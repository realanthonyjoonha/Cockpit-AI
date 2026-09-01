#!/usr/bin/env bash
# Assert 640px iPhone shell exists on empty product (desks=[]).
# Shared chrome only — no per-ticker forks. Live OPEN GROK is out of scope.
set -euo pipefail
ROOT="${1:?monorepo root}"
CSS="$ROOT/memory-cockpit-v2/src/theme.css"
APP="$ROOT/memory-cockpit-v2/src/App.jsx"
test -f "$CSS"
test -f "$APP"
grep -qE '@media \(max-width: 640px\)' "$CSS"
grep -q 'desk-phone' "$APP"
grep -q 'room-bar' "$APP"
grep -q 'className="top"' "$APP"
grep -q 'className="shell"' "$APP"
grep -q 'className="rail"' "$APP"
# empty product still renders Start inside the same shell
grep -q 'pages/Start' "$APP"
if [ -d "$ROOT/memory-cockpit-v2/src/pages/nvda" ] || [ -d "$ROOT/memory-cockpit-v2/src/pages/avgo" ]; then
  echo "per-ticker pages/ fork" >&2
  exit 1
fi
if [ -f "$ROOT/memory-cockpit-v2/scripts/phone-chrome-test.mjs" ]; then
  (cd "$ROOT/memory-cockpit-v2" && node scripts/phone-chrome-test.mjs)
fi
echo "    phone-shell OK"
