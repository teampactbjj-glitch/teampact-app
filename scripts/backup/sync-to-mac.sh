#!/usr/bin/env bash
# Clones/pulls the teampact-backups repo into ~/TeamPact-Backups so there's
# always an offline physical copy on this Mac. Run by a weekly launchd agent
# (see scripts/backup/com.teampact.backup-sync.plist).
set -euo pipefail

BACKUPS_REPO="${BACKUPS_REPO:-git@github.com:teampactbjj-glitch/teampact-backups.git}"
LOCAL_DIR="${LOCAL_DIR:-$HOME/TeamPact-Backups}"
LOG_FILE="$LOCAL_DIR/.sync.log"

if [[ ! -d "$LOCAL_DIR/.git" ]]; then
  echo "[sync-to-mac] cloning $BACKUPS_REPO → $LOCAL_DIR"
  git clone --depth 1 "$BACKUPS_REPO" "$LOCAL_DIR"
else
  echo "[sync-to-mac] pulling in $LOCAL_DIR"
  git -C "$LOCAL_DIR" pull --ff-only --depth 50 || {
    # If shallow pull fails (e.g. history rewritten), reset deeper.
    git -C "$LOCAL_DIR" fetch --depth 50 origin
    git -C "$LOCAL_DIR" reset --hard origin/main
  }
fi

mkdir -p "$LOCAL_DIR"
{
  echo "--- sync at $(date -Iseconds) ---"
  du -sh "$LOCAL_DIR" | awk '{print "local size: "$1}'
  COUNT=$(ls -1 "$LOCAL_DIR/snapshots" 2>/dev/null | wc -l | tr -d ' ')
  echo "snapshots:  $COUNT"
} >> "$LOG_FILE"

echo "[sync-to-mac] done — $LOCAL_DIR"
