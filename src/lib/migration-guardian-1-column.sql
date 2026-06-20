-- ============================================================
-- פיצ'ר הורה רב-ילדים — שלב 1 מתוך 3: עמודת guardian_id
-- מריצים על STAGING בלבד (ref tfrcyntrusfrjcpevotq).
-- אדיטיבי + idempotent: nullable, default NULL → אפס רגרסיה לרשומות קיימות.
-- ============================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS guardian_id uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.members.guardian_id IS
  'חשבון ההורה (auth.users.id) שמנהל את המתאמן הקטין; NULL לבוגרים עצמאיים';

CREATE INDEX IF NOT EXISTS idx_members_guardian
  ON public.members(guardian_id);

-- ---- אימות (מריץ אוטומטית, צריך להחזיר שורה אחת עם guardian_id) ----
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'members'
  AND column_name = 'guardian_id';
