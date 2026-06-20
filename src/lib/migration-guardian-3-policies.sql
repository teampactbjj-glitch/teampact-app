-- ============================================================
-- פיצ'ר הורה רב-ילדים — שלב 3 מתוך 3: RLS policies לאפוטרופוס
-- מריצים על STAGING בלבד (ref tfrcyntrusfrjcpevotq).
--
-- כל ה-policies כאן הם PERMISSIVE = תוספת OR על מה שקיים.
-- הם לא נוגעים/משכתבים שום policy קיים → מתאמן רגיל, מאמן ומנהל
-- ממשיכים לעבוד בדיוק כמו היום. רק נוסף נתיב חדש: הורה רואה/כותב
-- לילדים שלו (members שבהם guardian_id = auth.uid()).
--
-- idempotent: DROP POLICY IF EXISTS לפני כל CREATE.
-- ============================================================

-- ---------- members ----------
-- ההורה רואה את רשומות הילדים שלו (כדי לטעון אותם למתג ההחלפה)
DROP POLICY IF EXISTS members_select_guardian ON public.members;
CREATE POLICY members_select_guardian ON public.members
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND guardian_id = auth.uid());

-- ההורה מוסיף ילד חדש מתוך האפליקציה (status=pending, מחכה לאישור מאמן)
DROP POLICY IF EXISTS members_insert_guardian_child ON public.members;
CREATE POLICY members_insert_guardian_child ON public.members
  FOR INSERT TO authenticated
  WITH CHECK (guardian_id = auth.uid() AND status = 'pending');

-- ---------- checkins ----------
-- ALL = select + insert + update + delete. צ'ק-אין/ביטול אוטומטי לילד.
DROP POLICY IF EXISTS checkins_guardian_all ON public.checkins;
CREATE POLICY checkins_guardian_all ON public.checkins
  FOR ALL TO authenticated
  USING (public.is_guardian_of(athlete_id))
  WITH CHECK (public.is_guardian_of(athlete_id));

-- ---------- class_registrations ----------
-- ALL = select + insert + delete. הרשמה/ביטול לשיעור עבור ילד.
DROP POLICY IF EXISTS class_reg_guardian_all ON public.class_registrations;
CREATE POLICY class_reg_guardian_all ON public.class_registrations
  FOR ALL TO authenticated
  USING (public.is_guardian_of(athlete_id))
  WITH CHECK (public.is_guardian_of(athlete_id));

-- ---------- product_requests ----------
-- מפוצל (כמו ה-policies העצמיים הקיימים): select + insert + delete(pending).
-- עדכון סטטוס/תשלום נשאר רק למאמן/מנהל — ההורה לא נוגע בו.
DROP POLICY IF EXISTS product_req_select_guardian ON public.product_requests;
CREATE POLICY product_req_select_guardian ON public.product_requests
  FOR SELECT TO authenticated
  USING (public.is_guardian_of(athlete_id));

DROP POLICY IF EXISTS product_req_insert_guardian ON public.product_requests;
CREATE POLICY product_req_insert_guardian ON public.product_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.is_guardian_of(athlete_id));

DROP POLICY IF EXISTS product_req_delete_guardian ON public.product_requests;
CREATE POLICY product_req_delete_guardian ON public.product_requests
  FOR DELETE TO authenticated
  USING (public.is_guardian_of(athlete_id) AND status = 'pending');

-- ---- אימות (צריך להחזיר 7 שורות — כל ה-policies החדשים) ----
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'members_select_guardian',
    'members_insert_guardian_child',
    'checkins_guardian_all',
    'class_reg_guardian_all',
    'product_req_select_guardian',
    'product_req_insert_guardian',
    'product_req_delete_guardian'
  )
ORDER BY tablename, policyname;
