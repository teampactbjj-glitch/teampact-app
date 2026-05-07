-- ============================================================
-- Migration: Belt Test Syllabus — level_notes
-- Date: 2026-05-07
-- ============================================================
-- מטרה: להוסיף הערות ספציפיות לכל אחת מ-3 הדרגות במשפחת חגורה
-- (entry / mid / top), בלי לשכפל את התוכן המשפחתי.
--
-- Mapping בין דרגות ל-target_level:
--   kids_white          → kids_gray_white    = gray + entry
--   kids_gray_white     → kids_gray          = gray + mid
--   kids_gray           → kids_gray_black    = gray + top
--   kids_gray_black     → kids_yellow_white  = yellow + entry
--   kids_yellow_white   → kids_yellow        = yellow + mid
--   kids_yellow         → kids_yellow_black  = yellow + top
--   kids_yellow_black   → kids_orange_white  = orange + entry
--   kids_orange_white   → kids_orange        = orange + mid
--   kids_orange         → kids_orange_black  = orange + top
--   kids_orange_black   → kids_green_white   = green + entry
--   kids_green_white    → kids_green         = green + mid
--   kids_green          → kids_green_black   = green + top
-- ============================================================

ALTER TABLE belt_test_syllabus ADD COLUMN IF NOT EXISTS level_notes jsonb;

-- מילוי ערכי ברירת מחדל לכל 4 משפחות.
-- Schema:
--   {
--     "entry": "...",  -- דרגה ראשונה במשפחה (X-לבנה)
--     "mid":   "...",  -- דרגה אמצעית במשפחה (X)
--     "top":   "..."   -- דרגה עליונה במשפחה (X-שחורה)
--   }

UPDATE belt_test_syllabus
SET level_notes = jsonb_build_object(
  'entry', 'מכיר את כל התוכן ברמה בסיסית. מבצע בעזרת הדגמה.',
  'mid',   'מבצע את התוכן ברמה בינונית בעצמו. שטף בסיסי בין טכניקות.',
  'top',   'מבצע ברמה גבוהה ללא טעויות. מוכן לעבור למשפחת הצבע הבאה.'
)
WHERE belt_family = 'gray' AND level_notes IS NULL;

UPDATE belt_test_syllabus
SET level_notes = jsonb_build_object(
  'entry', 'מכיר את כל ההכנעות והיציאות ברמה בסיסית. עוצר בסימן כניעה.',
  'mid',   'מבצע הכנעות ויציאות בלי הדגמה. מבין מתי להפעיל כל אחת.',
  'top',   'משלב הכנעות ברצף. תזמון ושליטה גבוהים. מוכן למשפחה הבאה.'
)
WHERE belt_family = 'yellow' AND level_notes IS NULL;

UPDATE belt_test_syllabus
SET level_notes = jsonb_build_object(
  'entry', 'מכיר את כל הבריחים והחניקות ברמה בסיסית. שמירה על פוזיציות תקינה.',
  'mid',   'מבצע 3 הטלות ברמה טובה. שולט במעברים בין פוזיציות.',
  'top',   'בריחים וחניקות מכל פוזיציה ברצף. מבין רצפים תקיפים. מוכן לירוקה.'
)
WHERE belt_family = 'orange' AND level_notes IS NULL;

UPDATE belt_test_syllabus
SET level_notes = jsonb_build_object(
  'entry', 'מכיר פוזיציות מתקדמות (דלהיבא, סינגל איקס, חצי גארד) ברמה בסיסית.',
  'mid',   'מבצע סוויפים ומעברי גארד ברמה טובה. רהיטות במעברים.',
  'top',   'שילוב מלא של פוזיציות, מעברים, סוויפים, בריחים, וחניקות. רמה כמעט בוגר.'
)
WHERE belt_family = 'green' AND level_notes IS NULL;

-- ============================================================
-- Verify:
--   SELECT belt_family, level_notes->>'entry' AS entry,
--          level_notes->>'mid' AS mid, level_notes->>'top' AS top
--   FROM belt_test_syllabus ORDER BY display_order;
-- ============================================================
