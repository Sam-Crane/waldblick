-- Waldblick — every user gets a personal forest on signup.
--
-- The "No forest yet. Create a forest or accept an invite first" error
-- appears when a user has no membership — which is every user who
-- signed up and didn't happen to be the oldest profile when the seed ran.
--
-- This migration closes that gap two ways:
--   1. handle_new_user() is extended so the profile-creation trigger
--      also creates a personal forest (unless the user already has one)
--      and the 0008 forests_owner_membership trigger enrols them as owner.
--   2. A backfill loop walks every existing profile without any
--      membership and creates their personal forest.
--
-- Naming convention: "Revier <name>" where name comes from
-- raw_user_meta_data (signup form), falling back to the profile name.
-- Users can rename in the future via Settings.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p_name text;
  p_role text;
  p_forest_name text;
begin
  p_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Forester');
  p_role := coalesce(new.raw_user_meta_data->>'role', 'forester');
  p_forest_name := new.raw_user_meta_data->>'forest_name';

  -- Ensure the profile row exists. The profiles BEFORE INSERT trigger
  -- from 0004 assigns the invite_code.
  insert into public.profiles (id, name, role, forest_name)
  values (new.id, p_name, p_role, p_forest_name)
  on conflict (id) do nothing;

  -- If they have no memberships yet, spin up a personal forest. The
  -- forests_owner_membership trigger from 0008 auto-adds them as owner.
  if not exists (select 1 from public.memberships where user_id = new.id) then
    insert into public.forests (name, owner_id)
    values (coalesce(p_forest_name, 'Revier ' || p_name), new.id);
  end if;

  return new;
end $$;

-- Backfill: profiles that exist but have no forest membership get a
-- personal forest now. Idempotent — the not-exists guard ensures we
-- don't duplicate for users who already have one.
do $$
declare rec record;
begin
  for rec in
    select p.id, p.name, p.forest_name
    from public.profiles p
    where not exists (select 1 from public.memberships m where m.user_id = p.id)
  loop
    insert into public.forests (name, owner_id)
    values (
      coalesce(rec.forest_name, 'Revier ' || coalesce(rec.name, 'User')),
      rec.id
    );
  end loop;
end $$;
