-- ============================================================================
-- סנכרון אוטומטי של מייל הקשר עם מייל ההתחברות
-- ============================================================================
-- רקע: שינוי מייל באפליקציה מעדכן רק את auth.users (מייל ההתחברות).
--      מייל הקשר ב-members ו-profiles נשאר ישן, כי trigger
--      enforce_member_edit_admin_only חוסם עריכת members.email ע"י לא-אדמין.
--
-- פתרון: trigger על auth.users שמסנכרן את המייל החדש ל-members + profiles
--        (לפי id) אחרי אישור שינוי המייל. רץ עם הרשאות מערכת (SECURITY DEFINER),
--        ומשתמש בדגל session app.sync_email כדי לעקוף את trigger החסימה.
-- ============================================================================

BEGIN;

-- 1. עדכון trigger החסימה — מוסיף bypass לסנכרון המערכתי בלבד.
CREATE OR REPLACE FUNCTION public.enforce_member_edit_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Bypass: סנכרון מייל אוטומטי מ-auth.users (דגל session) — לא חסימה
  IF current_setting('app.sync_email', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- אדמין מאושר — מותר הכל
  IF public.is_approved_admin() THEN
    RETURN NEW;
  END IF;

  -- שינוי id (linking של אתלט עצמו) — מותר
  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RETURN NEW;
  END IF;

  -- שינוי status (workflow) — מותר
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- שינוי deleted_at (soft-delete) — מותר
  IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
    RETURN NEW;
  END IF;

  -- אחרי כל ה-bypasses: אם השתנה משהו "אישי" — חסום
  IF (OLD.full_name           IS DISTINCT FROM NEW.full_name)
   OR (OLD.email              IS DISTINCT FROM NEW.email)
   OR (OLD.phone              IS DISTINCT FROM NEW.phone)
   OR (OLD.membership_type    IS DISTINCT FROM NEW.membership_type)
   OR (OLD.subscription_type  IS DISTINCT FROM NEW.subscription_type)
   OR (OLD.group_ids          IS DISTINCT FROM NEW.group_ids)
   OR (OLD.group_id           IS DISTINCT FROM NEW.group_id)
   OR (OLD.branch_ids         IS DISTINCT FROM NEW.branch_ids)
   OR (OLD.branch_id          IS DISTINCT FROM NEW.branch_id)
   OR (OLD.active             IS DISTINCT FROM NEW.active)
   OR (OLD.coach_id           IS DISTINCT FROM NEW.coach_id)
   OR (OLD.group_name         IS DISTINCT FROM NEW.group_name)
  THEN
    RAISE EXCEPTION 'עריכת פרטי מתאמן/מנוי מותרת רק למנהל. נא לפנות למנהל לאישור השינוי.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. פונקציית הסנכרון — רצה כשמייל ב-auth.users משתנה.
CREATE OR REPLACE FUNCTION public.sync_email_on_auth_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    BEGIN
      -- דגל שמתיר ל-trigger החסימה לעבור את עדכון המייל
      PERFORM set_config('app.sync_email', '1', true);
      UPDATE public.members  SET email = NEW.email WHERE id = NEW.id;
      UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
      PERFORM set_config('app.sync_email', '0', true);
    EXCEPTION WHEN OTHERS THEN
      -- לעולם לא לחסום את שינוי המייל ב-Auth, גם אם הסנכרון נכשל
      PERFORM set_config('app.sync_email', '0', true);
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. ה-trigger על auth.users.
DROP TRIGGER IF EXISTS trg_sync_email_on_auth_change ON auth.users;
CREATE TRIGGER trg_sync_email_on_auth_change
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_email_on_auth_change();

COMMIT;

-- ============================================================================
-- ROLLBACK (אם נדרש לבטל):
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_sync_email_on_auth_change ON auth.users;
-- DROP FUNCTION IF EXISTS public.sync_email_on_auth_change();
-- ואז להריץ מחדש את 2026-05-02-fix-trainer-cannot-edit-member-fields.sql
-- כדי להחזיר את enforce_member_edit_admin_only לגרסה ללא ה-bypass.
-- ============================================================================
