-- =====================================================================
-- Migration: סנכרון profiles.subscription_type מ-members.subscription_type
-- תאריך: 2026-05-02
-- =====================================================================
-- הבעיה:
--   קיימות שתי עמודות subscription_type — אחת ב-profiles (לגאסי, נשמרת רק
--   ברישום) ואחת ב-members (זו שהמנהל מעדכן). תצוגת המתאמן השתמשה ב-fallback:
--     member?.subscription_type || profile?.subscription_type
--   כשה-member לא נטען או ש-subscription_type שם NULL — נראה הערך הישן מ-profiles.
--   תוצאה: מנהל ראה "2× בשבוע" ומתאמן ראה "4× בשבוע" לאותו אדם.
--
-- התיקון בקוד (commit נפרד):
--   AthleteDashboard.jsx ו-ClassSchedule.jsx כבר לא נופלים אחורה ל-profiles.
--
-- ה-migration הזה:
--   מעדכן את כל profiles.subscription_type לערך מ-members כדי שגם אם בעתיד
--   מישהו ינסה לקרוא את profiles.subscription_type ישירות — הוא יקבל ערך נכון.
-- =====================================================================

-- 1) סנכרון: לכל profile שיש לו member תואם ושב-members יש subscription_type מוגדר —
--    דרוס את הערך ב-profiles.
UPDATE profiles p
SET subscription_type = m.subscription_type
FROM members m
WHERE p.id = m.id
  AND m.subscription_type IS NOT NULL
  AND (p.subscription_type IS DISTINCT FROM m.subscription_type);

-- 2) דוח (לידיעת המריץ — ניתן לראות בלוג Supabase):
DO $$
DECLARE
  v_synced int;
  v_remaining_mismatch int;
BEGIN
  GET DIAGNOSTICS v_synced = ROW_COUNT;

  SELECT COUNT(*) INTO v_remaining_mismatch
  FROM profiles p
  JOIN members m ON m.id = p.id
  WHERE p.subscription_type IS DISTINCT FROM m.subscription_type
    AND m.subscription_type IS NOT NULL;

  RAISE NOTICE 'Synced profiles.subscription_type rows. Remaining mismatches (members has NULL): %', v_remaining_mismatch;
END $$;

-- =====================================================================
-- ROLLBACK (לא הפיך לחלוטין כי לא שמרנו את הערכים הקודמים).
-- אם תרצה לאפס profiles.subscription_type ל-NULL כדי לסמוך רק על members:
--   UPDATE profiles SET subscription_type = NULL;
-- =====================================================================
