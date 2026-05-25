-- ============================================================
-- יצירת טבלת checkins (אם לא קיימת) + תיקון FK ל-members
-- ============================================================
-- שגיאה שהמשתמש ראה:
--   "Could not find the table 'public.checkins' in the schema cache"
-- כלומר הטבלה לא קיימת כלל ב-Supabase שלך.
-- ה-migration הזה יוצר אותה (ב-FK הנכון ל-members) או מתקן אם כבר קיימת עם FK ישן ל-profiles.
-- בטוח להריץ אותו יותר מפעם אחת.
-- ============================================================

-- 1. יצירת הטבלה אם לא קיימת
CREATE TABLE IF NOT EXISTS public.checkins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status text DEFAULT 'present' CHECK (status IN ('present', 'absent')),
  checked_in_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 2. אם הטבלה קיימת כבר עם FK ישן ל-profiles — החלף אותו
ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_athlete_id_fkey;

ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_athlete_id_fkey
  FOREIGN KEY (athlete_id)
  REFERENCES public.members(id)
  ON DELETE CASCADE;

-- 3. הוסף עמודת status אם חסרה (תרחיש שבו הטבלה הייתה קיימת בלי עמודה זו)
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'present';

-- 4. אינדקסים לשאילתות מהירות
CREATE INDEX IF NOT EXISTS idx_checkins_class_id ON public.checkins(class_id);
CREATE INDEX IF NOT EXISTS idx_checkins_athlete_id ON public.checkins(athlete_id);
CREATE INDEX IF NOT EXISTS idx_checkins_checked_in_at ON public.checkins(checked_in_at);
CREATE INDEX IF NOT EXISTS idx_checkins_class_date ON public.checkins(class_id, checked_in_at);

-- 5. RLS — קריאה חופשית, כתיבה רק למאמנים
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkins_read" ON public.checkins;
DROP POLICY IF EXISTS "checkins_select" ON public.checkins;
DROP POLICY IF EXISTS "checkins_write" ON public.checkins;
DROP POLICY IF EXISTS "checkins_insert" ON public.checkins;
DROP POLICY IF EXISTS "checkins_update" ON public.checkins;
DROP POLICY IF EXISTS "checkins_delete" ON public.checkins;

CREATE POLICY "checkins_select" ON public.checkins
  FOR SELECT USING (true);

CREATE POLICY "checkins_write" ON public.checkins
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'trainer'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'trainer'
    )
  );

-- 6. רענון cache של ה-schema (חשוב — זה מה שגרם לשגיאה בדיוק)
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- אימות: בדיקה שהטבלה קיימת וה-FK נכון
-- ============================================================
-- SELECT conname, confrelid::regclass AS references_table
-- FROM pg_constraint
-- WHERE conrelid = 'public.checkins'::regclass AND contype = 'f';
