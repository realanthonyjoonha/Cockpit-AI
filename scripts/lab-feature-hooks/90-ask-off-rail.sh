#!/usr/bin/env bash
# Ask is off the glass rail; pack Q&A stays on API/CLI + hash route.
set -euo pipefail
ROOT="${1:?}"
MC="$ROOT/memory-cockpit-v2"
test -f "$MC/src/thinDesks.js"
test -f "$MC/src/pages/thin/Ask.jsx"
test -f "$MC/src/pages/thin/DeskRouter.jsx"
# Rail must not advertise Ask.
if grep -q "Ask — pack" "$MC/src/thinDesks.js"; then
  echo "    ✗ thinRail still advertises Ask" >&2
  exit 1
fi
# Rooms must not list ask (upgrade strips it).
rooms=$(node -e "const j=require('$MC/config/thin-desks.json'); console.log((j.rooms||[]).join(','))")
if echo "$rooms" | grep -qw ask; then
  echo "    ✗ rooms still include ask: $rooms" >&2
  exit 1
fi
grep -q "startsWith('ask')" "$MC/src/pages/thin/DeskRouter.jsx"
grep -q '/api/:slug/ask' "$MC/server/thinDeskMount.js"
test -f "$MC/scripts/thin-rail-test.mjs"
(cd "$MC" && node scripts/thin-rail-test.mjs)
echo "    ask-off-rail OK (API/CLI kept)"
