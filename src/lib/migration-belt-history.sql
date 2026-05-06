-- ============================================================
-- Migration: Belt History (Stage 3)
-- Date: 2026-05-06
-- Tables: belt_history
-- ============================================================
-- מטרה: לאפשר תיעוד מלא של היסטוריית החגורות לכל מתאמן.
-- היום יש רק members.belt + members.belt_received_at = החגורה הנוכחית בלבד.
-- מעתה: כל קידום (ייבוא Excel, אירוע קידום, או ידני) שומר שורה כאן.
--
-- מקורות (source):
--   'import'     — ייבוא מ-Excel (ImportBelts.jsx)
--   'promotion'  — קידום דרך אירוע (TrainerDashboard lazy execution) — שומר event_id
--   'manual'     — הוספה/עריכה ידנית ע"י מנהל ב-AthleteManagement
--
-- אילוצי שלמות:
--   UNIQUE(member_id, belt, belt_stripes) — מונע כפילויות במקרה של ייבוא חוזר.
--   ON CONFLICT DO NOTHING בקוד הצד-לקוח כדי שייבוא חוזר ייכשל בשקט.
-- ============================================================

-- ===== Table: belt_history =====
CREATE TABLE IF NOT EXISTS belt_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  belt          text NOT NULL,                                       -- white/blue/purple/brown/black/black_1..black_6 + kids
  belt_stripes  int  NOT NULL DEFAULT 0 CHECK (belt_stripes BETWEEN 0 AND 4),
  received_at   date NOT NULL,
  source        text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('import','promotion','manual')),
  event_id      uuid REFERENCES promotion_events(id) ON DELETE SET NULL,
  notes         text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(member_id, belt, belt_stripes)
);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_bh_member_received
  ON belt_history(member_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_bh_event
  ON belt_history(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bh_source
  ON belt_history(source);

-- ===== RLS =====
ALTER TABLE belt_history ENABLE ROW LEVEL SECURITY;

-- מתאמן רואה רק את שלו (לפי email מה-JWT, כמו בדפוס הקיים)
DROP POLICY IF EXISTS bh_select_self ON belt_history;
CREATE POLICY bh_select_self ON belt_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = belt_history.member_id
        AND lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- מאמן מאושר רואה הכל (סינון per-מתאמן נעשה באפליקציה)
DROP POLICY IF EXISTS bh_select_trainer ON belt_history;
CREATE POLICY bh_select_trainer ON belt_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );

-- מאמן מאושר כותב/מעדכן/מוחק (זה כולל מנהל — isAdmin זה דגל ב-JS, RLS משתמש ברול)
DROP POLICY IF EXISTS bh_write_trainer ON belt_history;
CREATE POLICY bh_write_trainer ON belt_history
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'trainer' AND is_approved = true)
  );
