-- ============================================================
-- Migration: Belt System for BJJ members
-- Date: 2026-05-05
-- Adds belt tracking columns to members + reporting view
-- ============================================================

-- 1. Add columns to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS belt              text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS belt_received_at  date;
ALTER TABLE members ADD COLUMN IF NOT EXISTS belt_stripes      int  DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS belt_category     text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS bjj_start_date    date;
ALTER TABLE members ADD COLUMN IF NOT EXISTS trains_gi         boolean DEFAULT true;

-- 2. Domain check constraints (DROP first so the migration is idempotent)
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_belt_check;
ALTER TABLE members ADD  CONSTRAINT members_belt_check
  CHECK (belt IS NULL OR belt IN (
    -- adult belts (IBJJF)
    'white','blue','purple','brown','black',
    'black_1','black_2','black_3','black_4','black_5','black_6',
    -- coral belts (advanced black)
    'coral_red_black','coral_red_white','red',
    -- kids belts (IBJJF kids ranking)
    'kids_white','kids_gray_white','kids_gray','kids_gray_black',
    'kids_yellow_white','kids_yellow','kids_yellow_black',
    'kids_orange_white','kids_orange','kids_orange_black',
    'kids_green_white','kids_green','kids_green_black'
  ));

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_belt_category_check;
ALTER TABLE members ADD  CONSTRAINT members_belt_category_check
  CHECK (belt_category IS NULL OR belt_category IN ('adult','kids'));

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_belt_stripes_check;
ALTER TABLE members ADD  CONSTRAINT members_belt_stripes_check
  CHECK (belt_stripes IS NULL OR (belt_stripes >= 0 AND belt_stripes <= 6));

-- 3. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_members_belt           ON members(belt)           WHERE belt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_belt_received  ON members(belt_received_at) WHERE belt_received_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_trains_gi      ON members(trains_gi);

-- 4. Backfill: כל המתאמנים הקיימים מאמנים ב-Gi כברירת מחדל
UPDATE members SET trains_gi = true WHERE trains_gi IS NULL;

-- 5. Reporting view: סיכום חגורות לפי צבע
CREATE OR REPLACE VIEW v_belt_summary AS
SELECT
  belt_category,
  belt,
  COUNT(*) AS member_count,
  MIN(belt_received_at) AS oldest_received,
  MAX(belt_received_at) AS newest_received
FROM members
WHERE deleted_at IS NULL
  AND status NOT IN ('pending', 'pending_deletion')
  AND trains_gi = true
  AND belt IS NOT NULL
GROUP BY belt_category, belt
ORDER BY belt_category, belt;

-- ============================================================
-- Done. Run in Supabase SQL Editor.
-- ============================================================
