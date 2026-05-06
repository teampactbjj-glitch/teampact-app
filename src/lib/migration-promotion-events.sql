-- ============================================================
-- Migration: Promotion Events System
-- Date: 2026-05-06
-- Tables: promotion_events, promotion_candidates
-- ============================================================
-- שני שלבים:
--   1. promotion_events  — אירוע קידום מתוכנן (תאריך, סניפים, מאמן יוצר)
--   2. promotion_candidates — מועמדים לאירוע + יעד (target_belt + target_stripes)
--
-- זרימה:
--   - מאמן יוצר אירוע עם status='planned' + מוסיף candidates עם status='planned'
--   - המתאמן רואה באנר "סומנת לקידום" + countdown
--   - יום אחרי event_date — TrainerDashboard מריץ lazy execution:
--     * עבור כל candidate עם status='planned' → מעדכן members.belt + belt_received_at
--     * candidate.status='promoted', event.status='completed'
--     * notifyPush + רשומת announcement type='promotion'
-- ============================================================

-- ===== Table: promotion_events =====
CREATE TABLE IF NOT EXISTS promotion_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  event_date    date NOT NULL,
  branch_ids    uuid[] DEFAULT '{}'::uuid[],   -- multi-select; אם ריק = כל הסניפים
  trainer_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned','completed','cancelled')),
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  completed_at  timestamptz,
  deleted_at    timestamptz
);

-- ===== Table: promotion_candidates =====
CREATE TABLE IF NOT EXISTS promotion_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES promotion_events(id) ON DELETE CASCADE,
  member_id       uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  current_belt    text,            -- snapshot ביצירה (לתיעוד היסטורי)
  current_stripes int  DEFAULT 0,
  target_belt     text NOT NULL,   -- היעד
  target_stripes  int  DEFAULT 0,
  status          text NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','promoted','not_promoted','cancelled')),
  promoted_at     timestamptz,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(event_id, member_id)
);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_pe_status         ON promotion_events(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pe_event_date     ON promotion_events(event_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pc_event          ON promotion_candidates(event_id);
CREATE INDEX IF NOT EXISTS idx_pc_member         ON promotion_candidates(member_id);
CREATE INDEX IF NOT EXISTS idx_pc_member_planned ON promotion_candidates(member_id, status)
                                                  WHERE status = 'planned';

-- ===== RLS =====
ALTER TABLE promotion_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_candidates ENABLE ROW LEVEL SECURITY;

-- מאמן מאושר רואה הכל
DROP POLICY IF EXISTS pe_select_trainer ON promotion_events;
CREATE POLICY pe_select_trainer ON promotion_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- מתאמן רואה רק אירועים שהוא מועמד בהם
-- חשוב: לא להשתמש ב-(SELECT email FROM auth.users ...) — דורש הרשאה על auth.users
-- שאין לרוב המשתמשים האותנטיים. במקום: auth.jwt() ->> 'email' (Supabase helper).
DROP POLICY IF EXISTS pe_select_candidate ON promotion_events;
CREATE POLICY pe_select_candidate ON promotion_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM promotion_candidates pc
      JOIN members m ON m.id = pc.member_id
      WHERE pc.event_id = promotion_events.id
        AND lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- מאמן מאושר כותב/מעדכן/מוחק
DROP POLICY IF EXISTS pe_write_trainer ON promotion_events;
CREATE POLICY pe_write_trainer ON promotion_events
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- candidates: מאמן רואה הכל
DROP POLICY IF EXISTS pc_select_trainer ON promotion_candidates;
CREATE POLICY pc_select_trainer ON promotion_candidates
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- candidate: מתאמן רואה רק את עצמו (לאיתור באנר)
DROP POLICY IF EXISTS pc_select_self ON promotion_candidates;
CREATE POLICY pc_select_self ON promotion_candidates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = promotion_candidates.member_id
        AND lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- candidates: מאמן כותב/מעדכן/מוחק
DROP POLICY IF EXISTS pc_write_trainer ON promotion_candidates;
CREATE POLICY pc_write_trainer ON promotion_candidates
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- ===== הרחבת announcements לתמיכה ב-type='promotion' =====
-- (announcement_type היה 'announcement' / 'seminar'. מוסיפים 'promotion'.)
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_type_check;
ALTER TABLE announcements ADD  CONSTRAINT announcements_type_check
  CHECK (type IN ('announcement','seminar','product','general','promotion'));
