-- Migration: הוספת עמודה hidden לטבלת branches
-- מטרה: לאפשר להסתיר סניף מהמתאמנים והמאמנים בלי למחוק אותו.
-- מנהל (is_admin = true) ימשיך לראות את כל הסניפים, כולל המוסתרים.

-- 1. הוספת העמודה (idempotent)
alter table public.branches
  add column if not exists hidden boolean not null default false;

-- 2. סימון "חולון - קאנטרי" כמוסתר (עד חתימה רשמית)
update public.branches
  set hidden = true
  where name = 'חולון - קאנטרי';

-- 3. אינדקס לסינון מהיר
create index if not exists branches_hidden_idx on public.branches (hidden);

-- כדי להחזיר סניף לתצוגה רגילה — לאחר חתימה — יש להריץ:
-- update public.branches set hidden = false where name = 'חולון - קאנטרי';
