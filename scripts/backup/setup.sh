#!/usr/bin/env bash
# One-shot interactive installer.
#
# What this does:
#   1. Creates the private repo teampactbjj-glitch/teampact-backups (if missing)
#   2. Adds it the 5 required Actions secrets (+2 optional Telegram ones)
#   3. Pushes .github/workflows/backup.yml to main (needs workflow scope)
#   4. Optionally installs the launchd plist for weekly Mac sync
#
# What you need handy before running:
#   - A GitHub PAT (fine-grained or classic) with scopes:
#       repo              (to create the backups repo)
#       workflow          (to push the workflow yaml)
#       admin:repo_hook   (not needed, just noting)
#     Create one at: https://github.com/settings/tokens
#
#   - Your Supabase DB password:
#       Supabase dashboard → Project Settings → Database → copy it.
#       (We can't read it from the CLI — it's only shown at project creation.)
#
# Usage:
#   bash scripts/backup/setup.sh

set -euo pipefail

BACKUPS_OWNER="teampactbjj-glitch"
BACKUPS_NAME="teampact-backups"
BACKUPS_REPO="$BACKUPS_OWNER/$BACKUPS_NAME"
APP_REPO="$BACKUPS_OWNER/teampact-app"
SUPABASE_PROJECT_REF="pnicoluujpidguvniwub"
SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"

step() { echo; echo "═══ $* ═══"; }
ask()  { local prompt="$1" var="$2"; read -r -p "$prompt " "$var"; }
asks() { local prompt="$1" var="$2"; read -r -s -p "$prompt " "$var"; echo; }

# ---------------------------------------------------------------
step "1/6  Inputs"
# ---------------------------------------------------------------
asks "GitHub PAT (scopes: repo, workflow):" GH_PAT
if [[ -z "${GH_PAT:-}" ]]; then echo "ERROR: PAT is required" >&2; exit 1; fi

# Quick scope check
SCOPES=$(curl -sI "https://api.github.com/user" -H "Authorization: Bearer $GH_PAT" \
  | awk -F': ' 'tolower($1)=="x-oauth-scopes"{print $2}' | tr -d '\r')
echo "   token scopes: ${SCOPES:-<fine-grained or unreported>}"

asks "Supabase DB password (session pooler, from Supabase dashboard):" DB_PW
if [[ -z "${DB_PW:-}" ]]; then echo "ERROR: DB password is required" >&2; exit 1; fi

# Derive other values from what's already on disk
SB_TOKEN=$(security find-generic-password -s "Supabase CLI" -a supabase -w 2>/dev/null \
  | sed 's/go-keyring-base64://' | base64 -d)
if [[ -z "${SB_TOKEN:-}" ]]; then
  echo "ERROR: couldn't read Supabase CLI token from Keychain." >&2
  echo "Run 'supabase login' first, then re-run this script." >&2
  exit 1
fi

SERVICE_ROLE_KEY=$(curl -sS "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys" \
  -H "Authorization: Bearer $SB_TOKEN" \
  | python3 -c "import json,sys; [print(k['api_key']) for k in json.load(sys.stdin) if k['name']=='service_role']")

DB_URL="postgresql://postgres.${SUPABASE_PROJECT_REF}:${DB_PW}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"

# Verify DB password (only if psql is available).
if command -v psql >/dev/null 2>&1; then
  echo "   verifying DB password with psql..."
  if ! psql "$DB_URL" -c "select 1" >/dev/null 2>&1; then
    echo "ERROR: could not connect to the DB with the provided password." >&2
    echo "Double-check it in Supabase dashboard → Database." >&2
    exit 1
  fi
  echo "   ✓ DB password works"
else
  echo "   (psql not installed — skipping DB password preflight; the Action will surface any auth error)"
fi

read -r -p "Set up Telegram alerts on backup failure? [y/N] " TG_YN
TG_TOKEN=""; TG_CHAT=""
if [[ "$(echo "$TG_YN" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
  ask "  Telegram bot token:"  TG_TOKEN
  ask "  Telegram chat id:"    TG_CHAT
fi

# ---------------------------------------------------------------
step "2/6  Ensuring $BACKUPS_REPO exists"
# ---------------------------------------------------------------
EXISTS=$(curl -sS -o /dev/null -w '%{http_code}' "https://api.github.com/repos/$BACKUPS_REPO" \
  -H "Authorization: Bearer $GH_PAT")

if [[ "$EXISTS" == "200" ]]; then
  echo "   ✓ already exists — reusing"
else
  # Try user endpoint first (most common case), fall back to org.
  CREATE_RESP=$(curl -sS -o /tmp/gh-create.json -w '%{http_code}' \
    -X POST "https://api.github.com/user/repos" \
    -H "Authorization: Bearer $GH_PAT" \
    -H "Accept: application/vnd.github+json" \
    -d "{\"name\":\"$BACKUPS_NAME\",\"private\":true,\"auto_init\":true,\"description\":\"Automated TeamPact DB+Storage snapshots\"}" || true)
  if [[ "$CREATE_RESP" == "201" ]]; then
    echo "   ✓ created"
  else
    CREATE_RESP2=$(curl -sS -o /tmp/gh-create2.json -w '%{http_code}' \
      -X POST "https://api.github.com/orgs/$BACKUPS_OWNER/repos" \
      -H "Authorization: Bearer $GH_PAT" \
      -H "Accept: application/vnd.github+json" \
      -d "{\"name\":\"$BACKUPS_NAME\",\"private\":true,\"auto_init\":true,\"description\":\"Automated TeamPact DB+Storage snapshots\"}" || true)
    if [[ "$CREATE_RESP2" == "201" ]]; then
      echo "   ✓ created (org repo)"
    else
      echo "   ERROR creating repo:" >&2
      cat /tmp/gh-create.json /tmp/gh-create2.json 2>/dev/null | head >&2
      exit 1
    fi
  fi
fi

# ---------------------------------------------------------------
step "3/6  Setting Actions secrets on $APP_REPO"
# ---------------------------------------------------------------
# Fetch the repo's public key for secret encryption
KEY_JSON=$(curl -sS "https://api.github.com/repos/$APP_REPO/actions/secrets/public-key" \
  -H "Authorization: Bearer $GH_PAT" -H "Accept: application/vnd.github+json")
KEY_ID=$(echo "$KEY_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["key_id"])')
KEY_B64=$(echo "$KEY_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["key"])')

# Make sure PyNaCl is available for sealed-box encryption
if ! python3 -c "import nacl" 2>/dev/null; then
  echo "   installing pynacl for secret encryption..."
  python3 -m pip install --quiet --user pynacl || pip3 install --quiet --user pynacl
fi

set_secret() {
  local name="$1" value="$2"
  local encrypted
  encrypted=$(PUB_KEY="$KEY_B64" SECRET_VALUE="$value" python3 -c '
import base64, os
from nacl import encoding, public
pk = public.PublicKey(os.environ["PUB_KEY"].encode(), encoding.Base64Encoder())
sb = public.SealedBox(pk)
print(base64.b64encode(sb.encrypt(os.environ["SECRET_VALUE"].encode())).decode())
')
  curl -sS -o /dev/null -w "   %{http_code}  $name\n" \
    -X PUT "https://api.github.com/repos/$APP_REPO/actions/secrets/$name" \
    -H "Authorization: Bearer $GH_PAT" -H "Accept: application/vnd.github+json" \
    -d "{\"encrypted_value\":\"$encrypted\",\"key_id\":\"$KEY_ID\"}"
}

set_secret BACKUPS_REPO              "$BACKUPS_REPO"
set_secret BACKUPS_REPO_TOKEN        "$GH_PAT"
set_secret SUPABASE_URL              "$SUPABASE_URL"
set_secret SUPABASE_SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
set_secret SUPABASE_DB_URL           "$DB_URL"
if [[ -n "$TG_TOKEN" ]]; then
  set_secret TELEGRAM_BOT_TOKEN "$TG_TOKEN"
  set_secret TELEGRAM_CHAT_ID   "$TG_CHAT"
fi

# ---------------------------------------------------------------
step "4/6  Pushing workflow file"
# ---------------------------------------------------------------
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

if git diff --quiet HEAD -- .github/workflows/backup.yml 2>/dev/null && \
   git ls-files --error-unmatch .github/workflows/backup.yml >/dev/null 2>&1; then
  echo "   ✓ already committed"
else
  git add .github/workflows/backup.yml
  git -c commit.gpgsign=false commit -m "Add daily backup workflow" || true
fi

# Use the PAT for this one push so it has workflow scope
REMOTE_URL=$(git remote get-url origin)
AUTH_URL=$(echo "$REMOTE_URL" | sed "s#https://#https://x-access-token:$GH_PAT@#")
git push "$AUTH_URL" main

# ---------------------------------------------------------------
step "5/6  Kicking off the first run"
# ---------------------------------------------------------------
sleep 3
curl -sS -o /dev/null -w "   dispatch: %{http_code}\n" \
  -X POST "https://api.github.com/repos/$APP_REPO/actions/workflows/backup.yml/dispatches" \
  -H "Authorization: Bearer $GH_PAT" -H "Accept: application/vnd.github+json" \
  -d '{"ref":"main"}'
echo "   Watch it: https://github.com/$APP_REPO/actions"

# ---------------------------------------------------------------
step "6/6  Weekly Mac sync (optional)"
# ---------------------------------------------------------------
read -r -p "Install the weekly launchd agent now? [y/N] " INSTALL_YN
if [[ "$(echo "$INSTALL_YN" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
  PLIST_SRC="$REPO_ROOT/scripts/backup/com.teampact.backup-sync.plist"
  PLIST_DST="$HOME/Library/LaunchAgents/com.teampact.backup-sync.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  # Rewrite the absolute path to sync-to-mac.sh in case the repo lives elsewhere
  sed "s#/Users/dudibenzaken/teampact-app/scripts/backup/sync-to-mac.sh#$REPO_ROOT/scripts/backup/sync-to-mac.sh#" "$PLIST_SRC" > "$PLIST_DST"
  launchctl unload "$PLIST_DST" 2>/dev/null || true
  launchctl load "$PLIST_DST"
  echo "   ✓ installed at $PLIST_DST (runs Sundays 10:00)"
fi

echo
echo "═══ done ═══"
echo "Backup repo:  https://github.com/$BACKUPS_REPO"
echo "Actions:      https://github.com/$APP_REPO/actions/workflows/backup.yml"
echo "Runbook:      docs/BACKUP_AND_RECOVERY.md"
