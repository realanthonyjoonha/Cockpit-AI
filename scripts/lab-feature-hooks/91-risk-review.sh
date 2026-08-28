#!/usr/bin/env bash
# Risk proposals: REVIEW then ACCEPT (same pattern as house). Empty product has no pending rows.
set -euo pipefail
ROOT="${1:?}"
MC="$ROOT/memory-cockpit-v2"
test -f "$MC/server/riskProposals.js"
grep -q 'export function reviewRiskProposal' "$MC/server/riskProposals.js"
grep -q 'REVIEW' "$MC/src/pages/thin/Risks.jsx"
grep -q 'REVIEW' "$MC/src/pages/thin/Risk.jsx"
grep -q 'openProposal' "$MC/src/pages/thin/Risks.jsx"
grep -q "risks/proposals/:id" "$MC/server/thinDeskMount.js"
test -f "$MC/scripts/risk-proposal-review-test.mjs"
(cd "$MC" && node scripts/risk-proposal-review-test.mjs)
echo "    risk-review OK"
