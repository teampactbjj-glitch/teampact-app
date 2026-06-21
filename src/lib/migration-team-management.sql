-- ============================================================
-- migration-team-management.sql
-- פריט 2 (Backlog) — מסך ניהול צוות: הרשאות תפקיד מאובטחות
-- ============================================================
-- מטרה:
--   1. לסגור חור אבטחה: היום profiles_update מאפשר ל-auth.uid()=id
--      לעדכן את עצמו, כולל is_admin → משתמש יכול תיאורטית להפוך את עצמו
--      למנהל. נסגור בעזרת טריגר BEFORE UPDATE.
--   2. לאפשר למנהל למנות/להוריד is_admin של אחרים — בבטחה.
--   3. הגנת מנהל אחרון: אסור להוריד is_admin אם זה המנהל היחיד שנשאר.
--   4. שכבת "בעלים" (is_owner): מנהל-על מוגן. מנהל רגיל לא יכול להסיר
--      את הבעלים או לשנות את סטטוס הבעלים. מתאים גם למכירה עתידית —
--      כל לקוח חדש = הבעלים של המועדון שלו, מוגן מהמנהלים שהוא ממנה.
-- ============================================================

-- (1) עמודת בעלים — מנהל-על מוגן
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- (2) הטריגר המאבטח
-- הערה: הודעות ה-RAISE באנגלית בכוונה — טקסט עברי (RTL) בתוך גוף הפונקציה
-- שובר את ההדבקה ב-SQL Editor של Supabase. ה-UI מציג הודעות בעברית בנפרד.
CREATE OR REPLACE FUNCTION protect_profile_privileges()
RETURNS TRIGGER AS $fn$
DECLARE
  caller_is_admin boolean;
  caller_is_owner boolean;
  admin_count int;
  privileged_changed boolean;
BEGIN
  -- קשר שרת מהימן (SQL Editor / service_role / bootstrap) — אין JWT, auth.uid() ריק.
  -- מאפשרים בלי בדיקות, כדי לא לחסום הקמת בעלים/מנהל ראשון ידנית.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- מי הקורא: מנהל מאושר? בעלים?
  SELECT (p.is_admin = true AND p.is_approved = true), COALESCE(p.is_owner, false)
    INTO caller_is_admin, caller_is_owner
    FROM profiles p
    WHERE p.id = auth.uid();
  caller_is_admin := COALESCE(caller_is_admin, false);
  caller_is_owner := COALESCE(caller_is_owner, false);

  -- האם השתנה אחד מהשדות הרגישים (תפקיד/הרשאה)
  privileged_changed :=
       (NEW.is_admin            IS DISTINCT FROM OLD.is_admin)
    OR (NEW.is_approved          IS DISTINCT FROM OLD.is_approved)
    OR (NEW.is_secretary         IS DISTINCT FROM OLD.is_secretary)
    OR (NEW.secretary_branch_id  IS DISTINCT FROM OLD.secretary_branch_id)
    OR (NEW.role                 IS DISTINCT FROM OLD.role);

  -- רק מנהל מאושר רשאי לשנות שדות תפקיד/הרשאה (גם לא על עצמו)
  IF privileged_changed AND NOT caller_is_admin THEN
    RAISE EXCEPTION 'Only an admin can change role/permission fields';
  END IF;

  -- רק הבעלים יכול לשנות את סטטוס הבעלים (אף מנהל אחר לא)
  IF (NEW.is_owner IS DISTINCT FROM OLD.is_owner) AND NOT caller_is_owner THEN
    RAISE EXCEPTION 'Only the owner can change owner status';
  END IF;

  -- הגנת הבעלים: אי אפשר להוריד את הרשאות המנהל של הבעלים — רק הבעלים עצמו
  IF OLD.is_owner = true AND NEW.is_admin = false AND NOT caller_is_owner THEN
    RAISE EXCEPTION 'Cannot remove owner admin rights - owner only';
  END IF;

  -- הגנת מנהל אחרון: אסור להוריד is_admin אם נשאר מנהל יחיד
  IF OLD.is_admin = true AND NEW.is_admin = false THEN
    SELECT count(*) INTO admin_count FROM profiles WHERE is_admin = true;
    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last admin - at least one must remain';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_privileges();

-- (3) bootstrap — דודי = הבעלים (מנהל-על). מזוהה לפי email.
--     רץ בקשר SQL Editor (auth.uid() ריק) ולכן עוקף את הטריגר.
UPDATE profiles
   SET is_owner = true, is_admin = true, is_approved = true
 WHERE email = 'teampactbjj@gmail.com';

-- ============================================================
-- בדיקות ידניות מומלצות:
--   1. כמנהל רגיל: לנסות "הסר ניהול" על הבעלים → אמור להיכשל.
--   2. כבעלים: למנות מנהל נוסף → אמור לעבוד.
--   3. כמשתמש רגיל: UPDATE profiles SET is_admin=true WHERE id=auth.uid(); → אמור להיכשל.
--   4. לוודא שדודי מסומן: SELECT email, is_owner, is_admin FROM profiles WHERE is_owner;
-- ============================================================
