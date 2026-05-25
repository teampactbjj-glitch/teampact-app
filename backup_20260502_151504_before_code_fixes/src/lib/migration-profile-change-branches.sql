-- הוספת עמודה לבקשות שינוי מנוי: רשימת סניפים מבוקשת
-- כשמתאמן שולח בקשת שינוי מנוי/כמות אימונים, הוא יכול לבחור גם את הסניפים
-- (אחד, שניים או שלושה). כשהמנהל מאשר — הסניפים נכתבים ל-members.branch_ids.

ALTER TABLE profile_change_requests
  ADD COLUMN IF NOT EXISTS requested_branch_ids uuid[];

-- חלוקת אימונים לפי סניף — דוגמה: {"branchId1": 2, "branchId2": 2}
ALTER TABLE profile_change_requests
  ADD COLUMN IF NOT EXISTS requested_branch_sessions jsonb;
