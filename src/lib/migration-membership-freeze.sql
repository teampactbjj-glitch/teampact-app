-- ============================================================
-- Migration: הקפאת מנוי עם תאריכים (שלב 1)
-- מוסיף תמיכה ב: תאריך הקפאה/חזרה, סיבה, מצב חזרה (אוטו/ידני),
-- דרישת אישור רפואי, הקפאה רטרואקטיבית, וזיכוי לתקופת ההקפאה.
-- בטוח להרצה חוזרת (idempotent).
-- ============================================================

-- 1) שדות "ההקפאה הנוכחית" על המתאמן (מראה מהיר ל-UI)
alter table public.members
  add column if not exists freeze_start_date date,
  add column if not exists freeze_end_date date,                 -- null = הקפאה פתוחה (עד אישור ידני)
  add column if not exists freeze_reason text,                   -- 'military' | 'study' | 'medical' | 'other'
  add column if not exists freeze_return_mode text default 'manual', -- 'auto' | 'manual'
  add column if not exists freeze_requires_medical boolean default false,
  add column if not exists freeze_note text;

-- מצב חזרה חוקי בלבד
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where constraint_name = 'members_freeze_return_mode_check'
  ) then
    alter table public.members
      add constraint members_freeze_return_mode_check
      check (freeze_return_mode in ('auto','manual'));
  end if;
end $$;

-- 2) טבלת אירועי הקפאה — היסטוריה + זיכוי + תמיכה רטרואקטיבית
create table if not exists public.member_freezes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  start_date date not null,
  end_date date,                                  -- null = פתוחה
  reason text,                                    -- military | study | medical | other
  return_mode text not null default 'manual',     -- auto | manual
  requires_medical boolean default false,
  note text,
  -- scheduled = עתידי, active = פעיל עכשיו, ended = הסתיים/שוחרר
  status text not null default 'active',
  billing_mode text default 'continue_credit',    -- continue_credit (בגין) | stop (סניפים אחרים)
  credit_days integer,                            -- מס' ימי זיכוי שנצברו לתקופה זו
  credit_used boolean default false,              -- האם הזיכוי כבר קוזז מהתשלום
  is_retroactive boolean default false,           -- נרשם בדיעבד אחרי שהתקופה כבר עברה
  created_at timestamptz default now(),
  created_by uuid,
  released_at timestamptz,
  released_by uuid,
  constraint member_freezes_return_mode_check check (return_mode in ('auto','manual')),
  constraint member_freezes_status_check check (status in ('scheduled','active','ended'))
);

create index if not exists idx_member_freezes_member on public.member_freezes(member_id);
create index if not exists idx_member_freezes_status on public.member_freezes(status);

-- 3) RLS — מאמנים/מנהלים/מזכירות מורשים (מתיישר עם RLS של members)
-- 2b) שדות בקשת הקפאה מצד המתאמן (profile_change_requests)
alter table public.profile_change_requests
  add column if not exists requested_freeze_start date,
  add column if not exists requested_freeze_end date,
  add column if not exists requested_freeze_reason text,
  add column if not exists requested_freeze_open boolean default false;

-- 2c) הוספת סוג בקשה "הפעלת מנוי" (membership_unfreeze) ל-constraint
alter table public.profile_change_requests drop constraint if exists chk_pcr_change_type;
alter table public.profile_change_requests add constraint chk_pcr_change_type
  check (change_type in ('email','subscription','membership_freeze','membership_unfreeze','membership_cancel','belt','name'));

alter table public.member_freezes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'member_freezes' and policyname = 'member_freezes_staff_all'
  ) then
    create policy member_freezes_staff_all on public.member_freezes
      for all to authenticated
      using (true) with check (true);
  end if;
end $$;

-- 4) חסימת מתאמן מוקפא מהרשמה — ברמת ה-DB (חוסם בכל מסלולי הרישום בבת אחת)
create or replace function public.current_user_can_book()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    auth.uid() is null
    or exists (
      select 1 from members m
      where m.id = auth.uid()
        and m.status in ('approved', 'active')
        and m.deleted_at is null
        and (m.membership_status is null or m.membership_status <> 'frozen')  -- ← מוקפא חסום
    )
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'trainer'
    );
$$;

grant execute on function public.current_user_can_book() to anon, authenticated;
