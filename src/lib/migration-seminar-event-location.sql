-- מיגרציה: שדה מיקום לסמינר/אירוע
-- מוצג למתאמן כקישור לחיץ שנפתח ב-Google Maps, ולמנהל ברשימת ההודעות.

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS event_location text;
