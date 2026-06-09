-- מיגרציה: טבלת הגדרות גלובליות לאפליקציה
-- שורה יחידה (id=1) עם הגדרות שחלות על כל הסניפים

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  id       int PRIMARY KEY DEFAULT 1,
  vat_rate numeric(5,2) NOT NULL DEFAULT 18,
  CONSTRAINT single_row CHECK (id = 1)
);

-- הוספת שורת ברירת מחדל אם לא קיימת
INSERT INTO public.app_settings (id, vat_rate)
VALUES (1, 18)
ON CONFLICT (id) DO NOTHING;

-- RLS: קריאה לכולם, עדכון רק למנהלים (authenticated)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read"   ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update" ON public.app_settings;

CREATE POLICY "app_settings_read"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "app_settings_update"
  ON public.app_settings FOR UPDATE
  USING (auth.role() = 'authenticated');

COMMIT;
