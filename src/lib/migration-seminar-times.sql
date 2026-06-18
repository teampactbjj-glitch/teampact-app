-- שעות סמינר: שעת התחלה + שעת סיום (טקסט "HH:MM"), ליד event_date.
-- השעות מוצגות אצל המתאמן ובמסך הניהול. אופציונליות — אפשר להשאיר ריק.

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS event_start_time text,
  ADD COLUMN IF NOT EXISTS event_end_time   text;
