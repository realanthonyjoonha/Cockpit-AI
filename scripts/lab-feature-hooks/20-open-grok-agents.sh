#!/usr/bin/env bash
# Assert openGrok agent surface exists (empty install still has catalog code).
set -euo pipefail
ROOT="${1:?}"
OG="$ROOT/memory-cockpit-v2/server/openGrok.js"
test -f "$OG"
grep -q "GROK_AGENTS\|buildInitialPrompt\|exports" "$OG" || grep -q "function\|module" "$OG"
# prompt test if present
if [ -f "$ROOT/memory-cockpit-v2/scripts/open-grok-prompt-test.mjs" ]; then
  (cd "$ROOT/memory-cockpit-v2" && node scripts/open-grok-prompt-test.mjs)
fi
echo "    open-grok-agents OK"
