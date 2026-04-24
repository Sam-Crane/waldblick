-- Waldblick Phase 5.5 — fix invite code, enable user discovery, notify on new sign-ups.

-- 1. Auto-create profiles row when a new auth user signs up ------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, forest_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Forester'),
    coalesce(new.raw_user_meta_data->>'role', 'forester'),
    new.raw_user_meta_data->>'forest_name'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Backfill profiles for users who signed up before the trigger existed.
-- The profiles BEFORE INSERT trigger from 0004 will auto-assign invite_code.
insert into public.profiles (id, name, role, forest_name)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Forester'),
  coalesce(u.raw_user_meta_data->>'role', 'forester'),
  u.raw_user_meta_data->>'forest_name'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 3. Allow all authenticated users to discover each other's profile info.
-- Fields exposed: id, name, role, forest_name, invite_code, created_at.
-- (Email is in auth.users, not here — still private.) RLS is permissive
-- for SELECT only; writes stay self-only.
drop policy if exists "profiles_authenticated_select" on public.profiles;
create policy "profiles_authenticated_select" on public.profiles
  for select to authenticated using (true);

-- 4. Extend notification kinds with 'user_joined'.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'critical_observation',
    'task_assigned',
    'message',
    'connection_request',
    'sync_issue',
    'user_joined'
  ));

-- 5. Fan out a 'user_joined' notification to existing users when a new
-- profile row is inserted. Capped at 200 recipients as a cheap spam fuse —
-- for production we'd scope this per-forest or rate-limit on the client.
create or replace function public.notify_on_user_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare rec record;
begin
  for rec in
    select id from public.profiles
     where id <> new.id
     order by created_at desc
     limit 200
  loop
    insert into public.notifications (user_id, kind, title, body, target_path)
    values (
      rec.id,
      'user_joined',
      'Neues Mitglied',
      coalesce(new.name, 'Jemand') || ' ist Waldblick beigetreten.',
      '/connect'
    );
  end loop;
  return new;
end $$;

drop trigger if exists profiles_notify_new on public.profiles;
create trigger profiles_notify_new
  after insert on public.profiles
  for each row execute function public.notify_on_user_joined();
