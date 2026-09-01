#!/usr/bin/env bash
# Assert blank PRODUCT shell files present (friend-shaped desks=[]).
# Empty-shell truth is PRODUCT, never kernel dogfood. Kernel may keep books.
# $1 = lab work monorepo root (already empty) OR a kernel path (redirect to PRODUCT).
set -euo pipefail

CAND="${1:?monorepo root}"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"

desk_count() {
  local td="$1/memory-cockpit-v2/config/thin-desks.json"
  if [ ! -f "$td" ]; then
    echo "?"
    return
  fi
  env -u FORCE_COLOR NO_COLOR=1 node -e 'try{process.stdout.write(String(require(process.argv[1]).desks.length))}catch(e){process.stdout.write("?")}' "$td" 2>/dev/null
}

ROOT=""
n_cand=$(desk_count "$CAND")
if [ "$n_cand" = "0" ]; then
  ROOT="$CAND"
else
  n_prod=$(desk_count "$PRODUCT")
  if [ "$n_prod" = "0" ]; then
    echo "    · $CAND desks=$n_cand (kernel/dogfood) — empty-shell uses PRODUCT $PRODUCT desks=[]"
    ROOT="$PRODUCT"
  else
    echo "empty-shell FAIL: need PRODUCT desks=[] (friend SoR)." >&2
    echo "  candidate: $CAND desks=$n_cand" >&2
    echo "  COCKPIT_PRODUCT: $PRODUCT desks=$n_prod" >&2
    echo "  Kernel may keep dogfood desks. Do not wipe kernel thin-desks.json." >&2
    echo "  Provision: ./scripts/ensure-product-empty.sh" >&2
    exit 1
  fi
fi

test -f "$ROOT/memory-cockpit-v2/config/thin-desks.json"
n=$(desk_count "$ROOT")
test "$n" = "0"
test -f "$ROOT/memory-cockpit-v2/server/thinDeskMount.js"
test -f "$ROOT/memory-cockpit-v2/server/openGrok.js"
# Refuse kernel desk list copied into the empty-shell tree
if [ -f "$ROOT/KERNEL.md" ] && [ "$n" != "0" ]; then
  echo "empty-shell FAIL: KERNEL.md with desks=$n" >&2
  exit 1
fi
echo "    empty-shell OK desks=[] root=$ROOT"
