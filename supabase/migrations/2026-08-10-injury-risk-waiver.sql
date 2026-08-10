-- מיגרציה: הצהרת סיכון ענף לחימה (מבוגר/הורה לקטין) + חתימה בכתב יד — חולון קאנטרי בלבד
-- תאריך: 10.08.2026
-- בטוחה להרצה חוזרת (IF NOT EXISTS בכל מקום) ולא נוגעת בנתונים קיימים.

-- ========== 1. club_waivers: תמיכה בכמה סוגי הצהרה + סימון קטין + חתימה מצוירת ==========
-- waiver_type='facility'     → ההצהרה הקיימת (נספח ד' קאנטרי)
-- waiver_type='injury_risk'  → הצהרת סיכון חדשה לענף לחימה
-- signature_image            → PNG מצויר (data URL) מה-SignaturePad. יכול להיות NULL אם
--                               נעשה שימוש בחלופה הנגישה (שם מוקלד) במקום.
ALTER TABLE public.club_waivers
  ADD COLUMN IF NOT EXISTS waiver_type text NOT NULL DEFAULT 'facility',
  ADD COLUMN IF NOT EXISTS is_minor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signature_image text;

ALTER TABLE public.club_waivers
  DROP CONSTRAINT IF EXISTS club_waivers_waiver_type_check;
ALTER TABLE public.club_waivers
  ADD CONSTRAINT club_waivers_waiver_type_check CHECK (waiver_type IN ('facility', 'injury_risk'));

-- מרפים את ה-NOT NULL על השם המוקלד — עכשיו שיש גם אופציה של חתימה מצוירת בלבד,
-- ייתכן ששדה הטקסט ריק (הקוד תמיד ממלא אותו עם שם ידוע כברירת מחדל בכל מקרה, אך
-- זו רשת ביטחון ברמת ה-DB כדי שהוספת עמודה זו לא תשבור אף insert).
ALTER TABLE public.club_waivers
  ALTER COLUMN signature_typed_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_club_waivers_waiver_type ON public.club_waivers (waiver_type);

-- ========== 2. trial_visits: תאריך לידה + שם הורה (לזיהוי קטין באימון ניסיון) ==========
ALTER TABLE public.trial_visits
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS guardian_name text;
