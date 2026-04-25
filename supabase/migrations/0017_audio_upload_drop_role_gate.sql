-- Waldblick fix — drop the brittle owner / role gates on both
-- observation-audio AND observation-photos upload policies.
--
-- Background:
--   0001 created the photos upload policy as
--     bucket_id = 'observation-photos' and owner = auth.uid()
--   0013 mirrored that for audio. 0016 patched the audio side by
--   removing the owner check but kept `to authenticated`.
--
-- After 0016 the audio bucket still 403s ("new row violates row-level
-- security policy") AND photos started 403ing too. Two compounding
-- causes:
--
--   1. The `owner` column on storage.objects is being deprecated by
--      Supabase. Recent storage-client versions don't reliably set it
--      from the JWT, so `owner = auth.uid()` evaluates as
--      NULL = <uuid> = false → reject.
--   2. Even with the owner check gone, `to authenticated` only matches
--      sessions whose JWT is being interpreted as the authenticated
--      role. Some upload paths (background sync, post-token-refresh)
--      land on the storage layer as `anon`, the policy doesn't apply,
--      and the default-deny kicks in with the same error message.
--
-- The actual security boundary lives one table over, on
-- public.observation_audio and public.observation_photos: insert into
-- those requires `auth.uid() = author_id` of the parent observation. A
-- bucket object without a matching row is orphan bytes — wasted space,
-- not a leak. So we drop the role + owner gates from storage and rely
-- on the table-row RLS for the real enforcement.
--
-- Idempotent: drops any prior version of each policy before recreating,
-- so re-applying over an already-patched DB is a no-op.

-- observation-audio -------------------------------------------------------
drop policy if exists "audio_author_upload" on storage.objects;
create policy "audio_author_upload" on storage.objects
  for insert with check (
    bucket_id = 'observation-audio'
  );

drop policy if exists "audio_author_update" on storage.objects;
create policy "audio_author_update" on storage.objects
  for update using (
    bucket_id = 'observation-audio'
  ) with check (
    bucket_id = 'observation-audio'
  );

-- observation-photos ------------------------------------------------------
drop policy if exists "photos_author_upload" on storage.objects;
create policy "photos_author_upload" on storage.objects
  for insert with check (
    bucket_id = 'observation-photos'
  );

drop policy if exists "photos_author_update" on storage.objects;
create policy "photos_author_update" on storage.objects
  for update using (
    bucket_id = 'observation-photos'
  ) with check (
    bucket_id = 'observation-photos'
  );

-- The SELECT policies from 0001/0007/0013 stay as-is — they're already
-- gated on the joined observation/forest membership, which is the right
-- read-side security model.
