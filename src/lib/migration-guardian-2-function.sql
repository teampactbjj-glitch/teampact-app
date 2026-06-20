-- ============================================================
-- פיצ'ר הורה רב-ילדים — שלב 2 מתוך 3: פונקציית is_guardian_of()
-- מריצים על STAGING בלבד (ref tfrcyntrusfrjcpevotq).
-- מחזירה TRUE אם המשתמש המחובר הוא האפוטרופוס של המתאמן הנתון.
-- SECURITY DEFINER כדי שתעקוף את ה-RLS בקריאה הפנימית ל-members
-- (אחרת הפונקציה לא תוכל לבדוק רשומת ילד) — בדיוק כמו is_approved_trainer().
-- idempotent: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_guardian_of(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = p_member_id
      AND m.guardian_id = auth.uid()
  );
$$;

GRANT ALL ON FUNCTION public.is_guardian_of(uuid) TO anon;
GRANT ALL ON FUNCTION public.is_guardian_of(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_guardian_of(uuid) TO service_role;

-- ---- אימות (צריך להחזיר שורה אחת עם שם הפונקציה) ----
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema='public' AND routine_name='is_guardian_of';
