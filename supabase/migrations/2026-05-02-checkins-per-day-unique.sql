-- ============================================================
-- Migration: checkins — שורה לכל יום (לא לכל זוג מתאמן+שיעור)
-- ============================================================
-- הבעיה (לפני המיגרציה):
--   ב-public.checkins יש unique(class_id, athlete_id) — לכל זוג שיעור+מתאמן
--   קיימת שורה אחת לכל החיים. אם דני בא לאותו שיעור 10 שבועות → שורה אחת,
--   ושאר ההגעות נזרקו (upsert עם ignoreDuplicates=true ב-3 קבצים).
--   תוצאה: דוחות מציגים מספרי "אימונים" נמוכים בעשרות מונים מהאמת.
--
-- מה המיגרציה עושה:
--   1. מוסיפה עמודת checkin_date (תאריך מקומי בישראל, מבוסס checked_in_at).
--   2. ממלאת את הערך לכל השורות הקיימות.
--   3. יוצרת טריגר BEFORE INSERT/UPDATE שתמיד מחשב את checkin_date.
--   4. מסירה את ה-unique הישן (class_id, athlete_id).
--   5. מוסיפה unique חדש (class_id, athlete_id, checkin_date).
--
-- אחרי המיגרציה — כל יום הוא רישום נפרד, כל הגעה נספרת בדוחות.
--
-- בטוח להריץ יותר מפעם אחת (idempotent ככל הניתן).
-- כולל rollback בתחתית הקובץ.
-- ============================================================

BEGIN;

-- 1) הוספת העמודה (אם עדיין לא קיימת)
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS checkin_date date;

-- 2) Backfill לכל השורות הקיימות — תאריך לפי שעון ישראל
UPDATE public.checkins
SET checkin_date = (checked_in_at AT TIME ZONE 'Asia/Jerusalem')::date
WHERE checkin_date IS NULL;

-- 3) הופך את העמודה ל-NOT NULL (אחרי שמילאנו את הכל)
ALTER TABLE public.checkins
  ALTER COLUMN checkin_date SET NOT NULL;

-- 4) טריגר: בכל INSERT/UPDATE על checked_in_at — נחשב מחדש checkin_date.
--    מקור אמת יחיד; לקוח יכול לשלוח את checkin_date גם, אבל הטריגר ידרוס אם לא תואם.
CREATE OR REPLACE FUNCTION public.set_checkin_date_from_ts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- אם אין checked_in_at — נכשל בצורה ידידותית
  IF NEW.checked_in_at IS NULL THEN
    NEW.checked_in_at := now();
  END IF;
  NEW.checkin_date := (NEW.checked_in_at AT TIME ZONE 'Asia/Jerusalem')::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_checkin_date ON public.checkins;
CREATE TRIGGER trg_set_checkin_date
  BEFORE INSERT OR UPDATE OF checked_in_at ON public.checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.set_checkin_date_from_ts();

-- 5) הסרת ה-unique הישן (class_id, athlete_id) — אם קיים בכל אחת מהצורות
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.checkins'::regclass
      AND contype = 'u'
      AND array_length(conkey, 1) = 2
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = conrelid AND a.attnum = ANY(conkey) AND a.attname = 'class_id'
      )
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = conrelid AND a.attnum = ANY(conkey) AND a.attname = 'athlete_id'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = conrelid AND a.attnum = ANY(conkey) AND a.attname = 'checkin_date'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.checkins DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

-- 6) הוספת ה-unique החדש (class_id, athlete_id, checkin_date) — שורה לכל יום
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.checkins'::regclass
      AND conname = 'checkins_class_athlete_date_unique'
  ) THEN
    ALTER TABLE public.checkins
      ADD CONSTRAINT checkins_class_athlete_date_unique
      UNIQUE (class_id, athlete_id, checkin_date);
  END IF;
END $$;

-- 7) אינדקס נוסף לשאילתות נפוצות בדוחות (status='present' + checked_in_at)
CREATE INDEX IF NOT EXISTS idx_checkins_present_checked_at
  ON public.checkins(checked_in_at)
  WHERE status = 'present';

-- 8) רענון cache של PostgREST כדי שהלקוח יכיר את העמודה החדשה מיד
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- אימות (להריץ ידנית אחרי המיגרציה כדי לראות שהכל תקין):
-- ============================================================
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.checkins'::regclass AND contype = 'u';
--
-- צפוי לראות שורה אחת בלבד:
--   checkins_class_athlete_date_unique  UNIQUE (class_id, athlete_id, checkin_date)
--
-- בדיקת trigger:
-- SELECT tgname, tgenabled FROM pg_trigger
-- WHERE tgrelid = 'public.checkins'::regclass;
-- צפוי: trg_set_checkin_date, tgenabled='O'

-- ============================================================
-- ROLLBACK (אם משהו השתבש — להריץ את כל הבלוק הזה):
-- ============================================================
-- BEGIN;
--   ALTER TABLE public.checkins DROP CONSTRAINT IF EXISTS checkins_class_athlete_date_unique;
--   DROP TRIGGER IF EXISTS trg_set_checkin_date ON public.checkins;
--   DROP FUNCTION IF EXISTS public.set_checkin_date_from_ts();
--   ALTER TABLE public.checkins DROP COLUMN IF EXISTS checkin_date;
--   -- שחזור ה-unique הישן (אם נדרש)
--   ALTER TABLE public.checkins ADD CONSTRAINT checkins_class_id_athlete_id_key UNIQUE (class_id, athlete_id);
--   NOTIFY pgrst, 'reload schema';
-- COMMIT;
