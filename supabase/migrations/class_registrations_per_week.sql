-- מיגרציה: רישום נפרד לכל שבוע
-- עד היום: UNIQUE על (athlete_id, class_id) — אתלט יכול להיות רשום לשיעור רק בשבוע אחד.
-- מעכשיו: UNIQUE על (athlete_id, class_id, week_start) — מאפשר להיות רשום
-- בו זמנית לשבוע הנוכחי וגם לשבוע הבא, החל מיום שישי 06:00.
--
-- להפעלה:  supabase db push  (או psql -f על מסד הנתונים)
-- ידני (אם המשמות שונות): SELECT conname FROM pg_constraint WHERE conrelid='public.class_registrations'::regclass;

begin;

-- מסירים את הקונסטריינט הישן אם קיים. שם ברירת המחדל של PostgREST/Supabase
-- נוצר אוטומטית ולכן אנחנו תופסים אותו דינמית כדי לא להישבר על שמות שונים.
do $$
declare
  c text;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.class_registrations'::regclass
      and contype = 'u'
  loop
    execute format('alter table public.class_registrations drop constraint %I', c);
  end loop;
end$$;

-- יוצרים את הקונסטריינט החדש: ייחודי לפי (אתלט, שיעור, שבוע).
-- אם אתלט נרשם לאותו שיעור פעמיים באותו שבוע — מתעדכן ולא יווצרו כפילויות.
alter table public.class_registrations
  add constraint class_registrations_athlete_class_week_key
  unique (athlete_id, class_id, week_start);

-- וידוא שיש אינדקס יעיל על week_start עבור שאילתות סינון
create index if not exists class_registrations_week_start_idx
  on public.class_registrations (week_start);

-- וידוא שיש אינדקס משולב לשאילתות של "כל הרישומים של אתלט בשבוע"
create index if not exists class_registrations_athlete_week_idx
  on public.class_registrations (athlete_id, week_start);

commit;
