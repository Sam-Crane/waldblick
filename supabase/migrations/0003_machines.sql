-- Waldblick Phase 4 — machine positions (scenario #4).
-- One row per active machine (keyed on user_id × forest_id). Clients upsert
-- their own position every ~30s while broadcasting; stale rows naturally
-- age out on the map based on last_seen_at.

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  forest_id uuid references public.forests(id) on delete set null,
  kind text not null check (kind in ('harvester','forwarder','maintenance','other')) default 'other',
  label text,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  last_seen_at timestamptz not null default now(),
  unique (user_id, forest_id)
);
create index if not exists machines_forest_last_seen_idx
  on public.machines(forest_id, last_seen_at desc);

alter table public.machines enable row level security;

-- Forest members can see all machines in their forest.
create policy "machines_member_select" on public.machines
  for select using (
    forest_id is null
    or exists (
      select 1 from public.memberships m
      where m.forest_id = machines.forest_id and m.user_id = auth.uid()
    )
  );

-- A user can only write their own machine row.
create policy "machines_self_upsert" on public.machines
  for insert with check (user_id = auth.uid());
create policy "machines_self_update" on public.machines
  for update using (user_id = auth.uid());
create policy "machines_self_delete" on public.machines
  for delete using (user_id = auth.uid());

-- Needed for realtime payloads to include OLD row on update/delete.
alter table public.machines replica identity full;
