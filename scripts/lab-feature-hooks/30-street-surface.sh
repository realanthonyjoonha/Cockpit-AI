#!/usr/bin/env bash
# Assert Street platform surface exists without requiring published firm rows.
set -euo pipefail
ROOT="${1:?}"
test -f "$ROOT/memory-cockpit-v2/server/thinStreet.js"
test -f "$ROOT/memory-cockpit-v2/server/streetSchema.js"
test -f "$ROOT/memory-cockpit-v2/src/pages/thin/Street.jsx"
if [ -f "$ROOT/memory-cockpit-v2/scripts/street-schema-test.mjs" ]; then
  (cd "$ROOT/memory-cockpit-v2" && node scripts/street-schema-test.mjs)
fi
# rooms default should allow street in factory template if thin-desks has rooms
rooms=$(node -e "const j=require('$ROOT/memory-cockpit-v2/config/thin-desks.json'); console.log((j.rooms||[]).join(','))")
echo "    rooms=$rooms"
if echo "$rooms" | grep -q street; then
  echo "    street room in template OK"
else
  echo "    · street not in rooms list (ensure-thin-rooms / factory may add later)" 
fi
echo "    street-surface OK"
