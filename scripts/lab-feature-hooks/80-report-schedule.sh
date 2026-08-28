#!/usr/bin/env bash
# Reports arm-next-print (no cron) + PDF-first page files.
set -euo pipefail
ROOT="${1:?}"
test -f "$ROOT/memory-cockpit-v2/server/reportSchedule.js"
test -f "$ROOT/memory-cockpit-v2/src/pages/thin/Reports.jsx"
grep -q 'Remind me after the next print' "$ROOT/memory-cockpit-v2/src/pages/thin/Reports.jsx"
grep -q 'Open PDF' "$ROOT/memory-cockpit-v2/src/pages/thin/Reports.jsx"
grep -q 'register_scope' "$ROOT/memory-cockpit-v2/src/pages/thin/Reports.jsx"
grep -q 'House only' "$ROOT/memory-cockpit-v2/src/pages/thin/Reports.jsx"
grep -q 'No register chapter' "$ROOT/memory-cockpit-v2/src/pages/thin/Reports.jsx"
grep -q 'Run through' "$ROOT/memory-cockpit-v2/src/pages/thin/Reports.jsx"
grep -q 'thesis_pace' "$ROOT/memory-cockpit-v2/server/researchRunsSchema.js"
grep -q 'resolveThesisRegister' "$ROOT/memory-cockpit-v2/server/researchRunsSchema.js"
grep -q 'reports/schedule' "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
(cd "$ROOT/memory-cockpit-v2" && node scripts/report-schedule-test.mjs)
echo "    report-schedule OK"
