-- ============================================================
-- TeamPact — פיצ'ר יום הולדת 🎂  (11.06.2026)
-- ============================================================
-- מה הקובץ הזה עושה:
--   A. coaches.birth_date — תאריך לידה למאמנים (לברכת יומולדת גם להם)
--   B. policy: מאמן יכול לקרוא את השורה של עצמו ב-coaches
--   C. RPC get_class_registrants — רשימת נרשמים לשיעור למתאמנים
--      (SECURITY DEFINER, מחזיר שם מלא + דגל יומולדת בלבד — בלי PII)
--   D. send_birthday_pushes() + pg_cron — push בוקר לחוגג ולמאמנים שלו
--
-- להרצה: להעתיק את כל הקובץ ל-SQL Editor של Supabase ולהריץ.
-- ============================================================

BEGIN;

-- ============================================================
-- A. תאריך לידה למאמנים
-- ============================================================
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS birth_date date;

-- ============================================================
-- B. מאמן קורא את השורה של עצמו (לבאנר יום ההולדת בממשק המאמן)
--    (policies הן OR — תוספת בטוחה שלא מצמצמת הרשאות קיימות)
-- ============================================================
DROP POLICY IF EXISTS coaches_select_self ON public.coaches;
CREATE POLICY coaches_select_self ON public.coaches
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- C. RPC — רשימת הנרשמים לשיעור (לתצוגת המתאמן)
-- ============================================================
-- למה RPC? ה-RLS של class_registrations מאפשר למתאמן לראות רק את
-- הרישומים של עצמו, ו-members חסומה למתאמנים (תיקון דליפת PII מ-05.05).
-- הפונקציה רצה כ-SECURITY DEFINER ומחזירה אך ורק: שם מלא + דגל יומולדת.
--
-- הרשאה: מאמן מאושר, או מתאמן פעיל שמשויך לסניף של השיעור.
--
-- לוגיקת היומולדת 🎂: העוגה מוצגת ליד נרשם אם תאריך השיעור (p_class_date)
-- בתוך 7 ימים מהיומולדת האחרון שלו, וזהו השיעור הראשון שהוא נרשם אליו
-- מאז היומולדת ("מהיומולדת עד הרגע שנרשם לאימון, גג שבוע").
--
-- הערת תאריכים: week_start בטבלה נוצר בצד הלקוח עם toISOString() —
-- חצות יום ראשון מקומי בישראל = שבת ב-UTC, לכן תאריך ההופעה המקומי
-- של שיעור הוא week_start + 1 + day_of_week.
CREATE OR REPLACE FUNCTION public.get_class_registrants(
  p_class_id   uuid,
  p_week_start date,
  p_class_date date
)
RETURNS TABLE (full_name text, is_birthday boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_branch  uuid;
  v_allowed boolean := false;
BEGIN
  SELECT c.branch_id INTO v_branch FROM public.classes c WHERE c.id = p_class_id;
  IF v_branch IS NULL THEN
    RETURN; -- שיעור לא קיים או ללא סניף
  END IF;

  IF public.is_approved_trainer() THEN
    v_allowed := true;
  ELSE
    -- מתאמן פעיל המשויך לסניף של השיעור.
    -- התאמה לפי id (members.id = auth user id) או לפי אימייל —
    -- תאימות ל-members לגאסי שבהם member.id שונה מ-profile.id.
    SELECT EXISTS (
      SELECT 1
      FROM public.members me
      WHERE (
              me.id = auth.uid()
              OR (me.email IS NOT NULL AND lower(me.email) = lower(
                   (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
                 ))
            )
        AND coalesce(me.active, true) = true
        AND me.deleted_at IS NULL
        AND (me.branch_id = v_branch OR v_branch = ANY(coalesce(me.branch_ids, '{}'::uuid[])))
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN
    RETURN; -- אין הרשאה — מחזירים רשימה ריקה (לא שגיאה)
  END IF;

  RETURN QUERY
  SELECT
    m.full_name,
    CASE
      WHEN m.birth_date IS NULL OR m.birth_date > p_class_date THEN false
      ELSE (
        bd.last_bd > p_class_date - 7
        AND COALESCE(fo.first_occ, p_class_date) = p_class_date
      )
    END AS is_birthday
  FROM public.class_registrations r
  JOIN public.members m ON m.id = r.athlete_id
  -- היומולדת האחרון של הנרשם נכון לתאריך השיעור (מטפל גם ב-29.2)
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN m.birth_date IS NULL OR m.birth_date > p_class_date THEN NULL
      ELSE (m.birth_date + make_interval(years =>
             EXTRACT(YEAR FROM age(p_class_date, m.birth_date))::int))::date
    END AS last_bd
  ) bd ON true
  -- ההופעה הראשונה שהנרשם רשום אליה מאז היומולדת
  LEFT JOIN LATERAL (
    SELECT min(r2.week_start + 1 + c2.day_of_week)::date AS first_occ
    FROM public.class_registrations r2
    JOIN public.classes c2 ON c2.id = r2.class_id
    WHERE r2.athlete_id = m.id
      AND bd.last_bd IS NOT NULL
      AND (r2.week_start + 1 + c2.day_of_week) >= bd.last_bd
  ) fo ON true
  WHERE r.class_id = p_class_id
    AND r.week_start = p_week_start
    AND m.deleted_at IS NULL
  ORDER BY m.full_name;
END;
$func$;

REVOKE ALL ON FUNCTION public.get_class_registrants(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_registrants(uuid, date, date) TO authenticated;

COMMIT;

-- ============================================================
-- D. Push בוקר — pg_cron + pg_net
-- ============================================================
-- מופעל כל יום ב-05:00 UTC = 08:00 בקיץ (IDT) / 07:00 בחורף (IST).
-- שולח:
--   1. ברכה לחוגג (מתאמן) — "מזל טוב ... ממועדון TeamPact Academy"
--   2. התראה רק למאמנים שהחוגג נרשם לשיעורים שלהם ב-5 השבועות האחרונים
--   3. ברכה למאמן חוגג + התראה למנהלים
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.send_birthday_pushes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  fn_url   text := 'https://pnicoluujpidguvniwub.supabase.co/functions/v1/send-push';
  -- anon key — מפתח ציבורי (נשלח לכל לקוח של האפליקציה), בטוח לשמירה כאן
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaWNvbHV1anBpZGd1dm5pd3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTY2NjUsImV4cCI6MjA5MTI5MjY2NX0.I7bRbvy1eU-W3MrlHuB93v2nGffsA9oiapfaa3SX6nM';
  today    date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  hdrs     jsonb;
  m        record;
  c        record;
  celebrant_uid uuid;
  coach_uids    uuid[];
  admin_uids    uuid[];
BEGIN
  hdrs := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || anon_key,
    'apikey',        anon_key
  );

  -- ========== 1+2: מתאמנים חוגגים ==========
  FOR m IN
    SELECT mm.id, mm.full_name, mm.email
    FROM public.members mm
    WHERE coalesce(mm.active, true) = true
      AND mm.deleted_at IS NULL
      AND mm.birth_date IS NOT NULL
      AND to_char(mm.birth_date, 'MM-DD') = to_char(today, 'MM-DD')
  LOOP
    -- מזהה ה-auth של החוגג: members.id הוא בד"כ ה-user_id,
    -- עם fallback להתאמת אימייל (members לגאסי עם id שונה)
    SELECT COALESCE(
      (SELECT p.id FROM public.profiles p WHERE p.id = m.id),
      (SELECT p.id FROM public.profiles p
        WHERE m.email IS NOT NULL AND lower(p.email) = lower(m.email) LIMIT 1)
    ) INTO celebrant_uid;

    -- ברכה לחוגג עצמו
    IF celebrant_uid IS NOT NULL THEN
      PERFORM net.http_post(
        url     := fn_url,
        headers := hdrs,
        body    := jsonb_build_object(
          'user_ids', jsonb_build_array(celebrant_uid),
          'title',    '🎂 יום הולדת שמח!',
          'body',     'מזל טוב ' || m.full_name || '! כל מועדון TeamPact Academy מאחל לך יום הולדת שמח 🥳',
          'tag',      'birthday',
          'url',      '/'
        )
      );
    END IF;

    -- רק המאמנים שהחוגג מתאמן אצלם — לפי השיעורים שנרשם אליהם
    -- ב-5 השבועות האחרונים (לא כל המאמנים!)
    SELECT array_agg(DISTINCT co.user_id) INTO coach_uids
    FROM public.class_registrations r
    JOIN public.classes  c2 ON c2.id = r.class_id
    JOIN public.coaches  co ON co.id = c2.coach_id
    WHERE r.athlete_id = m.id
      AND r.week_start >= today - 35
      AND co.user_id IS NOT NULL
      AND co.user_id <> COALESCE(celebrant_uid, '00000000-0000-0000-0000-000000000000'::uuid);

    IF coach_uids IS NOT NULL AND array_length(coach_uids, 1) > 0 THEN
      PERFORM net.http_post(
        url     := fn_url,
        headers := hdrs,
        body    := jsonb_build_object(
          'user_ids', to_jsonb(coach_uids),
          'title',    '🎂 יומולדת היום!',
          'body',     'היום יום ההולדת של ' || m.full_name || ' — אל תשכח לברך באימון! 🥳',
          'tag',      'birthday-coach',
          'url',      '/'
        )
      );
    END IF;
  END LOOP;

  -- ========== 3: מאמנים חוגגים ==========
  FOR c IN
    SELECT co.user_id, co.name
    FROM public.coaches co
    WHERE co.user_id IS NOT NULL
      AND co.birth_date IS NOT NULL
      AND to_char(co.birth_date, 'MM-DD') = to_char(today, 'MM-DD')
  LOOP
    -- ברכה למאמן החוגג
    PERFORM net.http_post(
      url     := fn_url,
      headers := hdrs,
      body    := jsonb_build_object(
        'user_ids', jsonb_build_array(c.user_id),
        'title',    '🎂 יום הולדת שמח!',
        'body',     'מזל טוב ' || c.name || '! כל מועדון TeamPact Academy מאחל לך יום הולדת שמח 🥳',
        'tag',      'birthday',
        'url',      '/'
      )
    );

    -- התראה למנהלים (בלי החוגג עצמו)
    BEGIN
      SELECT array_agg(t.id) INTO admin_uids
      FROM public.get_admin_user_ids() AS t(id)
      WHERE t.id IS NOT NULL AND t.id <> c.user_id;
    EXCEPTION WHEN OTHERS THEN
      admin_uids := NULL;
    END;

    IF admin_uids IS NOT NULL AND array_length(admin_uids, 1) > 0 THEN
      PERFORM net.http_post(
        url     := fn_url,
        headers := hdrs,
        body    := jsonb_build_object(
          'user_ids', to_jsonb(admin_uids),
          'title',    '🎂 יומולדת היום!',
          'body',     'היום יום ההולדת של המאמן ' || c.name || ' — אל תשכח לברך! 🥳',
          'tag',      'birthday-coach',
          'url',      '/'
        )
      );
    END IF;
  END LOOP;
END;
$func$;

-- הפונקציה רצה רק מה-cron — לא חשופה ללקוחות
REVOKE ALL ON FUNCTION public.send_birthday_pushes() FROM PUBLIC, anon, authenticated;

-- תזמון יומי: 05:00 UTC = 08:00 שעון ישראל בקיץ (07:00 בחורף).
-- unschedule קודם — בטוח להרצה חוזרת.
DO $$
BEGIN
  PERFORM cron.unschedule('birthday-push-daily');
EXCEPTION WHEN OTHERS THEN
  NULL; -- ה-job עוד לא קיים — זה בסדר
END$$;

SELECT cron.schedule(
  'birthday-push-daily',
  '0 5 * * *',
  $$SELECT public.send_birthday_pushes()$$
);

-- ============================================================
-- אימות לאחר הרצה:
-- ============================================================
-- SELECT jobname, schedule FROM cron.job WHERE jobname = 'birthday-push-daily';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'coaches' AND column_name = 'birth_date';
-- בדיקה ידנית (ישלח push אמיתי אם יש חוגג היום!):
-- SELECT public.send_birthday_pushes();
