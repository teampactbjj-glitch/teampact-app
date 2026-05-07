-- ============================================================
-- Seed: Belt Test Syllabus (תוכן מבחני חגורות לילדים)
-- Source: סילבוס למבחני חגורות ילדים.pdf (דודי בן זקן, מאי 2026)
-- Date: 2026-05-07
-- ============================================================
-- 4 משפחות חגורה: gray (5-7), yellow (8-10), orange (11-13), green (14-16)
-- כל kids_X_Y → מתפלל ל-belt_family לפי המילה האמצעית.
-- (kids_white אינו במבחן — זו חגורת התחלה ללא בחינה.)
-- ============================================================

-- ⚠️ להריץ אחרי migration-kids-annual-test.sql

-- ===== חגורה אפורה (גילאי 5-7) =====
INSERT INTO belt_test_syllabus (belt_family, age_range_label, display_order, content)
VALUES (
  'gray',
  '5-7',
  1,
  jsonb_build_object(
    'sections', jsonb_build_array(
      jsonb_build_object(
        'title', 'תרגול תנועתי',
        'items', jsonb_build_array(
          'זחילות',
          'החלפת בסיס',
          'גלגולים לפנים',
          'גלגולים לאחור',
          'גלגלון',
          'בלימות'
        )
      ),
      jsonb_build_object(
        'title', 'פוזיציות',
        'items', jsonb_build_array(
          'זיהוי שמות: גארד, סייד, מאונט, גב',
          'כניסה לפוזיציות'
        )
      ),
      jsonb_build_object(
        'title', 'הטלות',
        'items', jsonb_build_array(
          'דאבל לג (Double Leg)',
          'הטלת מותן'
        )
      )
    )
  )
)
ON CONFLICT (belt_family) DO UPDATE SET
  age_range_label = EXCLUDED.age_range_label,
  display_order   = EXCLUDED.display_order,
  content         = EXCLUDED.content,
  updated_at      = now();

-- ===== חגורה צהובה (גילאי 8-10) =====
INSERT INTO belt_test_syllabus (belt_family, age_range_label, display_order, content)
VALUES (
  'yellow',
  '8-10',
  2,
  jsonb_build_object(
    'sections', jsonb_build_array(
      jsonb_build_object(
        'title', 'פוזיציות',
        'items', jsonb_build_array(
          'יציאה מגארד סגור',
          'יציאה מסייד',
          'יציאה ממאונט'
        )
      ),
      jsonb_build_object(
        'title', 'הטלות',
        'items', jsonb_build_array(
          'דאבל לג',
          'הטלת מותן'
        )
      ),
      jsonb_build_object(
        'title', 'הכנעות',
        'items', jsonb_build_array(
          'הכנעה אחת מגארד',
          'הכנעה אחת מסייד',
          'הכנעה אחת ממאונט',
          'הכנעה אחת מהגב'
        )
      )
    )
  )
)
ON CONFLICT (belt_family) DO UPDATE SET
  age_range_label = EXCLUDED.age_range_label,
  display_order   = EXCLUDED.display_order,
  content         = EXCLUDED.content,
  updated_at      = now();

-- ===== חגורה כתומה (גילאי 11-13) =====
INSERT INTO belt_test_syllabus (belt_family, age_range_label, display_order, content)
VALUES (
  'orange',
  '11-13',
  3,
  jsonb_build_object(
    'sections', jsonb_build_array(
      jsonb_build_object(
        'title', 'פוזיציות',
        'items', jsonb_build_array(
          'שמירה על פוזיציות: גב, סייד, מאונט, גארד',
          'יציאה מכל אחת מהפוזיציות הנ"ל'
        )
      ),
      jsonb_build_object(
        'title', 'הטלות',
        'items', jsonb_build_array(
          'דאבל לג',
          'סינגל לג (Single Leg)',
          'הטלת מותן'
        )
      ),
      jsonb_build_object(
        'title', 'בריחים וחניקות',
        'items', jsonb_build_array(
          'בריח אחד וחניקה אחת מכל פוזיציה: סייד, מאונט, גב, גארד'
        )
      )
    )
  )
)
ON CONFLICT (belt_family) DO UPDATE SET
  age_range_label = EXCLUDED.age_range_label,
  display_order   = EXCLUDED.display_order,
  content         = EXCLUDED.content,
  updated_at      = now();

-- ===== חגורה ירוקה (גילאי 14-16) =====
INSERT INTO belt_test_syllabus (belt_family, age_range_label, display_order, content)
VALUES (
  'green',
  '14-16',
  4,
  jsonb_build_object(
    'sections', jsonb_build_array(
      jsonb_build_object(
        'title', 'פוזיציות',
        'items', jsonb_build_array(
          'סינגל איקס (Single X)',
          'דלהיבא (De La Riva)',
          'חצי גארד',
          'גארד פתוח'
        )
      ),
      jsonb_build_object(
        'title', 'מעברי גארד',
        'items', jsonb_build_array(
          'מעבר גארד פתוח',
          'מעבר חצי גארד',
          'מעבר מדלהיבא'
        )
      ),
      jsonb_build_object(
        'title', 'סוויפים',
        'items', jsonb_build_array(
          'מדלהיבא',
          'מסינגל איקס',
          'מחצי גארד'
        )
      ),
      jsonb_build_object(
        'title', 'בריחים וחניקות',
        'items', jsonb_build_array(
          'בריח אחד וחניקה אחת מכל פוזיציה: סייד, מאונט, גב, גארד',
          'בריח רגל ישר'
        )
      )
    )
  )
)
ON CONFLICT (belt_family) DO UPDATE SET
  age_range_label = EXCLUDED.age_range_label,
  display_order   = EXCLUDED.display_order,
  content         = EXCLUDED.content,
  updated_at      = now();

-- ============================================================
-- Verify:
--   SELECT belt_family, age_range_label, jsonb_array_length(content->'sections') AS section_count
--   FROM belt_test_syllabus ORDER BY display_order;
--
--   צפוי:
--     gray   | 5-7   | 3
--     yellow | 8-10  | 3
--     orange | 11-13 | 3
--     green  | 14-16 | 4
-- ============================================================
