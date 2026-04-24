-- Waldblick Phase 4 — server-side auto-priority on observations.
-- Runs on INSERT + UPDATE. Escalates (never downgrades) based on:
--   1. Category defaults (beetle/erosion/windthrow → critical)
--   2. Proximity to other open criticals within 50m
--
-- The `stale` flag for unresolved criticals >48h old is set by a scheduled
-- job (pg_cron if available) or the next time the row is touched by any
-- write — the function re-evaluates staleness on every UPDATE.

-- Add stale flag if it doesn't exist yet
alter table public.observations
  add column if not exists stale boolean not null default false;

create or replace function public.observation_auto_priority()
returns trigger language plpgsql as $$
declare
  category_priority text;
  clustered_criticals int;
  dist_m double precision := 50;  -- cluster radius
begin
  -- Category default
  category_priority := case new.category
    when 'beetle'       then 'critical'
    when 'erosion'      then 'critical'
    when 'windthrow'    then 'critical'
    when 'thinning'     then 'medium'
    when 'reforestation' then 'medium'
    else 'low'
  end;

  -- Escalate only (never downgrade what the user chose)
  if priority_rank(new.priority) < priority_rank(category_priority) then
    new.priority := category_priority;
  end if;

  -- Proximity bump: if at least one other open critical within 50m, escalate
  -- medium → critical. Uses Haversine-like approximation via degrees since
  -- we're working without PostGIS geography columns; 50m ≈ 0.00045°.
  if new.priority = 'medium' then
    select count(*)
      into clustered_criticals
      from public.observations o
     where o.id <> new.id
       and o.priority = 'critical'
       and o.status <> 'resolved'
       and (o.deleted_at is null)
       and abs(o.lat - new.lat) < (dist_m / 111320.0)
       and abs(o.lng - new.lng) < (dist_m / (111320.0 * cos(radians(new.lat))));
    if clustered_criticals > 0 then
      new.priority := 'critical';
    end if;
  end if;

  -- Staleness: unresolved critical older than 48h
  new.stale := (
    new.priority = 'critical'
    and new.status <> 'resolved'
    and new.captured_at < now() - interval '48 hours'
  );

  return new;
end $$;

create or replace function public.priority_rank(p text) returns int language sql immutable as $$
  select case p when 'critical' then 3 when 'medium' then 2 when 'low' then 1 else 0 end;
$$;

drop trigger if exists observations_auto_priority on public.observations;
create trigger observations_auto_priority
  before insert or update on public.observations
  for each row execute function public.observation_auto_priority();
