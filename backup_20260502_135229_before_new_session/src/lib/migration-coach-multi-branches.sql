-- ============================================================
-- TeamPact — Coach Multi-Branch Signup
-- הרץ ב-Supabase SQL Editor (פעם אחת)
-- ============================================================
-- מטרה:
--   מאמן יכול להירשם לכמה סניפים (1, 2 או יותר) בטופס הצטרפות
--   במקום סניף יחיד. מתבסס על אותו דפוס שכבר קיים ב-
--   profile_change_requests.requested_branch_ids.
-- ============================================================

-- מערך סניפים מבוקשים (לתמוך בכמה סניפים).
-- requested_branch_id (יחיד) נשאר לצורך תאימות אחורה ולהצגה מהירה,
-- אבל הקוד החדש משתמש ב-requested_branch_ids במקום (וכותב גם את הראשון
-- ל-requested_branch_id כדי לא לשבור קוד ישן).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS requested_branch_ids uuid[];

COMMENT ON COLUMN profiles.requested_branch_ids IS
  'רשימת סניפים שהמאמן ביקש להצטרף אליהם. בעת אישור תיווצר רשומת coaches לכל סניף.';
