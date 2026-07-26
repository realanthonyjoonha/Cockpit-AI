#!/usr/bin/env bash
# bootstrap.sh — Path 2 cold start: clone → green product shell (no tribal ~/Trading).
#
#   ./scripts/bootstrap.sh              # deps + build + doctor
#   ./scripts/bootstrap.sh --with-mcp   # also wire Grok MCP (needs grok CLI + login)
#   ./scripts/bootstrap.sh --skip-doctor
#
# Does NOT invent house views, risks, or desks. Sample packs in-repo (if present)
# are dogfood content — empty vault still gets a runnable glass shell.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/monorepo-env.sh"

WITH_MCP=0
SKIP_DOCTOR=0
for a in "$@"; do
  case "$a" in
    --with-mcp) WITH_MCP=1 ;;
    --skip-doctor) SKIP_DOCTOR=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/bootstrap.sh [--with-mcp] [--skip-doctor]

  1. Export monorepo env (COCKPIT_VAULT, ONTOLOGY_*, PORT)
  2. npm install + npm run build in memory-cockpit-v2
  3. ./scripts/doctor.sh
  4. Optional: ./scripts/install-grok-mcp.sh

Then: ./scripts/run-glass.sh  →  http://127.0.0.1:4681
EOF
      exit 0
      ;;
  esac
done

echo "=== cockpit bootstrap (Path 2) ==="
echo "Repo: $COCKPIT_REPO"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found (need Node 18+)"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 not found (need for ontology ./ont)"
  exit 1
fi

if [ ! -d "$COCKPIT_VAULT" ]; then
  echo "error: vault missing: $COCKPIT_VAULT"
  echo "  This monorepo expects research-wiki/ at clone root (sample or empty layout)."
  exit 1
fi
if [ ! -f "$COCKPIT_VAULT/cockpit/lib/fm.js" ]; then
  echo "error: vault parser missing: $COCKPIT_VAULT/cockpit/lib/fm.js"
  echo "  Glass requires cockpit/lib from the vault tree — do not strip it."
  exit 1
fi

GLASS="$COCKPIT_REPO/memory-cockpit-v2"
cd "$GLASS"

if [ ! -d node_modules ]; then
  echo "npm install…"
  npm install
else
  echo "node_modules present — skip install (delete node_modules to force)"
fi

echo "npm run build…"
npm run build

if [ "$WITH_MCP" -eq 1 ]; then
  echo ""
  echo "Wiring Grok MCP…"
  "$ROOT/scripts/install-grok-mcp.sh"
fi

if [ "$SKIP_DOCTOR" -eq 0 ]; then
  echo ""
  "$ROOT/scripts/doctor.sh" || true
fi

echo ""
echo "=== bootstrap done ==="
echo "Start glass:"
echo "  ./scripts/run-glass.sh"
echo "  open http://127.0.0.1:${PORT}"
echo ""
echo "Optional MCP:"
echo "  ./scripts/install-grok-mcp.sh && grok mcp doctor"
echo ""
echo "What this is NOT: invented underwriting. See COLD-START.md"
echo "  Green shell  = glass + paths + (optional) MCP"
echo "  Full desk    = research Part 1 → ont compile/verify → thin registry"
echo "                 (NEW-DESK-PLAYBOOK.md) — never skip with fake content"
