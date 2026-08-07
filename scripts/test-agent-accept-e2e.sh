#!/usr/bin/env bash
# Full E2E: scenario with agent_accept → scaffold desk → propose+accept house/risks.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
NAME="agentaccept"
PORT=4791
SLUG="tstk"
TICKER="TSTK"

echo "→ scenario-up $NAME (agent_accept on)"
"$ROOT/scripts/scenario-up.sh" "$NAME" \
  --port "$PORT" \
  --slugs "$SLUG" \
  --from "$PRODUCT" \
  --no-glass \
  --repin-only 2>/dev/null || true

# Fresh materialize if missing
if [ ! -d "$HOME/Desktop/cockpit-scenario-${NAME}/memory-cockpit-v2" ]; then
  "$ROOT/scripts/scenario-up.sh" "$NAME" \
    --port "$PORT" \
    --slugs "$SLUG" \
    --from "$PRODUCT" \
    --no-glass
else
  # refresh scenario json + pin from latest kernel code
  AGENT_ACCEPT=1 "$ROOT/scripts/scenario-up.sh" "$NAME" \
    --port "$PORT" \
    --slugs "$SLUG" \
    --from "$PRODUCT" \
    --no-glass \
    --repin-only
fi

SCEN="$HOME/Desktop/cockpit-scenario-${NAME}"
# Ensure latest pin/accept code in scenario
cp "$ROOT/memory-cockpit-v2/server/mcpPinGuard.js" "$SCEN/memory-cockpit-v2/server/"
cp "$ROOT/memory-cockpit-v2/server/cockpitMcpProject.js" "$SCEN/memory-cockpit-v2/server/"
cp "$ROOT/memory-cockpit-v2/server/houseProposals.js" "$SCEN/memory-cockpit-v2/server/" 2>/dev/null || true
cp "$ROOT/memory-cockpit-v2/server/riskProposals.js" "$SCEN/memory-cockpit-v2/server/" 2>/dev/null || true
cp "$ROOT/memory-cockpit-v2/scripts/mcp-cockpit-research.mjs" "$SCEN/memory-cockpit-v2/scripts/"
cp "$ROOT/memory-cockpit-v2/scripts/agent-accept-e2e-test.mjs" "$SCEN/memory-cockpit-v2/scripts/"

# Scaffold desk if missing
if ! node -e "const j=require('$SCEN/memory-cockpit-v2/config/thin-desks.json'); process.exit((j.desks||[]).some(d=>d.slug==='$SLUG')?0:1)"; then
  echo "→ scaffold $TICKER"
  (
    cd "$SCEN"
    if [ -x ./scripts/scaffold-new-desk.sh ]; then
      ./scripts/scaffold-new-desk.sh "$TICKER" "$SLUG" "Test Co Agent Accept"
    else
      echo "error: no scaffold-new-desk.sh" >&2
      exit 1
    fi
  )
fi

# Ensure scenario allows slug + agent_accept
node -e "
  const fs=require('fs');
  const p='$SCEN/.cockpit-scenario.json';
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  j.agent_accept=true;
  j.allowed_slugs=['$SLUG'];
  j.expect_root='$SCEN';
  fs.writeFileSync(p, JSON.stringify(j,null,2));
"

# Re-apply MCP pin with agent accept
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

echo "→ agent-accept-e2e-test"
export COCKPIT_VAULT="$SCEN/research-wiki"
export COCKPIT_REPO="$SCEN"
export COCKPIT_AGENT_ACCEPT=1
export COCKPIT_EXPECT_ROOT="$SCEN"
export COCKPIT_ALLOWED_SLUGS="$SLUG"
export COCKPIT_SCENARIO_NAME="$NAME"
export TEST_SLUG="$SLUG"
export TEST_TICKER="$TICKER"
export TEST_HOUSE_FILE="house-view-${SLUG}.md"
export TEST_RISKS_REL="raw/${SLUG}-research/08-risks-catalysts.md"

# Run with vault env set BEFORE node loads modules — use scenario's copy of test
# but import house code from KERNEL glass (has accept) with VAULT pointing at scenario
cd "$ROOT/memory-cockpit-v2"
node scripts/agent-accept-e2e-test.mjs

echo
echo "Scenario left at: $SCEN (delete when done)"
echo "config agent_accept line:"
grep AGENT_ACCEPT "$SCEN/.grok/config.toml" || true
