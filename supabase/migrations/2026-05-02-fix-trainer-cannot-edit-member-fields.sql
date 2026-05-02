-- ============================================================================
-- Bug fix: מאמן רגיל לא יכול לערוך פרטי מתאמן (כולל סוג מנוי) ישירות
-- ============================================================================
-- Symptom: מאמן רגיל פתח עריכת מתאמן ב-AthleteManagement → שינה את סוג המנוי →
--          השינוי נשמר ישירות במקום לדרוש אישור אדמין.
--
-- Root cause: ה-policy `members_update_trainer` (מתיקון 2026-05-02-fix-admin-trainer-split)
--             מתיר UPDATE לכל מאמן מאושר על כל שורה. אין הגבלת עמודות ב-RLS.
--
-- Fix: BEFORE UPDATE trigger שחוסם שינוי של עמודות אישיות/מנוי כשהקורא
--      אינו אדמין מאושר, *אלא אם* יחד עם זה משתנה גם status (flow של אישור/דחייה)
--      או deleted_at (soft-delete). זה משמר את כל ה-workflows הקיימים:
--        - approvePending: status pending→approved + subscription_type → מותר (status שונה)
--        - deleteAthlete (trainer): status →pending_deletion → מותר (status שונה)
--        - rejectPending (trainer): deleted_at → מותר (deleted_at שונה)
--        - LeadsManager.convertLead: status lead→active + subscription_type → מותר
--      וחוסם בדיוק את הבאג:
--        - saveAthlete (trainer, לא admin): UPDATE על subscription_type בלי שינוי status → BLOCKED
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_member_edit_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- אדמין מאושר — מותר הכל
  IF public.is_approved_admin() THEN
    RETURN NEW;
  END IF;

  -- שינוי id (linking של אתלט עצמו) — מותר. מוגן ע"י trg_enforce_member_id_self_link
  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RETURN NEW;
  END IF;

  -- שינוי status (workflow: אישור pending, בקשת מחיקה, ביטול בקשה, המרת lead) — מותר
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- שינוי deleted_at (soft-delete) — מותר
  IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
    RETURN NEW;
  END IF;

  -- אחרי שעברנו את כל ה-bypasses: אם השתנה משהו "אישי" — חסום
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

DROP TRIGGER IF EXISTS trg_enforce_member_edit_admin_only ON public.members;

CREATE TRIGGER trg_enforce_member_edit_admin_only
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_member_edit_admin_only();

-- ============================================================================
-- ROLLBACK (אם נדרש לבטל):
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_enforce_member_edit_admin_only ON public.members;
-- DROP FUNCTION IF EXISTS public.enforce_member_edit_admin_only();
-- ============================================================================
