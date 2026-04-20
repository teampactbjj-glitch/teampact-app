# TeamPact — Backup & Recovery Runbook

Free-tier protection stack, no Supabase Pro. This doc is the single source
of truth for what's running and how to recover.

## Protection layers

| # | What | Where | Status |
|---|------|-------|--------|
| 1 | Soft-delete trigger on `members`, `classes`, `announcements`, `product_orders`, `coaches` | DB (`supabase/migrations/soft_delete.sql`) | ✅ live |
| 2 | RLS hides soft-deleted rows from the app | DB (`supabase/migrations/soft_delete_rls.sql`) | ✅ live |
| 3 | `audit_log` table records every INSERT/UPDATE/DELETE on 10 tables | DB (`supabase/migrations/audit_log.sql`) | ✅ live |
| 4 | `pg_dump` + Storage download committed every 4h to the `teampact-backups` private repo | `.github/workflows/backup.yml` | ⏳ needs secrets (see below) |
| 5 | Telegram alert on backup failure | Same workflow | ⏳ optional, fires only if `TELEGRAM_BOT_TOKEN` is set |
| 6 | Weekly pull of the backups repo into `~/TeamPact-Backups` on this Mac | `scripts/backup/sync-to-mac.sh` + `com.teampact.backup-sync.plist` | ⏳ needs local install |

## One-time setup checklist

Do these once, in order. Every step takes a minute.

### 1. Create the private backups repo
- GitHub → **New repository**
- Owner: `teampactbjj-glitch`, name: `teampact-backups`, **Private**, do **not** initialise with README.
- After creation, clone locally once and push an empty commit so `main` exists.

### 2. Personal access token for the Action to push there
- GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token*.
- Repository access: *Only select repositories* → `teampact-backups`.
- Permissions → **Contents: Read and write**.
- Expiration: 1 year.
- Copy the token (`github_pat_…`).

### 3. Add repo secrets on `teampact-app`
Go to the `teampact-app` repo → Settings → Secrets and variables → Actions → *New repository secret*. Add:

| Name | Value |
|------|-------|
| `BACKUPS_REPO` | `teampactbjj-glitch/teampact-backups` |
| `BACKUPS_REPO_TOKEN` | the `github_pat_…` token from step 2 |
| `SUPABASE_URL` | `https://pnicoluujpidguvniwub.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → `service_role` secret |
| `SUPABASE_DB_URL` | Supabase dashboard → Project Settings → **Database** → *Connection string (URI, session pooler)* with the password filled in |
| `TELEGRAM_BOT_TOKEN` *(optional)* | token from `@BotFather` |
| `TELEGRAM_CHAT_ID` *(optional)* | your chat id — DM `@userinfobot` to get it |

### 4. Trigger the first run
- `teampact-app` → Actions → **Backup** → *Run workflow*.
- Should finish in ~1 minute. Check `teampact-backups` for a new `snapshots/YYYY-MM-DD_HHMM/` folder.

### 5. Weekly local sync (optional but recommended)
```bash
# one-time: edit the absolute path to sync-to-mac.sh inside the plist,
# then install the launchd agent
cp scripts/backup/com.teampact.backup-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.teampact.backup-sync.plist
# optional sanity run
bash scripts/backup/sync-to-mac.sh
```

## Recovery scenarios

### A. "I deleted the wrong row from the app"
Most destructive actions now go through the soft-delete trigger, so the row
is still in the DB — just hidden from the app.

```sql
-- Find it (Supabase SQL Editor, bypasses RLS)
select id, deleted_at, *
from public.<table>
where deleted_at is not null
order by deleted_at desc
limit 20;

-- Restore one row
select public.restore_soft_deleted('public.<table>'::regclass, '<row-uuid>'::uuid);
```

Tables with soft-delete: `members`, `classes`, `announcements`, `product_orders`, `coaches`.

### B. "Something weird happened — I need to see who did what"
```sql
select at, actor_id, op, table_name, row_id, old_row, new_row
from public.audit_log
where table_name = '<table>'
  and row_id = '<row-uuid>'
order by at desc;
```

### C. "A whole table got corrupted — restore from last snapshot"
1. Pick a snapshot from `teampact-backups/snapshots/YYYY-MM-DD_HHMM/`.
2. **Take a fresh snapshot of the current (corrupted) DB first**, in case
   the latest snapshot is older than you want.
3. Restore to a **scratch** Supabase project (or local Postgres) first:
   ```bash
   gunzip -c snapshots/<stamp>/db/full.sql.gz | psql "$SCRATCH_DB_URL"
   ```
4. Copy the specific rows you need back to production with a manual SQL
   script. *Never* drop/replace a whole production table from a backup
   without verifying the dump is intact.

### D. "Supabase is gone entirely"
Worst case: recreate a Supabase project, restore `db/full.sql.gz`, re-upload
Storage objects from `snapshots/<stamp>/storage/`. Point the app at the new
project via `SUPABASE_URL` / `SUPABASE_ANON_KEY` in Vercel env vars.

## Quarterly restore drill
Once a quarter, spin up a scratch Supabase project, run the restore steps
above, and confirm:
- `select count(*) from public.members` matches production.
- A few sample rows look right.
- Storage URLs resolve to the right images.

A backup that's never been test-restored is not a backup.

## Files touched by this setup

- `scripts/backup/dump-db.sh`
- `scripts/backup/dump-storage.sh`
- `scripts/backup/make-manifest.sh`
- `scripts/backup/sync-to-mac.sh`
- `scripts/backup/com.teampact.backup-sync.plist`
- `scripts/backup/README.md`
- `.github/workflows/backup.yml`
- `supabase/migrations/soft_delete.sql`
- `supabase/migrations/soft_delete_rls.sql`
- `supabase/migrations/audit_log.sql`
- `supabase/migrations/admin_user_ids_rpc.sql`
