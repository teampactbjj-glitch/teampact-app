-- Run once in Supabase SQL Editor.
-- Creates the table that stores each device's Web Push subscription.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

create index if not exists idx_push_subs_user on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subs_own" on push_subscriptions;
create policy "push_subs_own" on push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
