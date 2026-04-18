-- כשמוחקים שורה מ-members, מוחקים אוטומטית גם את המשתמש המקביל ב-auth.users
-- SECURITY DEFINER: הטריגר רץ בהרשאות של בעל הפונקציה (postgres), לא של המשתמש שגורם למחיקה
-- כך מחיקה מה-UI של מאמן/מנהל תמחק גם את חשבון ה-Auth, והמייל ישתחרר להרשמה חוזרת

CREATE OR REPLACE FUNCTION delete_auth_user_on_member_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- מוחק רק אם ה-id של המתאמן תואם ל-user ב-auth (חלק מהמתאמנים הישנים אולי לא מקושרים)
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    -- אם מסיבה כלשהי המחיקה ב-auth נכשלה — אל תפיל את המחיקה ב-members
    RAISE WARNING 'Failed to delete auth.user for member %: %', OLD.id, SQLERRM;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_auth_user_on_member_delete ON members;

CREATE TRIGGER trg_delete_auth_user_on_member_delete
AFTER DELETE ON members
FOR EACH ROW
EXECUTE FUNCTION delete_auth_user_on_member_delete();
