#!/usr/bin/env bash
# Cursor stdio MCP → testing-cockpit seal (not Grok user pin, not kernel vault).
# Workspace-relative. Run from repo root via .cursor/mcp.json.
set -euo pipefail
[ -n "${BASH_VERSION:-}" ] || { echo "error: bash required" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/dogfood-paths.sh"
SEAL="$(dogfood_default_dest "$ROOT")"
MCP_NAME="${COCKPIT_MCP_NAME:-cockpit-research-dogfood}"
SCRIPT="$ROOT/memory-cockpit-v2/scripts/mcp-cockpit-research.mjs"

if [ ! -f "$SCRIPT" ]; then
  echo "cursor-dogfood-mcp: missing $SCRIPT" >&2
  exit 1
fi

need_up=0
if [ ! -f "$SEAL/.cockpit-dogfood.json" ]; then need_up=1; fi
if [ -n "${COCKPIT_DOGFOOD_SLUGS:-}" ] && [ -f "$SEAL/.cockpit-scenario.json" ]; then
  have=$(node -e "const j=require(process.argv[1]);console.log((j.allowed_slugs||[]).join(','))" "$SEAL/.cockpit-scenario.json")
  want=$(echo "$COCKPIT_DOGFOOD_SLUGS" | tr 'A-Z' 'a-z' | tr -d ' ')
  if [ "$have" != "$want" ]; then need_up=1; fi
fi
if [ "$need_up" -eq 1 ]; then
  echo "cursor-dogfood-mcp: bootstrapping $SEAL (--no-glass)" >&2
  UP=(--dir "$SEAL" --mcp-name "$MCP_NAME" --no-glass)
  if [ -n "${COCKPIT_DOGFOOD_SLUGS:-}" ]; then UP+=(--slugs "$COCKPIT_DOGFOOD_SLUGS"); fi
  bash "$ROOT/scripts/dogfood-up.sh" "${UP[@]}"
fi
if [ -f "$SEAL/.cockpit-scenario.json" ]; then
  SLUGS_CSV=$(node -e "const j=require(process.argv[1]);console.log((j.allowed_slugs||['dogf']).join(','))" "$SEAL/.cockpit-scenario.json")
else
  SLUGS_CSV="${COCKPIT_DOGFOOD_SLUGS:-dogf}"
fi

if is_live_tree "$SEAL"; then
  echo "cursor-dogfood-mcp: refuse live tree $SEAL" >&2
  exit 1
fi
if [ -L "$SEAL/research-wiki" ]; then
  echo "cursor-dogfood-mcp: refuse vault symlink" >&2
  exit 1
fi

export COCKPIT_REPO="$SEAL"
export COCKPIT_VAULT="$SEAL/research-wiki"
export ONTOLOGY_WIKI="$COCKPIT_VAULT"
export ONTOLOGY_STORE="$SEAL/ontology/store/by_ticker"
export ONTOLOGY_ROOT="$SEAL/ontology"
export COCKPIT_EXPECT_ROOT="$SEAL"
export COCKPIT_ALLOWED_SLUGS="$SLUGS_CSV"
export COCKPIT_SCENARIO_NAME="dogfood"
export COCKPIT_MCP_NAME="$MCP_NAME"
export COCKPIT_AGENT_ACCEPT="${COCKPIT_AGENT_ACCEPT:-1}"

exec node "$SCRIPT"
