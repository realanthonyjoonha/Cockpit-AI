#!/usr/bin/env bash
# friend-upgrade.sh — seamless platform upgrade for an existing personalized Cockpit.
# Keeps YOUR desks, house, risks, packs, vault. Updates glass + agents only.
# Decision-support only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NO_PULL=0
NO_MCP=0
SKIP_BUILD=0

usage() {
  cat <<'EOF'
Friend upgrade — get latest Street + daybook + factory features without losing your books.

Usage:
  ./scripts/friend-upgrade.sh              # git pull (if repo) + bootstrap + rooms + MCP
  ./scripts/friend-upgrade.sh --no-pull    # already pulled / offline copy
  ./scripts/friend-upgrade.sh --no-mcp     # skip install-grok-mcp
  ./scripts/friend-upgrade.sh --skip-build # skip npm build (dev only)

Safe: does not delete research-wiki, ontology/store, thin-desks desks, or secrets.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --no-pull) NO_PULL=1; shift ;;
    --no-mcp) NO_MCP=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown: $1"; usage; exit 1 ;;
  esac
done

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Cockpit friend upgrade (platform only)                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  repo: $ROOT"
echo

# --- 1. git pull (optional) ---
if [ "$NO_PULL" -eq 0 ] && [ -d "$ROOT/.git" ]; then
  echo "→ git pull (your local commits stay; resolve conflicts if any)"
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git pull --ff-only || {
      echo ""
      echo "  git pull --ff-only failed (diverged or no network)."
      echo "  Fix with: git status · git pull (maybe --rebase) · re-run with --no-pull if you merged by hand."
      exit 1
    }
  else
    echo "  (no upstream set — skip pull; use --no-pull next time or: git branch -u origin/main)"
  fi
else
  echo "→ skip git pull"
fi
echo

# --- 2. bootstrap / build ---
echo "→ install + build glass"
if [ -x "$ROOT/scripts/bootstrap.sh" ] && [ "$SKIP_BUILD" -eq 0 ]; then
  # bootstrap usually npm install + build + doctor
  if grep -q 'with-mcp' "$ROOT/scripts/bootstrap.sh" 2>/dev/null; then
    ./scripts/bootstrap.sh
  else
    ./scripts/bootstrap.sh
  fi
elif [ "$SKIP_BUILD" -eq 0 ]; then
  (cd memory-cockpit-v2 && npm install && npm run build)
else
  echo "  skip build"
fi
echo

# --- 3. ensure Street room on existing installs ---
echo "→ ensure thin rooms include street (factory default)"
if [ -f "$ROOT/scripts/ensure-thin-rooms.mjs" ]; then
  node "$ROOT/scripts/ensure-thin-rooms.mjs"
else
  echo "  (ensure-thin-rooms.mjs missing — skip)"
fi
echo

# --- 4. MCP pin to THIS monorepo ---
if [ "$NO_MCP" -eq 0 ] && [ -x "$ROOT/scripts/install-grok-mcp.sh" ]; then
  echo "→ wire Grok MCP to this folder (your vault)"
  ./scripts/install-grok-mcp.sh || echo "  MCP install warned — agents may need manual pin"
else
  echo "→ skip MCP"
fi
echo

# --- 5. doctor ---
if [ -x "$ROOT/scripts/doctor.sh" ]; then
  echo "→ doctor"
  ./scripts/doctor.sh || true
  echo
fi

# --- 6. what you got ---
cat <<'EOF'
╔══════════════════════════════════════════════════════════╗
║  Upgrade complete — your books were not replaced         ║
╚══════════════════════════════════════════════════════════╝

Kept (yours):
  · research-wiki / house / risks / packs
  · thin-desks.json companies you already underwrote
  · secrets (.env, .access.json)

New / refreshed platform:
  · Daybook daily  →  AGENTS · Daily brief  or  /cockpit-daily {slug}
  · Street room    →  #{slug}/street
      REFRESH STREET  = research firm PTs + auto-update when vault publishes
      OPEN GROK       = free-form Street agent
  · Empty Street is OK until first REFRESH STREET for that ticker

Next:
  1. Restart glass if it was running:
       ./scripts/run-glass.sh
  2. Hard-refresh browser (Cmd+Shift+R)
  3. Open a desk → Street or Daily brief

Help: FRIEND-UPGRADE.md · FRIEND-START.md (first install)
EOF
