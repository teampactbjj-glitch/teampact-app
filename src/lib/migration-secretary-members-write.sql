-- ============================================================
-- Migration: הרשאת כתיבה על members למזכירות
-- ============================================================
-- בעיה: מזכירה לוחצת "אשר" / "דחה" על מתאמן ממתין → מקבלת שגיאה.
-- סיבה: ה-policy הפעיל "members_all_trainer" (מ-migration-coach-approval.sql)
--        מחייב role='trainer' AND is_approved=true עבור כל פעולת כתיבה.
--        המזכירה רואה מתאמנים דרך policy אחר (members_select_anon = SELECT לכולם),
--        אבל אם is_approved שלה אינו true — כל UPDATE/INSERT/DELETE נחסם בשקט (0 שורות).
--        גם "אשר" וגם "דחה" הם UPDATE על members, ולכן שניהם נכשלים.
--
-- הפתרון: לאפשר גם is_secretary=true לנהל מתאמנים, ללא תלות ב-is_approved.
--          המזכירה מוגדרת ידנית ע"י האדמין (CoachesManager), אז זה בטוח.
--          הסינון לסניף שלה נעשה ברמת האפליקציה (branchFilter).
-- בטוח להריץ יותר מפעם אחת.
-- ============================================================

ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- כתיבה כללית (UPDATE/INSERT/SELECT) — מאמן מאושר או מזכיר/ה
DROP POLICY IF EXISTS "members_all_trainer" ON members;
CREATE POLICY "members_all_trainer" ON members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'trainer'
        AND (is_approved = true OR is_secretary = true)
    )
  );

-- DELETE מפורש — מאמן מאושר או מזכיר/ה (ליישור קו עם המדיניות החדשה)
DROP POLICY IF EXISTS "members_delete_trainer" ON members;
CREATE POLICY "members_delete_trainer" ON members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'trainer'
        AND (is_approved = true OR is_secretary = true)
    )
  );

-- רענון cache של ה-schema
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- אבחון (אופציונלי) — הרץ בנפרד כדי לראות את כל ה-policies על members:
-- SELECT policyname, cmd, permissive, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'members'
-- ORDER BY cmd, policyname;
-- ============================================================
