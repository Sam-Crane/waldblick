-- Waldblick — per-user notification preferences.
--
-- Problem: the fanout triggers from 0004/0005 insert a notification for
-- every recipient without asking whether they want it. The user_joined
-- fanout in particular sends one row per existing user on every signup —
-- noisy at any scale.
--
-- Fix: add a JSONB `notification_prefs` column on profiles with a default
-- of "all kinds on" and extend every fanout trigger to check the prefs
-- before inserting. Users can then silence specific kinds from Settings
-- without losing access to others.
--
-- Shape of the JSONB (every key optional; missing = default-true):
--   {
--     "critical_observation": true,
--     "task_assigned":        true,
--     "message":              true,
--     "connection_request":   true,
--     "sync_issue":           true,
--     "user_joined":          true
--   }

-- 1. Column + default ----------------------------------------------------
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- 2. Helper: returns true if `user` wants `kind`.
-- Default is permissive (true) when the key is missing or null.
create or replace function public.wants_notification(p_user_id uuid, p_kind text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select (notification_prefs -> p_kind)::boolean
       from public.profiles
      where id = p_user_id),
    true
  );
$$;

-- 3. Rewire each fanout trigger to gate its insert on wants_notification. --

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_id uuid;
  author_name text;
begin
  select case when c.participant_a = new.author_id then c.participant_b else c.participant_a end
    into other_id
    from public.conversations c
   where c.id = new.conversation_id;

  if public.wants_notification(other_id, 'message') then
    select name into author_name from public.profiles where id = new.author_id;
    insert into public.notifications (user_id, kind, title, body, target_path)
    values (
      other_id,
      'message',
      coalesce(author_name, 'Nachricht'),
      substring(new.body for 140),
      '/messages/' || new.conversation_id
    );
  end if;

  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;

create or replace function public.notify_on_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  obs_summary text;
begin
  if new.assignee_id is null then return new; end if;
  if not public.wants_notification(new.assignee_id, 'task_assigned') then return new; end if;
  select category into obs_summary from public.observations where id = new.observation_id;
  insert into public.notifications (user_id, kind, title, body, target_path)
  values (
    new.assignee_id,
    'task_assigned',
    'Neue Aufgabe',
    coalesce(obs_summary, 'Aufgabe zugewiesen'),
    '/observations/' || new.observation_id
  );
  return new;
end $$;

create or replace function public.notify_on_critical_observation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare rec record;
begin
  if new.priority <> 'critical' or new.forest_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.priority = 'critical' then return new; end if;

  for rec in
    select user_id from public.memberships where forest_id = new.forest_id and user_id <> new.author_id
  loop
    if public.wants_notification(rec.user_id, 'critical_observation') then
      insert into public.notifications (user_id, kind, title, body, target_path)
      values (
        rec.user_id,
        'critical_observation',
        'Kritische Beobachtung',
        new.category || ' · ' || substring(coalesce(new.description, '') for 100),
        '/observations/' || new.id
      );
    end if;
  end loop;
  return new;
end $$;

create or replace function public.notify_on_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_name text;
  addressee_name text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    if public.wants_notification(new.addressee_id, 'connection_request') then
      select name into requester_name from public.profiles where id = new.requester_id;
      insert into public.notifications (user_id, kind, title, body, target_path)
      values (
        new.addressee_id,
        'connection_request',
        coalesce(requester_name, 'Neue Verbindung'),
        'möchte sich mit Ihnen verbinden.',
        '/connect'
      );
    end if;
  elsif tg_op = 'UPDATE'
        and new.status = 'accepted'
        and (old.status is null or old.status <> 'accepted') then
    if public.wants_notification(new.requester_id, 'connection_request') then
      select name into addressee_name from public.profiles where id = new.addressee_id;
      insert into public.notifications (user_id, kind, title, body, target_path)
      values (
        new.requester_id,
        'connection_request',
        coalesce(addressee_name, 'Verbindung bestätigt'),
        'hat Ihre Anfrage angenommen. Sie teilen jetzt ein Revier.',
        '/connect'
      );
    end if;
  end if;
  return new;
end $$;

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
    if public.wants_notification(rec.id, 'user_joined') then
      insert into public.notifications (user_id, kind, title, body, target_path)
      values (
        rec.id,
        'user_joined',
        'Neues Mitglied',
        coalesce(new.name, 'Jemand') || ' ist Waldblick beigetreten.',
        '/connect'
      );
    end if;
  end loop;
  return new;
end $$;
