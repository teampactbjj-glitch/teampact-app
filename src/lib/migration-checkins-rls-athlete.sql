-- ============================================================
-- Migration: Allow athletes to write their own checkins (RLS fix)
-- Date: 2026-05-05
-- ============================================================
-- Background: existing 'checkins_write' policy allows ONLY trainers to
-- INSERT/UPDATE/DELETE. Athletes whose member.id != profile.id (or who
-- log in via separate auth user matched by email) had their auto-checkins
-- silently blocked by RLS — class_registrations succeeded but checkins didn't,
-- so progress page showed stale numbers.
--
-- Fix: add a permissive policy specifically for the athlete's own rows,
-- matching either by direct auth.uid()=athlete_id (legacy) OR by email match
-- between auth.users.email and members.email.
-- ============================================================

-- IMPORTANT: do NOT use (SELECT email FROM auth.users WHERE id = auth.uid())
-- here — authenticated users don't have read access to auth.users, so the
-- policy would crash on every read of checkins. Use auth.jwt() ->> 'email'
-- instead — it reads from the JWT claims, no table access required.
DROP POLICY IF EXISTS "checkins_athlete_self_write" ON checkins;

CREATE POLICY "checkins_athlete_self_write" ON checkins
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = athlete_id
    OR EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = checkins.athlete_id
        AND lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    auth.uid() = athlete_id
    OR EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = checkins.athlete_id
        AND lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- ============================================================
-- Pre-backfill cleanup: fix class_registrations with broken athlete_id
-- (legacy bug: some registrations were saved with profile.id instead of
-- member.id, before the member.id fix in earlier session).
-- Match by email between auth.users and members.
-- ============================================================
UPDATE class_registrations r
SET athlete_id = sub.member_id
FROM (
  SELECT DISTINCT
    r2.athlete_id AS old_id,
    m.id          AS member_id
  FROM class_registrations r2
  JOIN auth.users u ON u.id = r2.athlete_id
  JOIN members    m ON lower(m.email) = lower(u.email)
  LEFT JOIN members m2 ON m2.id = r2.athlete_id
  WHERE m2.id IS NULL
) sub
WHERE r.athlete_id = sub.old_id;

-- ============================================================
-- Backfill: create checkins for any class_registration that has already
-- occurred but lacks a corresponding checkin row.
-- JOIN members ensures we skip any leftover broken athlete_ids.
-- ============================================================
INSERT INTO checkins (class_id, athlete_id, status, checked_in_at, checkin_date)
SELECT
  r.class_id,
  r.athlete_id,
  'present',
  ((r.week_start::date + cls.day_of_week)::timestamp + cls.start_time::time)::timestamptz,
  (r.week_start::date + cls.day_of_week)::date
FROM class_registrations r
JOIN classes cls ON cls.id = r.class_id
JOIN members m   ON m.id = r.athlete_id
WHERE r.week_start >= CURRENT_DATE - INTERVAL '30 days'
  AND r.week_start <= CURRENT_DATE + INTERVAL '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM checkins c
    WHERE c.class_id = r.class_id
      AND c.athlete_id = r.athlete_id
      AND c.checkin_date = (r.week_start::date + cls.day_of_week)::date
  )
ON CONFLICT (class_id, athlete_id, checkin_date) DO NOTHING;
