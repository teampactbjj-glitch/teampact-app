-- ============================================================
-- 2026-05-02 — Security Fix #4: Tighten profile_change_requests RLS
-- ============================================================
-- Problem: existing policies have qual=true / with_check=true,
-- meaning ANY authenticated user can:
--   - SELECT every change request in the system
--   - UPDATE any change request (including approving their own!)
--
-- Fix:
--   SELECT — only the owner (athlete_id = auth.uid()) OR an admin/trainer
--   INSERT — only as yourself (athlete_id must equal auth.uid())
--   UPDATE — only an approved admin (reviewers)
--   DELETE — only an approved admin (cleanup)
--
-- Rollback at the bottom of this file.
-- ============================================================

BEGIN;

-- Helper: returns true if the calling auth.uid() is an approved admin.
-- SECURITY DEFINER so it bypasses RLS on profiles.
CREATE OR REPLACE FUNCTION public.is_approved_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  result boolean;
BEGIN
  SELECT COALESCE(p.is_admin, false)
         AND p.role = 'trainer'
         AND COALESCE(p.is_approved, false)
    INTO result
    FROM public.profiles p
   WHERE p.id = auth.uid();
  RETURN COALESCE(result, false);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.is_approved_admin() TO anon, authenticated;

-- Helper: returns true if the calling auth.uid() is an approved trainer (admin or not).
CREATE OR REPLACE FUNCTION public.is_approved_trainer()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  result boolean;
BEGIN
  SELECT p.role = 'trainer' AND COALESCE(p.is_approved, false)
    INTO result
    FROM public.profiles p
   WHERE p.id = auth.uid();
  RETURN COALESCE(result, false);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.is_approved_trainer() TO anon, authenticated;

-- Drop the over-permissive existing policies.
DROP POLICY IF EXISTS "insert profile requests" ON public.profile_change_requests;
DROP POLICY IF EXISTS "read profile requests"   ON public.profile_change_requests;
DROP POLICY IF EXISTS "update profile requests" ON public.profile_change_requests;

-- New policies:

-- SELECT — owner sees own requests; trainers (admin or not) see all
-- (because the TrainerDashboard pending-requests UI needs to read them).
CREATE POLICY "pcr_select_owner_or_trainer" ON public.profile_change_requests
  FOR SELECT
  TO authenticated
  USING (
    athlete_id = auth.uid()
    OR public.is_approved_trainer()
  );

-- INSERT — athlete can only create requests for themselves.
CREATE POLICY "pcr_insert_self" ON public.profile_change_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    athlete_id = auth.uid()
  );

-- UPDATE — admin only (e.g., reviewers approving/rejecting).
CREATE POLICY "pcr_update_admin" ON public.profile_change_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_approved_admin())
  WITH CHECK (public.is_approved_admin());

-- DELETE — admin only (cleanup).
CREATE POLICY "pcr_delete_admin" ON public.profile_change_requests
  FOR DELETE
  TO authenticated
  USING (public.is_approved_admin());

COMMIT;

-- ============================================================
-- Rollback
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "pcr_select_owner_or_trainer" ON public.profile_change_requests;
-- DROP POLICY IF EXISTS "pcr_insert_self"             ON public.profile_change_requests;
-- DROP POLICY IF EXISTS "pcr_update_admin"            ON public.profile_change_requests;
-- DROP POLICY IF EXISTS "pcr_delete_admin"            ON public.profile_change_requests;
-- -- Restore original permissive policies if you need them back:
-- CREATE POLICY "insert profile requests" ON public.profile_change_requests FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "read profile requests"   ON public.profile_change_requests FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "update profile requests" ON public.profile_change_requests FOR UPDATE TO authenticated USING (true);
-- COMMIT;
