-- בקשות מחיקת שיעור: מאמן מבקש, מנהל מאשר.
-- הרץ ב-Supabase SQL Editor.
--
-- כשהעמודה מאוכלסת, השיעור עדיין מופיע (כמאושר) — עד שמנהל ילחץ "אשר מחיקה".
-- NULL = אין בקשת מחיקה פעילה.

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_classes_deletion_requested_at
  ON classes(deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;
