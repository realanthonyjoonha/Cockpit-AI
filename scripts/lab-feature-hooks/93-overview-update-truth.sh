#!/usr/bin/env bash
# Empty Overview + Update tell the truth (COMPILE BOOK / glass ACCEPT). No leftover Trading path.
set -euo pipefail
ROOT="${1:?}"
MC="$ROOT/memory-cockpit-v2"
test -f "$MC/src/pages/thin/Overview.jsx"
if grep -q '~/Trading/ontology' "$MC/src/pages/thin/Overview.jsx"; then
  echo "    ✗ Overview still points at ~/Trading/ontology" >&2
  exit 1
fi
grep -q 'COMPILE BOOK' "$MC/src/pages/thin/Overview.jsx"
grep -q 'BookStrip' "$MC/src/pages/thin/Overview.jsx"
test -f "$MC/src/pages/thin/UpdateMetaOnly.jsx"
if grep -q 'parked for a future' "$MC/src/pages/thin/UpdateMetaOnly.jsx"; then
  echo "    ✗ Update still says ACCEPT is parked" >&2
  exit 1
fi
grep -q 'glass' "$MC/src/pages/thin/UpdateMetaOnly.jsx"
grep -q 'ACCEPT' "$MC/src/pages/thin/UpdateMetaOnly.jsx"
echo "    overview-update-truth OK"
