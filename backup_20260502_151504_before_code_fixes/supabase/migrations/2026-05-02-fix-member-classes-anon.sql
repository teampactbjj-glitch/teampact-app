-- ============================================================
-- 2026-05-02 — Security Fix #6: Close anon access to member_classes
-- ============================================================
-- Problem: existing policies on member_classes are FOR
-- SELECT/INSERT/DELETE USING (true), so any anon user can read
-- the entire class roster (member_id ↔ class_id mapping).
--
-- Code audit shows the table is used ONLY by trainer/admin UI
-- (TodayClasses.jsx — read roster + delete on class cleanup).
-- Athletes use class_registrations, not member_classes.
--
-- Fix: replace open policies with trainer-only policies. Anon
-- and athletes lose all access (they don't need any).
-- ============================================================

BEGIN;

-- Make sure RLS is on (defensive — should already be enabled).
ALTER TABLE public.member_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_classes_select"  ON public.member_classes;
DROP POLICY IF EXISTS "member_classes_insert"  ON public.member_classes;
DROP POLICY IF EXISTS "member_classes_delete"  ON public.member_classes;
DROP POLICY IF EXISTS "member_classes_all"     ON public.member_classes;

-- Trainers (approved) get full access — needed for roster reads
-- and pre-deletion cleanup in TodayClasses.
CREATE POLICY "member_classes_trainer_all" ON public.member_classes
  FOR ALL
  TO authenticated
  USING (public.is_approved_trainer())
  WITH CHECK (public.is_approved_trainer());

COMMIT;

-- ============================================================
-- Rollback
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "member_classes_trainer_all" ON public.member_classes;
-- CREATE POLICY "member_classes_select" ON public.member_classes FOR SELECT USING (true);
-- CREATE POLICY "member_classes_insert" ON public.member_classes FOR INSERT WITH CHECK (true);
-- CREATE POLICY "member_classes_delete" ON public.member_classes FOR DELETE USING (true);
-- COMMIT;
