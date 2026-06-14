-- ============================================================================
-- מזכיר/ה — הרשאת עריכה/אישור מתאמנים (bypass בטריגר)
-- ============================================================================
-- בעיה: מזכירה לוחצת "אשר" → שגיאה:
--       "עריכת פרטי מתאמן/מנוי מותרת רק למנהל. נא לפנות למנהל לאישור השינוי."
-- סיבה: הטריגר enforce_member_edit_admin_only חוסם שינוי שדות אישיים
--       (active, membership_type, subscription_type וכו') לכל מי שאינו
--       is_approved_admin(). באישור מתאמן משתנים active + subscription_type,
--       ולכן הטריגר זורק שגיאה למזכירה.
--
-- פתרון: הוספת bypass למזכיר/ה (role='trainer' AND is_secretary=true).
--        המזכירה מוגדרת ידנית ע"י האדמין, ובאפליקציה היא מקבלת ניהול מלא
--        על מתאמני הסניף שלה — אז עריכה/אישור צריכים לעבוד.
--        שאר הלוגיקה (admin bypass, sync_email, status/id/deleted_at) ללא שינוי.
-- בטוח להריץ יותר מפעם אחת.
-- ============================================================================

BEGIN;

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

  -- מזכיר/ה — מורשה לנהל/לאשר מתאמנים (כמו אדמין לעניין עריכה)
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'trainer'
      AND is_secretary = true
  ) THEN
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

COMMIT;
