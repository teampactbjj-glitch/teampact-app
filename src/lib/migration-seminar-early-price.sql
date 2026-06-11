-- מיגרציה: מחיר מוקדם לסמינרים (Early Bird)
-- מוסיף לטבלת announcements שני שדות:
--   early_price          — מחיר מוקדם (₪)
--   early_price_deadline — התאריך האחרון שבו המחיר המוקדם בתוקף (כולל)
-- אחרי התאריך הזה המחיר הרגיל (price) הוא הקובע.

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS early_price numeric,
  ADD COLUMN IF NOT EXISTS early_price_deadline date;
