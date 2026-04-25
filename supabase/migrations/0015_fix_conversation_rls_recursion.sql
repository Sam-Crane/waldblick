-- Waldblick fix — break RLS recursion on public.conversation_members.
--
-- 0014 introduced group chat. Its conversation_members SELECT policy
-- referenced conversation_members in its own body:
--
--   user_id = auth.uid()
--   or exists (select 1 from public.conversation_members me ...)
--
-- Postgres expands RLS for every relation in a query, including those
-- inside other RLS bodies. The self-reference forms an infinite
-- expansion loop, which Postgres detects and aborts with
--
--   ERROR:  infinite recursion detected in policy for relation
--           "conversation_members"
--
-- That ERROR surfaces to PostgREST as 500. The same fault cascades
-- into queries on conversations and messages, since their policies
-- also do `exists (select from conversation_members ...)`.
--
-- The fix: hoist the membership-lookup into a SECURITY DEFINER
-- function. SECURITY DEFINER functions bypass RLS on the tables they
-- touch, so the recursion never starts. As a side benefit the policy
-- expression is now a single function call rather than an inlined
-- subquery, which the planner handles more cheaply.
--
-- Semantics are preserved exactly:
--   - You can see a conversation iff you are a member.
--   - You can see a member row iff it is yours, or you are also a
--     member of that conversation.
--   - You can add a member iff you are already in the conversation
--     (or you are adding yourself, e.g. accepting an invite).
--   - You can read/write messages iff you are a member.

create or replace function public.is_conversation_member(
  conv_id uuid,
  uid uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.conversation_members
     where conversation_id = conv_id
       and user_id = uid
  );
$$;

grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

-- conversations -----------------------------------------------------------
drop policy if exists "conversations_member_select" on public.conversations;
create policy "conversations_member_select" on public.conversations
  for select using (
    public.is_conversation_member(id, auth.uid())
  );

-- conversation_members ----------------------------------------------------
-- The recursive one. Same intent as 0014: members can see other members'
-- rows in the same conversation. Now the membership-check goes through
-- the SECURITY DEFINER function and doesn't trip RLS again.
drop policy if exists "members_self_or_member_select" on public.conversation_members;
create policy "members_self_or_member_select" on public.conversation_members
  for select using (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "members_peer_insert" on public.conversation_members;
create policy "members_peer_insert" on public.conversation_members
  for insert with check (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id, auth.uid())
  );

-- messages ----------------------------------------------------------------
drop policy if exists "messages_member_select" on public.messages;
create policy "messages_member_select" on public.messages
  for select using (
    public.is_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "messages_member_insert" on public.messages;
create policy "messages_member_insert" on public.messages
  for insert with check (
    author_id = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
  );
