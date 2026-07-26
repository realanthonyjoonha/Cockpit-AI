#!/usr/bin/env bash
# doctor.sh — product-shell health check for a monorepo clone (Path 2 cold start).
# Does NOT invent research. Exit 0 = shell green enough to open glass / wire MCP.
#
#   ./scripts/doctor.sh
#   ./scripts/doctor.sh --strict   # also require grok CLI + healthy-looking MCP (if installed)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/monorepo-env.sh
COCKPIT_ENV_QUIET=1
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/monorepo-env.sh"
export COCKPIT_REPO COCKPIT_VAULT ONTOLOGY_WIKI ONTOLOGY_STORE ONTOLOGY_ROOT PORT HOST

STRICT=0
for a in "$@"; do
  case "$a" in
    --strict) STRICT=1 ;;
    -h|--help)
      echo "Usage: $0 [--strict]"
      echo "  Checks monorepo paths, Node, Python, vault, packs, glass build, optional Grok MCP."
      exit 0
      ;;
  esac
done

pass=0
fail=0
warn=0

ok()   { pass=$((pass + 1)); echo "  ✓ $1"; }
bad()  { fail=$((fail + 1)); echo "  ✗ $1 — $2"; }
note() { warn=$((warn + 1)); echo "  ⚠ $1 — $2"; }

echo "=== cockpit doctor (Path 2 product shell) ==="
echo "COCKPIT_REPO=$COCKPIT_REPO"
echo "COCKPIT_VAULT=$COCKPIT_VAULT"
echo "ONTOLOGY_STORE=$ONTOLOGY_STORE"
echo ""

echo "Layout:"
if [ -f "$COCKPIT_REPO/AGENTS.md" ]; then ok "AGENTS.md"; else bad "AGENTS.md" "missing at monorepo root"; fi
if [ -d "$COCKPIT_REPO/memory-cockpit-v2" ]; then ok "memory-cockpit-v2/"; else bad "memory-cockpit-v2/" "missing"; fi
if [ -d "$COCKPIT_REPO/ontology" ]; then ok "ontology/"; else bad "ontology/" "missing"; fi
if [ -d "$COCKPIT_VAULT" ]; then ok "research-wiki (vault)"; else bad "research-wiki" "vault missing at $COCKPIT_VAULT"; fi
if [ -f "$COCKPIT_VAULT/cockpit/lib/fm.js" ]; then ok "vault cockpit/lib/fm.js"; else bad "fm.js" "vault parser missing (glass will not start)"; fi
if [ -d "$ONTOLOGY_STORE" ]; then ok "ontology store/by_ticker"; else bad "store" "missing $ONTOLOGY_STORE"; fi
if [ -x "$ONTOLOGY_ROOT/ont" ] || [ -f "$ONTOLOGY_ROOT/ont" ]; then ok "ontology/ont"; else bad "ont" "missing $ONTOLOGY_ROOT/ont"; fi

echo ""
echo "Tooling:"
if command -v node >/dev/null 2>&1; then
  NV=$(node -v 2>/dev/null || echo '?')
  # Node 18+
  MAJOR=$(echo "$NV" | sed -E 's/^v([0-9]+).*/\1/')
  if [ "${MAJOR:-0}" -ge 18 ] 2>/dev/null; then ok "node $NV"; else bad "node" "need 18+ (got $NV)"; fi
else
  bad "node" "not found (need Node 18+)"
fi
if command -v npm >/dev/null 2>&1; then ok "npm $(npm -v 2>/dev/null || echo '?')"; else bad "npm" "not found"; fi
if command -v python3 >/dev/null 2>&1; then ok "python3 $(python3 --version 2>/dev/null | awk '{print $2}')"; else bad "python3" "not found (need for ./ont)"; fi

GROK_BIN="${GROK_BIN:-}"
if [ -z "$GROK_BIN" ]; then
  if [ -x "$HOME/.grok/bin/grok" ]; then GROK_BIN="$HOME/.grok/bin/grok"
  elif command -v grok >/dev/null 2>&1; then GROK_BIN="$(command -v grok)"
  fi
fi
if [ -n "${GROK_BIN:-}" ]; then
  ok "grok CLI ($GROK_BIN)"
else
  if [ "$STRICT" -eq 1 ]; then
    bad "grok CLI" "not found — install https://x.ai/cli then ./scripts/install-grok-mcp.sh"
  else
    note "grok CLI" "optional for shell; required for MCP agents (https://x.ai/cli)"
  fi
fi

echo ""
if [ -f "$ROOT/KERNEL.md" ]; then
  echo "Compiled packs (kernel — empty is expected):"
  pack_n=0
  if [ -d "$ONTOLOGY_STORE" ]; then
    pack_n=$(find "$ONTOLOGY_STORE" -maxdepth 1 -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [ "${pack_n:-0}" -eq 0 ]; then
    ok "no packs under store — correct for empty cold-start kernel"
  else
    ok "$pack_n pack file(s) present (example or underwritten)"
  fi
else
  echo "Compiled packs (sample / dogfood content if present):"
  for t in NBIS MSFT MU; do
    f="$ONTOLOGY_STORE/$t.json"
    if [ -f "$f" ]; then
      ok "pack $t.json"
    else
      note "pack $t.json" "missing — glass thin desk for this ticker will show empty/unavailable (not an invent-from-nothing shell)"
    fi
  done
fi

echo ""
echo "Glass:"
if [ -d "$COCKPIT_REPO/memory-cockpit-v2/node_modules" ]; then
  ok "memory-cockpit-v2/node_modules"
else
  note "node_modules" "run: ./scripts/bootstrap.sh  (or cd memory-cockpit-v2 && npm install)"
fi
if [ -f "$COCKPIT_REPO/memory-cockpit-v2/dist/index.html" ]; then
  ok "dist/ built"
else
  note "dist/" "not built yet — bootstrap will npm run build"
fi

if [ -n "${GROK_BIN:-}" ]; then
  echo ""
  echo "Grok MCP (best-effort):"
  if "$GROK_BIN" mcp list 2>/dev/null | grep -qi 'cockpit-research'; then
    ok "cockpit-research listed in grok mcp"
  else
    if [ "$STRICT" -eq 1 ]; then
      bad "cockpit-research MCP" "not listed — run ./scripts/install-grok-mcp.sh"
    else
      note "cockpit-research MCP" "not listed yet — ./scripts/install-grok-mcp.sh"
    fi
  fi
fi

echo ""
echo "Ontology verify (monorepo paths; skip if no pack):"
if [ -f "$ONTOLOGY_STORE/NBIS.json" ] && [ -f "$ONTOLOGY_ROOT/ont" ]; then
  if (
    cd "$ONTOLOGY_ROOT"
    export ONTOLOGY_WIKI COCKPIT_VAULT ONTOLOGY_STORE
    ./ont verify NBIS
  ) >/tmp/cockpit-doctor-verify-nbis.txt 2>&1; then
    ok "ont verify NBIS"
  else
    bad "ont verify NBIS" "see /tmp/cockpit-doctor-verify-nbis.txt"
  fi
else
  note "ont verify" "skipped (no NBIS pack or ont) — green shell does not require inventing research"
fi

echo ""
echo "=== summary: $pass ok · $warn warn · $fail fail ==="
if [ "$fail" -gt 0 ]; then
  echo "FAIL — fix errors above, then re-run ./scripts/doctor.sh"
  echo "See COLD-START.md for Fresh Mac → green."
  exit 1
fi
echo "PASS — product shell paths look good."
# Kernel folder → recommend 4682 (live monorepo often already on 4681)
if [ -f "$ROOT/KERNEL.md" ]; then
  SUGGEST_PORT=4682
else
  SUGGEST_PORT="${PORT:-4681}"
fi
echo "Next:"
echo "  ./scripts/bootstrap.sh          # install + build if needed"
echo "  ./scripts/run-glass.sh          # http://127.0.0.1:${SUGGEST_PORT}"
if [ -f "$ROOT/KERNEL.md" ]; then
  echo "  ./scripts/scaffold-new-desk.sh TICKER   # empty structure (no invented research)"
fi
echo "  ./scripts/install-grok-mcp.sh   # optional agents"
echo "  Read COLD-START.md — what works with zero new research vs underwriting."
exit 0
