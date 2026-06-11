-- ============================================================
-- Migration: תיקון מחיקת מתאמנים (members) — policy DELETE תקין
-- ============================================================
-- בעיה: מנהל/מזכירה לוחצים "מחק" → המתאמן נשאר.
-- סיבה: ב-Supabase, כש-RLS חוסם DELETE הוא מחזיר 0 שורות *בלי error*,
--        אז הקוד חושב שהצליח. SELECT/UPDATE עובדים דרך policies אחרות,
--        ולכן רואים/עורכים מתאמנים תקין — רק DELETE נופל בשקט.
--
-- הפתרון: policy DELETE מפורש ל-role='trainer' (כולל מנהל ומזכירה).
-- בטוח להריץ יותר מפעם אחת.
-- ============================================================

-- 1) ודא ש-RLS פעיל
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- 2) policy DELETE מפורש לטריינרים/מנהל/מזכירה (כולם role='trainer')
DROP POLICY IF EXISTS "members_delete_trainer" ON members;
CREATE POLICY "members_delete_trainer" ON members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- 3) רענון cache של ה-schema
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- אבחון (אופציונלי) — הרץ בנפרד כדי לראות את כל ה-policies על members:
-- ============================================================
-- SELECT policyname, cmd, permissive, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'members'
-- ORDER BY cmd, policyname;
--
-- אם מופיעה policy מסוג RESTRICTIVE על DELETE — היא חוסמת גם אם הוספנו את שלנו.
-- במקרה כזה מחק אותה ידנית: DROP POLICY "<שם>" ON members;
