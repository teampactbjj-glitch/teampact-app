-- מוסיף שדה status ל-classes לאישור מנהל
-- הרץ ב-Supabase SQL Editor
--
-- ערכים:
--   'pending'  – שיעור שהוסף ע"י מאמן וממתין לאישור מנהל
--   'approved' – שיעור מאושר (מופיע למתאמנים)

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved'));

CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status);

-- שיעורים קיימים ייחשבו כמאושרים (הברירת מחדל כבר 'approved')
UPDATE classes SET status = 'approved' WHERE status IS NULL;
