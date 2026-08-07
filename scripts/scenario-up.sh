#!/usr/bin/env bash
# scenario-up.sh — create/start an isolated product-like test Cockpit + MCP pin.
# Decision-support only. Does not push. Does not copy kernel research books.
#
# Usage:
#   ./scripts/scenario-up.sh A --port 4691 --slugs aaa,bbb
#   ./scripts/scenario-up.sh mytest --port 4692 --slugs spcx --from ~/Desktop/cockpit-product
#   ./scripts/scenario-up.sh A --no-glass          # pin only
#   ./scripts/scenario-up.sh A --repin-only        # rewrite pin in existing folder
#   ./scripts/scenario-up.sh A --refresh-code      # re-copy platform modules + ensure Street dist
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME=""
PORT=""
SLUGS=""
FROM="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
BASE_DIR="${COCKPIT_SCENARIO_HOME:-$HOME/Desktop}"
NO_GLASS=0
REPIN_ONLY=0
NO_MCP=0
REFRESH_CODE=0

usage() {
  sed -n '2,14p' "$0"
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:?}"; shift 2 ;;
    --slugs) SLUGS="${2:?}"; shift 2 ;;
    --from) FROM="${2:?}"; shift 2 ;;
    --base-dir) BASE_DIR="${2:?}"; shift 2 ;;
    --no-glass) NO_GLASS=1; shift ;;
    --repin-only) REPIN_ONLY=1; shift ;;
    --no-mcp) NO_MCP=1; shift ;;
    --refresh-code) REFRESH_CODE=1; shift ;;
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
  echo "error: scenario name required (e.g. A)" >&2
  usage
fi
NAME="$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-_')"
if [ -z "$NAME" ]; then
  echo "error: invalid name" >&2
  exit 1
fi
if [ -z "$PORT" ]; then
  PORT=$((4690 + $(echo -n "$NAME" | cksum | awk '{print $1 % 20 + 1}')))
fi

SCENARIO_DIR="${BASE_DIR}/cockpit-scenario-${NAME}"
FROM="$(cd "$FROM" 2>/dev/null && pwd || echo "$FROM")"

if [ ! -d "$FROM/memory-cockpit-v2" ]; then
  echo "error: --from must be a Cockpit monorepo (got $FROM)" >&2
  exit 1
fi

# Refuse copying kernel dogfood as scenario source if it has many desks (use product)
if echo "$FROM" | grep -q 'cockpit-kernel'; then
  n=$(node -e "try{console.log(require('$FROM/memory-cockpit-v2/config/thin-desks.json').desks.length)}catch(e){console.log(0)}")
  if [ "$n" != "0" ]; then
    echo "error: refusing to scenario-up FROM kernel dogfood (desks=$n). Use cockpit-product shell." >&2
    exit 1
  fi
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  SCENARIO UP — isolated product test Cockpit             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  name:     $NAME"
echo "  dir:      $SCENARIO_DIR"
echo "  port:     $PORT"
echo "  slugs:    ${SLUGS:-'(none locked — empty shell)'}"
echo "  from:     $FROM"
echo

if [ "$REPIN_ONLY" -eq 1 ]; then
  if [ ! -d "$SCENARIO_DIR/memory-cockpit-v2" ]; then
    echo "error: scenario dir missing — run without --repin-only first" >&2
    exit 1
  fi
else
  if [ ! -d "$SCENARIO_DIR/memory-cockpit-v2" ]; then
    echo "→ materialize scenario from product shell (no research books)"
    mkdir -p "$SCENARIO_DIR"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a \
        --exclude node_modules \
        --exclude dist \
        --exclude .git \
        --exclude 'ontology/packs/*.json' \
        --exclude 'ontology/store/by_ticker/*.json' \
        --exclude 'research-wiki/raw/*' \
        --exclude 'research-wiki/house-view-*.md' \
        --exclude 'research-wiki/wiki/entities/**' \
        --exclude 'research-wiki/wiki/sources/**' \
        --exclude 'research-wiki/cockpit/street/**' \
        --exclude 'research-wiki/cockpit/briefs/**' \
        --exclude 'research-wiki/cockpit/proposals/**' \
        "$FROM/" "$SCENARIO_DIR/"
    else
      cp -a "$FROM/." "$SCENARIO_DIR/"
    fi
    # Force empty desks for clean scenario
    TD="$SCENARIO_DIR/memory-cockpit-v2/config/thin-desks.json"
    if [ -f "$TD" ]; then
      node -e "
        const fs=require('fs');
        const p='$TD';
        const j=JSON.parse(fs.readFileSync(p,'utf8'));
        j.desks=[];
        if (!Array.isArray(j.rooms) || !j.rooms.includes('street')) {
          j.rooms = ['overview','risks','house','sources','street','ask','update'];
        }
        fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
      "
    fi
    # Share node_modules from source for speed
    if [ -d "$FROM/memory-cockpit-v2/node_modules" ]; then
      rm -rf "$SCENARIO_DIR/memory-cockpit-v2/node_modules"
      ln -sfn "$FROM/memory-cockpit-v2/node_modules" "$SCENARIO_DIR/memory-cockpit-v2/node_modules"
    fi
  else
    echo "→ scenario dir exists (reuse)"
  fi
fi

ABS="$(cd "$SCENARIO_DIR" && pwd)"
GLASS="$ABS/memory-cockpit-v2"

# ── platform modules (always from ROOT when present — pin/accept/street/stance) ──
sync_platform_modules() {
  local src_glass="$ROOT/memory-cockpit-v2"
  local dst_glass="$GLASS"
  [ -d "$src_glass/server" ] || return 0
  [ -d "$dst_glass/server" ] || return 0
  echo "→ sync platform modules from $ROOT"
  local f
  for f in \
    mcpPinGuard.js \
    cockpitMcpProject.js \
    openGrok.js \
    houseProposals.js \
    riskProposals.js \
    thinModel.js \
    thinStreet.js \
    streetSchema.js \
    streetAgentSeed.js \
    streetProvider.js \
    monorepoPaths.js \
    pack.js
  do
    if [ -f "$src_glass/server/$f" ]; then
      cp "$src_glass/server/$f" "$dst_glass/server/"
    fi
  done
  mkdir -p "$dst_glass/scripts"
  for f in mcp-cockpit-research.mjs agent-accept-e2e-test.mjs scenario-pipeline-gates.mjs; do
    if [ -f "$src_glass/scripts/$f" ]; then
      cp "$src_glass/scripts/$f" "$dst_glass/scripts/"
    fi
  done
  # frontend sources that matter for Street / overview chips
  if [ -f "$src_glass/src/pages/thin/Street.jsx" ]; then
    mkdir -p "$dst_glass/src/pages/thin"
    cp "$src_glass/src/pages/thin/Street.jsx" "$dst_glass/src/pages/thin/" 2>/dev/null || true
    cp "$src_glass/src/pages/thin/Overview.jsx" "$dst_glass/src/pages/thin/" 2>/dev/null || true
    cp "$src_glass/src/pages/thin/DeskRouter.jsx" "$dst_glass/src/pages/thin/" 2>/dev/null || true
    cp "$src_glass/src/thinDesks.js" "$dst_glass/src/" 2>/dev/null || true
  fi
}

dist_has_street() {
  local d="$1"
  [ -d "$d" ] || return 1
  # shellcheck disable=SC2046
  if grep -q 'REFRESH STREET\|FIRM MODELS' "$d"/assets/*.js 2>/dev/null; then
    return 0
  fi
  return 1
}

# Ensure glass dist includes Street UI (never leave July-era shell without Street)
ensure_glass_dist() {
  local dst="$GLASS/dist"
  echo "→ ensure glass dist includes Street UI"

  # Break stale symlink without Street
  if [ -L "$dst" ]; then
    local target
    target="$(readlink "$dst" || true)"
    if ! dist_has_street "$dst"; then
      echo "  removing stale dist symlink (no Street UI): $target"
      rm -f "$dst"
    else
      echo "  dist symlink has Street UI — ok"
      return 0
    fi
  fi

  if dist_has_street "$dst"; then
    echo "  local dist has Street UI — ok"
    return 0
  fi

  # Build in scenario if node_modules present
  if [ -d "$GLASS/node_modules" ] || [ -L "$GLASS/node_modules" ]; then
    if [ -f "$GLASS/package.json" ]; then
      echo "  npm run build in scenario glass…"
      (cd "$GLASS" && npm run build) || true
      if dist_has_street "$GLASS/dist"; then
        echo "  build produced Street UI — ok"
        return 0
      fi
    fi
  fi

  # Prefer ROOT (kernel) dist with Street, then FROM (product)
  for cand in "$ROOT/memory-cockpit-v2/dist" "$FROM/memory-cockpit-v2/dist"; do
    if dist_has_street "$cand"; then
      echo "  copying Street-capable dist from $cand"
      rm -rf "$dst"
      cp -a "$cand" "$dst"
      if dist_has_street "$dst"; then
        echo "  dist copy has Street UI — ok"
        return 0
      fi
    fi
  done

  echo "error: scenario glass dist missing Street UI. Build kernel/product glass first:" >&2
  echo "  cd $ROOT/memory-cockpit-v2 && npm run build" >&2
  exit 1
}

# Always sync pin/accept code when scenario exists; --refresh-code forces full module + dist pass
if [ -d "$GLASS" ]; then
  sync_platform_modules
  if [ "$REFRESH_CODE" -eq 1 ] || [ "$REPIN_ONLY" -eq 0 ]; then
    ensure_glass_dist
  else
    # repin-only still needs Street dist or glass is useless for Street tests
    ensure_glass_dist
  fi
fi

# Write scenario pin file (MCP + OPEN GROK seed)
SLUG_JSON='[]'
if [ -n "$SLUGS" ]; then
  SLUG_JSON=$(node -e "console.log(JSON.stringify('$SLUGS'.split(/[\s,]+/).filter(Boolean)))")
fi
AGENT_ACCEPT_JSON="true"
if [ "${AGENT_ACCEPT:-1}" = "0" ] || [ "${AGENT_ACCEPT:-}" = "false" ]; then
  AGENT_ACCEPT_JSON="false"
fi
# Preserve created timestamp if present
CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ -f "$SCENARIO_DIR/.cockpit-scenario.json" ]; then
  CREATED=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$SCENARIO_DIR/.cockpit-scenario.json','utf8')).created||'')}catch(e){console.log('')}" 2>/dev/null || true)
  [ -n "$CREATED" ] || CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
cat >"$SCENARIO_DIR/.cockpit-scenario.json" <<EOF
{
  "name": "$NAME",
  "expect_root": "$ABS",
  "allowed_slugs": $SLUG_JSON,
  "port": $PORT,
  "agent_accept": $AGENT_ACCEPT_JSON,
  "created": "$CREATED",
  "updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
echo "→ wrote .cockpit-scenario.json (agent_accept=$AGENT_ACCEPT_JSON)"

# Ensure street room in registry
if [ -f "$GLASS/config/thin-desks.json" ]; then
  node -e "
    const fs=require('fs');
    const p='$GLASS/config/thin-desks.json';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    const need=['overview','risks','house','sources','street','ask','update'];
    j.rooms = Array.from(new Set([...(j.rooms||[]), ...need]));
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
fi

# MCP project pin with expect root + allowed slugs
if [ "$NO_MCP" -eq 0 ]; then
  echo "→ install MCP pin for this scenario"
  (
    cd "$SCENARIO_DIR"
    export COCKPIT_REPO="$ABS"
    export COCKPIT_VAULT="$ABS/research-wiki"
    export ONTOLOGY_STORE="$ABS/ontology/store/by_ticker"
    export ONTOLOGY_ROOT="$ABS/ontology"
    export COCKPIT_EXPECT_ROOT="$ABS"
    export COCKPIT_SCENARIO_NAME="$NAME"
    if [ -n "$SLUGS" ]; then export COCKPIT_ALLOWED_SLUGS="$SLUGS"; fi
    if [ "$AGENT_ACCEPT_JSON" = "true" ]; then export COCKPIT_AGENT_ACCEPT=1; else export COCKPIT_AGENT_ACCEPT=0; fi
    node --input-type=module -e "
      import { ensureProjectCockpitMcp } from 'file://${ABS}/memory-cockpit-v2/server/cockpitMcpProject.js';
      process.env.COCKPIT_EXPECT_ROOT = '${ABS}';
      process.env.COCKPIT_SCENARIO_NAME = '${NAME}';
      process.env.COCKPIT_ALLOWED_SLUGS = '${SLUGS}';
      process.env.COCKPIT_AGENT_ACCEPT = '${AGENT_ACCEPT_JSON}' === 'true' ? '1' : '0';
      process.env.COCKPIT_VAULT = '${ABS}/research-wiki';
      process.env.ONTOLOGY_STORE = '${ABS}/ontology/store/by_ticker';
      process.env.ONTOLOGY_ROOT = '${ABS}/ontology';
      const r = ensureProjectCockpitMcp('${ABS}');
      console.log(JSON.stringify(r, null, 2));
      if (!r.ok) process.exit(1);
    "
    if [ -x ./scripts/install-grok-mcp.sh ]; then
      ./scripts/install-grok-mcp.sh || true
      node --input-type=module -e "
        import { ensureProjectCockpitMcp } from 'file://${ABS}/memory-cockpit-v2/server/cockpitMcpProject.js';
        process.env.COCKPIT_EXPECT_ROOT = '${ABS}';
        process.env.COCKPIT_SCENARIO_NAME = '${NAME}';
        process.env.COCKPIT_ALLOWED_SLUGS = '${SLUGS}';
        process.env.COCKPIT_AGENT_ACCEPT = '${AGENT_ACCEPT_JSON}' === 'true' ? '1' : '0';
        process.env.COCKPIT_VAULT = '${ABS}/research-wiki';
        process.env.ONTOLOGY_STORE = '${ABS}/ontology/store/by_ticker';
        process.env.ONTOLOGY_ROOT = '${ABS}/ontology';
        const r = ensureProjectCockpitMcp('${ABS}');
        console.log('pin re-apply', r.ok, r.expect_root, r.allowed_slugs, r.agent_accept);
      "
    fi
  )
fi

if [ "$NO_GLASS" -eq 0 ]; then
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "→ port $PORT already in use — not starting another glass"
  else
    echo "→ starting glass on :$PORT"
    export COCKPIT_REPO="$ABS"
    export COCKPIT_VAULT="$ABS/research-wiki"
    export ONTOLOGY_WIKI="$COCKPIT_VAULT"
    export ONTOLOGY_STORE="$ABS/ontology/store/by_ticker"
    export ONTOLOGY_ROOT="$ABS/ontology"
    export PORT HOST=127.0.0.1 COCKPIT_ENV_QUIET=1
    nohup bash -c "cd '$ABS/memory-cockpit-v2' && npm start" \
      >"/tmp/cockpit-scenario-${NAME}-${PORT}.log" 2>&1 &
    echo "  pid $!  log /tmp/cockpit-scenario-${NAME}-${PORT}.log"
    for _ in $(seq 1 40); do
      if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/api/thin-desks"; then
        echo "  glass ready"
        break
      fi
      sleep 1
    done
  fi
fi

echo
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  SCENARIO READY: $NAME"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  folder:  $ABS"
echo "  glass:   http://127.0.0.1:${PORT}/#/start"
echo "  MCP:     project pin + COCKPIT_EXPECT_ROOT=$ABS"
echo "  slugs:   ${SLUGS:-(unrestricted within this folder only)}"
echo "  agent_accept: $AGENT_ACCEPT_JSON (MCP accept_house/risk_proposal when true)"
echo
echo "  MUST: OPEN GROK only from THIS glass (or cwd=$ABS)."
echo "  MUST: list_desks → monorepo_root == $ABS"
echo "  Pipeline: ./scripts/scenario-pipeline-e2e.sh $NAME --ticker TICKER --port $PORT"
echo "  If wrong: STOP. Re-run: $0 $NAME --repin-only --refresh-code --port $PORT --slugs ${SLUGS:-x}"
echo "  Delete when done: rm -rf $ABS"
echo
