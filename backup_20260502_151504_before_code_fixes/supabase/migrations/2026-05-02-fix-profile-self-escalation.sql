-- ============================================================
-- 2026-05-02 — Security Fix #1: Block profile self-escalation
-- ============================================================
-- Problem: The existing "profiles_update" RLS policy uses USING
-- without WITH CHECK. A regular coach (or any authenticated user
-- with their own row in profiles) could call:
--   await supabase.from('profiles')
--     .update({ is_admin: true })
--     .eq('id', myUserId)
-- and the DB would happily save it because USING returns true
-- (auth.uid() = id), and there is no WITH CHECK to validate the
-- new row.
--
-- Fix: a BEFORE UPDATE trigger that runs at DB level. It checks
-- whether the caller (auth.uid()) is an approved admin. If not,
-- the protected columns (is_admin, is_approved, role) must not
-- change. The trigger uses SECURITY DEFINER so it can read the
-- profiles table without RLS interference, and SET search_path =
-- '' to mitigate search-path attacks.
--
-- Rollback at the bottom of this file.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_profile_no_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_is_admin boolean := false;
BEGIN
  -- Service role / postgres bypass: auth.uid() returns NULL for them.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Read caller's privileges directly (bypasses RLS thanks to SECURITY DEFINER).
  SELECT COALESCE(p.is_admin, false)
         AND p.role = 'trainer'
         AND COALESCE(p.is_approved, false)
    INTO caller_is_admin
    FROM public.profiles p
   WHERE p.id = auth.uid();

  -- Approved admin: allow any change.
  IF COALESCE(caller_is_admin, false) THEN
    RETURN NEW;
  END IF;

  -- Non-admin caller: protected columns must remain unchanged.
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Only an admin can change profiles.is_admin'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    RAISE EXCEPTION 'Only an admin can change profiles.is_approved'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only an admin can change profiles.role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_no_self_escalation
  ON public.profiles;

CREATE TRIGGER trg_enforce_profile_no_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_no_self_escalation();

COMMIT;

-- ============================================================
-- Rollback (run if anything breaks)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_enforce_profile_no_self_escalation
--   ON public.profiles;
-- DROP FUNCTION IF EXISTS public.enforce_profile_no_self_escalation();
-- COMMIT;
