#!/usr/bin/env bash
# feature-ready.sh — lightweight gate agents run before claiming a PLATFORM feature is "implement done".
# Does not push. Does not replace lab-e2e / release-check (those are ship).
# Decision-support only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
pass=0
ok() { echo "  ✓ $*"; pass=$((pass + 1)); }
bad() { echo "  ✗ $*"; fail=$((fail + 1)); }

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  FEATURE READY (factory + easy-mode wiring)              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  root: $ROOT"
echo

need_file() {
  if [ -f "$1" ]; then ok "$2"
  else bad "missing $2 ($1)"
  fi
}

need_grep() {
  if [ ! -f "$1" ]; then bad "$3 (missing $1)"; return; fi
  if grep -qE "$2" "$1"; then ok "$3"
  else bad "$3"
  fi
}

echo "→ easy-mode docs + commands (Anthony cognitive load)"
need_file "$ROOT/docs/EASY.md" "docs/EASY.md"
need_file "$ROOT/docs/FEATURE-MAP.md" "docs/FEATURE-MAP.md (factory rooms + proof)"
need_file "$ROOT/scripts/verify-feature.sh" "named verify lever scripts/verify-feature.sh"
need_file "$ROOT/.grok/commands/cockpit-feature.md" "/cockpit-feature command"
need_file "$ROOT/.grok/commands/cockpit-ship.md" "/cockpit-ship command"
need_file "$ROOT/.grok/commands/cockpit-verify.md" "/cockpit-verify command"
need_grep "$ROOT/AGENTS.md" 'docs/EASY\.md|/cockpit-feature|Easy mode' "AGENTS points at easy mode or feature command"
need_grep "$ROOT/.grok/commands/cockpit.md" 'cockpit-feature' "cockpit menu lists feature"
need_grep "$ROOT/docs/EASY.md" 'Scales via registry|desk N' "EASY.md states scale law"
need_grep "$ROOT/docs/EASY.md" '/cockpit-ship|Ship' "EASY.md states ship mode"
need_grep "$ROOT/docs/EASY.md" 'FEATURE-MAP' "EASY.md points at feature map"
need_grep "$ROOT/docs/LAB.md" 'FEATURE-MAP|verify-feature' "LAB.md points at feature map or verify lever"
need_grep "$ROOT/docs/FEATURE-MAP.md" 'overview|risks|house|sources|street|model|research|ask|update' "map lists thin rooms"
need_grep "$ROOT/docs/FEATURE-MAP.md" 'background' "map mentions background (parked if not a room)"
need_grep "$ROOT/docs/FEATURE-MAP.md" 'verify-feature' "map names the verify lever"
echo

echo "→ factory scalability smells (shared paths exist)"
need_file "$ROOT/memory-cockpit-v2/src/pages/thin/Street.jsx" "shared thin Street (not per-ticker)"
need_file "$ROOT/memory-cockpit-v2/config/thin-desks.json" "registry thin-desks.json"
need_grep "$ROOT/memory-cockpit-v2/server/thinDeskMount.js" 'thin-desks' "live registry mount"
# discourage per-ticker operate pages
if compgen -G "$ROOT/memory-cockpit-v2/src/pages/nvda/*" >/dev/null 2>&1 \
  || compgen -G "$ROOT/memory-cockpit-v2/src/pages/avgo/*" >/dev/null 2>&1; then
  bad "per-ticker pages/ under src/pages/{nvda,avgo} — factory violation"
else
  ok "no per-ticker pages/nvda or pages/avgo trees"
fi
echo

echo "→ operate-glance scales (registry loop feature)"
if [ -f "$ROOT/memory-cockpit-v2/server/operateGlance.js" ]; then
  ok "operateGlance.js present"
  need_grep "$ROOT/memory-cockpit-v2/server/operateGlance.js" 'getLiveThinRegistry|registry' "glance loops registry"
  need_grep "$ROOT/memory-cockpit-v2/server/index.js" 'operate-glance' "API route mounted"
else
  ok "operateGlance optional — skip (not an error if removed)"
fi
echo

echo "→ develop / ship docs still wired"
need_file "$ROOT/docs/DEVELOP.md" "DEVELOP.md"
need_file "$ROOT/RELEASE.md" "RELEASE.md"
need_file "$ROOT/docs/LAB.md" "LAB.md"
need_grep "$ROOT/docs/DEVELOP.md" 'PLATFORM|feature brief|ship-ready' "DEVELOP has class/brief/ship-ready"
echo

echo "→ sync allowlist knows easy commands (friends get agent surface)"
need_grep "$ROOT/scripts/sync-agent-surface.sh" 'cockpit-feature|EASY\.md|cockpit-ship' \
  "sync-agent-surface allowlists easy-mode artifacts" || true
# soft: if pattern missing, still bad for full pass
if grep -qE 'cockpit-feature|EASY\.md|cockpit-ship' "$ROOT/scripts/sync-agent-surface.sh" 2>/dev/null; then
  :
else
  bad "sync-agent-surface.sh should allowlist docs/EASY.md and cockpit-feature/ship commands"
fi
need_grep "$ROOT/scripts/sync-agent-surface.sh" 'FEATURE-MAP|verify-feature' \
  "sync-agent-surface allowlists FEATURE-MAP / verify-feature"
need_grep "$ROOT/docs/PRODUCT-KERNEL-SOR.md" 'FEATURE-MAP|verify-feature' \
  "PRODUCT-KERNEL-SOR lists FEATURE-MAP / verify-feature"
echo

if [ "$fail" -gt 0 ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  FEATURE READY FAIL  ($pass pass · $fail fail)          ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo "  Fix factory/easy-mode wiring before claiming implement done."
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  FEATURE READY PASS  ($pass checks)                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  Next for friends: /cockpit-ship (lab-e2e + release-check)."
echo "  Push only if human says push."
exit 0
