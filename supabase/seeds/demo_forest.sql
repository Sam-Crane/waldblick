-- Demo seed — creates one forest and adds every existing profile as a
-- member. Safe to run more than once (idempotent).
--
-- Adjust the forest name / boundary as needed before running.
-- After this runs, every new observation an app user captures will
-- attach to this forest, which means the critical-observation fanout
-- notification (in migration 0004) will actually deliver to other members.

-- 1. Pick an owner. Defaults to the oldest profile; override by uncommenting.
do $$
declare
  owner uuid;
  forest uuid;
begin
  -- owner := '00000000-0000-0000-0000-000000000000';
  select id into owner from public.profiles order by created_at asc limit 1;
  if owner is null then
    raise notice 'No profiles found. Sign up first, then run this seed.';
    return;
  end if;

  -- 2. Forest, create if missing.
  select id into forest from public.forests where name = 'Revier Eichberg';
  if forest is null then
    insert into public.forests (name, owner_id) values ('Revier Eichberg', owner) returning id into forest;
    raise notice 'Created forest % with owner %', forest, owner;
  else
    raise notice 'Forest Revier Eichberg already exists (%)', forest;
  end if;

  -- 3. Membership for every profile. Owner gets role='owner'; everyone else
  --    gets 'forester' unless they already have a membership (kept as-is).
  insert into public.memberships (user_id, forest_id, role)
  select p.id, forest, case when p.id = owner then 'owner' else coalesce(p.role, 'forester') end
  from public.profiles p
  on conflict (user_id, forest_id) do nothing;

  raise notice 'Memberships seeded for all profiles';
end $$;

-- 4. Optional: attach existing observations (that were captured before the
-- forest existed) to this forest so they fan out to members.
update public.observations
   set forest_id = (select id from public.forests where name = 'Revier Eichberg' limit 1)
 where forest_id is null;
