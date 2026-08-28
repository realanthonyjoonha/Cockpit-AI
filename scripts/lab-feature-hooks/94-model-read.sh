#!/usr/bin/env bash
# Assert model_read job + Model page Open PDF strip exist on empty product (no live grok).
set -euo pipefail
ROOT="${1:?}"
test -f "$ROOT/memory-cockpit-v2/server/modelReadGraph.js"
test -f "$ROOT/.grok/skills/model-read/SKILL.md"
test -f "$ROOT/.grok/commands/cockpit-model-read.md"
grep -q 'model_read' "$ROOT/memory-cockpit-v2/server/researchRunsSchema.js"
grep -q 'isModelReadJob' "$ROOT/memory-cockpit-v2/server/researchRunsSchema.js"
grep -q 'isInteractiveResearchJob' "$ROOT/memory-cockpit-v2/server/researchRunsWorker.js"
grep -q 'READ MODEL' "$ROOT/memory-cockpit-v2/src/pages/thin/Model.jsx"
grep -q 'Open PDF' "$ROOT/memory-cockpit-v2/src/pages/thin/Model.jsx"
grep -q 'lane=model' "$ROOT/memory-cockpit-v2/src/pages/thin/Model.jsx"
grep -q 'model-read' "$ROOT/memory-cockpit-v2/server/openGrok.js"
grep -q 'assert_model_read_order' "$ROOT/scripts/report/build.py"
grep -q 'model_read' "$ROOT/memory-cockpit-v2/server/thinResearchRuns.js"
(cd "$ROOT/memory-cockpit-v2" && node scripts/model-read-graph-test.mjs)
echo "    model-read OK"
