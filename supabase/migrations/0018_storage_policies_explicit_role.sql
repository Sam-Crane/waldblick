-- Waldblick fix — give storage.objects INSERT/UPDATE policies an
-- explicit `to authenticated` role list.
--
-- 0017 created INSERT/UPDATE policies without a `to <role>` clause,
-- expecting them to default to `public` (everyone). On this Postgres
-- build the empty `to` clause stored an empty role list (`polroles = {}`)
-- instead, which evaluates as "applies to no role" — the policy
-- effectively never matches, every INSERT falls through to default-
-- deny, and Storage 403s with the misleading "new row violates
-- row-level security policy" string.
--
-- pg_policies showed `roles = {public}` because the view interprets
-- the empty array as public; pg_policy (the underlying catalog) showed
-- `polroles = {-}` (OID 0) which is the actual stored value, and
-- whatever evaluation path is in play here is treating that as the
-- empty set, not as public.
--
-- Naming the role explicitly removes the ambiguity. We use
-- `to authenticated` because Storage will not accept anon JWTs for
-- writes against private buckets anyway — being explicit costs us
-- nothing and removes one variable.

-- observation-audio -------------------------------------------------------
drop policy if exists "audio_author_upload" on storage.objects;
create policy "audio_author_upload" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'observation-audio');

drop policy if exists "audio_author_update" on storage.objects;
create policy "audio_author_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'observation-audio')
  with check (bucket_id = 'observation-audio');

-- observation-photos ------------------------------------------------------
drop policy if exists "photos_author_upload" on storage.objects;
create policy "photos_author_upload" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'observation-photos');

drop policy if exists "photos_author_update" on storage.objects;
create policy "photos_author_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'observation-photos')
  with check (bucket_id = 'observation-photos');

-- The SELECT policies (audio_member_read, photos_member_read) already
-- have `to authenticated` from 0001/0013, so they were never affected.
