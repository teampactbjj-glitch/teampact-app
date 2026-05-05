-- ============================================================
-- 2026-05-05 — Security Fix: סגירת דליפת PII ל-authenticated
-- ============================================================
-- בעיה שתלמיד דיווח עליה: מתאמן מאומת רגיל הצליח להוציא דרך
-- supabase-js את כל הטבלה members (full_name, phone, email,
-- membership_type, belt וכו') וגם את כל profiles.
--
-- שורש הבעיה: שתי policies מותרות מדי שלא בדקו בעלות:
--   1) members."members read self"
--      USING (deleted_at IS NULL)  ← בלי שום בדיקת בעלות
--   2) profiles."allow authenticated read profiles"
--      USING (true)                ← פתוח לחלוטין למאומתים
--
-- (Phase A מ-2026-05-02 סגרה את חשיפת members ל-anon, אבל
--  השאירה את שתי הפוליסיות האלה לכל authenticated.)
--
-- התיקון: למחוק את שתי הפוליסיות הפרוצות, ולהחליף את זו של
-- profiles ב-3 policies מדויקות שמכסות בדיוק את הצרכים של
-- האפליקציה (מתאמן רואה עצמו + רואה מאמנים מאושרים, מאמן
-- רואה הכל, מנהל רואה הכל).
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- חלק A: members — מחיקת ה-policy הפרוצה
-- ----------------------------------------------------------------
-- כל הצרכים הלגיטימיים כבר מכוסים ע"י:
--   • members_select_self_authenticated  → המתאמן עצמו
--   • members_select_trainer             → is_approved_trainer()
--   • members_select                     → admin / coach בסניף
DROP POLICY IF EXISTS "members read self" ON public.members;

-- ----------------------------------------------------------------
-- חלק B: profiles — מחיקת הפרוצה + יצירת מחליפים מדויקים
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "allow authenticated read profiles" ON public.profiles;

-- B.1 — מתאמן רגיל יכול לראות פרופילים של מאמנים מאושרים
--       (נדרש כדי ש-AthleteDashboard יציג טלפון של המאמן)
DROP POLICY IF EXISTS "profiles_select_public_coaches" ON public.profiles;
CREATE POLICY "profiles_select_public_coaches" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    role = 'trainer'
    AND is_approved = true
  );

-- B.2 — מאמן מאושר יכול לקרוא את כל הפרופילים
DROP POLICY IF EXISTS "profiles_select_trainer" ON public.profiles;
CREATE POLICY "profiles_select_trainer" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_approved_trainer());

-- B.3 — מנהל יכול לקרוא את כל הפרופילים
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_approved_admin());

-- (ה-policy הקיים "קרא פרופיל עצמי" עם auth.uid() = id נשאר —
--  הוא מאפשר לכל אחד לקרוא את עצמו.)

COMMIT;

-- ============================================================
-- אימות אחרי הרצה — מה צפוי:
--   • members: 3 SELECT policies בלבד
--     (members_select, members_select_self_authenticated, members_select_trainer)
--   • profiles: 4 SELECT policies
--     (profiles_select_admin, profiles_select_public_coaches,
--      profiles_select_trainer, "קרא פרופיל עצמי")
-- ============================================================
-- SELECT tablename, policyname, cmd, roles, qual AS using_clause
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('members', 'profiles')
--   AND cmd IN ('SELECT', 'ALL')
-- ORDER BY tablename, cmd, policyname;
-- ============================================================

-- ============================================================
-- Rollback (במקרה חירום בלבד)
-- ============================================================
-- BEGIN;
-- CREATE POLICY "members read self" ON public.members
--   FOR SELECT TO authenticated USING (deleted_at IS NULL);
-- CREATE POLICY "allow authenticated read profiles" ON public.profiles
--   FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS "profiles_select_public_coaches" ON public.profiles;
-- DROP POLICY IF EXISTS "profiles_select_trainer" ON public.profiles;
-- DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
-- COMMIT;
