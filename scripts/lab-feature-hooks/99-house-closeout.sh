#!/usr/bin/env bash
# House closeout: DEEP new-desk must propose_house (not scaffold) + dump in Grok.
# Runs against the tree under test (product in lab; kernel in dogfood).
set -euo pipefail
ROOT="${1:?}"
MC="$ROOT/memory-cockpit-v2"
CMD="$ROOT/.grok/commands/cockpit-new-desk.md"
PROP="$ROOT/.grok/commands/cockpit-propose.md"
REG="$ROOT/.grok/commands/cockpit-register.md"

test -f "$MC/scripts/house-closeout.mjs"
test -f "$MC/scripts/house-closeout-test.mjs"
grep -q 'house-closeout.mjs' "$CMD"
grep -q 'TSLA-class' "$CMD"
grep -q 'full proposed house markdown' "$CMD" || grep -q 'full house markdown printed' "$CMD"
grep -q 'propose_house' "$CMD"

(cd "$MC" && node scripts/house-closeout-test.mjs)
test -f "$MC/scripts/register-closeout.mjs"
test -f "$MC/scripts/register-closeout-test.mjs"
grep -q 'register-closeout.mjs' "$CMD"
grep -q 'House first, then register' "$CMD" || grep -q 'register-closeout' "$CMD"
grep -q 'same Grok terminal' "$CMD"
grep -q 'Never require a second OPEN GROK' "$CMD"
grep -q 'same terminal, register' "$PROP"
grep -q 'Align register' "$PROP"
grep -q 'GO' "$PROP"
grep -q 'SAVE DRAFT' "$PROP"
grep -q 'Align to that house' "$REG"
grep -q 'GO' "$REG"
(cd "$MC" && node scripts/register-closeout-test.mjs)
test -f "$MC/scripts/new-desk-closeout.mjs"
test -f "$MC/scripts/house-propose-guard-test.mjs"
grep -q 'new-desk-closeout.mjs' "$CMD"
(cd "$MC" && node scripts/house-propose-guard-test.mjs)
(cd "$MC" && node scripts/new-desk-closeout-test.mjs)
test -f "$MC/scripts/go-commit.mjs"
test -f "$MC/scripts/go-commit-test.mjs"
test -f "$MC/server/goCommit.js"
grep -q 'commit_on_go' "$CMD"
grep -q 'go-commit.mjs' "$CMD"
grep -q 'commit_on_go' "$PROP"
grep -q 'GO writes' "$PROP"
grep -q 'EDIT' "$PROP"
grep -q 'EDIT' "$REG"
grep -q 'Three words' "$PROP"
grep -q 'propose FORMING' "$CMD"
grep -q 'refuses FORMING' "$MC/server/houseStance.js"
test -f "$MC/server/houseUtterance.js"
test -f "$MC/scripts/house-utterance-test.mjs"
(cd "$MC" && node scripts/house-utterance-test.mjs)
(cd "$MC" && node scripts/go-commit-test.mjs)
echo "    house-closeout OK"
