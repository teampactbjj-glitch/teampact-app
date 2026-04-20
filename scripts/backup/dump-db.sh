#!/usr/bin/env bash
# Dumps the TeamPact Supabase DB to out/db/full.sql.gz.
# Requires $SUPABASE_DB_URL (session pooler URL with password).
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL is not set" >&2
  exit 1
fi

OUT_DIR="${OUT_DIR:-out}"
mkdir -p "$OUT_DIR/db"

echo "[dump-db] dumping schema + data..."
pg_dump "$SUPABASE_DB_URL" \
  --no-owner \
  --no-privileges \
  --quote-all-identifiers \
  --schema=public \
  --schema=auth \
  --schema=storage \
  | gzip -9 > "$OUT_DIR/db/full.sql.gz"

SIZE=$(du -h "$OUT_DIR/db/full.sql.gz" | cut -f1)
echo "[dump-db] wrote $OUT_DIR/db/full.sql.gz ($SIZE)"
