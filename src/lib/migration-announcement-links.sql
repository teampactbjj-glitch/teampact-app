-- מיגרציה: קישורים מובנים להודעות וסמינרים
-- links: מערך jsonb של {label, url} — מוצגים למתאמן ככפתורים לחיצים
-- (למשל: קישור הרשמה + קישור תשלום לסמינר).

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS links jsonb;
