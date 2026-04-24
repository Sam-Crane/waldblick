-- Waldblick Phase A.4 — group conversations (n-party chat).
--
-- Existing `conversations` (from 0004) model 1:1 direct messages with a
-- participant_a + participant_b constraint. Extending to groups without
-- breaking DMs: add a `kind` column and a `conversation_members` table.
-- Direct conversations stay unchanged (participant_a/b still populated);
-- group conversations use conversation_members exclusively.
--
-- Membership-based RLS replaces the participant-column checks so the same
-- policy works for both kinds.

-- 1. Schema additions ---------------------------------------------------------
alter table public.conversations
  add column if not exists kind text not null default 'direct' check (kind in ('direct','group')),
  add column if not exists name text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx
  on public.conversation_members(user_id);
alter table public.conversation_members enable row level security;

-- 2. Backfill membership rows for existing direct conversations ---------------
-- So the new RLS works for existing DMs. Idempotent via ON CONFLICT.
insert into public.conversation_members (conversation_id, user_id)
select id, participant_a from public.conversations
on conflict (conversation_id, user_id) do nothing;
insert into public.conversation_members (conversation_id, user_id)
select id, participant_b from public.conversations
on conflict (conversation_id, user_id) do nothing;

-- 3. RLS — rewrite policies to use conversation_members ----------------------
drop policy if exists "conversations_participant_select" on public.conversations;
drop policy if exists "conversations_participant_insert" on public.conversations;
drop policy if exists "messages_participant_select" on public.messages;
drop policy if exists "messages_author_insert" on public.messages;

create policy "conversations_member_select" on public.conversations
  for select using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversations.id and cm.user_id = auth.uid()
    )
  );

-- Creating a conversation: the creator must include themselves as a member
-- via the insert trigger below. Allow anyone authenticated to create for now.
create policy "conversations_authenticated_insert" on public.conversations
  for insert to authenticated with check (
    auth.uid() = created_by or created_by is null
  );

create policy "members_self_or_member_select" on public.conversation_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversation_members me
      where me.conversation_id = conversation_members.conversation_id
        and me.user_id = auth.uid()
    )
  );

-- Anyone already in the conversation can add new members (simpler than
-- admin-only for v1). Leaving = delete your own row.
create policy "members_peer_insert" on public.conversation_members
  for insert with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversation_members me
      where me.conversation_id = conversation_members.conversation_id
        and me.user_id = auth.uid()
    )
  );
create policy "members_self_delete" on public.conversation_members
  for delete using (user_id = auth.uid());

create policy "messages_member_select" on public.messages
  for select using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "messages_member_insert" on public.messages
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- 4. Creator auto-joins on conversation insert -------------------------------
-- Ensures the created_by user ends up as a member without the client
-- having to do two round-trips.
create or replace function public.auto_join_conversation_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.conversation_members (conversation_id, user_id)
    values (new.id, new.created_by)
    on conflict (conversation_id, user_id) do nothing;
  end if;
  -- Direct-conversation legacy path: auto-add both classic participants too.
  if new.kind = 'direct' then
    insert into public.conversation_members (conversation_id, user_id)
    values (new.id, new.participant_a), (new.id, new.participant_b)
    on conflict (conversation_id, user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists conversations_auto_join on public.conversations;
create trigger conversations_auto_join
  after insert on public.conversations
  for each row execute function public.auto_join_conversation_creator();

-- 5. Fanout notification trigger: include every other group member ----------
-- The existing notify_on_message (0006/0010) only handled direct chats
-- ("select a/b from c"). Replace with a version that iterates
-- conversation_members.

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  author_name text;
begin
  select name into author_name from public.profiles where id = new.author_id;
  for rec in
    select user_id
      from public.conversation_members
     where conversation_id = new.conversation_id
       and user_id <> new.author_id
  loop
    if public.wants_notification(rec.user_id, 'message') then
      insert into public.notifications (user_id, kind, title, body, target_path)
      values (
        rec.user_id,
        'message',
        coalesce(author_name, 'Nachricht'),
        substring(new.body for 140),
        '/messages/' || new.conversation_id
      );
    end if;
  end loop;

  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
