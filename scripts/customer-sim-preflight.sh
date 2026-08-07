#!/usr/bin/env bash
# customer-sim-preflight.sh — prove this tree is a blank-product customer environment.
# Decision-support only. Does not push. Does not touch kernel books.
#
# Usage:
#   cd ~/Desktop/cockpit-product && ./scripts/customer-sim-preflight.sh
#   COCKPIT_PRODUCT=~/Desktop/cockpit-product ./scripts/customer-sim-preflight.sh
#   CUSTOMER_SIM_PORT=4690 ./scripts/customer-sim-preflight.sh --start-glass
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${CUSTOMER_SIM_PORT:-4690}"
START_GLASS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --start-glass) START_GLASS=1; shift ;;
    --port) PORT="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

# Resolve monorepo root (order matters for contamination safety)
resolve_root() {
  if [ -n "${COCKPIT_PRODUCT:-}" ] && [ -d "${COCKPIT_PRODUCT}/memory-cockpit-v2" ] && [ -f "${COCKPIT_PRODUCT}/AGENTS.md" ]; then
    cd "$COCKPIT_PRODUCT" && pwd
    return
  fi
  # Prefer cwd if it is a monorepo (agent/customer habit: cd product first)
  if [ -f "./AGENTS.md" ] && [ -d "./memory-cockpit-v2" ]; then
    pwd
    return
  fi
  # Fall back to script's monorepo
  echo "$SCRIPT_ROOT"
}

ROOT="$(resolve_root)"

fail=0
ok() { echo "  ✓ $*"; }
bad() { echo "  ✗ $*"; fail=1; }

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  CUSTOMER SIM PREFLIGHT                                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  root: $ROOT"
echo "  port: $PORT"
echo

if [ ! -f "$ROOT/AGENTS.md" ] || [ ! -d "$ROOT/memory-cockpit-v2" ]; then
  bad "not a Cockpit monorepo root"
  echo "CUSTOMER SIM PREFLIGHT FAIL"
  exit 1
fi
ok "monorepo layout"

# Docs / command surface present for customer sim
if [ -f "$ROOT/docs/CUSTOMER-SIM.md" ]; then ok "docs/CUSTOMER-SIM.md"
else bad "missing docs/CUSTOMER-SIM.md — sync product or pull platform"
fi
if [ -f "$ROOT/.grok/commands/cockpit-customer-sim.md" ]; then ok "cockpit-customer-sim command"
else bad "missing .grok/commands/cockpit-customer-sim.md"
fi
if [ -f "$ROOT/CUSTOMER-SIM-PROMPT.md" ] || [ -f "$ROOT/docs/CUSTOMER-SIM.md" ]; then
  ok "customer prompt/docs available"
fi

is_dogfood=0
n=0
slugs=""
TD="$ROOT/memory-cockpit-v2/config/thin-desks.json"
if [ -f "$TD" ]; then
  n=$(node -e "console.log(require('$TD').desks.length)")
  slugs=$(node -e "console.log((require('$TD').desks||[]).map(d=>d.slug).join(','))")
fi

# Dogfood = kernel path with real desks (product trees may still ship KERNEL.md as a cold-start marker)
if echo "$ROOT" | grep -q 'cockpit-kernel'; then
  if [ "$n" != "0" ]; then
    bad "path cockpit-kernel with desks=$n — customer sim forbidden (use cockpit-product)"
    is_dogfood=1
  else
    echo "  · path contains cockpit-kernel but desks empty (prefer product tree)"
  fi
elif [ -f "$ROOT/KERNEL.md" ] && [ "$n" = "0" ]; then
  echo "  · KERNEL.md present with desks=[] (product cold-start export — OK)"
fi

if [ ! -f "$TD" ]; then
  bad "missing thin-desks.json"
else
  if [ "$n" = "0" ]; then
    ok "desks=[] (true first-run customer)"
  else
    # allow only seal-* disposable isolation desks (node-validated)
    bad_slugs=$(node -e "
      const j=require('$TD');
      const bad=(j.desks||[]).map(d=>d.slug).filter(s=>!/^seal-\\d+\$/.test(s||''));
      console.log(bad.join(','));
    ")
    if [ -n "$bad_slugs" ]; then
      bad "desks=$n non-disposable slugs=[$bad_slugs] — reset product or use fresh clone"
      is_dogfood=1
    else
      ok "desks=$n disposable seal-only [$slugs]"
    fi
  fi
fi

# Glass
glass_ok=0
if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/api/thin-desks"; then
  glass_ok=1
  ok "glass up on :$PORT"
  body=$(curl -sf --max-time 5 "http://127.0.0.1:${PORT}/api/thin-desks" || true)
  if [ -n "$body" ]; then
    reg=$(printf '%s' "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.registry_path||'')}catch(e){console.log('')}})")
    rn=$(printf '%s' "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log((JSON.parse(d).desks||[]).length)}catch(e){console.log('?')}})")
    echo "  · live desks=$rn registry_path=$reg"
    # Contamination: live glass must serve THIS monorepo's thin-desks when we claim customer mode
    expect_reg="$ROOT/memory-cockpit-v2/config/thin-desks.json"
    if [ -n "$reg" ] && [ "$reg" != "$expect_reg" ]; then
      # resolve realpaths
      rp_reg=$(python3 -c "import os;print(os.path.realpath('$reg'))" 2>/dev/null || echo "$reg")
      rp_exp=$(python3 -c "import os;print(os.path.realpath('$expect_reg'))" 2>/dev/null || echo "$expect_reg")
      if [ "$rp_reg" != "$rp_exp" ]; then
        bad "GLASS/TREE MISMATCH: live registry is not this monorepo's thin-desks.json"
        echo "      live: $reg"
        echo "      expect: $expect_reg"
        echo "      → wrong glass instance or wrong ROOT (contamination risk)"
      else
        ok "live registry_path matches this monorepo"
      fi
    elif [ -n "$reg" ]; then
      ok "live registry_path matches this monorepo"
    fi
    if [ "$is_dogfood" -eq 0 ] && [ "$rn" != "0" ] && [ "$rn" != "?" ]; then
      # live non-empty while disk empty = another process? or seal
      echo "  · note: live desks=$rn (disk n=$n)"
    fi
  fi
else
  if [ "$START_GLASS" -eq 1 ]; then
    if [ "$is_dogfood" -eq 1 ]; then
      bad "refusing --start-glass on dogfood tree"
    else
      echo "→ starting glass on :$PORT from $ROOT"
      if [ ! -d "$ROOT/memory-cockpit-v2/node_modules" ]; then
        (cd "$ROOT/memory-cockpit-v2" && npm install) || bad "npm install failed"
      fi
      if [ ! -f "$ROOT/memory-cockpit-v2/dist/index.html" ]; then
        (cd "$ROOT/memory-cockpit-v2" && npm run build) || true
      fi
      export COCKPIT_REPO="$ROOT"
      export COCKPIT_VAULT="$ROOT/research-wiki"
      export ONTOLOGY_WIKI="$COCKPIT_VAULT"
      export ONTOLOGY_STORE="$ROOT/ontology/store/by_ticker"
      export PORT HOST=127.0.0.1 COCKPIT_ENV_QUIET=1
      nohup bash -c "cd '$ROOT/memory-cockpit-v2' && npm start" >"/tmp/customer-sim-${PORT}.log" 2>&1 &
      echo "  pid $!"
      for _ in $(seq 1 40); do
        if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/api/thin-desks"; then
          ok "glass started on :$PORT"
          glass_ok=1
          break
        fi
        sleep 1
      done
      if [ "$glass_ok" -eq 0 ]; then
        bad "glass failed to start — see /tmp/customer-sim-${PORT}.log"
      fi
    fi
  else
    bad "glass not reachable on :$PORT — PORT=$PORT ./scripts/run-glass-instance.sh $PORT  or  $0 --start-glass"
  fi
fi

echo
echo "  Customer URL: http://127.0.0.1:${PORT}/#/start"
echo "  Expect: START only · Build next company · no dogfood tickers"
echo "  MCP: cd this root → ./scripts/install-grok-mcp.sh → list_desks empty"
echo

if [ "$fail" -ne 0 ]; then
  echo "CUSTOMER SIM PREFLIGHT FAIL"
  exit 1
fi
echo "CUSTOMER SIM PREFLIGHT PASS"
exit 0
