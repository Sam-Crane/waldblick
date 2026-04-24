-- Waldblick Phase 4.5 — connections, messaging, notifications.

-- profiles.invite_code ---------------------------------------------------------
alter table public.profiles
  add column if not exists invite_code text unique;

create or replace function public.generate_invite_code() returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I to avoid confusion
  code text := '';
  i int := 0;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end $$;

create or replace function public.assign_invite_code() returns trigger language plpgsql as $$
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

drop trigger if exists profiles_invite_code on public.profiles;
create trigger profiles_invite_code
  before insert on public.profiles
  for each row execute function public.assign_invite_code();

-- Backfill existing rows that don't yet have a code.
update public.profiles set invite_code = public.generate_invite_code() where invite_code is null;

-- connections -----------------------------------------------------------------
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending','accepted','blocked')) default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.connections enable row level security;

create policy "connections_party_select" on public.connections
  for select using (auth.uid() in (requester_id, addressee_id));
create policy "connections_requester_insert" on public.connections
  for insert with check (auth.uid() = requester_id);
create policy "connections_party_update" on public.connections
  for update using (auth.uid() in (requester_id, addressee_id));

-- conversations + messages ----------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles(id) on delete cascade,
  participant_b uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (participant_a, participant_b),
  check (participant_a < participant_b)
);
alter table public.conversations enable row level security;

create policy "conversations_participant_select" on public.conversations
  for select using (auth.uid() in (participant_a, participant_b));
create policy "conversations_participant_insert" on public.conversations
  for insert with check (auth.uid() in (participant_a, participant_b));

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  observation_id uuid references public.observations(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_created_idx on public.messages(conversation_id, created_at);
alter table public.messages enable row level security;

create policy "messages_participant_select" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.participant_a, c.participant_b)
    )
  );
create policy "messages_author_insert" on public.messages
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.participant_a, c.participant_b)
    )
  );

alter table public.messages replica identity full;

-- notifications ---------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in
    ('critical_observation','task_assigned','message','connection_request','sync_issue')),
  title text not null,
  body text not null,
  target_path text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, read, created_at desc);
alter table public.notifications enable row level security;

create policy "notifications_owner_select" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_owner_update" on public.notifications
  for update using (user_id = auth.uid());

alter table public.notifications replica identity full;

-- Trigger: fan out notifications ----------------------------------------------

-- New message → notify the other participant.
create or replace function public.notify_on_message() returns trigger language plpgsql as $$
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

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_message();

-- New task → notify the assignee.
create or replace function public.notify_on_task() returns trigger language plpgsql as $$
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

drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify
  after insert on public.tasks
  for each row execute function public.notify_on_task();

-- New critical observation → notify other forest members.
create or replace function public.notify_on_critical_observation() returns trigger language plpgsql as $$
declare rec record;
begin
  if new.priority <> 'critical' or new.forest_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.priority = 'critical' then return new; end if;  -- only on first escalation

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

drop trigger if exists observations_notify_critical on public.observations;
create trigger observations_notify_critical
  after insert or update of priority on public.observations
  for each row execute function public.notify_on_critical_observation();

-- New connection request → notify the addressee.
create or replace function public.notify_on_connection() returns trigger language plpgsql as $$
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

drop trigger if exists connections_notify on public.connections;
create trigger connections_notify
  after insert on public.connections
  for each row execute function public.notify_on_connection();
