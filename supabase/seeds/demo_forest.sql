-- Demo seed — creates a forest ("Revier Eichberg") owned by the OLDEST
-- profile and enrols ONLY that profile as a member.
--
-- This is intentionally single-owner. Observations captured by that user
-- get backfilled onto the forest so the fanout notifications have a
-- delivery target. Other users do NOT get access to the forest's data.
--
-- To test multi-user coordination (everyone sees everyone's observations),
-- run `supabase/seeds/demo_forest_multi.sql` after this. That file is a
-- deliberate privacy loosening — do not run it on a production project
-- unless you've got real memberships set up instead.
--
-- Idempotent; safe to re-run.

do $$
declare
  owner uuid;
  forest uuid;
begin
  -- Override by uncommenting and pasting your user id:
  -- owner := '00000000-0000-0000-0000-000000000000';
  select id into owner from public.profiles order by created_at asc limit 1;
  if owner is null then
    raise notice 'No profiles found. Sign up first, then run this seed.';
    return;
  end if;

  -- Forest, create if missing.
  select id into forest from public.forests where name = 'Revier Eichberg';
  if forest is null then
    insert into public.forests (name, owner_id) values ('Revier Eichberg', owner)
      returning id into forest;
    raise notice 'Created forest % with owner %', forest, owner;
  else
    raise notice 'Forest Revier Eichberg already exists (%)', forest;
  end if;

  -- Membership — ONLY the owner. Others join by invite / by running the
  -- separate multi-user seed.
  insert into public.memberships (user_id, forest_id, role)
  values (owner, forest, 'owner')
  on conflict (user_id, forest_id) do nothing;

  -- Attach ONLY the owner's existing (null-forest) observations to this
  -- forest. Observations from other authors are left alone so this seed
  -- doesn't accidentally pull their data into the forest's membership view.
  update public.observations
     set forest_id = forest
   where forest_id is null
     and author_id = owner;

  raise notice 'Single-owner seed complete. Owner %, forest %.', owner, forest;
end $$;
