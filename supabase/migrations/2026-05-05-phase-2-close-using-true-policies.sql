-- ============================================================
-- 2026-05-05 — Phase 2: סגירת 4 policies עם USING (true)
-- ============================================================
-- בעקבות החקירה שמצאה את דליפת ה-PII (ראה
-- 2026-05-05-fix-authenticated-pii-leak.sql), זיהיתי 4 policies
-- נוספות עם USING (true) לתפקיד public/anon, שלא קשורות לדליפת
-- members/profiles אבל עדיין חושפות מידע:
--   1) attendance.\"ניהול נוכחות\" — ALL public USING (true)
--   2) checkins.checkins_select — SELECT public USING (true)
--   3) class_registrations.class_registrations_read — USING (true)
--   4) product_requests.product_requests_read — USING (true)
--
-- מנגנון: לכל אחת — מחיקה והחלפה ב-policies מדויקות לפי
-- הצרכים בקוד (מתאמן רואה את שלו, מאמן/מנהל רואה הכל).
-- attendance לא משומש בכלל בקוד → רק admin/trainer יכולים לקרוא.
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1) attendance — לא משומש בקוד, סוגרים לחלוטין
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "ניהול נוכחות" ON public.attendance;

DROP POLICY IF EXISTS "attendance_select_admin" ON public.attendance;
CREATE POLICY "attendance_select_admin" ON public.attendance
  FOR SELECT
  TO authenticated
  USING (public.is_approved_admin());

DROP POLICY IF EXISTS "attendance_select_trainer" ON public.attendance;
CREATE POLICY "attendance_select_trainer" ON public.attendance
  FOR SELECT
  TO authenticated
  USING (public.is_approved_trainer());

-- ----------------------------------------------------------------
-- 2) checkins — מתאמן רואה את שלו, מאמן/מנהל הכל
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "checkins_select" ON public.checkins;

DROP POLICY IF EXISTS "checkins_select_self" ON public.checkins;
CREATE POLICY "checkins_select_self" ON public.checkins
  FOR SELECT
  TO authenticated
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS "checkins_select_trainer" ON public.checkins;
CREATE POLICY "checkins_select_trainer" ON public.checkins
  FOR SELECT
  TO authenticated
  USING (public.is_approved_trainer());

DROP POLICY IF EXISTS "checkins_select_admin" ON public.checkins;
CREATE POLICY "checkins_select_admin" ON public.checkins
  FOR SELECT
  TO authenticated
  USING (public.is_approved_admin());

-- ----------------------------------------------------------------
-- 3) class_registrations — מתאמן רואה את שלו, מאמן/מנהל הכל
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "class_registrations_read" ON public.class_registrations;

DROP POLICY IF EXISTS "class_reg_select_self" ON public.class_registrations;
CREATE POLICY "class_reg_select_self" ON public.class_registrations
  FOR SELECT
  TO authenticated
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS "class_reg_select_trainer" ON public.class_registrations;
CREATE POLICY "class_reg_select_trainer" ON public.class_registrations
  FOR SELECT
  TO authenticated
  USING (public.is_approved_trainer());

DROP POLICY IF EXISTS "class_reg_select_admin" ON public.class_registrations;
CREATE POLICY "class_reg_select_admin" ON public.class_registrations
  FOR SELECT
  TO authenticated
  USING (public.is_approved_admin());

-- ----------------------------------------------------------------
-- 4) product_requests — מתאמן רואה את שלו, מאמן/מנהל הכל
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "product_requests_read" ON public.product_requests;

DROP POLICY IF EXISTS "product_req_select_admin" ON public.product_requests;
CREATE POLICY "product_req_select_admin" ON public.product_requests
  FOR SELECT
  TO authenticated
  USING (public.is_approved_admin());

-- product_req_select_own ו-product_req_select (למאמן) כבר קיימים.

COMMIT;

-- ============================================================
-- VERIFY: מה נשאר עם USING (true) ל-public/anon אחרי התיקון?
-- ============================================================
-- SELECT tablename, policyname, cmd, roles, qual AS using_clause
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND qual::text = 'true'
--   AND ('public' = ANY(roles) OR 'anon' = ANY(roles))
-- ORDER BY tablename, cmd;
-- ============================================================

-- ============================================================
-- Rollback (חירום בלבד)
-- ============================================================
-- BEGIN;
-- CREATE POLICY "ניהול נוכחות" ON public.attendance FOR ALL TO public USING (true);
-- DROP POLICY IF EXISTS "attendance_select_admin" ON public.attendance;
-- DROP POLICY IF EXISTS "attendance_select_trainer" ON public.attendance;
-- CREATE POLICY "checkins_select" ON public.checkins FOR SELECT TO public USING (true);
-- DROP POLICY IF EXISTS "checkins_select_self" ON public.checkins;
-- DROP POLICY IF EXISTS "checkins_select_trainer" ON public.checkins;
-- DROP POLICY IF EXISTS "checkins_select_admin" ON public.checkins;
-- CREATE POLICY "class_registrations_read" ON public.class_registrations FOR SELECT TO public USING (true);
-- DROP POLICY IF EXISTS "class_reg_select_self" ON public.class_registrations;
-- DROP POLICY IF EXISTS "class_reg_select_trainer" ON public.class_registrations;
-- DROP POLICY IF EXISTS "class_reg_select_admin" ON public.class_registrations;
-- CREATE POLICY "product_requests_read" ON public.product_requests FOR SELECT TO public USING (true);
-- DROP POLICY IF EXISTS "product_req_select_admin" ON public.product_requests;
-- COMMIT;
