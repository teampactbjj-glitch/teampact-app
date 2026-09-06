-- מיגרציה: ביטול מנוי עצמאי (ללא אישור מנהל) + סגירת פרצת הרשמה לשיעורים למתאמן מבוטל/הורה.
-- הורצה בפועל דרך mcp__Supabase__apply_migration ב-06.09.2026. קובץ זה נשמר כאן לתיעוד/
-- ביקורת בלבד (עקבי עם שאר קבצי supabase/migrations בפרויקט).
--
-- רקע: דודי ביקש (1) ביטול מנוי יהיה עצמאי באפליקציה, עם מודל הסבר משפטי + אישור כפול,
-- (2) אכיפה שרתית אמיתית של תאריך הביטול (לא רק קוד JS שרץ כשמסך מסוים פתוח), ו-(3) שהגישה
-- להרשמה לשיעורים תיחסם בפועל למתאמן שבוטל/הוקפא/פג — כולל כשההרשמה מתבצעת ע"י הורה בשם ילד
-- (guardian), תרחיש שלא היה מכוסה כלל לפני המיגרציה הזו.

-- 1) current_user_can_book(): לחסום גם 'cancelled' (לא רק frozen/expired) מהזמנת שיעורים.
create or replace function public.current_user_can_book()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    auth.uid() is null
    or exists (
      select 1 from members m
      where m.id = auth.uid()
        and m.status in ('approved', 'active')
        and m.deleted_at is null
        and (m.membership_status is null or m.membership_status not in ('frozen', 'expired', 'cancelled'))
    )
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'trainer');
$function$;

-- 2) גרסה כללית שבודקת לפי מזהה מתאמן נתון (ולא רק auth.uid()) — בשביל תרחיש הורה/אפוטרופוס
--    שמזמין/מבטל בשם ילד. אותה לוגיקה בדיוק כמו current_user_can_book, רק ממוקדת מתאמן ספציפי.
create or replace function public.member_can_book(p_member_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from members m
    where m.id = p_member_id
      and m.status in ('approved', 'active')
      and m.deleted_at is null
      and (m.membership_status is null or m.membership_status not in ('frozen', 'expired', 'cancelled'))
  );
$function$;

-- 3) סוגר את הפרצה הקיימת: הרשמה/ביטול-הרשמה של הורה בשם ילד (class_reg_guardian_all)
--    לא בדקה בכלל את סטטוס המנוי של הילד. עכשיו נדרש גם member_can_book.
drop policy if exists class_reg_guardian_all on public.class_registrations;
create policy class_reg_guardian_all on public.class_registrations
  for all
  using (is_guardian_of(athlete_id) and member_can_book(athlete_id))
  with check (is_guardian_of(athlete_id) and member_can_book(athlete_id));

-- 4) אותה פרצה בטבלת checkins (הצ'ק-אין האוטומטי שנוצר יחד עם ההרשמה) — גם לכתיבה עצמית
--    וגם לכתיבת הורה בשם ילד.
drop policy if exists checkins_athlete_self_write on public.checkins;
create policy checkins_athlete_self_write on public.checkins
  for all
  using (
    (
      (auth.uid() = athlete_id)
      or exists (select 1 from members m where m.id = checkins.athlete_id and lower(m.email) = lower(auth.jwt() ->> 'email'))
    )
    and member_can_book(athlete_id)
  )
  with check (
    (
      (auth.uid() = athlete_id)
      or exists (select 1 from members m where m.id = checkins.athlete_id and lower(m.email) = lower(auth.jwt() ->> 'email'))
    )
    and member_can_book(athlete_id)
  );

drop policy if exists checkins_guardian_all on public.checkins;
create policy checkins_guardian_all on public.checkins
  for all
  using (is_guardian_of(athlete_id) and member_can_book(athlete_id))
  with check (is_guardian_of(athlete_id) and member_can_book(athlete_id));

-- 5) RPC לביטול מנוי עצמאי (מתאמן או הורה בשם ילד) — ללא צורך באישור מנהל.
--    קובע cancel_date = היום + חודש קלנדרי אחד (אם עוד אין ביטול פעיל בתהליך),
--    ורושם שורת תיעוד ב-profile_change_requests עם status='approved' (להיסטוריה בלבד,
--    לא מופיע בתור האישורים הממתינים כי אין שם מה לאשר).
create or replace function public.self_cancel_membership(p_member_id uuid)
returns date
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing date;
  v_new_date date;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  if not (auth.uid() = p_member_id or is_guardian_of(p_member_id)) then
    raise exception 'unauthorized';
  end if;

  select cancel_date, full_name into v_existing, v_name from members where id = p_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;

  if v_existing is not null then
    return v_existing; -- כבר קיים ביטול פעיל בתהליך — לא דורסים בתאריך חדש
  end if;

  v_new_date := (current_date + interval '1 month')::date;

  update members
  set cancel_date = v_new_date
  where id = p_member_id and membership_status is distinct from 'cancelled';

  insert into profile_change_requests (athlete_id, athlete_name, change_type, requested_value, note, status)
  values (p_member_id, v_name, 'membership_cancel', v_new_date::text, 'בוטל עצמאית באפליקציה (ללא אישור מנהל נדרש)', 'approved');

  return v_new_date;
end;
$function$;

grant execute on function public.self_cancel_membership(uuid) to authenticated;

-- 6) אכיפה שרתית אמיתית (לא רק קוד בצד לקוח שרץ כשמסך מסוים פתוח): כל יום, כל מתאמן
--    שהגיע תאריך הביטול שלו עובר ל-membership_status='cancelled'. ברגע שזה קורה:
--    - invoice4u-charge-monthly מפסיק לחייב אותו (השאילתה שם דורשת membership_status='active').
--    - current_user_can_book()/member_can_book() חוסמים הרשמה חדשה לשיעורים (סעיף 1-2 לעיל).
select cron.schedule(
  'enforce_membership_cancellations',
  '0 1 * * *', -- כל יום ב-01:00 UTC (03:00/04:00 שעון ישראל)
  $$
  update members
  set membership_status = 'cancelled', cancel_date = null
  where cancel_date is not null
    and cancel_date <= current_date
    and membership_status is distinct from 'cancelled'
    and deleted_at is null;
  $$
);
