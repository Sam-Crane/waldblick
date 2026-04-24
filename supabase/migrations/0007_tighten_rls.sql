-- Waldblick — tighten Row-Level Security to close two cross-user leaks.
--
-- Before this migration:
--   * observations_member_select said "forest_id IS NULL OR forest member".
--     Any observation with null forest_id was readable by every signed-in
--     user, because that branch didn't check anything else. Same shape of
--     bug on observation_photos (via the join), machines, and the storage
--     read policy.
--   * tasks_member_rw used FOR ALL with only a forest-membership check.
--     Any forest member could read, update, AND delete any task in the
--     forest — contractors could delete a forester's assignment.
--
-- After this migration:
--   * Null forest_id rows are only readable by the author (or machine owner).
--   * Tasks are read/update-scoped to the assignee + observation author;
--     insert + delete are author-only.

-- --- observations ----------------------------------------------------------
drop policy if exists "observations_member_select" on public.observations;
create policy "observations_member_select" on public.observations
  for select using (
    author_id = auth.uid()
    or (
      forest_id is not null
      and exists (
        select 1 from public.memberships m
        where m.forest_id = observations.forest_id
          and m.user_id = auth.uid()
      )
    )
  );

-- --- observation_photos ----------------------------------------------------
drop policy if exists "photos_member_select" on public.observation_photos;
create policy "photos_member_select" on public.observation_photos
  for select using (
    exists (
      select 1 from public.observations o
      where o.id = observation_photos.observation_id
        and (
          o.author_id = auth.uid()
          or (
            o.forest_id is not null
            and exists (
              select 1 from public.memberships m
              where m.forest_id = o.forest_id
                and m.user_id = auth.uid()
            )
          )
        )
    )
  );

-- --- tasks: split FOR ALL into four narrow policies ------------------------
drop policy if exists "tasks_member_rw" on public.tasks;

create policy "tasks_party_select" on public.tasks
  for select using (
    assignee_id = auth.uid()
    or exists (
      select 1 from public.observations o
      where o.id = tasks.observation_id
        and o.author_id = auth.uid()
    )
  );

create policy "tasks_author_insert" on public.tasks
  for insert with check (
    exists (
      select 1 from public.observations o
      where o.id = tasks.observation_id
        and o.author_id = auth.uid()
    )
  );

create policy "tasks_party_update" on public.tasks
  for update using (
    assignee_id = auth.uid()
    or exists (
      select 1 from public.observations o
      where o.id = tasks.observation_id
        and o.author_id = auth.uid()
    )
  );

create policy "tasks_author_delete" on public.tasks
  for delete using (
    exists (
      select 1 from public.observations o
      where o.id = tasks.observation_id
        and o.author_id = auth.uid()
    )
  );

-- --- machines --------------------------------------------------------------
drop policy if exists "machines_member_select" on public.machines;
create policy "machines_member_select" on public.machines
  for select using (
    user_id = auth.uid()
    or (
      forest_id is not null
      and exists (
        select 1 from public.memberships m
        where m.forest_id = machines.forest_id
          and m.user_id = auth.uid()
      )
    )
  );

-- --- storage.objects read policy for observation-photos --------------------
-- The previous policy didn't guard null forest_id either. Tighten via the
-- same author-or-member check.
drop policy if exists "photos_member_read" on storage.objects;
create policy "photos_member_read" on storage.objects
  for select to authenticated using (
    bucket_id = 'observation-photos'
    and exists (
      select 1 from public.observation_photos p
      join public.observations o on o.id = p.observation_id
      where p.storage_path = storage.objects.name
        and (
          o.author_id = auth.uid()
          or (
            o.forest_id is not null
            and exists (
              select 1 from public.memberships m
              where m.forest_id = o.forest_id
                and m.user_id = auth.uid()
            )
          )
        )
    )
  );
