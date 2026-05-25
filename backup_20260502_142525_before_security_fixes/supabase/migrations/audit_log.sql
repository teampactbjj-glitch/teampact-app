-- Run once in Supabase SQL Editor.
-- Records every INSERT/UPDATE/DELETE on protected tables along with the auth
-- user that did it. Rows are append-only — the RLS policy rejects updates
-- and deletes outright.

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid,          -- auth.uid() at the time of the action
  op         text not null check (op in ('INSERT','UPDATE','DELETE')),
  table_name text not null,
  row_id     uuid,
  old_row    jsonb,
  new_row    jsonb
);

create index if not exists audit_log_at_idx         on public.audit_log (at desc);
create index if not exists audit_log_table_row_idx  on public.audit_log (table_name, row_id);
create index if not exists audit_log_actor_idx      on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

-- Admins can read their own gym's audit trail.
drop policy if exists "audit_log_admin_select" on public.audit_log;
create policy "audit_log_admin_select" on public.audit_log
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- Nobody writes directly — only the trigger (runs as SECURITY DEFINER) inserts.
-- Explicit deny for UPDATE/DELETE so even service_role users can't quietly
-- rewrite history without a schema change.
drop policy if exists "audit_log_no_update" on public.audit_log;
create policy "audit_log_no_update" on public.audit_log for update using (false) with check (false);
drop policy if exists "audit_log_no_delete" on public.audit_log;
create policy "audit_log_no_delete" on public.audit_log for delete using (false);

-- Trigger function: extract row id (many tables use 'id' uuid) and log.
create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old     jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new     jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row_id  uuid;
begin
  -- Try new.id, fall back to old.id; null if neither has a uuid id column
  begin
    if v_new ? 'id' then v_row_id := (v_new->>'id')::uuid;
    elsif v_old ? 'id' then v_row_id := (v_old->>'id')::uuid;
    end if;
  exception when others then
    v_row_id := null;
  end;

  insert into public.audit_log (actor_id, op, table_name, row_id, old_row, new_row)
  values (auth.uid(), tg_op, tg_table_name, v_row_id, v_old, v_new);

  return coalesce(new, old);
end;
$$;

-- Attach to the soft-delete-protected tables + a few others where we want
-- a full diary.
do $$
declare t text;
begin
  foreach t in array array[
    'members','classes','announcements','product_orders','coaches',
    'profiles','branches','products','class_registrations','member_classes'
  ]
  loop
    execute format('drop trigger if exists tr_audit on public.%I', t);
    execute format(
      'create trigger tr_audit after insert or update or delete on public.%I ' ||
      'for each row execute function public.tg_audit()',
      t
    );
  end loop;
end $$;
