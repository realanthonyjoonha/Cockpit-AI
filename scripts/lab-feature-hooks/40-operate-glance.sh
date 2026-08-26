#!/usr/bin/env bash
# Assert multi-desk operate glance API is wired (blank install still OK — empty desks[]).
set -euo pipefail
ROOT="${1:?}"
test -f "$ROOT/memory-cockpit-v2/server/operateGlance.js" || {
  echo "    · operateGlance.js absent (skip if feature not shipped to this tree)"
  exit 0
}
test -f "$ROOT/memory-cockpit-v2/server/index.js"
grep -q 'operate-glance\|operateGlance' "$ROOT/memory-cockpit-v2/server/index.js"
if [ -f "$ROOT/memory-cockpit-v2/scripts/operate-glance-test.mjs" ]; then
  (cd "$ROOT/memory-cockpit-v2" && node scripts/operate-glance-test.mjs)
fi
# empty desks must not throw
(cd "$ROOT/memory-cockpit-v2" && node --input-type=module -e '
import { operateGlance } from "./server/operateGlance.js";
const g = operateGlance();
if (!g || g.ok !== true) throw new Error("operateGlance not ok");
if (!Array.isArray(g.desks)) throw new Error("desks not array");
console.log("    operate-glance OK desks="+g.desks.length);
')
echo "    operate-glance surface OK"
