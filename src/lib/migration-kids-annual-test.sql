-- ============================================================
-- Migration: Kids Annual Belt Test (יוני 2026)
-- Date: 2026-05-07
-- ============================================================
-- מטרה: תשתית למבחני דרגות שנתיים לילדים.
--
-- 4 שינויים:
--   1. טבלה חדשה `belt_test_syllabus` — סילבוס לפי משפחת חגורה (gray/yellow/orange/green)
--   2. members.birth_date — שדה תאריך לידה אופציונלי (למעבר לבוגרים בגיל 16)
--   3. הרחבת promotion_events — event_type, class_id, attendance_threshold
--   4. הרחבת promotion_candidates — attendance_pct, attendance_recommendation, target_to_adult
-- ============================================================

-- ============================================================
-- 1. Table: belt_test_syllabus
-- ============================================================
-- סילבוס לפי משפחת חגורה. גם kids_gray_white, kids_gray, kids_gray_black
-- כולם משתמשים ב-belt_family='gray'. 4 שורות סה"כ.
CREATE TABLE IF NOT EXISTS belt_test_syllabus (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  belt_family     text NOT NULL UNIQUE
                  CHECK (belt_family IN ('gray','yellow','orange','green')),
  age_range_label text NOT NULL,                -- '5-7' / '8-10' / '11-13' / '14-16'
  display_order   int  NOT NULL,
  content         jsonb NOT NULL,               -- { sections: [{ title, items: [...] }, ...] }
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bts_family ON belt_test_syllabus(belt_family);

-- RLS: כל מאומת רואה (קריאה בלבד), רק מאמן מאושר כותב/עורך
ALTER TABLE belt_test_syllabus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bts_select_all ON belt_test_syllabus;
CREATE POLICY bts_select_all ON belt_test_syllabus
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS bts_write_trainer ON belt_test_syllabus;
CREATE POLICY bts_write_trainer ON belt_test_syllabus
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- ============================================================
-- 2. members.birth_date
-- ============================================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date date NULL;
CREATE INDEX IF NOT EXISTS idx_members_birth_date ON members(birth_date) WHERE birth_date IS NOT NULL;

-- ============================================================
-- 3. promotion_events extension
-- ============================================================
-- event_type:
--   'regular'           — אירוע קידום רגיל (היום)
--   'kids_annual_test'  — מבחן דרגות שנתי לילדים (חדש)
ALTER TABLE promotion_events ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'regular';
ALTER TABLE promotion_events DROP CONSTRAINT IF EXISTS promotion_events_event_type_check;
ALTER TABLE promotion_events ADD  CONSTRAINT promotion_events_event_type_check
  CHECK (event_type IN ('regular','kids_annual_test'));

-- class_id — אם האירוע מקושר לשיעור ספציפי (kids_annual_test תמיד מקושר)
ALTER TABLE promotion_events ADD COLUMN IF NOT EXISTS class_id uuid
  REFERENCES classes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pe_class_id ON promotion_events(class_id) WHERE class_id IS NOT NULL;

-- attendance_threshold — סף נוכחות (% ב-0..1) שמעליו ילד "מומלץ לקידום"
-- Default 0.6 = 60%. NULL = "ללא חישוב המלצה" (אירוע רגיל).
ALTER TABLE promotion_events ADD COLUMN IF NOT EXISTS attendance_threshold numeric(3,2) NULL
  CHECK (attendance_threshold IS NULL OR (attendance_threshold >= 0 AND attendance_threshold <= 1));

-- ============================================================
-- 4. promotion_candidates extension
-- ============================================================
-- attendance_pct — אחוז נוכחות מאז קבלת החגורה הנוכחית (snapshot ביצירת candidate)
ALTER TABLE promotion_candidates ADD COLUMN IF NOT EXISTS attendance_pct numeric(4,3) NULL
  CHECK (attendance_pct IS NULL OR (attendance_pct >= 0 AND attendance_pct <= 1));

-- attendance_recommendation — המלצת המערכת (לא חוסם, רק מסמן)
--   'promote'       — נוכחות מעל הסף, מומלץ לקדם
--   'review'        — נוכחות מתחת לסף, לבדיקת מאמן
--   'not_evaluated' — לא חושב (אירוע ללא threshold או ללא נתוני שיעורים)
ALTER TABLE promotion_candidates ADD COLUMN IF NOT EXISTS attendance_recommendation text
  DEFAULT 'not_evaluated'
  CHECK (attendance_recommendation IN ('promote','review','not_evaluated'));

-- target_to_adult — אם true, target_belt='white' והילד עובר לקטגוריית בוגרים
ALTER TABLE promotion_candidates ADD COLUMN IF NOT EXISTS target_to_adult boolean DEFAULT false;

-- expected_sessions / attended_sessions — מספרים גולמיים לתיעוד
ALTER TABLE promotion_candidates ADD COLUMN IF NOT EXISTS expected_sessions int NULL;
ALTER TABLE promotion_candidates ADD COLUMN IF NOT EXISTS attended_sessions int NULL;

-- ============================================================
-- 5. View: kids_active — נוחות לשליפת ילדים פעילים
-- ============================================================
CREATE OR REPLACE VIEW kids_active AS
SELECT
  m.id,
  m.full_name,
  m.email,
  m.phone,
  m.belt,
  m.belt_stripes,
  m.belt_received_at,
  m.belt_category,
  m.birth_date,
  CASE
    WHEN m.birth_date IS NOT NULL
    THEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.birth_date))::int
    ELSE NULL
  END AS age_years,
  m.coach_id,
  m.status,
  m.created_at
FROM members m
WHERE m.belt_category = 'kids'
  AND m.status = 'active'
  AND (m.deleted_at IS NULL OR m.deleted_at IS NULL);

-- ============================================================
-- DONE
-- ============================================================
-- אחרי הרצה — verify:
--   SELECT * FROM belt_test_syllabus;            -- אמור להיות ריק (Seed יבוא בנפרד)
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='members' AND column_name='birth_date';   -- 1 שורה
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='promotion_events' AND column_name IN ('event_type','class_id','attendance_threshold');
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='promotion_candidates'
--     AND column_name IN ('attendance_pct','attendance_recommendation','target_to_adult');
--   SELECT * FROM kids_active LIMIT 3;
