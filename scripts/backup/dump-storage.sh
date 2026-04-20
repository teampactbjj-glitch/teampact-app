#!/usr/bin/env bash
# Recursively downloads every object in the configured Supabase Storage buckets
# into out/storage/<bucket>/<path>. Requires $SUPABASE_URL and
# $SUPABASE_SERVICE_ROLE_KEY.
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is not set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is not set}"

BUCKETS="${BUCKETS:-images products}"
OUT_DIR="${OUT_DIR:-out}"

download_prefix() {
  local bucket="$1"
  local prefix="$2"
  local offset=0
  local page_size=1000

  while :; do
    local resp
    resp=$(curl -sS -X POST "$SUPABASE_URL/storage/v1/object/list/$bucket" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"limit\":$page_size,\"offset\":$offset,\"prefix\":\"$prefix\"}")

    # Exit when listing fails or returns no array.
    if [[ "$resp" != \[* ]]; then
      echo "[dump-storage] list error for $bucket/$prefix: $resp" >&2
      return 1
    fi

    local n_items
    n_items=$(echo "$resp" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
    [[ "$n_items" == "0" ]] && break

    # Walk items: entries with metadata.size are files, without are folders.
    echo "$resp" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for item in data:
    kind = "file" if (item.get("metadata") or {}).get("size") is not None else "dir"
    print(kind + "\t" + item["name"])
' | while IFS=$'\t' read -r kind name; do
      local full
      if [[ -n "$prefix" ]]; then
        full="$prefix/$name"
      else
        full="$name"
      fi
      if [[ "$kind" == "dir" ]]; then
        download_prefix "$bucket" "$full"
      else
        local dest="$OUT_DIR/storage/$bucket/$full"
        mkdir -p "$(dirname "$dest")"
        curl -sSfL "$SUPABASE_URL/storage/v1/object/$bucket/$full" \
          -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
          -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
          -o "$dest"
      fi
    done

    [[ "$n_items" -lt "$page_size" ]] && break
    offset=$((offset + page_size))
  done
}

for bucket in $BUCKETS; do
  echo "[dump-storage] bucket=$bucket"
  mkdir -p "$OUT_DIR/storage/$bucket"
  download_prefix "$bucket" ""
done

echo "[dump-storage] done"
find "$OUT_DIR/storage" -type f | wc -l | xargs echo "[dump-storage] total files:"
du -sh "$OUT_DIR/storage" | awk '{print "[dump-storage] total size: "$1}'
