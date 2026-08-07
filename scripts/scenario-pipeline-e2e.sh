#!/usr/bin/env bash
# scenario-pipeline-e2e.sh — fail-closed scenario factory gate.
# Decision-support only. Does not push.
#
# HARD LAW: Scenario content must MIRROR cockpit-kernel /cockpit-new-desk DEEP
# underwrite (full house, ≥25 claims, R1–R8+ tripwires, Street, research slices).
# Thin seeders / megacap stubs FAIL the depth gate by default.
#
# This script does NOT write deep research. Order of operations:
#   1) scenario-up (pin + glass dist)
#   2) YOU / agent: DEEP underwrite into the scenario vault (same bar as kernel)
#   3) this script: ACCEPT + compile/verify + glass APIs + depth floors
#
# Usage:
#   # After DEEP underwrite already in scenario folder:
#   ./scripts/scenario-pipeline-e2e.sh coreweave --ticker CRWV --slug crwv --port 4797
#
#   # Plumbing-only light fixture (NOT for real tickers / NOT default):
#   ALLOW_LIGHT_FIXTURE=1 ./scripts/scenario-pipeline-e2e.sh demox \
#     --ticker DEMO --port 4798 --fixture-light
#
#   # Check-only (no ACCEPT write):
#   ./scripts/scenario-pipeline-e2e.sh … --skip-accept
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
BASE_DIR="${COCKPIT_SCENARIO_HOME:-$HOME/Desktop}"

NAME=""
TICKER=""
SLUG=""
PORT=""
FIXTURE_LIGHT=0
ALLOW_LIGHT_FIXTURE=0
SKIP_ACCEPT=0
SKIP_STREET=0
NO_GLASS=0
DISPLAY_NAME=""

usage() {
  sed -n '2,22p' "$0"
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ticker) TICKER="${2:?}"; shift 2 ;;
    --slug) SLUG="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --from) PRODUCT="${2:?}"; shift 2 ;;
    --display-name) DISPLAY_NAME="${2:?}"; shift 2 ;;
    --fixture-light) FIXTURE_LIGHT=1; shift ;;
    --allow-light-fixture) ALLOW_LIGHT_FIXTURE=1; shift ;;
    --skip-accept) SKIP_ACCEPT=1; shift ;;
    --skip-street) SKIP_STREET=1; shift ;;
    --no-glass) NO_GLASS=1; shift ;;
    -h|--help) usage ;;
    -*)
      echo "unknown: $1" >&2
      exit 1
      ;;
    *)
      if [ -z "$NAME" ]; then NAME="$1"; shift
      else echo "unexpected: $1" >&2; exit 1
      fi
      ;;
  esac
done

if [ -z "$NAME" ]; then
  echo "error: scenario name required" >&2
  usage
fi
NAME="$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-_')"
TICKER="$(echo "${TICKER:-$NAME}" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9.-')"
SLUG="$(echo "${SLUG:-$TICKER}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
if [ -z "$PORT" ]; then
  PORT=$((4690 + $(echo -n "$NAME" | cksum | awk '{print $1 % 20 + 1}')))
fi
DISPLAY_NAME="${DISPLAY_NAME:-$TICKER Scenario Desk}"

SCEN="${BASE_DIR}/cockpit-scenario-${NAME}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  SCENARIO PIPELINE E2E                                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  name:    $NAME"
echo "  ticker:  $TICKER  slug: $SLUG"
echo "  port:    $PORT"
echo "  dir:     $SCEN"
echo "  depth:   $(if [ "$FIXTURE_LIGHT" -eq 1 ] && [ "${ALLOW_LIGHT_FIXTURE:-0}" -eq 1 ]; then echo LIGHT_FIXTURE_OPT_IN; else echo KERNEL_DEEP_REQUIRED; fi)"
echo "  skip_accept: $SKIP_ACCEPT"
echo

if [ "$FIXTURE_LIGHT" -eq 1 ] && [ "${ALLOW_LIGHT_FIXTURE:-0}" -ne 1 ]; then
  echo "error: --fixture-light requires --allow-light-fixture (double opt-in)." >&2
  echo "  Real tickers must use DEEP underwrite first (mirror kernel /cockpit-new-desk)." >&2
  echo "  Plumbing only: … --fixture-light --allow-light-fixture" >&2
  exit 2
fi

# 1) scenario-up (materialize or refresh code + pin + dist)
UP_ARGS=("$NAME" --port "$PORT" --slugs "$SLUG" --from "$PRODUCT" --refresh-code)
if [ "$NO_GLASS" -eq 1 ]; then UP_ARGS+=(--no-glass); fi
AGENT_ACCEPT=1 "$ROOT/scripts/scenario-up.sh" "${UP_ARGS[@]}"

if [ ! -d "$SCEN/memory-cockpit-v2" ]; then
  echo "error: scenario materialize failed" >&2
  exit 1
fi

# 2) latest gate modules into scenario
cp "$ROOT/memory-cockpit-v2/scripts/scenario-pipeline-gates.mjs" \
  "$SCEN/memory-cockpit-v2/scripts/" 2>/dev/null || true
cp "$ROOT/memory-cockpit-v2/server/mcpPinGuard.js" "$SCEN/memory-cockpit-v2/server/"
cp "$ROOT/memory-cockpit-v2/server/houseProposals.js" "$SCEN/memory-cockpit-v2/server/"
cp "$ROOT/memory-cockpit-v2/server/riskProposals.js" "$SCEN/memory-cockpit-v2/server/"
cp "$ROOT/memory-cockpit-v2/server/streetSchema.js" "$SCEN/memory-cockpit-v2/server/"
cp "$ROOT/memory-cockpit-v2/server/thinModel.js" "$SCEN/memory-cockpit-v2/server/"

# 3) scaffold desk if missing
if ! node -e "const j=require('$SCEN/memory-cockpit-v2/config/thin-desks.json'); process.exit((j.desks||[]).some(d=>d.slug==='$SLUG'||d.ticker==='$TICKER')?0:1)"; then
  echo "→ scaffold $TICKER / $SLUG"
  (
    cd "$SCEN"
    if [ -x ./scripts/scaffold-new-desk.sh ]; then
      ./scripts/scaffold-new-desk.sh "$TICKER" "$SLUG" "$DISPLAY_NAME"
    elif [ -x "$ROOT/scripts/scaffold-new-desk.sh" ]; then
      # scaffold expects monorepo cwd with research-wiki
      "$ROOT/scripts/scaffold-new-desk.sh" "$TICKER" "$SLUG" "$DISPLAY_NAME" || true
      # if kernel scaffold wrote into ROOT, copy desk registration hints — prefer scenario-local
      if [ -x "$SCEN/scripts/scaffold-new-desk.sh" ]; then
        "$SCEN/scripts/scaffold-new-desk.sh" "$TICKER" "$SLUG" "$DISPLAY_NAME"
      fi
    else
      echo "error: no scaffold-new-desk.sh" >&2
      exit 1
    fi
  )
fi

# Ensure scenario json
node -e "
  const fs=require('fs');
  const p='$SCEN/.cockpit-scenario.json';
  const j=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{};
  j.name='$NAME';
  j.expect_root='$SCEN';
  j.allowed_slugs=['$SLUG'];
  j.port=$PORT;
  j.agent_accept=true;
  j.updated=new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
"

# Re-pin
node --input-type=module -e "
  import { ensureProjectCockpitMcp } from 'file://$SCEN/memory-cockpit-v2/server/cockpitMcpProject.js';
  process.env.COCKPIT_EXPECT_ROOT='$SCEN';
  process.env.COCKPIT_ALLOWED_SLUGS='$SLUG';
  process.env.COCKPIT_AGENT_ACCEPT='1';
  process.env.COCKPIT_SCENARIO_NAME='$NAME';
  process.env.COCKPIT_VAULT='$SCEN/research-wiki';
  process.env.ONTOLOGY_STORE='$SCEN/ontology/store/by_ticker';
  process.env.ONTOLOGY_ROOT='$SCEN/ontology';
  console.log(ensureProjectCockpitMcp('$SCEN'));
"

# 4) glass up if needed
if [ "$NO_GLASS" -eq 0 ]; then
  if ! curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/api/thin-desks"; then
    echo "→ start glass :$PORT"
    lsof -ti ":$PORT" | xargs kill -9 2>/dev/null || true
    export COCKPIT_REPO="$SCEN"
    export COCKPIT_VAULT="$SCEN/research-wiki"
    export ONTOLOGY_WIKI="$COCKPIT_VAULT"
    export ONTOLOGY_STORE="$SCEN/ontology/store/by_ticker"
    export ONTOLOGY_ROOT="$SCEN/ontology"
    export PORT HOST=127.0.0.1 COCKPIT_ENV_QUIET=1
    nohup bash -c "cd '$SCEN/memory-cockpit-v2' && npm start" \
      >"/tmp/cockpit-scenario-${NAME}-${PORT}.log" 2>&1 &
    for _ in $(seq 1 40); do
      if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/api/thin-desks"; then
        echo "  glass ready"
        break
      fi
      sleep 1
    done
  else
    echo "→ glass already up on :$PORT"
  fi
fi

# 5) gates
export COCKPIT_VAULT="$SCEN/research-wiki"
export COCKPIT_REPO="$SCEN"
export COCKPIT_AGENT_ACCEPT=1
export COCKPIT_EXPECT_ROOT="$SCEN"
export COCKPIT_ALLOWED_SLUGS="$SLUG"
export COCKPIT_SCENARIO_NAME="$NAME"
export ONTOLOGY_STORE="$SCEN/ontology/store/by_ticker"
export ONTOLOGY_ROOT="$SCEN/ontology"
export ONTOLOGY_WIKI="$SCEN/research-wiki"
export TEST_SLUG="$SLUG"
export TEST_TICKER="$TICKER"
export TEST_HOUSE_FILE="house-view-${SLUG}.md"
export TEST_RISKS_REL="raw/${SLUG}-research/08-risks-catalysts.md"
export GLASS_PORT="$PORT"
export FIXTURE_LIGHT="$FIXTURE_LIGHT"
export ALLOW_LIGHT_FIXTURE="${ALLOW_LIGHT_FIXTURE:-0}"
export SKIP_ACCEPT="$SKIP_ACCEPT"
export SKIP_STREET="$SKIP_STREET"

# Prefer scenario glass modules (with vault env already set)
GATES="$SCEN/memory-cockpit-v2/scripts/scenario-pipeline-gates.mjs"
if [ ! -f "$GATES" ]; then
  GATES="$ROOT/memory-cockpit-v2/scripts/scenario-pipeline-gates.mjs"
fi

echo "→ run gates: $GATES"
cd "$SCEN/memory-cockpit-v2"
node "$GATES"
RC=$?

echo
if [ "$RC" -eq 0 ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  SCENARIO PIPELINE E2E PASS: $NAME / $TICKER"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo "  folder:   $SCEN"
  echo "  overview: http://127.0.0.1:${PORT}/#/${SLUG}/overview"
  echo "  house:    http://127.0.0.1:${PORT}/#/${SLUG}/house"
  echo "  risks:    http://127.0.0.1:${PORT}/#/${SLUG}/risks"
  echo "  street:   http://127.0.0.1:${PORT}/#/${SLUG}/street"
  echo
  echo "  OPEN GROK only with cwd=$SCEN (or from this glass)."
  echo "  list_desks must show monorepo_root=$SCEN"
  exit 0
fi

echo "SCENARIO PIPELINE E2E FAIL (exit $RC)"
exit "$RC"
