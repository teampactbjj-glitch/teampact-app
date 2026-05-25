-- Run once in Supabase SQL Editor.
-- Adds soft-delete to the tables where accidental loss would hurt most.
-- Philosophy: once something lands in these tables, it is NEVER hard-deleted
-- from the app. If the app issues DELETE, a trigger flips it into an UPDATE
-- that sets deleted_at = now(). A nightly job can purge rows older than N
-- days if we ever want to — for now we just keep everything.

-- 1) deleted_at columns + indexes
alter table public.members          add column if not exists deleted_at timestamptz;
alter table public.classes          add column if not exists deleted_at timestamptz;
alter table public.announcements    add column if not exists deleted_at timestamptz;
alter table public.product_orders   add column if not exists deleted_at timestamptz;
alter table public.coaches          add column if not exists deleted_at timestamptz;

create index if not exists members_deleted_at_idx        on public.members        (deleted_at);
create index if not exists classes_deleted_at_idx        on public.classes        (deleted_at);
create index if not exists announcements_deleted_at_idx  on public.announcements  (deleted_at);
create index if not exists product_orders_deleted_at_idx on public.product_orders (deleted_at);
create index if not exists coaches_deleted_at_idx        on public.coaches        (deleted_at);

-- 2) Generic soft-delete trigger function.
--    Converts a DELETE into an UPDATE of deleted_at, then aborts the delete.
--    If the row is already soft-deleted, we allow the DELETE to proceed (so
--    operators can permanently purge via SQL when they really mean it).
create or replace function public.tg_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_soft_deleted boolean;
begin
  execute format(
    'select (deleted_at is not null) from %I.%I where ctid = $1',
    tg_table_schema, tg_table_name
  ) into is_soft_deleted using old.ctid;

  if is_soft_deleted then
    -- second DELETE → let it through (permanent purge path)
    return old;
  end if;

  execute format(
    'update %I.%I set deleted_at = now() where ctid = $1',
    tg_table_schema, tg_table_name
  ) using old.ctid;

  return null;  -- cancels the DELETE
end;
$$;

-- 3) Attach the trigger to each protected table.
--    Use drop-then-create so re-running the migration is idempotent.
do $$
declare
  t text;
begin
  foreach t in array array['members','classes','announcements','product_orders','coaches']
  loop
    execute format('drop trigger if exists tr_soft_delete on public.%I', t);
    execute format(
      'create trigger tr_soft_delete before delete on public.%I ' ||
      'for each row execute function public.tg_soft_delete()',
      t
    );
  end loop;
end $$;

-- 4) Helper: manually restore a soft-deleted row by id.
create or replace function public.restore_soft_deleted(
  tbl regclass,
  row_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  execute format('update %s set deleted_at = null where id = $1 and deleted_at is not null', tbl)
    using row_id;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.restore_soft_deleted(regclass, uuid) from public;
grant execute on function public.restore_soft_deleted(regclass, uuid) to authenticated;
