-- מיגרציה: חולון קאנטרי — הרשמה עם תשלום ואישור אוטומטי + הצהרת קאנטרי (נספח ד')
-- תאריך: 26.07.2026
-- להריץ ב-Supabase SQL Editor (העתק-הדבק את כל הקובץ).
-- הסקריפט מאתר את סניף "חולון קאנטרי" לפי שם (ILIKE) ומסמן אותו כ-requires_facility_waiver.
-- אם השם לא נמצא / נמצא יותר מסניף אחד — הסקריפט ייכשל בהודעה ברורה, בלי לשנות כלום.

-- ========== 1. branches: דגל לסניפים שדורשים הצהרת קאנטרי + מחירון תשלום-מלא-בלבד ==========
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS requires_facility_waiver boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  v_branch_id uuid;
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.branches
    WHERE name ILIKE '%חולון%' AND name ILIKE '%קאנטרי%';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'לא נמצא סניף בשם שמכיל "חולון" ו-"קאנטרי". בדוק את שם הסניף בטבלת branches ועדכן את הסקריפט.';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'נמצאו % סניפים תואמים ל"חולון קאנטרי" — יש לצמצם את הסינון בסקריפט.', v_count;
  END IF;

  SELECT id INTO v_branch_id FROM public.branches
    WHERE name ILIKE '%חולון%' AND name ILIKE '%קאנטרי%';

  UPDATE public.branches SET requires_facility_waiver = true WHERE id = v_branch_id;

  RAISE NOTICE 'סניף חולון קאנטרי אותר בהצלחה: %', v_branch_id;
END $$;

-- ========== 2. branch_subscription_prices: מחירון מלא (עמודת "לקוח חיצוני" בנספח א' לחוזה) ==========
DO $$
DECLARE
  v_branch_id uuid;
BEGIN
  SELECT id INTO v_branch_id FROM public.branches WHERE requires_facility_waiver = true LIMIT 1;

  INSERT INTO public.branch_subscription_prices (branch_id, subscription_type, price) VALUES
    (v_branch_id, '1x_week', 300),
    (v_branch_id, '2x_week', 400),
    (v_branch_id, '4x_week', 500),
    (v_branch_id, 'unlimited', 600)
  ON CONFLICT (branch_id, subscription_type) DO UPDATE SET price = EXCLUDED.price;
END $$;

-- הערה: אם ה-INSERT לעיל נכשל על "there is no unique or exclusion constraint" — סימן
-- שאין UNIQUE constraint על (branch_id, subscription_type) בטבלה הקיימת. במקרה כזה, במקום
-- ה-DO block שלמעלה, יש להריץ ידנית DELETE + INSERT רגיל:
--   DELETE FROM public.branch_subscription_prices WHERE branch_id = '<המזהה שהודפס למעלה ב-NOTICE>';
--   INSERT INTO public.branch_subscription_prices (branch_id, subscription_type, price) VALUES
--     ('<אותו מזהה>', '1x_week', 300), ('<אותו מזהה>', '2x_week', 400),
--     ('<אותו מזהה>', '4x_week', 500), ('<אותו מזהה>', 'unlimited', 600);

-- ========== 3. members: שדות תשלום + הנחה + ת"ז ==========
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS green_invoice_doc_id text,
  ADD COLUMN IF NOT EXISTS green_invoice_doc_url text,
  ADD COLUMN IF NOT EXISTS wants_discount boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_payment_ref text;

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_payment_status_check;
ALTER TABLE public.members
  ADD CONSTRAINT members_payment_status_check CHECK (payment_status IN ('unpaid', 'paid'));

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_discount_type_check;
ALTER TABLE public.members
  ADD CONSTRAINT members_discount_type_check CHECK (discount_type IS NULL OR discount_type IN ('country_club_member', 'employee_family'));

CREATE INDEX IF NOT EXISTS idx_members_registration_payment_ref ON public.members (registration_payment_ref);

-- ========== 4. trial_visits: תמיכה ברישום-עצמי מהאפליקציה + תשלום ==========
ALTER TABLE public.trial_visits
  ALTER COLUMN class_id DROP NOT NULL;

ALTER TABLE public.trial_visits
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS requested_date date,
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'coach_manual',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS green_invoice_doc_id text,
  ADD COLUMN IF NOT EXISTS green_invoice_doc_url text;

ALTER TABLE public.trial_visits
  DROP CONSTRAINT IF EXISTS trial_visits_source_check;
ALTER TABLE public.trial_visits
  ADD CONSTRAINT trial_visits_source_check CHECK (source IN ('coach_manual', 'app_self_serve'));

ALTER TABLE public.trial_visits
  DROP CONSTRAINT IF EXISTS trial_visits_payment_status_check;
ALTER TABLE public.trial_visits
  ADD CONSTRAINT trial_visits_payment_status_check CHECK (payment_status IN ('unpaid', 'paid'));

-- הרשמה עצמית מהאפליקציה (אנונימי) — מותר להכניס רק רשומה "לא-משולמת" עדיין;
-- הסימון ל-paid נעשה אך ורק ע"י ה-webhook (service role, עוקף RLS).
DROP POLICY IF EXISTS trial_visits_self_serve_insert ON public.trial_visits;
CREATE POLICY trial_visits_self_serve_insert ON public.trial_visits
  FOR INSERT TO anon
  WITH CHECK (source = 'app_self_serve' AND payment_status = 'unpaid' AND paid_amount IS NULL);

-- ========== 5. club_waivers: הצהרת "נספח ד'" חתומה (מנויים + מתאמני ניסיון) ==========
CREATE TABLE IF NOT EXISTS public.club_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id),
  member_id uuid REFERENCES public.members(id),
  trial_visit_id uuid REFERENCES public.trial_visits(id),
  full_name text NOT NULL,
  id_number text NOT NULL,
  address text,
  phone text,
  signature_typed_name text NOT NULL,
  waiver_version text NOT NULL DEFAULT 'appendix-d-2026-07',
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  CONSTRAINT club_waivers_target_check CHECK (member_id IS NOT NULL OR trial_visit_id IS NOT NULL)
);

ALTER TABLE public.club_waivers ENABLE ROW LEVEL SECURITY;

-- מתאמן ניסיון אנונימי חותם על עצמו (member_id הוא NULL, trial_visit_id חובה)
DROP POLICY IF EXISTS club_waivers_anon_insert ON public.club_waivers;
CREATE POLICY club_waivers_anon_insert ON public.club_waivers
  FOR INSERT TO anon
  WITH CHECK (member_id IS NULL AND trial_visit_id IS NOT NULL);

-- הורה/מתאמן בוגר רשום חותם על עצמו או על ילדיו (אותה לוגיקה כמו members_insert_guardian_child)
DROP POLICY IF EXISTS club_waivers_authenticated_insert ON public.club_waivers;
CREATE POLICY club_waivers_authenticated_insert ON public.club_waivers
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = auth.uid()
    OR member_id IN (SELECT id FROM public.members WHERE guardian_id = auth.uid())
  );

-- קריאה — רק צוות מאמנים/מנהלים (מראה חוסלות ✔)
DROP POLICY IF EXISTS club_waivers_select_trainer ON public.club_waivers;
CREATE POLICY club_waivers_select_trainer ON public.club_waivers
  FOR SELECT TO authenticated
  USING (public.is_approved_trainer());

CREATE INDEX IF NOT EXISTS idx_club_waivers_member_id ON public.club_waivers (member_id);
CREATE INDEX IF NOT EXISTS idx_club_waivers_trial_visit_id ON public.club_waivers (trial_visit_id);
