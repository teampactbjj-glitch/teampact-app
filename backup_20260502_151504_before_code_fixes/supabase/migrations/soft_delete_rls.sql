-- Run once in Supabase SQL Editor, after soft_delete.sql.
-- Tightens the existing permissive "qual = true" SELECT/ALL policies so they
-- also exclude soft-deleted rows. Policies that already have a meaningful
-- expression get `AND deleted_at IS NULL` appended. This way the app code
-- doesn't need to sprinkle `.is('deleted_at', null)` on every query — the DB
-- refuses to return them.
--
-- Admin-only bypass: admins with is_admin=true keep full access through the
-- `*_admin` ALL policies (which we leave alone), so a future "trash" UI can
-- still surface deleted rows for restore.

-- ---------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------
alter policy "ניהול הודעות" on public.announcements
  using (deleted_at is null) with check (true);

alter policy "allow_read_announcements" on public.announcements
  using (deleted_at is null);

-- ---------------------------------------------------------------
-- classes — drop the redundant qual=true policies, keep the richer one
-- ---------------------------------------------------------------
alter policy "allow_read_classes" on public.classes
  using (deleted_at is null);
alter policy "קרא שיעורים" on public.classes
  using (deleted_at is null);
-- classes_select already has a meaningful expr — add the filter
alter policy "classes_select" on public.classes
  using ((deleted_at is null) and ((auth.uid() is null) or exists (
    select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'trainer'
  ) or (status = 'approved')));
alter policy "classes_write" on public.classes
  using (exists (
    select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'trainer'
  ));

-- ---------------------------------------------------------------
-- coaches
-- ---------------------------------------------------------------
alter policy "קרא מאמנים" on public.coaches
  using (deleted_at is null);
alter policy "allow authenticated read coaches" on public.coaches
  using (deleted_at is null);
alter policy "allow_read_coaches" on public.coaches
  using (deleted_at is null);

-- ---------------------------------------------------------------
-- members
-- ---------------------------------------------------------------
-- `members_admin` ALL policy: admins still see everything (incl. deleted)
-- `members_trainer_write` ALL policy: trainers managing their class — filter
alter policy "members_trainer_write" on public.members
  using ((deleted_at is null) and exists (
    select 1 from coaches co
    join classes c on c.coach_id = co.id
    where co.user_id = auth.uid()
      and (members.group_id = c.id or members.group_ids @> jsonb_build_array(c.id))
  ));
-- Overly permissive qual=true SELECTs → tighten to deleted_at filter only
alter policy "members_select_anon" on public.members using (deleted_at is null);
alter policy "members read self" on public.members using (deleted_at is null);
alter policy "members_phone_lookup" on public.members using (deleted_at is null);
-- "מאמן יכול לנהל מתאמנים" is ALL with qual=true — convert to deleted filter
alter policy "מאמן יכול לנהל מתאמנים" on public.members
  using (deleted_at is null) with check (true);
-- `members_select` already has a real expr — append deleted filter
alter policy "members_select" on public.members
  using ((deleted_at is null) and (
    (id = auth.uid()) or
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) or
    exists (select 1 from coaches co where co.user_id = auth.uid()
            and (co.branch_id = any(coalesce(members.branch_ids, array[members.branch_id]))
                 or co.branch_id = members.branch_id))
  ));

-- ---------------------------------------------------------------
-- product_orders
-- ---------------------------------------------------------------
alter policy "Allow all for authenticated" on public.product_orders
  using (deleted_at is null) with check (true);
