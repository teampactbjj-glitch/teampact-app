-- ============================================================
-- 2026-05-02 — Security Fix #5: Block account takeover via members.id update
-- ============================================================
-- Problem: AthleteDashboard.jsx:1190-1213 has a "link" flow that
-- updates members.id to match auth.uid() when an athlete logs in
-- and their auth user id doesn't yet match an existing members
-- row. Without DB protection, an attacker who can reach the
-- update API could:
--   1. Pick any victim's members row (still publicly readable
--      pre-fix-#2-Phase-B).
--   2. POST update { id: <attacker auth.uid> } where id = <victim id>
--   3. Now the attacker's auth user "owns" the victim's
--      training history, payments, profile.
--
-- Fix: BEFORE UPDATE OF id trigger that only permits the change if:
--   (a) Caller is an approved trainer (legitimate admin op), OR
--   (b) Caller is claiming an unclaimed row that matches their
--       own auth email (NEW.id = auth.uid() AND lower(OLD.email)
--       = lower(caller's auth email)).
--
-- Note: this also depends on Supabase Auth enforcing email
-- verification — otherwise an attacker could register an auth
-- user with a victim's email. Email verification SHOULD already
-- be on; verify in Supabase Auth settings.
--
-- Rollback at the bottom.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_member_id_self_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  caller_email text;
BEGIN
  -- Service role / postgres bypass.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- No id change → nothing to enforce.
  IF NEW.id IS NOT DISTINCT FROM OLD.id THEN
    RETURN NEW;
  END IF;

  -- Approved trainers: allow the change (admin-style relinking).
  IF public.is_approved_trainer() THEN
    RETURN NEW;
  END IF;

  -- Self-link path:
  --   - new id must be the caller's auth.uid()
  --   - the existing row's email must match the caller's auth email
  --     (case-insensitive). This is the "I'm claiming MY record" check.
  caller_email := lower(COALESCE(auth.jwt() ->> 'email', ''));

  IF NEW.id = auth.uid()
     AND OLD.email IS NOT NULL
     AND lower(OLD.email) = caller_email
     AND caller_email <> ''
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Account takeover blocked: members.id may only be set to your own auth.uid(), and only on a row whose email matches your authenticated email.'
    USING ERRCODE = '42501';
END;
$func$;

DROP TRIGGER IF EXISTS trg_enforce_member_id_self_link ON public.members;

CREATE TRIGGER trg_enforce_member_id_self_link
  BEFORE UPDATE OF id ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_member_id_self_link();

COMMIT;

-- ============================================================
-- Rollback
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_enforce_member_id_self_link ON public.members;
-- DROP FUNCTION IF EXISTS public.enforce_member_id_self_link();
-- COMMIT;
