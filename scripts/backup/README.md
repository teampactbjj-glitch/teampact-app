# TeamPact backup scripts

These run in CI (`.github/workflows/backup.yml`) and can also be run locally for
a one-off snapshot.

## Local dry-run

```bash
export SUPABASE_URL=https://pnicoluujpidguvniwub.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...            # from Supabase secrets
export SUPABASE_DB_URL='postgresql://postgres.pnicoluujpidguvniwub:...@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'
export OUT_DIR=./out-local

./scripts/backup/dump-db.sh
./scripts/backup/dump-storage.sh
./scripts/backup/make-manifest.sh
```

Output goes to `./out-local/` — safe to delete afterwards.

## Restore (from the backups repo)

See `teampact-backups/README.md` for the full runbook. Short version:

```bash
gunzip -c 2026-04-20/db/full.sql.gz | psql "$TARGET_DB_URL"
```

Do **not** restore to the production DB without taking a fresh snapshot first.
