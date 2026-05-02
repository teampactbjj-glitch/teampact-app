-- ============================================================
-- 2026-05-02 — Security Fix #1.3: Admin / Trainer Split
-- ============================================================
-- Business rule (per Dudi):
--
--   Regular trainer:
--     - SELECT  members            → ALLOWED (sees athletes)
--     - INSERT  members            → ALLOWED (can add athletes)
--     - UPDATE  members            → ALLOWED (can edit athlete details)
--     - DELETE  members            → BLOCKED (only admin can hard-delete)
--     - DELETE  class_registrations → ALLOWED (handled elsewhere)
--     - DELETE  coaches / profiles → BLOCKED (only admin)
--
--   Admin (is_admin = true):
--     - everything above is ALLOWED.
--
-- The over-permissive `members_all_trainer` and `coaches_all` style
-- policies are replaced with explicit, granular ones.
--
-- Helper functions used:
--   public.is_approved_admin()    — returns boolean
--   public.is_approved_trainer()  — returns boolean
-- (Both already exist from 2026-05-02-fix-profile-change-requests-rls.sql)
--
-- Rollback at bottom of file.
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. members — split per-operation
-- ---------------------------------------------------------------

-- Drop old "anything goes for any trainer" policy (created via dashboard,
-- not in migrations folder; IF EXISTS keeps this idempotent).
DROP POLICY IF EXISTS "members_all_trainer" ON public.members;
DROP POLICY IF EXISTS "members_all_admin"   ON public.members;

-- SELECT — any approved trainer (admin OR regular) can read all members.
DROP POLICY IF EXISTS "members_select_trainer" ON public.members;
CREATE POLICY "members_select_trainer" ON public.members
  FOR SELECT
  TO authenticated
  USING (public.is_approved_trainer());

-- INSERT — any approved trainer can add a new member.
DROP POLICY IF EXISTS "members_insert_trainer" ON public.members;
CREATE POLICY "members_insert_trainer" ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_approved_trainer());

-- UPDATE — any approved trainer can edit member details.
-- (per Dudi's spec: trainers may need to edit details for their branch)
DROP POLICY IF EXISTS "members_update_trainer" ON public.members;
CREATE POLICY "members_update_trainer" ON public.members
  FOR UPDATE
  TO authenticated
  USING (public.is_approved_trainer())
  WITH CHECK (public.is_approved_trainer());

-- DELETE — only an approved admin can hard-delete a member.
-- (Soft-delete via UPDATE deleted_at = now() is still allowed for trainers
--  through the UPDATE policy above.)
DROP POLICY IF EXISTS "members_delete_admin" ON public.members;
CREATE POLICY "members_delete_admin" ON public.members
  FOR DELETE
  TO authenticated
  USING (public.is_approved_admin());

-- ---------------------------------------------------------------
-- 2. coaches — only admin can DELETE
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "coaches_all"          ON public.coaches;
DROP POLICY IF EXISTS "coaches_all_trainer"  ON public.coaches;
DROP POLICY IF EXISTS "coaches_modify"       ON public.coaches;

-- SELECT — any approved trainer reads the coaches roster.
DROP POLICY IF EXISTS "coaches_select_trainer" ON public.coaches;
CREATE POLICY "coaches_select_trainer" ON public.coaches
  FOR SELECT
  TO authenticated
  USING (public.is_approved_trainer());

-- INSERT — only admin can add a new coach record.
DROP POLICY IF EXISTS "coaches_insert_admin" ON public.coaches;
CREATE POLICY "coaches_insert_admin" ON public.coaches
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_approved_admin());

-- UPDATE — only admin can rename / move-branch a coach.
DROP POLICY IF EXISTS "coaches_update_admin" ON public.coaches;
CREATE POLICY "coaches_update_admin" ON public.coaches
  FOR UPDATE
  TO authenticated
  USING (public.is_approved_admin())
  WITH CHECK (public.is_approved_admin());

-- DELETE — only admin can delete a coach.
DROP POLICY IF EXISTS "coaches_delete_admin" ON public.coaches;
CREATE POLICY "coaches_delete_admin" ON public.coaches
  FOR DELETE
  TO authenticated
  USING (public.is_approved_admin());

-- ---------------------------------------------------------------
-- 3. profiles — DELETE restricted to admin
-- ---------------------------------------------------------------
-- The CoachesManager rejects pending trainer requests via
-- `from('profiles').delete().eq('id', t.id)` — this should be admin-only.
-- We do NOT touch SELECT/UPDATE here; those are already protected by
-- 2026-05-02-fix-profile-self-escalation.sql + existing RLS.

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (public.is_approved_admin());

COMMIT;

-- ============================================================
-- ROLLBACK (run only if you need to revert)
-- ============================================================
-- BEGIN;
--   DROP POLICY IF EXISTS "members_select_trainer"  ON public.members;
--   DROP POLICY IF EXISTS "members_insert_trainer"  ON public.members;
--   DROP POLICY IF EXISTS "members_update_trainer"  ON public.members;
--   DROP POLICY IF EXISTS "members_delete_admin"    ON public.members;
--
--   DROP POLICY IF EXISTS "coaches_select_trainer"  ON public.coaches;
--   DROP POLICY IF EXISTS "coaches_insert_admin"    ON public.coaches;
--   DROP POLICY IF EXISTS "coaches_update_admin"    ON public.coaches;
--   DROP POLICY IF EXISTS "coaches_delete_admin"    ON public.coaches;
--
--   DROP POLICY IF EXISTS "profiles_delete_admin"   ON public.profiles;
--
--   -- (You'd then re-create the previous "_all" policy if you need to.)
-- COMMIT;
