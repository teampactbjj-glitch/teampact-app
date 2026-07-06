-- ============================================================
-- 2026-07-06 — אישור/דחיית בקשות הצטרפות: רק מנהל + מזכירה של אותו סניף
-- ============================================================
-- דודי ביקש: רק מנהל ומזכירת הסניף יכולים לאשר/לדחות בקשת הצטרפות —
-- לא מאמן רגיל, ולא מזכירה של סניף אחר.
--
-- מה נמצא באבחון (pg_policies בפועל בפרודקשן):
--   1. policy בשם "members_all_trainer" (ALL commands) עדיין קיים ונותן
--      לכל מאמן מאושר גישה מלאה כולל DELETE. הוא היה אמור להימחק
--      במיגרציה 2026-05-02-fix-admin-trainer-split.sql אך כנראה לא רץ
--      בפרודקשן, או נוצר מחדש דרך הדשבורד.
--   2. policy "members_delete_staff" מרשה DELETE גם למאמן מאושר רגיל
--      (role='trainer' AND is_approved=true) — לא רק אדמין/מזכירה.
--   3. הטריגר enforce_member_edit_admin_only (שאמור לחסום מאמן רגיל
--      מ"אישור") כתוב כסדרת IF...RETURN עצמאיים: ברגע שזוהה שינוי ב-
--      status (שקורה תמיד יחד עם active/subscription_type ב-approve),
--      הוא מחזיר NEW ומדלג על הבדיקה של שאר השדות — כלומר מאמן רגיל
--      יכול היה בפועל "לאשר" מתאמן, בניגוד לכוונה המקורית.
--   4. אף אחת מהבדיקות (DELETE policy או הטריגר) לא בדקה סניף כלל —
--      ה"רק הסניף שלה" של מזכירה היה קיים רק במסך (UI), לא ב-DB.
--
-- מה מתקן:
--   1. מוחק את "members_all_trainer" (מיותר — לכל פעולה יש כבר policy
--      ייעודי: select/insert/update לפי is_approved_trainer()).
--   2. מחליף את "members_delete_staff": רק אדמין, או מזכירה שהסניף שלה
--      (profiles.secretary_branch_id) תואם לסניף המתאמן.
--   3. כותב מחדש את enforce_member_edit_admin_only: בודק תחילה אם
--      *בכלל* השתנה שדה "רגיש" (active/subscription_type/branch/coach
--      וכו'), ורק אם כן — דורש אדמין או מזכירת-אותו-סניף. שינוי status/
--      id/deleted_at לבד (בלי שדה רגיש) נשאר מותר לכולם, כמו קודם.
-- בטוח להריץ יותר מפעם אחת.
-- ============================================================

BEGIN;

-- 1) policy ישן/כללי מדי — מיותר, לכל פעולה כבר יש policy ספציפי
DROP POLICY IF EXISTS "members_all_trainer" ON public.members;

-- 2) DELETE (דחייה) — רק אדמין, או מזכירה של אותו סניף
DROP POLICY IF EXISTS "members_delete_staff" ON public.members;
DROP POLICY IF EXISTS "members_delete_admin" ON public.members;
CREATE POLICY "members_delete_staff" ON public.members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.is_admin = true
          OR (
            p.is_secretary = true
            AND p.secretary_branch_id IS NOT NULL
            AND (
              members.branch_id = p.secretary_branch_id
              OR p.secretary_branch_id = ANY (COALESCE(members.branch_ids, ARRAY[members.branch_id]))
            )
          )
        )
    )
  );

-- 3) UPDATE (אישור/עריכת שדות רגישים) — תיקון הלוגיקה + בדיקת סניף למזכירה
CREATE OR REPLACE FUNCTION public.enforce_member_edit_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sensitive_changed boolean;
BEGIN
  -- Bypass: סנכרון מייל אוטומטי מ-auth.users (דגל session) — לא חסימה
  IF current_setting('app.sync_email', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- אדמין מאושר — מותר הכל
  IF public.is_approved_admin() THEN
    RETURN NEW;
  END IF;

  -- האם השתנה שדה "רגיש" (אישור/פרטי מנוי/שיוך)?
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

  -- לא השתנה שום שדה רגיש (למשל רק status/id/deleted_at) — מותר לכולם
  IF NOT v_sensitive_changed THEN
    RETURN NEW;
  END IF;

  -- מזכיר/ה — מורשית לאשר/לערוך שדות רגישים, רק במתאמנים מהסניף שלה
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
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
