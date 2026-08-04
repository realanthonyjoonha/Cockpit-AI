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

# --- 5b. desk health (scar-tissue: registry ↔ resolve; NBIS class) ---
echo "→ desk health (thin-slug-resolve + desk-health --all)"
if [ -d "$ROOT/memory-cockpit-v2" ]; then
  (
    cd "$ROOT/memory-cockpit-v2"
    if [ -f scripts/thin-slug-resolve-test.mjs ]; then
      node scripts/thin-slug-resolve-test.mjs || {
        echo "  FAIL: thin-slug-resolve — a registered desk may be blocked by RESERVED_API_SLUGS"
        exit 1
      }
    fi
    if [ -f scripts/desk-health.mjs ]; then
      node scripts/desk-health.mjs --all || {
        echo "  FAIL: desk-health — registered desk not operable (process layer)"
        exit 1
      }
      # Live HTTP only if glass is up AND its catalog matches this install's desks
      # (avoids false PASS when another monorepo's glass is on 4681/4682)
      LOCAL_SLUGS=$(node -e "
        const fs=require('fs');const p='config/thin-desks.json';
        try{const j=JSON.parse(fs.readFileSync(p,'utf8'));
          console.log((j.desks||[]).map(d=>d.slug).filter(Boolean).sort().join(','));
        }catch(e){console.log('')}
      ")
      for PORT in 4682 4681; do
        if curl -sf "http://127.0.0.1:${PORT}/api/thin-desks" >/dev/null 2>&1; then
          REMOTE_SLUGS=$(curl -sS "http://127.0.0.1:${PORT}/api/thin-desks" | node -e "
            let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
              try{const j=JSON.parse(d);console.log((j.desks||[]).map(x=>x.slug).filter(Boolean).sort().join(','));}
              catch(e){console.log('')}
            });
          ")
          if [ -n "$LOCAL_SLUGS" ] && [ "$LOCAL_SLUGS" = "$REMOTE_SLUGS" ]; then
            echo "  live glass :${PORT} matches this registry ($LOCAL_SLUGS) — desk-health --base-url"
            node scripts/desk-health.mjs --all --base-url "http://127.0.0.1:${PORT}" || {
              echo "  FAIL: live desk-health on :${PORT}"
              exit 1
            }
          else
            echo "  live glass :${PORT} registry mismatch (local=[$LOCAL_SLUGS] remote=[$REMOTE_SLUGS]) — skip live (process layer already ran)"
          fi
          break
        fi
      done
    fi
  ) || exit 1
else
  echo "  skip (no memory-cockpit-v2)"
fi
echo

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
