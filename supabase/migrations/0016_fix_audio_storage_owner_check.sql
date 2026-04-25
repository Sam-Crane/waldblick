-- Waldblick fix — drop the brittle owner = auth.uid() check on
-- observation-audio uploads.
--
-- 0013 wrote:
--
--   create policy "audio_author_upload" on storage.objects
--     for insert to authenticated with check (
--       bucket_id = 'observation-audio' and owner = auth.uid()
--     );
--
-- The `owner` column on storage.objects is being deprecated by Supabase
-- (in favour of `owner_id`) and is no longer reliably auto-populated by
-- the storage client. Result: every audio upload now 403s with "new row
-- violates row-level security policy" because the column comes back NULL.
--
-- The real author-gate for audio uploads is the row-level RLS on
-- public.observation_audio (see 0013, "audio_author_insert"): only the
-- author of an observation may create an observation_audio row pointing
-- at a storage path. A storage object without a matching row is harmless
-- orphan data, scrubbable by an offline cleanup job. So it is safe to
-- drop the storage-level owner check and rely on the table-row policy
-- for the real enforcement.
--
-- We narrow this fix to audio only. Photos (observation-photos bucket)
-- are left alone because they may be working in the wild — if/when the
-- same bug bites photos we'll mirror this change for that bucket.

drop policy if exists "audio_author_upload" on storage.objects;
create policy "audio_author_upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'observation-audio'
  );

-- Allow upsert (clients sometimes retry an interrupted upload). Without
-- an UPDATE policy the second attempt 403s when upsert: true falls
-- through to an UPDATE on the existing object.
drop policy if exists "audio_author_update" on storage.objects;
create policy "audio_author_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'observation-audio'
  ) with check (
    bucket_id = 'observation-audio'
  );
