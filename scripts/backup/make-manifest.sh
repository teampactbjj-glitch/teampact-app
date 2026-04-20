#!/usr/bin/env bash
# Writes MANIFEST.txt summarizing the snapshot (db size, file counts, timestamp,
# git sha of the app repo).
set -euo pipefail

OUT_DIR="${OUT_DIR:-out}"
mkdir -p "$OUT_DIR"

GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo unknown)
DB_SIZE=$(du -h "$OUT_DIR/db/full.sql.gz" 2>/dev/null | cut -f1 || echo "?")
STORAGE_FILES=$(find "$OUT_DIR/storage" -type f 2>/dev/null | wc -l | tr -d ' ')
STORAGE_SIZE=$(du -sh "$OUT_DIR/storage" 2>/dev/null | cut -f1 || echo "?")

cat > "$OUT_DIR/MANIFEST.txt" <<EOF
TeamPact snapshot
=================
Taken at:      $(date -u +'%Y-%m-%dT%H:%M:%SZ')
App git sha:   $GIT_SHA
DB dump size:  $DB_SIZE  ($OUT_DIR/db/full.sql.gz)
Storage files: $STORAGE_FILES  ($STORAGE_SIZE, $OUT_DIR/storage/)
EOF

cat "$OUT_DIR/MANIFEST.txt"
