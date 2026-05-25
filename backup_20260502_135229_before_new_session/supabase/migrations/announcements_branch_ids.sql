-- Adds a branch_ids column to announcements so a message can be targeted at
-- one or more specific branches. Null or empty array means "all branches".
alter table announcements
  add column if not exists branch_ids uuid[];
