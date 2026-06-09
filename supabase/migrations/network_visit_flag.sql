-- מיגרציה: תמיכה באורחי רשת (network visits)
-- מתאמן המנוי בסניף א' שמגיע להתאמן בסניף ב' נרשם כ"אורח רשת".
-- הוא נספר במכסה השבועית שלו (נגד המנוי הראשי), אבל לא נחשב לחיוב של הסניף המארח.

BEGIN;

-- checkins: האם זה ביקור כאורח רשת (ממנוי בסניף אחר)?
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS is_network_visit boolean NOT NULL DEFAULT false;

-- class_registrations: כנ"ל — לסנכרון עם הרישום השבועי
ALTER TABLE public.class_registrations
  ADD COLUMN IF NOT EXISTS is_network_visit boolean NOT NULL DEFAULT false;

-- אינדקס לסינון בדוחות (כדי לדעת כמה אורחי רשת היו בכל שיעור/סניף)
CREATE INDEX IF NOT EXISTS idx_checkins_network_visit
  ON public.checkins (is_network_visit)
  WHERE is_network_visit = true;

CREATE INDEX IF NOT EXISTS idx_class_registrations_network_visit
  ON public.class_registrations (is_network_visit)
  WHERE is_network_visit = true;

COMMIT;
