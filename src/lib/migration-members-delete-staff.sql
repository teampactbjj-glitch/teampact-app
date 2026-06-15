-- ============================================================
-- Migration: מחיקת מתאמנים — policy DELETE אחיד לצוות
-- ============================================================
-- בעיה: אדמין (דודי) ומזכירות לוחצים "דחה" על מתאמן ממתין →
--        "אין הרשאה". הסיבה (מאבחון pg_policies):
--        - members_delete_admin בודקת is_approved_admin() → false עבור דודי
--        - members_delete_trainer / members_all_trainer דורשות role='trainer'
--          → התפקיד של דודי אינו 'trainer'
--        דודי מזוהה כאדמין דרך profiles.is_admin=true (כך הוא רואה את כל המתאמנים),
--        אבל אף policy של DELETE לא בדקה את הדגל הזה → DELETE נחסם בשקט (0 שורות).
--
-- פתרון: policy DELETE אחד וברור שמכסה את כל הצוות:
--        is_admin=true  או  is_secretary=true  או  מאמן מאושר (role='trainer' AND is_approved).
--        מחיקה קשיחה מפעילה את הטריגר שמוחק גם את חשבון ה-auth ומשחרר את המייל.
-- בטוח להריץ יותר מפעם אחת.
-- ============================================================

ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- ניקוי מדיניות DELETE ישנות/כפולות
DROP POLICY IF EXISTS "members_delete_admin"   ON members;
DROP POLICY IF EXISTS "members_delete_trainer" ON members;
DROP POLICY IF EXISTS "members_delete_staff"   ON members;

-- policy DELETE אחיד: אדמין / מזכירה / מאמן מאושר
CREATE POLICY "members_delete_staff" ON members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (
          is_admin = true
          OR is_secretary = true
          OR (role = 'trainer' AND is_approved = true)
        )
    )
  );

-- ודא שטריגר ה-cascade שמשחרר את המייל קיים (מחיקת auth.user בעת מחיקת member)
CREATE OR REPLACE FUNCTION delete_auth_user_on_member_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to delete auth.user for member %: %', OLD.id, SQLERRM;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_auth_user_on_member_delete ON members;
CREATE TRIGGER trg_delete_auth_user_on_member_delete
AFTER DELETE ON members
FOR EACH ROW
EXECUTE FUNCTION delete_auth_user_on_member_delete();

-- רענון cache של ה-schema
NOTIFY pgrst, 'reload schema';
