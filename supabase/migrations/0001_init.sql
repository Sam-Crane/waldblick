-- Waldblick — initial schema (Phase 3).
-- Run in Supabase SQL editor once per project.
--
-- Tables: users · forests · memberships · plots · observations · observation_photos · tasks
-- Plus: storage bucket `observation-photos`.
-- RLS: members of a forest can read/write its data; writes are attributed to auth.uid().

create extension if not exists "uuid-ossp";

-- profiles (1:1 with auth.users) ------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text check (role in ('owner','forester','contractor','operator')) default 'forester',
  forest_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_self_upsert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

-- forests + membership ---------------------------------------------------------
create table if not exists public.forests (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.forests enable row level security;

create table if not exists public.memberships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  forest_id uuid not null references public.forests(id) on delete cascade,
  role text not null check (role in ('owner','forester','contractor','operator')) default 'forester',
  created_at timestamptz not null default now(),
  primary key (user_id, forest_id)
);
alter table public.memberships enable row level security;

create policy "memberships_self_select" on public.memberships
  for select using (auth.uid() = user_id);

create policy "forests_member_select" on public.forests
  for select using (
    exists (select 1 from public.memberships m where m.forest_id = forests.id and m.user_id = auth.uid())
  );

-- plots ------------------------------------------------------------------------
create table if not exists public.plots (
  id uuid primary key default uuid_generate_v4(),
  forest_id uuid not null references public.forests(id) on delete cascade,
  name text not null,
  color text,
  boundary jsonb not null, -- GeoJSON Polygon
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.plots enable row level security;

create policy "plots_member_rw" on public.plots
  for all using (
    exists (select 1 from public.memberships m where m.forest_id = plots.forest_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.memberships m where m.forest_id = plots.forest_id and m.user_id = auth.uid())
  );

-- observations ----------------------------------------------------------------
create table if not exists public.observations (
  id uuid primary key,                 -- client-generated uuid (from Dexie)
  forest_id uuid references public.forests(id) on delete set null,
  plot_id uuid references public.plots(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('beetle','thinning','reforestation','windthrow','erosion','machine','other')),
  priority text not null check (priority in ('critical','medium','low')),
  status text not null check (status in ('open','in_progress','resolved')) default 'open',
  description text not null default '',
  lat double precision not null,
  lng double precision not null,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists observations_forest_updated_idx on public.observations(forest_id, updated_at desc);
alter table public.observations enable row level security;

create policy "observations_member_select" on public.observations
  for select using (
    forest_id is null
    or exists (select 1 from public.memberships m where m.forest_id = observations.forest_id and m.user_id = auth.uid())
  );
create policy "observations_author_insert" on public.observations
  for insert with check (author_id = auth.uid());
create policy "observations_author_update" on public.observations
  for update using (author_id = auth.uid());

-- observation photos ----------------------------------------------------------
create table if not exists public.observation_photos (
  id uuid primary key,
  observation_id uuid not null references public.observations(id) on delete cascade,
  storage_path text not null,           -- relative path inside the bucket
  width int,
  height int,
  captured_at timestamptz not null default now()
);
alter table public.observation_photos enable row level security;

create policy "photos_member_select" on public.observation_photos
  for select using (
    exists (
      select 1 from public.observations o
      where o.id = observation_photos.observation_id
        and (o.forest_id is null or exists (
          select 1 from public.memberships m where m.forest_id = o.forest_id and m.user_id = auth.uid()
        ))
    )
  );
create policy "photos_author_insert" on public.observation_photos
  for insert with check (
    exists (select 1 from public.observations o where o.id = observation_photos.observation_id and o.author_id = auth.uid())
  );

-- tasks -----------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  observation_id uuid not null references public.observations(id) on delete cascade,
  assignee_id uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.tasks enable row level security;

create policy "tasks_member_rw" on public.tasks
  for all using (
    exists (
      select 1 from public.observations o
      join public.memberships m on m.forest_id = o.forest_id and m.user_id = auth.uid()
      where o.id = tasks.observation_id
    )
  );

-- storage bucket --------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('observation-photos', 'observation-photos', false)
on conflict (id) do nothing;

-- storage policies: author can upload; any forest member can read
create policy "photos_author_upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'observation-photos' and owner = auth.uid()
  );
create policy "photos_member_read" on storage.objects
  for select to authenticated using (
    bucket_id = 'observation-photos' and exists (
      select 1 from public.observation_photos p
      join public.observations o on o.id = p.observation_id
      where p.storage_path = storage.objects.name
        and (o.forest_id is null or exists (
          select 1 from public.memberships m where m.forest_id = o.forest_id and m.user_id = auth.uid()
        ))
    )
  );

-- handy trigger: bump updated_at on observation row update ---------------------
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

drop trigger if exists observations_touch on public.observations;
create trigger observations_touch
  before update on public.observations
  for each row execute function public.touch_updated_at();

drop trigger if exists plots_touch on public.plots;
create trigger plots_touch
  before update on public.plots
  for each row execute function public.touch_updated_at();
