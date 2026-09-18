#!/usr/bin/env bash
# Assert research-run reliability modules load on empty product (no live grok spawn).
set -euo pipefail
ROOT="${1:?}"
test -f "$ROOT/memory-cockpit-v2/server/thinResearchRuns.js"
test -f "$ROOT/memory-cockpit-v2/server/researchRunsWorker.js"
test -f "$ROOT/memory-cockpit-v2/server/researchAcquire.js"
grep -q 'research/runs/:runId/cancel' "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q 'research/runs/:runId/acquire' "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q 'research/runs/:runId/checkpoint' "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q 'thesis_report' "$ROOT/memory-cockpit-v2/server/researchRunsSchema.js"
grep -q 'reports' "$ROOT/memory-cockpit-v2/src/pages/thin/DeskRouter.jsx"
test -f "$ROOT/memory-cockpit-v2/src/pages/thin/Reports.jsx"
test ! -f "$ROOT/memory-cockpit-v2/src/pages/thin/Research.jsx"
test ! -f "$ROOT/memory-cockpit-v2/src/pages/thin/compileRunList.js"
grep -q 'researchLane' "$ROOT/memory-cockpit-v2/server/researchRunsSchema.js"
grep -q 'isThesisReportJob' "$ROOT/memory-cockpit-v2/server/researchRunsWorker.js"
grep -q 'Stopped before PDF' "$ROOT/memory-cockpit-v2/src/pages/thin/Reports.jsx"
grep -q 'lane: req.query.lane' "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
(cd "$ROOT/memory-cockpit-v2" && node scripts/thin-research-runs-test.mjs)
(cd "$ROOT/memory-cockpit-v2" && node scripts/research-lifecycle-test.mjs)
(cd "$ROOT/memory-cockpit-v2" && node scripts/research-acquire-test.mjs)
echo "    research-runs reliability OK"
