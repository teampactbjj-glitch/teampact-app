-- ============================================================
-- 2026-07-08 — RPC: יחידות אימון BJJ אמיתיות מאז קבלת החגורה הנוכחית
-- (למועמדים לקידום — "מועמדים לקידום" ב-ReportsManager.jsx, כולל בוגרים)
-- ============================================================
-- למה: דודי שאל בצדק — הנוסחה של "מועמדים לקידום" (שנים + יחידות אימון,
-- PROMOTION_THRESHOLDS) חישבה את היחידות מתוך מערך ה-checkins שנמשך ללקוח
-- עם סינון קשיח gte(180 יום אחורה). זה תקין כרגע (ההיסטוריה האמיתית עוד
-- קצרה מ-180 יום — הצ'ק-אין הכי ישן הוא מ-13.4.2026), אבל ברגע שההיסטוריה
-- תעבור 180 יום (בערך אוקטובר 2026) — לכל מתאמן עם חגורה ותיקה מ-180+ יום,
-- הספירה תתחיל "לשכוח" אימונים ישנים בשקט. אותה בעיה בדיוק כמו שתוקנה
-- לילדים (kids_units_since_belt, 08.07.2026) — כאן הפתרון המקביל, אבל
-- לכל מי שמשתתף במנוע ההצעות הזה (גם בוגרים וגם ילדים בעלי חגורת Gi/NoGi,
-- כי הלוגיקה הקיימת ב-JS לא מסננת לפי belt_category — לא שיניתי את זה,
-- רק את מקור הדאטה, כדי לא לשנות מי מוצג, רק לתקן את החישוב).
--
-- הפתרון: RPC אחד שמחשב בשרת (בלי הגבלת 180 יום) בדיוק את שלוש התוצאות
-- שה-JS צריך, ומחזיר שורה קטנה אחת לכל מתאמן רלוונטי (לא מושך checkins
-- גולמיים ללקוח בכלל — אין תוספת egress):
--   1. observed_units   — כמה checkins (BJJ, status=present) יש לו מאז
--                         effective_belt_received_at (או הכל, אם אין תאריך).
--   2. first_checkin_ms — ה-checkin הראשון-בכל-ההיסטוריה שלו על שיעור BJJ
--                         (ms). דרוש לחישוב ה-backfill ההיסטורי.
--   3. calib_units      — כמה checkins יש לו ב-90 הימים הראשונים אחרי
--                         first_checkin_ms (חלון הכיול לחישוב תדירות ממוצעת).
-- ה-JS ממשיך לעשות את הנוסחה עצמה (הקרנה אחורה, ×0.86 חגים וכו') — היא
-- נשארת ב-ReportsManager.jsx בלי שינוי, רק "המזון" שלה (הנתונים הגולמיים)
-- עבר לחישוב שרת בלתי-תלוי בטווח 180 יום.
--
-- קלט: p_class_ids — מערך ה-class_id-ים שסווגו כ-BJJ. מחושב בקליינט
-- (detectDiscipline על classes, טבלה קטנה שכבר נמשכת בלי הגבלת תאריך) ולא
-- בתוך ה-SQL, כדי לא לשכפל את לוגיקת הסיווג (detectDiscipline) בשתי שפות —
-- אם דודי משנה מילות מפתח לזיהוי BJJ בעתיד, זה במקום אחד בלבד (JS).
--
-- קירוב מכוון (לשקיפות מלאה): ה-JS המקורי סופר checkin רק אם "השיעור כבר
-- הסתיים בפועל" (checkin_date + שעת-התחלה + משך). כאן סופרים לפי checked_in_at
-- ישירות, בלי לשחזר את זמן-הסיום המדויק (נמנעים מחישובי אזורי-זמן שבירים
-- ב-SQL). ההבדל הוא לכל היותר כמה שעות סביב שיעור שקורה ממש עכשיו — זניח
-- מול סף של מאות יחידות על פני שנים.
--
-- הרשאות: כמו kids_units_since_belt — is_approved_trainer() בלבד.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.bjj_units_since_belt(p_class_ids uuid[])
RETURNS TABLE(member_id uuid, observed_units bigint, first_checkin_ms bigint, calib_units bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  IF NOT public.is_approved_trainer() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT
      m.id AS mid,
      -- עדיפות: התאריך המוקדם ביותר בהיסטוריית ה-belt_history עבור החגורה
      -- הנוכחית שלו, ואם אין → members.belt_received_at. בדיוק כמו ב-JS.
      COALESCE(
        (SELECT MIN(bh.received_at) FROM public.belt_history bh
          WHERE bh.member_id = m.id AND bh.belt = m.belt),
        m.belt_received_at
      ) AS since_ts
    FROM public.members m
    WHERE m.deleted_at IS NULL
      AND m.status NOT IN ('pending', 'pending_deletion')
      AND m.belt IS NOT NULL
      AND (m.trains_gi IS DISTINCT FROM false OR m.trains_nogi IS TRUE)
  ),
  ck AS (
    SELECT c.athlete_id AS aid, c.checked_in_at AS ts
    FROM public.checkins c
    WHERE c.status = 'present'
      AND c.class_id = ANY(p_class_ids)
      AND c.athlete_id IN (SELECT mid FROM eligible)
  ),
  first_ck AS (
    SELECT aid, MIN(ts) AS first_ts
    FROM ck
    GROUP BY aid
  )
  SELECT
    e.mid AS member_id,
    COUNT(*) FILTER (
      WHERE ck.ts IS NOT NULL
        AND (e.since_ts IS NULL OR ck.ts >= e.since_ts)
    ) AS observed_units,
    CASE WHEN f.first_ts IS NULL THEN NULL
         ELSE (EXTRACT(EPOCH FROM f.first_ts) * 1000)::bigint END AS first_checkin_ms,
    COUNT(*) FILTER (
      WHERE f.first_ts IS NOT NULL
        AND ck.ts >= f.first_ts
        AND ck.ts < f.first_ts + interval '90 days'
    ) AS calib_units
  FROM eligible e
  LEFT JOIN ck ON ck.aid = e.mid
  LEFT JOIN first_ck f ON f.aid = e.mid
  GROUP BY e.mid, f.first_ts;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.bjj_units_since_belt(uuid[]) TO authenticated;

COMMIT;

-- ============================================================
-- Rollback
-- ============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.bjj_units_since_belt(uuid[]);
-- COMMIT;
