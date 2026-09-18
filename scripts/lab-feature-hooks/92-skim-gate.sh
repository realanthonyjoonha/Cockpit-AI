#!/usr/bin/env bash
# House-only (skim): no register chapter — schema + printer fail-closed.
set -euo pipefail
ROOT="${1:?}"
MC="$ROOT/memory-cockpit-v2"
test -f "$MC/server/researchRunsSchema.js"
grep -q 'export function skimThesisViolations' "$MC/server/researchRunsSchema.js"
grep -q 'export function defaultThesisOrder' "$MC/server/researchRunsSchema.js"
grep -q 'No register chapter' "$MC/src/pages/thin/Reports.jsx"
grep -q 'omit `register-updated`' "$MC/server/researchRunsAgentSeed.js"
test -f "$ROOT/scripts/report/build.py"
grep -q 'def assert_skim_register_omitted' "$ROOT/scripts/report/build.py"
# Pure function: all-scope still allows register ORDER.
(cd "$MC" && node -e "
import { skimThesisViolations } from './server/researchRunsSchema.js';
if (skimThesisViolations({ register_scope: 'all', order: ['setup','register-updated'] }).length) {
  throw new Error('all-scope must not trip skim gate');
}
if (!skimThesisViolations({ register_scope: 'skim', order: ['setup','register-updated'] }).length) {
  throw new Error('skim + register ORDER must fail');
}
")
echo "    skim-gate OK"
