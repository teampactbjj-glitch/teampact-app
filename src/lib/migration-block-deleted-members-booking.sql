-- ============================================================
-- Migration: חסימת מתאמן שנמחק (soft-delete) מהרשמה/הזמנה
-- תאריך: 19.06.2026
-- ============================================================
-- באג: המחיקה היא soft-delete (טריגר tr_soft_delete מסמן deleted_at
-- ומשאיר status='approved'/'active'). הפונקציה current_user_can_book()
-- בדקה רק status IN ('approved','active') ולא את deleted_at — לכן מתאמן
-- שנמחק עדיין הצליח להירשם לאימונים / להזמין.
--
-- תיקון: מוסיפים תנאי m.deleted_at IS NULL. כל ה-policies של כתיבה
-- (member_classes / class_registrations / product_requests) משתמשות
-- בפונקציה הזו, אז התיקון חוסם בכל המקומות בבת אחת.
--
-- בטוח: CREATE OR REPLACE, רק מוסיף תנאי מחמיר. בוגרים פעילים שלא נמחקו
-- (deleted_at IS NULL) — אפס שינוי בהתנהגות.
-- להריץ ב-Supabase SQL Editor.
-- ============================================================

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
        AND m.deleted_at IS NULL          -- ← התיקון: מתאמן שנמחק חסום
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'trainer'
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_book() TO anon, authenticated;
