#!/usr/bin/env bash
# Assert blank product shell files present.
set -euo pipefail
ROOT="${1:?}"
test -f "$ROOT/memory-cockpit-v2/config/thin-desks.json"
n=$(node -e "console.log(require('$ROOT/memory-cockpit-v2/config/thin-desks.json').desks.length)")
test "$n" = "0"
test -f "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
test -f "$ROOT/memory-cockpit-v2/server/openGrok.js"
echo "    empty-shell OK"
