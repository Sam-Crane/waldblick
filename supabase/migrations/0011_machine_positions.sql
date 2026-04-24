-- Waldblick — machine trail history.
--
-- The `machines` table carries only the LAST known position per
-- user × forest (unique constraint). To draw a fading trail behind
-- each moving machine on the map, we need to keep a short history
-- of pings. That's this table.
--
-- Retention: 4 hours per machine. Anything older is pruned on every
-- insert via a lightweight BEFORE trigger so the table can't grow
-- unbounded without a cron job. 4h × one ping per 30s = 480 rows
-- per active machine at steady state — tiny.

create table if not exists public.machine_positions (
  id bigserial primary key,
  machine_id uuid not null references public.machines(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  forest_id uuid references public.forests(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  recorded_at timestamptz not null default now()
);

create index if not exists machine_positions_machine_time_idx
  on public.machine_positions (machine_id, recorded_at desc);
create index if not exists machine_positions_forest_time_idx
  on public.machine_positions (forest_id, recorded_at desc);

alter table public.machine_positions enable row level security;

-- Forest members see positions for machines in their forest. Null
-- forest_id falls back to owner-only visibility (mirrors 0007).
drop policy if exists "machine_positions_member_select" on public.machine_positions;
create policy "machine_positions_member_select" on public.machine_positions
  for select using (
    user_id = auth.uid()
    or (
      forest_id is not null
      and exists (
        select 1 from public.memberships m
        where m.forest_id = machine_positions.forest_id
          and m.user_id = auth.uid()
      )
    )
  );

-- Only the operator can write their own positions.
create policy "machine_positions_self_insert" on public.machine_positions
  for insert with check (user_id = auth.uid());

-- Realtime payloads need full OLD rows for DELETE events (pruner triggers these).
alter table public.machine_positions replica identity full;

-- Prune old rows: on every insert for a given machine, delete rows
-- older than 4 hours for that same machine. Cheap because the
-- machine_time index is a covering filter.
create or replace function public.prune_machine_positions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.machine_positions
   where machine_id = new.machine_id
     and recorded_at < now() - interval '4 hours';
  return new;
end $$;

drop trigger if exists machine_positions_prune on public.machine_positions;
create trigger machine_positions_prune
  after insert on public.machine_positions
  for each row execute function public.prune_machine_positions();
