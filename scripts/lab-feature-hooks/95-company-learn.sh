#!/usr/bin/env bash
# Assert Background room + learn vault APIs exist on empty product (no live grok).
set -euo pipefail
ROOT="${1:?}"
test -f "$ROOT/memory-cockpit-v2/server/thinLearn.js"
test -f "$ROOT/memory-cockpit-v2/server/learnSchema.js"
test -f "$ROOT/memory-cockpit-v2/server/learnMap.js"
test -f "$ROOT/memory-cockpit-v2/server/learnHarvest.js"
test -f "$ROOT/memory-cockpit-v2/server/learnDiagrams.js"
test -f "$ROOT/memory-cockpit-v2/server/learnPhotos.js"
test -f "$ROOT/memory-cockpit-v2/server/learnDeep.js"
test -f "$ROOT/memory-cockpit-v2/server/learnAgentSeed.js"
test -f "$ROOT/memory-cockpit-v2/src/pages/thin/Background.jsx"
test -f "$ROOT/memory-cockpit-v2/src/pages/thin/LearnDiagrams.jsx"
test -f "$ROOT/memory-cockpit-v2/src/pages/thin/LearnPhotos.jsx"
test -f "$ROOT/memory-cockpit-v2/scripts/learn-photos.mjs"
test -f "$ROOT/memory-cockpit-v2/scripts/fixtures/learn-product-map.json"
test -f "$ROOT/memory-cockpit-v2/src/pages/thin/learnDiagramLayout.js"
test -f "$ROOT/memory-cockpit-v2/src/pages/thin/learnDiagramPick.js"
test -f "$ROOT/memory-cockpit-v2/plans/LEARN-ENGINE.md"
test -f "$ROOT/memory-cockpit-v2/plans/LEARN-DIAGRAMS-V2-PLAN.md"
test -f "$ROOT/memory-cockpit-v2/plans/LEARN-PHOTOS-PLAN.md"
test -f "$ROOT/memory-cockpit-v2/plans/LEARN-BACKGROUND-V3.md"
test -f "$ROOT/.grok/skills/company-learn/SKILL.md"
test -f "$ROOT/.grok/commands/cockpit-learn.md"
grep -q "startsWith('background')" "$ROOT/memory-cockpit-v2/src/pages/thin/DeskRouter.jsx"
grep -q 'background' "$ROOT/memory-cockpit-v2/src/thinDesks.js"
grep -q "/api/:slug/learn" "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q "learn/map" "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q "learn/photos" "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q "learn/deep" "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q "action: 'tutor'" "$ROOT/memory-cockpit-v2/server/openGrok.js"
grep -q "action: 'background'" "$ROOT/memory-cockpit-v2/server/openGrok.js"
grep -q "learn-deepen" "$ROOT/memory-cockpit-v2/server/openGrok.js"
grep -qi 'silence is not contradiction' "$ROOT/memory-cockpit-v2/server/learnAgentSeed.js"
grep -qi 'learn-map engine' "$ROOT/memory-cockpit-v2/server/learnAgentSeed.js"
grep -q 'diagrams' "$ROOT/memory-cockpit-v2/server/learnAgentSeed.js"
grep -q 'ARCHITECTURE' "$ROOT/memory-cockpit-v2/src/pages/thin/LearnDiagrams.jsx"
if grep -q '<svg' "$ROOT/memory-cockpit-v2/src/pages/thin/LearnDiagrams.jsx"; then
  echo "LearnDiagrams.jsx still contains SVG" >&2
  exit 1
fi
grep -q 'NOT RUN' "$ROOT/memory-cockpit-v2/src/pages/thin/Background.jsx"
grep -q 'learn-deepen' "$ROOT/memory-cockpit-v2/src/pages/thin/Background.jsx"
if grep -q 'learn-split' "$ROOT/memory-cockpit-v2/src/pages/thin/Background.jsx"; then
  echo "Background.jsx still uses learn-split two-column layout" >&2
  exit 1
fi
grep -q 'StudyTree' "$ROOT/memory-cockpit-v2/src/pages/thin/Background.jsx"
if grep -q 'OPEN TUTOR' "$ROOT/memory-cockpit-v2/src/pages/thin/Background.jsx"; then
  echo "Background.jsx still has OPEN TUTOR chrome" >&2
  exit 1
fi
grep -q 'learn-tab' "$ROOT/memory-cockpit-v2/src/pages/thin/LearnDiagrams.jsx"
grep -q 'learnDiagrams' "$ROOT/memory-cockpit-v2/server/learnMap.js"
grep -q "'background'" "$ROOT/scripts/ensure-thin-rooms.mjs"
(cd "$ROOT/memory-cockpit-v2" && node scripts/thin-learn-test.mjs)
(cd "$ROOT/memory-cockpit-v2" && node scripts/learn-factory.mjs --dry-run)
fill_code=0
(cd "$ROOT/memory-cockpit-v2" && node scripts/learn-factory.mjs --fill) && fill_code=0 || fill_code=$?
if [ "$fill_code" -ne 2 ]; then
  echo "learn-factory --fill must exit 2 (got $fill_code)" >&2
  exit 1
fi
echo "    company-learn OK"
