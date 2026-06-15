-- מיגרציה: הוספת שם הורה לטבלת members
-- נחוץ עבור טופס הרישום — הורים שרושמים ילדים ממלאים את שם ההורה,
-- בעוד שם המתאמן/ת נשמר ב-full_name. עבור בוגרים השדה נשאר NULL.
-- להריץ ב-Supabase SQL Editor.

alter table members add column if not exists parent_name text;

comment on column members.parent_name is 'שם מלא של ההורה הרושם (רק עבור מתאמנים קטינים); NULL לבוגרים';
