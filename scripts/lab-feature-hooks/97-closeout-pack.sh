#!/usr/bin/env bash
# Closeout pack: propose-from-map / propose-from-run + glance attention chips.
set -euo pipefail
ROOT="${1:?}"
MC="$ROOT/memory-cockpit-v2"
test -f "$MC/server/filingMapCloseout.js"
test -f "$MC/server/researchRunCloseout.js"
grep -q 'propose-from-map' "$MC/server/thinDeskMount.js"
grep -q 'propose-from-run' "$MC/server/thinDeskMount.js"
grep -q 'PROPOSE FROM MAP' "$MC/src/pages/thin/FilingMapDossier.jsx"
grep -q 'PROPOSE FROM REPORT' "$MC/src/pages/thin/Reports.jsx"
grep -q 'CLOSEOUT · PROPOSE STATUS' "$MC/src/pages/thin/Risk.jsx"
grep -q 'propose-pending' "$MC/server/operateGlance.js"
grep -q 'filing-propose' "$MC/server/operateGlance.js"
grep -q 'research-promote' "$MC/server/operateGlance.js"
grep -q 'MAP→PROPOSE' "$MC/src/pages/Start.jsx"
grep -q 'PROPOSE FROM REPORT' "$MC/src/pages/thin/Reports.jsx"
(cd "$MC" && node scripts/filing-map-closeout-test.mjs)
(cd "$MC" && node scripts/research-run-closeout-test.mjs)
(cd "$MC" && node scripts/operate-glance-test.mjs)
echo "    closeout-pack OK"
