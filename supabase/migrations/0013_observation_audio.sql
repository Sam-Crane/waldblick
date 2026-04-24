-- Waldblick — voice notes on observations.
--
-- Mirrors observation_photos: one row per audio clip, file lives in a
-- separate storage bucket (observation-audio) with the same member-read,
-- author-write policies as photos.

create table if not exists public.observation_audio (
  id uuid primary key,
  observation_id uuid not null references public.observations(id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'audio/webm',
  duration_ms int not null default 0,
  captured_at timestamptz not null default now()
);
create index if not exists observation_audio_observation_idx
  on public.observation_audio(observation_id);

alter table public.observation_audio enable row level security;

-- Readers: anyone who can read the parent observation.
drop policy if exists "audio_member_select" on public.observation_audio;
create policy "audio_member_select" on public.observation_audio
  for select using (
    exists (
      select 1 from public.observations o
      where o.id = observation_audio.observation_id
        and (
          o.author_id = auth.uid()
          or (
            o.forest_id is not null
            and exists (
              select 1 from public.memberships m
              where m.forest_id = o.forest_id and m.user_id = auth.uid()
            )
          )
        )
    )
  );

-- Writers: only the author of the parent observation may insert.
create policy "audio_author_insert" on public.observation_audio
  for insert with check (
    exists (
      select 1 from public.observations o
      where o.id = observation_audio.observation_id
        and o.author_id = auth.uid()
    )
  );

-- Storage bucket for the audio files. Private — content is served via
-- signed URLs.
insert into storage.buckets (id, name, public)
values ('observation-audio', 'observation-audio', false)
on conflict (id) do nothing;

create policy "audio_author_upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'observation-audio' and owner = auth.uid()
  );

create policy "audio_member_read" on storage.objects
  for select to authenticated using (
    bucket_id = 'observation-audio' and exists (
      select 1 from public.observation_audio a
      join public.observations o on o.id = a.observation_id
      where a.storage_path = storage.objects.name
        and (
          o.author_id = auth.uid()
          or (
            o.forest_id is not null
            and exists (
              select 1 from public.memberships m
              where m.forest_id = o.forest_id and m.user_id = auth.uid()
            )
          )
        )
    )
  );
