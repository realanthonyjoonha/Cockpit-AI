#!/usr/bin/env bash
# Assert in-glass source reader + filing-link factory files on blank product.
set -euo pipefail
ROOT="${1:?}"
for f in \
  memory-cockpit-v2/server/sourceRead.js \
  memory-cockpit-v2/server/sourceCatalog.js \
  memory-cockpit-v2/src/pages/thin/Sources.jsx \
  memory-cockpit-v2/src/pages/thin/filingLink.js \
  memory-cockpit-v2/src/pages/thin/Model.jsx \
  memory-cockpit-v2/scripts/source-read-test.mjs
do
  test -f "$ROOT/$f" || { echo "    missing $f"; exit 1; }
done
grep -q 'sources/:id' "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q 'filing-link' "$ROOT/memory-cockpit-v2/src/theme.css"
grep -q 'prose.wide' "$ROOT/memory-cockpit-v2/src/theme.css"
grep -q 'sourceOwnedByDesk\|filterCatalogForDesk' "$ROOT/memory-cockpit-v2/server/thinModel.js"
(cd "$ROOT/memory-cockpit-v2" && node scripts/source-read-test.mjs)
(cd "$ROOT/memory-cockpit-v2" && node scripts/source-catalog-test.mjs)
echo "    source-read + filing-link OK"
