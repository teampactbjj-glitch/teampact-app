-- ============================================================
-- trial_visits — מתאמני ניסיון שהגיעו לאימון בלי להירשם במערכת
-- ============================================================
-- הקונטקסט: כשמאמן מוסיף "מתאמן ניסיון" לשיעור — אנחנו לא רוצים ליצור
-- רשומה ב-`members` (כי זה לא מתאמן רשום של המועדון), אבל כן רוצים לתעד
-- את הביקור לדוחות שיווקיים: כמה אנשים ניסו BJJ החודש, כמה Muay Thai וכו'.
--
-- הטבלה מקושרת ל-`classes` ב-FK עם CASCADE (אם השיעור נמחק — גם הביקור).
-- אין FK לאיש: מתאמן הניסיון לא קיים בשום טבלה אחרת.
--
-- בטוח להריץ יותר מפעם אחת (idempotent).
-- ============================================================

-- 1. יצירת הטבלה
CREATE TABLE IF NOT EXISTS public.trial_visits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  visitor_name text NOT NULL,
  visitor_phone text,                    -- רשות
  visited_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- המאמן/מנהל שהוסיף
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. אינדקסים לדוחות (חיפוש לפי תאריך + לפי שיעור/שיטת לחימה)
CREATE INDEX IF NOT EXISTS idx_trial_visits_class_id ON public.trial_visits(class_id);
CREATE INDEX IF NOT EXISTS idx_trial_visits_visited_at ON public.trial_visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_trial_visits_class_date ON public.trial_visits(class_id, visited_at);

-- 3. RLS
ALTER TABLE public.trial_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trial_visits_select" ON public.trial_visits;
DROP POLICY IF EXISTS "trial_visits_write"  ON public.trial_visits;

-- קריאה: רק מאמנים/מנהלים (זה מידע ניהולי — מתאמני ניסיון לא צריכים לראות)
CREATE POLICY "trial_visits_select" ON public.trial_visits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'trainer'
    )
  );

-- כתיבה (INSERT/UPDATE/DELETE): רק מאמנים/מנהלים
CREATE POLICY "trial_visits_write" ON public.trial_visits
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

-- 4. רענון cache של ה-schema של PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- אימות: בדיקה שהטבלה נוצרה
-- ============================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'trial_visits';

-- ============================================================
-- שאילתות דוחות לדוגמה (לקריאה מ-`ReportsManager`):
-- ============================================================
-- ביקורי ניסיון לחודש האחרון לפי שיטת לחימה (class_type):
--
-- SELECT c.class_type, COUNT(*) AS visits
-- FROM trial_visits tv
-- JOIN classes c ON c.id = tv.class_id
-- WHERE tv.visited_at >= now() - interval '30 days'
-- GROUP BY c.class_type
-- ORDER BY visits DESC;
--
-- ביקורי ניסיון השבוע לפי סניף:
--
-- SELECT b.name AS branch, COUNT(*) AS visits
-- FROM trial_visits tv
-- JOIN classes c ON c.id = tv.class_id
-- JOIN branches b ON b.id = c.branch_id
-- WHERE tv.visited_at >= date_trunc('week', now())
-- GROUP BY b.name
-- ORDER BY visits DESC;
