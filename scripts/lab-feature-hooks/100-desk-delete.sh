#!/usr/bin/env bash
# Blank product: removing a company deletes its files. Nothing is archived.
# The suite uses a throwaway vault. It does not read Anthony's books.
set -euo pipefail
ROOT="${1:?}"
test -f "$ROOT/memory-cockpit-v2/server/deskBundle.js"
test -f "$ROOT/memory-cockpit-v2/server/deleteDesk.js"
test -f "$ROOT/memory-cockpit-v2/src/pages/thin/DeleteCompany.jsx"
test -f "$ROOT/memory-cockpit-v2/scripts/desk-bundle-test.mjs"
test -f "$ROOT/memory-cockpit-v2/scripts/desk-delete-census-test.mjs"
test -f "$ROOT/memory-cockpit-v2/scripts/desk-delete-http-test.mjs"
grep -q "DeleteCompany" "$ROOT/memory-cockpit-v2/src/pages/thin/Overview.jsx"
grep -q "/api/:slug/desk/delete" "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q "desk-bundle" "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
grep -q "These files are deleted" "$ROOT/memory-cockpit-v2/src/pages/thin/DeleteCompany.jsx"
grep -q "desk-delete-census-test.mjs" "$ROOT/memory-cockpit-v2/package.json"
if grep -q "to trash" "$ROOT/memory-cockpit-v2/src/pages/thin/DeleteCompany.jsx"; then
  echo "DeleteCompany still offers a trash archive" >&2
  exit 1
fi
(cd "$ROOT/memory-cockpit-v2" && node scripts/desk-bundle-test.mjs)
(cd "$ROOT/memory-cockpit-v2" && node scripts/desk-delete-census-test.mjs)
(cd "$ROOT/memory-cockpit-v2" && node scripts/desk-delete-http-test.mjs)
echo "    desk-delete OK"
