#!/usr/bin/env bash
# Filing map: Filings room is the ledger; Overview is signal only.
set -euo pipefail
ROOT="${1:?}"
MC="$ROOT/memory-cockpit-v2"
test -f "$MC/server/filingMapInbox.js"
test -f "$MC/server/filingMapSchema.js"
test -f "$MC/src/pages/thin/Overview.jsx"
test -f "$MC/src/pages/thin/Filings.jsx"
test -f "$MC/src/pages/thin/filingMapPaint.js"
test -f "$MC/src/pages/thin/FilingMapDossier.jsx"
grep -q 'MAP FILINGS' "$MC/src/pages/thin/Filings.jsx"
grep -q 'Open analysis' "$MC/src/pages/thin/Filings.jsx"
grep -q 'IN BOOK' "$MC/src/pages/thin/Filings.jsx"
grep -q 'OPEN GROK' "$MC/src/pages/thin/FilingMapDossier.jsx"
grep -q 'PROPOSE FROM MAP' "$MC/src/pages/thin/FilingMapDossier.jsx"
grep -q 'CONFIRM PROPOSE' "$MC/src/pages/thin/FilingMapDossier.jsx"
grep -q 'CLOSEOUT' "$MC/src/pages/thin/Filings.jsx"
grep -q 'propose-from-map' "$MC/server/thinDeskMount.js"
grep -q 'proposeFromFilingMap' "$MC/server/filingMapCloseout.js"
grep -q 'planFilingMapCloseout' "$MC/server/filingMapCloseout.js"
grep -q 'onProposeFromMap' "$MC/src/pages/thin/Filings.jsx"
grep -q 'closeoutPreviewCounts' "$MC/src/pages/thin/filingMapPaint.js"
test -f "$MC/scripts/filing-map-closeout-test.mjs"
grep -q 'filingPageDigest' "$MC/src/pages/thin/FilingMapDossier.jsx"
grep -q 'Digest' "$MC/src/pages/thin/FilingMapDossier.jsx"
grep -q 'FilingsSignal' "$MC/src/pages/thin/Overview.jsx"
grep -q '/filings' "$MC/src/pages/thin/Overview.jsx"
# form·date separator, accession jail, houseStance (tree under test)
test -f "$MC/src/pages/thin/filingLink.js"
grep -q "['\"] · ['\"]" "$MC/src/pages/thin/Overview.jsx"
grep -q 'looksLikeAccession' "$MC/src/pages/thin/filingLink.js"
grep -q 'Open on EDGAR' "$MC/src/pages/thin/filingLink.js"
grep -q 'fmap-print .v' "$MC/src/theme.css"
grep -q 'isScaffoldStance' "$MC/server/houseStance.js"
test -f "$MC/scripts/house-stance-test.mjs"
(cd "$MC" && node scripts/house-stance-test.mjs)
if [ -f "$MC/src/pages/thin/filingLink.js" ] && grep -q 'looksLikeAccession' "$MC/src/pages/thin/filingLink.js"; then
  grep -q "['\"] · ['\"]" "$MC/src/pages/thin/Overview.jsx"
fi
grep -q 'filingsStripMode' "$MC/src/pages/thin/Filings.jsx"
grep -q 'filingsLedgerExtras' "$MC/src/pages/thin/Filings.jsx"
grep -q 'never_mapped' "$MC/src/pages/thin/filingMapPaint.js"
grep -q "startsWith('filings')" "$MC/src/pages/thin/DeskRouter.jsx"
grep -q '/filings' "$MC/src/thinDesks.js"
if grep -q 'ov-stack' "$MC/src/pages/thin/Overview.jsx"; then
  echo "    ✗ Overview still pins via ov-stack" >&2
  exit 1
fi
if grep -q 'className="btn"' "$MC/src/pages/thin/Overview.jsx" && grep -q 'MAP FILINGS' "$MC/src/pages/thin/Overview.jsx"; then
  echo "    ✗ Overview still has MAP FILINGS button" >&2
  exit 1
fi
if grep -q 'FilingMapDossier' "$MC/src/pages/thin/Overview.jsx"; then
  echo "    ✗ Overview still mounts FilingMapDossier" >&2
  exit 1
fi
if grep -qE 'specrow|delta\.json|PAST MAPS' "$MC/src/pages/thin/FilingMapDossier.jsx"; then
  echo "    ✗ dossier still has specrow / files / PAST MAPS" >&2
  exit 1
fi
if grep -q 'never mapped IN BOOK + no material → quiet' "$MC/scripts/filing-map-test.mjs"; then
  echo "    ✗ test re-encoded the MRVL/LLY quiet-unmapped scar" >&2
  exit 1
fi
grep -q 'last_print' "$MC/server/secEdgar.js"
grep -q 'filing_map' "$MC/server/researchRunsSchema.js"
grep -q 'inbox.json' "$MC/server/filingMapInbox.js"
grep -q 'Cancel' "$MC/src/pages/thin/Filings.jsx"
grep -q 'filing_map_status' "$MC/server/operateGlance.js"
grep -q '/filings' "$MC/src/pages/Start.jsx"
if grep -q 'Research pipeline card' "$MC/src/pages/thin/Overview.jsx"; then
  echo "    ✗ Overview still mentions Research pipeline card" >&2
  exit 1
fi
grep -q 'filing-map' "$MC/server/openGrok.js"
test -f "$ROOT/.grok/commands/cockpit-filings-e2e.md"
grep -q 'Do not ask for a ticker' "$ROOT/.grok/commands/cockpit-filings-e2e.md"
(cd "$MC" && node scripts/filing-map-test.mjs)
(cd "$MC" && node scripts/filing-map-closeout-test.mjs)
echo "    filing-map OK"
