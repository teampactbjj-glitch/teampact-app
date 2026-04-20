-- ============================================================
-- Migration: Block pending members from booking/ordering via RLS
--
-- Context: authenticated users with a `members` row whose status
-- is 'pending' could INSERT/UPDATE/DELETE into member_classes,
-- class_registrations, and product_requests. Several accumulated
-- `USING (true)` policies bypass any stricter gate. This migration
-- drops the permissive legacy policies and installs a single set
-- keyed off members.status.
--
-- Anon (phone-login) path is preserved via auth.uid() IS NULL —
-- phone-only athletes never acquire a Supabase auth session.
-- ============================================================

-- Helper: true when the current auth user may book/order.
-- SECURITY DEFINER so it can read members/profiles regardless of RLS.
CREATE OR REPLACE FUNCTION public.current_user_can_book()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NULL
    OR EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = auth.uid()
        AND m.status IN ('approved', 'active')
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'trainer'
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_book() TO anon, authenticated;

-- ============================================================
-- member_classes
-- ============================================================
DROP POLICY IF EXISTS "allow_all_member_classes"  ON member_classes;
DROP POLICY IF EXISTS "ניהול שיוך קבוצות"          ON member_classes;
DROP POLICY IF EXISTS "member_classes_all"        ON member_classes;
DROP POLICY IF EXISTS "member_classes_insert"     ON member_classes;
DROP POLICY IF EXISTS "member_classes_delete"     ON member_classes;

CREATE POLICY "member_classes_insert" ON member_classes
  FOR INSERT WITH CHECK (public.current_user_can_book());

CREATE POLICY "member_classes_delete" ON member_classes
  FOR DELETE USING (public.current_user_can_book());

-- member_classes_select (SELECT USING true) is kept as-is.

-- ============================================================
-- class_registrations
-- ============================================================
DROP POLICY IF EXISTS "allow_all_class_registrations" ON class_registrations;
DROP POLICY IF EXISTS "athletes register themselves"  ON class_registrations;
DROP POLICY IF EXISTS "class_registrations_write"     ON class_registrations;
DROP POLICY IF EXISTS "class_reg_write"               ON class_registrations;

CREATE POLICY "class_registrations_write" ON class_registrations
  FOR ALL USING (
    (auth.uid() = athlete_id AND public.current_user_can_book())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  )
  WITH CHECK (
    (auth.uid() = athlete_id AND public.current_user_can_book())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- SELECT policies left as-is.

-- ============================================================
-- product_requests
-- ============================================================
DROP POLICY IF EXISTS "allow_all_product_requests_trainer" ON product_requests;
DROP POLICY IF EXISTS "allow_insert_product_requests"      ON product_requests;
DROP POLICY IF EXISTS "athletes can insert requests"       ON product_requests;
DROP POLICY IF EXISTS "insert requests"                    ON product_requests;
DROP POLICY IF EXISTS "product_req_insert"                 ON product_requests;
DROP POLICY IF EXISTS "product_requests_insert"            ON product_requests;
DROP POLICY IF EXISTS "anyone can update requests"         ON product_requests;
DROP POLICY IF EXISTS "update requests"                    ON product_requests;
DROP POLICY IF EXISTS "product_requests_update"            ON product_requests;
DROP POLICY IF EXISTS "product_req_write"                  ON product_requests;

-- Approved members (or trainers) can create requests.
CREATE POLICY "product_requests_insert" ON product_requests
  FOR INSERT WITH CHECK (public.current_user_can_book());

-- Only trainers/admins can update.
CREATE POLICY "product_requests_update" ON product_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'trainer' OR is_admin = true)
    )
  );

-- product_req_delete_own (own pending delete) and the SELECT
-- policies are kept as-is.
