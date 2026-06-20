-- שיעורי בדיקה ל-staging בלבד (סניף חולון) — כדי לבדוק הרשמה לאימון לכל ילד.
-- day_of_week: 0=ראשון ... 6=שבת. status=approved כדי שיופיעו ללו"ז המתאמן.
INSERT INTO public.classes (branch_id, name, class_type, day_of_week, start_time, end_time, status, coach_name, duration_minutes)
VALUES
  ('8ecebf3c-1baa-4582-84e4-e12f840c325f', 'ילדים — ראשון',  'ילדים',  0, '17:00', '18:00', 'approved', 'מאמן בדיקה', 60),
  ('8ecebf3c-1baa-4582-84e4-e12f840c325f', 'בוגרים — ראשון', 'בוגרים', 0, '18:30', '19:30', 'approved', 'מאמן בדיקה', 60),
  ('8ecebf3c-1baa-4582-84e4-e12f840c325f', 'ילדים — שני',    'ילדים',  1, '17:00', '18:00', 'approved', 'מאמן בדיקה', 60),
  ('8ecebf3c-1baa-4582-84e4-e12f840c325f', 'בוגרים — שלישי', 'בוגרים', 2, '18:30', '19:30', 'approved', 'מאמן בדיקה', 60),
  ('8ecebf3c-1baa-4582-84e4-e12f840c325f', 'ילדים — רביעי',  'ילדים',  3, '17:00', '18:00', 'approved', 'מאמן בדיקה', 60),
  ('8ecebf3c-1baa-4582-84e4-e12f840c325f', 'בוגרים — חמישי', 'בוגרים', 4, '18:30', '19:30', 'approved', 'מאמן בדיקה', 60);

SELECT name, day_of_week, start_time, status FROM public.classes ORDER BY day_of_week, start_time;
