-- OPTIONAL demo seed — enrol EVERY existing profile as a member of
-- "Revier Eichberg". This is the multi-user coordination demo setup:
-- everyone sees everyone's observations, critical-observation fanout
-- delivers to the whole group.
--
-- PRIVACY WARNING: this is a deliberate cross-user visibility loosening.
-- Do not run this on a production project unless you actually have one
-- shared organisation. For real multi-org use, create separate forests
-- and set memberships explicitly per user.
--
-- Prerequisite: run `supabase/seeds/demo_forest.sql` first (creates the
-- forest with a single owner).
--
-- Idempotent; safe to re-run.

do $$
declare
  forest uuid;
begin
  select id into forest from public.forests where name = 'Revier Eichberg';
  if forest is null then
    raise notice 'Forest "Revier Eichberg" does not exist. Run demo_forest.sql first.';
    return;
  end if;

  -- Enrol every profile that isn't already a member. Owner stays owner;
  -- others get 'forester' by default so they can write observations.
  insert into public.memberships (user_id, forest_id, role)
  select
    p.id,
    forest,
    case when f.owner_id = p.id then 'owner' else coalesce(p.role, 'forester') end
  from public.profiles p
  join public.forests f on f.id = forest
  on conflict (user_id, forest_id) do nothing;

  -- Backfill any remaining null-forest observations across ALL authors.
  update public.observations
     set forest_id = forest
   where forest_id is null;

  raise notice 'Multi-user demo: all profiles now members of %.', forest;
end $$;
