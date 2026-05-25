-- ============================================================
-- 2026-05-02 — Security Fix #2 (Phase A): Restrict members anon exposure
-- ============================================================
-- Problem: members_select_anon = FOR SELECT USING (true). Anyone
-- (no auth) can `select *` and pull every member's full record:
-- name, phone, email, branch, status, etc.
--
-- The only legitimate anon use case is the registration page check:
-- "is there already a member with this phone+name?"
--
-- Phase A (this migration): introduce a tightly-scoped RPC for that
-- check, plus an authenticated-self SELECT policy for the cases
-- where a logged-in user reads their own member row. Keep the
-- existing open policy for backwards compatibility.
--
-- Phase B (next migration, after the app code is updated to call
-- the RPC and Vercel has deployed): drop members_select_anon.
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- RPC: check_member_registration_exists(phone, full_name)
-- Returns jsonb { exists: bool, status: text } — does NOT leak
-- any other field. Anon can call it; that's the entire intended
-- anon access surface to members.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_member_registration_exists(
  p_phone     text,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_status text;
BEGIN
  -- Trim + normalize on both sides to make matching tolerant.
  p_phone     := regexp_replace(COALESCE(p_phone, ''), '[\s\-\(\)]', '', 'g');
  p_full_name := btrim(COALESCE(p_full_name, ''));

  IF p_phone = '' OR p_full_name = '' THEN
    RETURN jsonb_build_object('exists', false, 'status', null);
  END IF;

  SELECT m.status
    INTO v_status
    FROM public.members m
   WHERE regexp_replace(COALESCE(m.phone, ''), '[\s\-\(\)]', '', 'g') = p_phone
     AND btrim(COALESCE(m.full_name, '')) = p_full_name
   LIMIT 1;

  RETURN jsonb_build_object(
    'exists', v_status IS NOT NULL,
    'status', v_status
  );
END;
$func$;

-- Allow anon + authenticated to call this RPC.
REVOKE ALL ON FUNCTION public.check_member_registration_exists(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_member_registration_exists(text, text) TO anon, authenticated;

-- ----------------------------------------------------------------
-- New policy: authenticated user can SELECT their own member row
-- (matched by id OR by email — covers AthleteDashboard's link flow).
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "members_select_self_authenticated" ON public.members;
CREATE POLICY "members_select_self_authenticated" ON public.members
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
  );

COMMIT;

-- ============================================================
-- Phase B (run separately, AFTER the app code is updated to use
-- the RPC and the change is deployed to production):
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "members_select_anon" ON public.members;
-- COMMIT;

-- ============================================================
-- Rollback for Phase A
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "members_select_self_authenticated" ON public.members;
-- DROP FUNCTION IF EXISTS public.check_member_registration_exists(text, text);
-- COMMIT;
