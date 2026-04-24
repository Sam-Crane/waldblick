-- Waldblick — make the invite-code flow a real membership grant.
--
-- Before: entering someone's code created a `connections` row, accepting it
-- just opened a chat. The two parties stayed on separate forests; each
-- still only saw their own observations.
--
-- After: accepting a connection adds both parties as members of every
-- forest either of them is in. Coarser than per-forest invites, but it
-- matches the user's expectation that an invite code = "join my org".
-- Per-forest invites can be layered on later (new UI, new column on
-- connections pointing at the forest being granted).

-- --- ensure forest owners are members of their forest ---------------------
-- If a forest is inserted via anything other than demo_forest.sql, the
-- owner wasn't being added to memberships automatically. Fix that so
-- future forest-creation UIs work out of the box.

create or replace function public.add_owner_to_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.memberships (user_id, forest_id, role)
  values (new.owner_id, new.id, 'owner')
  on conflict (user_id, forest_id) do nothing;
  return new;
end $$;

drop trigger if exists forests_owner_membership on public.forests;
create trigger forests_owner_membership
  after insert on public.forests
  for each row execute function public.add_owner_to_memberships();

-- Backfill for forests that already exist without an owner membership.
insert into public.memberships (user_id, forest_id, role)
select f.owner_id, f.id, 'owner'
from public.forests f
left join public.memberships m on m.user_id = f.owner_id and m.forest_id = f.id
where m.user_id is null;

-- --- connection accept → bidirectional forest memberships -----------------
-- Fires once when status transitions from pending to accepted. Each side
-- is added to every forest the other side is in. Existing memberships
-- are preserved (ON CONFLICT DO NOTHING).

create or replace function public.grant_memberships_on_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare rec record;
begin
  if new.status <> 'accepted' then return new; end if;
  if old.status = 'accepted' then return new; end if;  -- no-op on repeat accepts

  -- Add requester to every forest the addressee is in.
  for rec in
    select forest_id from public.memberships where user_id = new.addressee_id
  loop
    insert into public.memberships (user_id, forest_id, role)
    values (new.requester_id, rec.forest_id, 'forester')
    on conflict (user_id, forest_id) do nothing;
  end loop;

  -- Add addressee to every forest the requester is in.
  for rec in
    select forest_id from public.memberships where user_id = new.requester_id
  loop
    insert into public.memberships (user_id, forest_id, role)
    values (new.addressee_id, rec.forest_id, 'forester')
    on conflict (user_id, forest_id) do nothing;
  end loop;

  return new;
end $$;

drop trigger if exists connections_grant_memberships on public.connections;
create trigger connections_grant_memberships
  after update on public.connections
  for each row execute function public.grant_memberships_on_accept();

-- --- notify requester when their request is accepted ----------------------
-- Extends the existing notify_on_connection trigger to also fire on an
-- UPDATE where status flips to accepted. The requester gets a
-- 'connection_request'-kind notification (re-using the enum to avoid
-- widening the CHECK — the title text makes intent clear).

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
    select name into requester_name from public.profiles where id = new.requester_id;
    insert into public.notifications (user_id, kind, title, body, target_path)
    values (
      new.addressee_id,
      'connection_request',
      coalesce(requester_name, 'Neue Verbindung'),
      'möchte sich mit Ihnen verbinden.',
      '/connect'
    );
  elsif tg_op = 'UPDATE'
        and new.status = 'accepted'
        and (old.status is null or old.status <> 'accepted') then
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
  return new;
end $$;
