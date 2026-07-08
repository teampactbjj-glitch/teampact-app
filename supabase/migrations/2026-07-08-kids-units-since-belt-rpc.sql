-- ============================================================
-- 2026-07-08 — RPC: יחידות אימון אמיתיות לילד מאז קבלת החגורה הנוכחית
-- ============================================================
-- למה: המסך "מוכנים לקידום — ילדים" (ReportsManager.jsx) בדק עד היום "זמן
-- בלוח שנה" (חודשים מאז קבלת החגורה) בלי לבדוק בכלל אם הילד באמת הגיע
-- לאימונים. סוכם עם דודי (08.07.2026) לעבור למדד אמיתי: 50 יחידות אימון
-- בפועל (checkins עם status='present') מאז קבלת החגורה הנוכחית, ולא לפי
-- זמן קלנדרי.
--
-- הבעיה הטכנית: ReportsManager מושך checkins רק ל-180 יום אחורה (כדי
-- לא להעמיס את הדוחות האחרים) — לא מספיק כדי לספור יחידות מאז חגורה
-- שהתקבלה לפני יותר מ-180 יום. הפתרון: פונקציית RPC שמחשבת את הספירה
-- בשרת (אגרגציה קטנה שמוחזרת ללקוח — לא כל השורות הגולמיות), כך שאין
-- צורך למשוך היסטוריה נוספת של checkins ללקוח (וזה גם לא מוסיף עומס
-- egress, בניגוד להרחבת טווח ה-180 יום הקיים).
--
-- הרשאות: כמו is_approved_trainer() הקיים במיגרציות קודמות — פונקציה זו
-- מוגבלת למאמנים מאושרים בלבד (לא אתלטים, לא anon).
--
-- ⚠️ תוקן 08.07.2026 (לפני שדודי הריץ בכלל!) — בדקתי את המספרים בפועל מול
-- הדאטה לפני שהצעתי להריץ, ומצאתי באג: הגרסה הראשונה עשתה
-- COALESCE(belt_received_at, bjj_start_date, '1900-01-01') — כלומר לילד
-- בלי שום תאריך בכלל (וזה קורה ל-כ-10 מתוך 19 ילדים במערכת כרגע, כי
-- האפליקציה חדשה ולא כולם עודכנו) היא הייתה סופרת את **כל** ההיסטוריה שלו
-- מאז ומעולם כאילו הוא זכאי "מאז 1900" — מספר גדול ומטעה, לא באמת "יחידות
-- מאז החגורה הנוכחית". התיקון: אם אין שום תאריך (לא belt_received_at ולא
-- bjj_start_date) — הילד פשוט לא מופיע בתוצאה בכלל, וה-UI כבר בנוי (ראו
-- ReportsManager.jsx) להציג "אין נתונים עדיין" עבורו במקום מספר שגוי.
--
-- הערה חשובה נוספת (לא באג, מגבלה טבעית): הצ'ק-אין הכי ישן במערכת הוא
-- מ-13.4.2026 — כלומר למתאמנים ותיקים (חגורה מלפני התאריך הזה) המספר ישקף
-- רק את הנוכחות שנרשמה דיגיטלית מאז אז, לא את כל הוותק האמיתי. זה בדיוק
-- למה דודי תכנן לעשות את מבחני 2026 ידנית ואז לעדכן את כולם — מהעדכון הזה
-- קדימה, הספירה תהיה מדויקת לגמרי כי כל הנוכחות תיספר דיגיטלית.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.kids_units_since_belt()
RETURNS TABLE(member_id uuid, units bigint)
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
  SELECT c.athlete_id AS member_id, COUNT(*) AS units
  FROM public.checkins c
  JOIN public.members m ON m.id = c.athlete_id
  WHERE c.status = 'present'
    AND m.belt_category = 'kids'
    AND m.deleted_at IS NULL
    AND COALESCE(m.belt_received_at, m.bjj_start_date) IS NOT NULL
    AND c.checkin_date >= COALESCE(m.belt_received_at, m.bjj_start_date)
  GROUP BY c.athlete_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.kids_units_since_belt() TO authenticated;

COMMIT;

-- ============================================================
-- Rollback
-- ============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.kids_units_since_belt();
-- COMMIT;
