#!/usr/bin/env bash
# Assert stale-pack auto-compile helpers exist on blank product.
set -euo pipefail
ROOT="${1:?}"
test -f "$ROOT/memory-cockpit-v2/server/packStale.js"
test -f "$ROOT/memory-cockpit-v2/server/thinCompile.js"
grep -q 'if_stale' "$ROOT/memory-cockpit-v2/server/thinCompile.js"
grep -q 'if_stale' "$ROOT/memory-cockpit-v2/src/pages/thin/DeskRouter.jsx"
(cd "$ROOT/memory-cockpit-v2" && node scripts/pack-stale-test.mjs)
echo "    pack-stale OK"
