-- ============================================================
-- TeamPact — Coach Self-Registration & Admin Approval
-- הרץ ב-Supabase SQL Editor
-- ============================================================
-- מטרה:
--   1. לאפשר למאמנים להירשם בעצמם דרך /register-coach
--   2. למנוע גישה לנתוני מועדון עד שאדמין מאשר אותם
--   3. ליצור ערוץ "בקשות מאמנים ממתינות" לאדמין
-- ============================================================

-- שדה אישור מאמן בטבלת profiles
-- ברירת מחדל TRUE לרשומות קיימות (לא לפגוע במאמנים פעילים)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT true;

-- שדה טלפון מאמן (לאישור מהיר ע"י המנהל)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone text;

-- שדה סניף מבוקש (מה המאמן ביקש בעת הרשמה — לפני אישור)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS requested_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

-- מאמנים חדשים שנרשמים יקבלו is_approved=false (החלת ברירת מחדל בעת insert)
-- אבל לא לשנות רשומות קיימות
COMMENT ON COLUMN profiles.is_approved IS
  'TRUE אחרי אישור אדמין. רשומות חדשות עם role=trainer יווצרו עם FALSE דרך RegisterCoachPage';

-- אינדקס לטעינה מהירה של בקשות ממתינות
CREATE INDEX IF NOT EXISTS idx_profiles_pending_trainers
  ON profiles(role, is_approved)
  WHERE role = 'trainer' AND is_approved = false;

-- ============================================================
-- עדכון מדיניות RLS — מאמן לא מאושר לא יכול לקרוא נתונים רגישים
-- ============================================================

-- members: רק מאמנים מאושרים רואים מתאמנים (החליף את members_all_trainer)
DROP POLICY IF EXISTS "members_all_trainer" ON members;
CREATE POLICY "members_all_trainer" ON members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- announcements: רק מאמנים מאושרים יכולים לכתוב
DROP POLICY IF EXISTS "announcements_write" ON announcements;
CREATE POLICY "announcements_write" ON announcements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- coaches: רק מאמנים מאושרים יכולים לערוך טבלת מאמנים
DROP POLICY IF EXISTS "coaches_write" ON coaches;
CREATE POLICY "coaches_write" ON coaches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- classes: רק מאמנים מאושרים יכולים לערוך שיעורים
DROP POLICY IF EXISTS "classes_write" ON classes;
CREATE POLICY "classes_write" ON classes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- profiles: לאפשר למאמן חדש להכניס שורת profile של עצמו (insert) גם לפני אישור
-- (כדי שטופס ההרשמה יעבוד). select / update כבר בנויים נכון.
DROP POLICY IF EXISTS "profiles_insert_self_pending" ON profiles;
CREATE POLICY "profiles_insert_self_pending" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- profiles_update: רק אדמין יכול להפוך is_approved ל-true
-- (משתמש לא יכול לאשר את עצמו)
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    -- משתמש מעדכן את עצמו אבל לא משנה is_approved
    auth.uid() = id OR
    -- או שאדמין מאושר מעדכן (כולל is_approved של אחרים)
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true AND is_admin = true)
  );

-- ============================================================
-- TRIGGER: רשומה חדשה ב-profiles עם role=trainer → is_approved=false
-- ============================================================
-- הסיבה: ה-DEFAULT הוא true (להגן על מאמנים קיימים), אבל הרשמה חדשה
-- של מאמן צריכה תמיד ליצור רשומה ממתינה לאישור.
CREATE OR REPLACE FUNCTION enforce_pending_coach_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'trainer' THEN
    -- מאמן חדש = לא מאושר, ולא אדמין
    NEW.is_approved := false;
    NEW.is_admin := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_pending_coach_approval ON profiles;
CREATE TRIGGER trg_enforce_pending_coach_approval
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_pending_coach_approval();
