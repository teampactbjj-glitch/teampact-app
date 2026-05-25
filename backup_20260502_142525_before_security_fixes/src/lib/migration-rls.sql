-- ============================================================
-- TeamPact — Full RLS Migration
-- Run in Supabase SQL Editor
-- ============================================================
-- Access model:
--   anon (no session) = athletes logging in via phone
--   authenticated + role='trainer' = coaches / admins
-- ============================================================

-- ============================================================
-- PROFILES
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

-- Any authenticated user can read profiles (trainers need to look each other up)
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users can only insert their own profile row
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Users can update their own profile; trainers can update any
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- ============================================================
-- BRANCHES
-- ============================================================
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches_select" ON branches;
DROP POLICY IF EXISTS "branches_write" ON branches;

-- Anyone (including anon) can read branches — needed on register page
CREATE POLICY "branches_select" ON branches
  FOR SELECT USING (true);

-- Only trainers can create/update/delete branches
CREATE POLICY "branches_write" ON branches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- ============================================================
-- CLASSES
-- ============================================================
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classes_select" ON classes;
DROP POLICY IF EXISTS "classes_write" ON classes;

-- Anyone can read classes — athletes see schedule, register page lists them
CREATE POLICY "classes_select" ON classes
  FOR SELECT USING (true);

-- Only trainers can create/update/delete classes
CREATE POLICY "classes_write" ON classes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- ============================================================
-- COACHES
-- ============================================================
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coaches_select" ON coaches;
DROP POLICY IF EXISTS "coaches_write" ON coaches;

-- Authenticated users can read coaches (trainer dashboard needs this)
CREATE POLICY "coaches_select" ON coaches
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only trainers can modify coaches
CREATE POLICY "coaches_write" ON coaches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- ============================================================
-- MEMBERS
-- ============================================================
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select_anon"      ON members;
DROP POLICY IF EXISTS "members_insert_pending"   ON members;
DROP POLICY IF EXISTS "members_all_trainer"      ON members;
DROP POLICY IF EXISTS "members_phone_lookup"     ON members;
DROP POLICY IF EXISTS "members_pending_insert"   ON members;

-- Anon can SELECT — required for phone-based login lookup
CREATE POLICY "members_select_anon" ON members
  FOR SELECT USING (true);

-- Anon can INSERT only pending self-registrations (QR flow)
CREATE POLICY "members_insert_pending" ON members
  FOR INSERT WITH CHECK (status = 'pending' AND active = false);

-- Trainers have full access (SELECT + INSERT + UPDATE + DELETE)
CREATE POLICY "members_all_trainer" ON members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- ============================================================
-- MEMBER_CLASSES
-- ============================================================
ALTER TABLE member_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_classes_select" ON member_classes;
DROP POLICY IF EXISTS "member_classes_insert"  ON member_classes;
DROP POLICY IF EXISTS "member_classes_delete"  ON member_classes;
DROP POLICY IF EXISTS "member_classes_all"     ON member_classes;

-- Anyone can read member_classes — TodayClasses uses this to build class rosters
CREATE POLICY "member_classes_select" ON member_classes
  FOR SELECT USING (true);

-- Anyone can insert — athletes (anon) manage their own schedule
-- Application logic enforces which member_id they use
CREATE POLICY "member_classes_insert" ON member_classes
  FOR INSERT WITH CHECK (true);

-- Anyone can delete — athletes unregister themselves
CREATE POLICY "member_classes_delete" ON member_classes
  FOR DELETE USING (true);

-- ============================================================
-- CLASS_REGISTRATIONS (legacy — Supabase auth users)
-- ============================================================
ALTER TABLE class_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "class_reg_select" ON class_registrations;
DROP POLICY IF EXISTS "class_reg_write"  ON class_registrations;

-- Authenticated users see their own rows; trainers see all
CREATE POLICY "class_reg_select" ON class_registrations
  FOR SELECT USING (
    auth.uid() = athlete_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- Users manage their own registrations; trainers manage all
CREATE POLICY "class_reg_write" ON class_registrations
  FOR ALL USING (
    auth.uid() = athlete_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- ============================================================
-- CHECKINS
-- ============================================================
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkins_select" ON checkins;
DROP POLICY IF EXISTS "checkins_write"  ON checkins;

-- Anyone can read checkins — TodayClasses shows live attendance to trainers
CREATE POLICY "checkins_select" ON checkins
  FOR SELECT USING (true);

-- Only trainers can mark attendance (insert/update/delete)
CREATE POLICY "checkins_write" ON checkins
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select" ON announcements;
DROP POLICY IF EXISTS "announcements_write"  ON announcements;

-- Anyone can read announcements — athletes see them on dashboard
CREATE POLICY "announcements_select" ON announcements
  FOR SELECT USING (true);

-- Only trainers can create/edit/delete announcements
CREATE POLICY "announcements_write" ON announcements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- ============================================================
-- PRODUCT_REQUESTS
-- ============================================================
ALTER TABLE product_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_req_select" ON product_requests;
DROP POLICY IF EXISTS "product_req_select_own" ON product_requests;
DROP POLICY IF EXISTS "product_req_insert" ON product_requests;
DROP POLICY IF EXISTS "product_req_delete_own" ON product_requests;
DROP POLICY IF EXISTS "product_req_write"  ON product_requests;

-- Trainers can read and manage all product requests
CREATE POLICY "product_req_select" ON product_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- Athletes can read their own product requests
CREATE POLICY "product_req_select_own" ON product_requests
  FOR SELECT USING (athlete_id = auth.uid());

-- Anyone (anon athletes) can submit a product request
CREATE POLICY "product_req_insert" ON product_requests
  FOR INSERT WITH CHECK (true);

-- Athletes can cancel (delete) their own pending requests
CREATE POLICY "product_req_delete_own" ON product_requests
  FOR DELETE USING (athlete_id = auth.uid() AND status = 'pending');

-- Only trainers can update/delete (mark as done etc.)
CREATE POLICY "product_req_write" ON product_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- ============================================================
-- INDEXES (if not already created)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_members_phone  ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
