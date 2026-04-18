-- הוספת שדות לטופס ההרשמה: בחירת מאמן
-- הרץ ב-Supabase SQL Editor

-- coach_id: קישור רשמי לטבלת coaches (כשיהיה לה רשומה); NULL ל-unlimited
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL;

-- requested_coach_name: שם המאמן שהמתאמן בחר בטופס (fallback — גם אם אין רשומה ב-coaches)
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS requested_coach_name text;

-- אינדקסים לסינון מהיר של pending לפי מאמן
CREATE INDEX IF NOT EXISTS idx_members_coach_id ON members(coach_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_members_requested_coach_name ON members(requested_coach_name) WHERE status = 'pending';

-- הוספת רשומות coaches חסרות (מושיק / איתי / אולגה) — user_id יתמלא בהמשך דרך ה-UI
-- רק אם לא קיימים כבר לפי שם:
INSERT INTO coaches (name)
SELECT x.name FROM (VALUES
  ('דודי בן זקן'),
  ('סהר גפלא'),
  ('מושיק קידר'),
  ('איתי ליפשיץ'),
  ('אולגה רובין')
) AS x(name)
WHERE NOT EXISTS (SELECT 1 FROM coaches c WHERE c.name = x.name);
