-- Run this in Supabase SQL Editor

-- Profiles (extends auth.users)
create table if not exists profiles (
  id uuid references auth.users primary key,
  full_name text not null,
  email text,
  phone text,
  role text check (role in ('trainer', 'athlete')) default 'athlete',
  subscription_type text check (subscription_type in ('2x_week', '4x_week', 'unlimited')),
  group_name text,
  created_at timestamptz default now()
);

-- Classes
create table if not exists classes (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references profiles(id),
  title text not null,
  scheduled_at timestamptz not null,
  duration_minutes int default 60,
  created_at timestamptz default now()
);

-- Registrations (athlete → class)
create table if not exists registrations (
  id uuid default gen_random_uuid() primary key,
  class_id uuid references classes(id) on delete cascade,
  athlete_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(class_id, athlete_id)
);

-- Check-ins
create table if not exists checkins (
  id uuid default gen_random_uuid() primary key,
  class_id uuid references classes(id) on delete cascade,
  athlete_id uuid references profiles(id) on delete cascade,
  checked_in_at timestamptz default now(),
  unique(class_id, athlete_id)
);

-- Announcements & seminars
create table if not exists announcements (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references profiles(id),
  title text not null,
  content text,
  type text check (type in ('announcement', 'seminar')) default 'announcement',
  event_date timestamptz,
  created_at timestamptz default now()
);

-- RLS Policies (enable row level security)
alter table profiles enable row level security;
alter table classes enable row level security;
alter table registrations enable row level security;
alter table checkins enable row level security;
alter table announcements enable row level security;

-- Allow users to read all profiles
create policy "profiles_read" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id or exists (
  select 1 from profiles where id = auth.uid() and role = 'trainer'
));

-- Classes: all can read, trainers can insert/update
create policy "classes_read" on classes for select using (true);
create policy "classes_write" on classes for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'trainer')
);

-- Registrations: all can read, athletes register themselves, trainers manage all
create policy "registrations_read" on registrations for select using (true);
create policy "registrations_write" on registrations for all using (
  auth.uid() = athlete_id or
  exists (select 1 from profiles where id = auth.uid() and role = 'trainer')
);

-- Checkins: all can read, athletes check themselves in, trainers manage all
create policy "checkins_read" on checkins for select using (true);
create policy "checkins_write" on checkins for all using (
  auth.uid() = athlete_id or
  exists (select 1 from profiles where id = auth.uid() and role = 'trainer')
);

-- Announcements: all can read, trainers write
create policy "announcements_read" on announcements for select using (true);
create policy "announcements_write" on announcements for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'trainer')
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
