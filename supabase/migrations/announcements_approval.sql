-- Run once in Supabase SQL Editor.
-- Adds moderation/approval workflow to announcements.
-- New announcements from non-admin trainers start as 'pending' and are
-- invisible to athletes until an admin approves them.

alter table announcements
  add column if not exists status text not null default 'pending';

alter table announcements
  add column if not exists approved_by uuid references auth.users(id);

alter table announcements
  add column if not exists approved_at timestamptz;

-- Backfill existing rows as already approved so they keep showing.
update announcements set status = 'approved' where status is null or status = 'pending';

create index if not exists idx_announcements_status on announcements(status);
