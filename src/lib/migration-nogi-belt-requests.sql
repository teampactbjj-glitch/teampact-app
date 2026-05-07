-- ============================================================
-- Migration: NoGi support + Belt approval requests
-- Date: 2026-05-07
-- ============================================================
-- חלק א': תמיכת NoGi
--   members.trains_nogi - מתאמן ב-NoGi (אופציונלי, יכול להיות ביחד עם trains_gi)
--   העיקרון: Gi+NoGi הם אותה הדרגה — שיעור = יחידה אחת לדירוג, ללא הבדל.
--
-- חלק ב': בקשת אישור דרגה מהמתאמן
--   הרחבת profile_change_requests עם change_type='belt' + שדות ייעודיים.
--   המתאמן ממלא בפרופיל את הדרגה הנוכחית שלו (חגורה, פסים, תאריכים, NoGi/Gi),
--   המנהל מאשר → כותב ל-members + INSERT ל-belt_history (source='manual').
-- ============================================================

-- ===== חלק א': trains_nogi =====
ALTER TABLE members ADD COLUMN IF NOT EXISTS trains_nogi boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_members_trains_nogi ON members(trains_nogi) WHERE trains_nogi = true;

-- ===== חלק ב': הרחבת profile_change_requests לטיפול ב-change_type='belt' =====
ALTER TABLE profile_change_requests ADD COLUMN IF NOT EXISTS requested_belt text;
ALTER TABLE profile_change_requests ADD COLUMN IF NOT EXISTS requested_belt_stripes int;
ALTER TABLE profile_change_requests ADD COLUMN IF NOT EXISTS requested_belt_received_at date;
ALTER TABLE profile_change_requests ADD COLUMN IF NOT EXISTS requested_bjj_start_date date;
ALTER TABLE profile_change_requests ADD COLUMN IF NOT EXISTS requested_trains_gi boolean;
ALTER TABLE profile_change_requests ADD COLUMN IF NOT EXISTS requested_trains_nogi boolean;
ALTER TABLE profile_change_requests ADD COLUMN IF NOT EXISTS prior_academy text;

-- אם יש CHECK constraint על change_type — לעדכן לכלול 'belt'.
-- ב-Supabase לא תמיד יש כזה. אם יש: drop ויצירה מחדש.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'profile_change_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%change_type%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE profile_change_requests DROP CONSTRAINT %I', con_name);
  END IF;
  -- ליצור מחדש עם 'belt'
  ALTER TABLE profile_change_requests
    ADD CONSTRAINT profile_change_requests_change_type_check
    CHECK (change_type IN ('email','subscription','belt'));
EXCEPTION WHEN OTHERS THEN
  -- אם הוסיפה כבר — להתעלם
  NULL;
END $$;
