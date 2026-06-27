-- ============================================================================
-- מניעת כפילויות ב-product_requests: הרשמות סמינר + הזמנות חנות
-- תאריך: 2026-06-27
--
-- רקע: עידו סוקז נרשם פעמיים לאותו סמינר (אותו athlete_id + announcement_id),
-- כי לא היה אילוץ ייחודי ב-DB. כאן מוסיפים שני אינדקסים ייחודיים *חלקיים*.
-- האינדקסים לא מוחקים שום נתון. אם קיימות כבר כפילויות — היצירה תיכשל,
-- ולכן קודם מריצים את שאילתות האיתור (שלב 1) ופותרים ידנית (לשמור את המשלם!).
--
-- הבחנה בין סמינר לחנות באותה טבלה:
--   סמינר → announcement_id מלא, product_id ריק (NULL)
--   חנות  → product_id מלא (וגם announcement_id מלא)
-- ============================================================================

-- ---------- שלב 1: איתור כפילויות קיימות (להריץ קודם!) ----------

-- 1א. כפילויות בהרשמות סמינר (אותו מתאמן לאותו סמינר יותר מפעם אחת)
select athlete_id, announcement_id,
       count(*) as cnt,
       array_agg(id order by created_at)      as request_ids,
       array_agg(status order by created_at)  as statuses,
       array_agg(athlete_name)                as names
from product_requests
where product_id is null and announcement_id is not null
group by athlete_id, announcement_id
having count(*) > 1;

-- 1ב. כפילויות בהזמנות חנות *ממתינות* (אותו מתאמן, אותו מוצר, יותר מ-pending אחד)
select athlete_id, product_id,
       count(*) as cnt,
       array_agg(id order by created_at)  as request_ids,
       array_agg(athlete_name)            as names
from product_requests
where product_id is not null and status = 'pending'
group by athlete_id, product_id
having count(*) > 1;

-- אם השאילתות מחזירות שורות: למחוק ידנית את הכפולה המיותרת לפי id
-- (להשאיר את המשלם/הישן לפי שיקול דעת). לדוגמה:
--   delete from product_requests where id = '<ID-של-הכפולה>';


-- ---------- שלב 2: יצירת האילוצים (רק אחרי ששלב 1 נקי) ----------

-- 2א. הרשמת סמינר ייחודית: מתאמן אחד → הרשמה אחת לכל סמינר.
--     (ביטול הרשמה לסמינר מוחק את השורה, ולכן אין צורך לסנן לפי status.)
create unique index if not exists uniq_seminar_registration
  on product_requests (athlete_id, announcement_id)
  where product_id is null and announcement_id is not null;

-- 2ב. הזמנת חנות ייחודית: מתאמן אחד → הזמנה *ממתינה* אחת לכל מוצר.
--     מסונן ל-status='pending' בלבד, כך שרכישה חוזרת אחרי 'done' (שולם)
--     ובוטלים לא חוסמים הזמנה חדשה.
create unique index if not exists uniq_shop_pending_order
  on product_requests (athlete_id, product_id)
  where product_id is not null and status = 'pending';


-- ---------- אימות ----------
select indexname, indexdef
from pg_indexes
where tablename = 'product_requests'
  and indexname in ('uniq_seminar_registration', 'uniq_shop_pending_order');
