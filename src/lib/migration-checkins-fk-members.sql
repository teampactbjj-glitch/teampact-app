-- ============================================================
-- תיקון: checkins.athlete_id צריך להצביע על members, לא profiles
-- ============================================================
-- הבעיה: הסכמה המקורית הגדירה:
--   athlete_id uuid references profiles(id)
-- מתאמנים שנרשמו ידנית ע"י המאמן (AthleteManagement / ImportAthletes)
-- מקבלים id רנדומלי שלא קיים ב-profiles → FK violation בהכנסת checkin.
-- כתוצאה מכך כפתור "נוכח" נראה שעובד אבל לא שומר כלום.
--
-- הפתרון: להחליף את ה-FK כך שיצביע על members (id).
-- ============================================================

-- 1. הסר את ה-FK הישן (שם ברירת מחדל של Postgres: <table>_<column>_fkey)
ALTER TABLE checkins
  DROP CONSTRAINT IF EXISTS checkins_athlete_id_fkey;

-- 2. הוסף FK חדש אל members
ALTER TABLE checkins
  ADD CONSTRAINT checkins_athlete_id_fkey
  FOREIGN KEY (athlete_id)
  REFERENCES members(id)
  ON DELETE CASCADE;

-- 3. הוסף עמודת status אם חסרה (הקוד מניח שקיימת)
ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'present';

-- אימות: בצע SELECT לבדיקה
-- SELECT conname, conrelid::regclass, confrelid::regclass
-- FROM pg_constraint WHERE conrelid = 'checkins'::regclass;
