-- Waldblick fix — SECURITY DEFINER on the 0004 notification triggers, plus
-- explicit search_path on every function we own (Supabase linter 0011).
--
-- Two separate problems this migration solves:
--
-- 1. 403 on connections INSERT (and latent failures on messages, tasks,
--    critical observations). Those trigger functions were SECURITY INVOKER,
--    so they ran with the acting user's permissions. Their job is to insert
--    a notification row FOR ANOTHER USER — but notifications RLS only
--    allows each user to manage their own rows. The insert fails; the
--    original INSERT is rolled back; client gets a 403.
--    Fix: SECURITY DEFINER on the four fanout functions.
--
-- 2. Supabase linter 0011 "Function Search Path Mutable" — warns on every
--    function that doesn't explicitly SET search_path, because a malicious
--    role with a custom search_path could shadow built-in operators.
--    Fix: SET search_path = public (or '') on every function we own.

-- --- 0004 fanout triggers: add SECURITY DEFINER + search_path --------------

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

  select name into author_name from public.profiles where id = new.author_id;

  insert into public.notifications (user_id, kind, title, body, target_path)
  values (
    other_id,
    'message',
    coalesce(author_name, 'Nachricht'),
    substring(new.body for 140),
    '/messages/' || new.conversation_id
  );

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
    insert into public.notifications (user_id, kind, title, body, target_path)
    values (
      rec.user_id,
      'critical_observation',
      'Kritische Beobachtung',
      new.category || ' · ' || substring(coalesce(new.description, '') for 100),
      '/observations/' || new.id
    );
  end loop;
  return new;
end $$;

create or replace function public.notify_on_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare requester_name text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
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
  return new;
end $$;

-- --- search_path hardening for non-fanout helpers --------------------------
-- These don't cross users, so they stay SECURITY INVOKER; they only need
-- an explicit search_path to satisfy the linter.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.priority_rank(p text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p when 'critical' then 3 when 'medium' then 2 when 'low' then 1 else 0 end;
$$;

create or replace function public.observation_auto_priority()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  category_priority text;
  clustered_criticals int;
  dist_m double precision := 50;
begin
  category_priority := case new.category
    when 'beetle'        then 'critical'
    when 'erosion'       then 'critical'
    when 'windthrow'     then 'critical'
    when 'thinning'      then 'medium'
    when 'reforestation' then 'medium'
    else 'low'
  end;

  if public.priority_rank(new.priority) < public.priority_rank(category_priority) then
    new.priority := category_priority;
  end if;

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

  new.stale := (
    new.priority = 'critical'
    and new.status <> 'resolved'
    and new.captured_at < now() - interval '48 hours'
  );

  return new;
end $$;

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int := 0;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end $$;

create or replace function public.assign_invite_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare attempts int := 0;
begin
  if new.invite_code is not null then return new; end if;
  loop
    new.invite_code := public.generate_invite_code();
    begin
      return new;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 10 then raise; end if;
    end;
  end loop;
end $$;
