-- באג קריטי שהתגלה 06.09.2026 (דרך בדיקת פרו-רייטה, לא קשור במקור לבקשה) ותוקן.
-- הורץ בפועל בשני שלבים דרך mcp__Supabase__apply_migration (השלב הראשון לא עבד,
-- ראו הסבר למטה) — קובץ זה משקף רק את הגרסה הסופית הנכונה, לתיעוד/ביקורת.
--
-- מה קרה: trg_enforce_member_edit_admin_only חוסם שינוי בשדות רגישים (active, branch_id,
-- subscription_type ועוד) אלא אם is_approved_admin() (דורש auth.uid()) או מזכירת סניף
-- (גם דורש auth.uid()). קריאת Edge Function עם ה-service role key (למשל
-- invoice4u-callback, כשמאשר אוטומטית הרשמה שהסכום ששולם תואם למחירון) אין לה auth.uid()
-- בכלל — אז נחסמה תמיד עם שגיאת 42501. וכיוון שזה טריגר BEFORE UPDATE, כל ה-UPDATE
-- נכשל בשלמותו (לא רק השדה 'active') — כלומר גם payment_status/paid_amount/
-- invoice4u_last_charge_status לא היו נשמרים בכלל, למרות שהתשלום עצמו הצליח ב-Invoice4u.
-- המשמעות: האישור האוטומטי (auto-approve) מעולם לא עבד בפועל, מאז שהמערכת עלתה היום.
-- נבדק ואומת: 0 מתאמנים אמיתיים (לא בדיקה) נפגעו מזה עד כה — הבאג נתפס באותו יום
-- שבו הפיצ'ר עלה, לפני שהיה זמן לרישום אמיתי עם מחיר תואם.
--
-- ניסיון תיקון ראשון (current_user='service_role') לא עבד: בתוך פונקציה
-- SECURITY DEFINER, current_user הופך להיות ה-owner של הפונקציה (postgres), לא התפקיד
-- שבאמת קורא לה. auth.role() קורא GUC ברמת ה-session (request.jwt.claim.role) שלא
-- מושפע מ-SECURITY DEFINER — זו הבדיקה הנכונה, ואומת בפועל (בדיקת HTTP אמיתית מול
-- הפונקציה הפרוסה: status 200, autoApproved:true, השדות אכן נשמרו ב-DB).
create or replace function public.enforce_member_edit_admin_only()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_sensitive_changed boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.sync_email', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF public.is_approved_admin() THEN
    RETURN NEW;
  END IF;

  v_sensitive_changed := (
       OLD.full_name           IS DISTINCT FROM NEW.full_name
    OR OLD.email               IS DISTINCT FROM NEW.email
    OR OLD.phone               IS DISTINCT FROM NEW.phone
    OR OLD.membership_type     IS DISTINCT FROM NEW.membership_type
    OR OLD.subscription_type   IS DISTINCT FROM NEW.subscription_type
    OR OLD.group_ids           IS DISTINCT FROM NEW.group_ids
    OR OLD.group_id            IS DISTINCT FROM NEW.group_id
    OR OLD.branch_ids          IS DISTINCT FROM NEW.branch_ids
    OR OLD.branch_id           IS DISTINCT FROM NEW.branch_id
    OR OLD.active              IS DISTINCT FROM NEW.active
    OR OLD.coach_id            IS DISTINCT FROM NEW.coach_id
    OR OLD.group_name          IS DISTINCT FROM NEW.group_name
  );

  IF NOT v_sensitive_changed THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'trainer'
      AND p.is_secretary = true
      AND p.secretary_branch_id IS NOT NULL
      AND (
        OLD.branch_id = p.secretary_branch_id
        OR p.secretary_branch_id = ANY (COALESCE(OLD.branch_ids, ARRAY[OLD.branch_id]))
        OR NEW.branch_id = p.secretary_branch_id
        OR p.secretary_branch_id = ANY (COALESCE(NEW.branch_ids, ARRAY[NEW.branch_id]))
      )
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'עריכת פרטי מתאמן/מנוי מותרת רק למנהל או למזכירת הסניף. נא לפנות למנהל לאישור השינוי.'
    USING ERRCODE = '42501';
END;
$function$;
