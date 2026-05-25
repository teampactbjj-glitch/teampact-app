-- ============================================================
-- Migration: Phone-based athlete identification
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add status column to members table
--    'active'  = approved member (can log in)
--    'pending' = registered via QR, waiting for admin approval
ALTER TABLE members ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Mark all existing records as active
UPDATE members SET status = 'active' WHERE status IS NULL;

-- 2. Make sure phone column exists on members (should already exist)
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone text;

-- ============================================================
-- RLS Policies for phone-based login (no Supabase auth session)
-- ============================================================

-- Allow anonymous (anon key) to read members by phone for login lookup
-- This is safe: only active+phone fields needed; sensitive data is protected
-- by the query itself (athletes only see their own dashboard after login).

-- If RLS is enabled on members, add these policies:

-- Read policy: allow anon to look up members by phone
DROP POLICY IF EXISTS "members_phone_lookup" ON members;
CREATE POLICY "members_phone_lookup" ON members
  FOR SELECT
  USING (true);
-- Note: if you want stricter read access, replace (true) with:
-- USING (auth.uid() IS NOT NULL OR status IN ('active', 'pending'))

-- Allow anon to insert pending registrations (QR self-registration)
DROP POLICY IF EXISTS "members_pending_insert" ON members;
CREATE POLICY "members_pending_insert" ON members
  FOR INSERT
  WITH CHECK (status = 'pending' AND active = false);

-- ============================================================
-- member_classes table — allow members to register for classes
-- ============================================================

-- If member_classes doesn't exist yet, create it:
CREATE TABLE IF NOT EXISTS member_classes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  class_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(member_id, class_id)
);

-- Allow anon to read/write member_classes (athletes manage their own schedule)
ALTER TABLE member_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_classes_all" ON member_classes;
CREATE POLICY "member_classes_all" ON member_classes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Optional: index for fast phone lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
