#!/usr/bin/env bash
# Fail closed: blank product lab only.
set -euo pipefail

PRODUCT="${1:-${COCKPIT_PRODUCT:-/work/product}}"

fail() { echo "  ✗ guard: $*" >&2; exit 1; }
ok() { echo "  ✓ guard: $*"; }

[ -d "$PRODUCT/memory-cockpit-v2" ] || fail "not a monorepo (missing memory-cockpit-v2): $PRODUCT"
[ -f "$PRODUCT/AGENTS.md" ] || fail "missing AGENTS.md: $PRODUCT"

TD="$PRODUCT/memory-cockpit-v2/config/thin-desks.json"
[ -f "$TD" ] || fail "missing thin-desks.json"

n=$(env -u FORCE_COLOR NO_COLOR=1 node -e 'try{const j=require(process.argv[1]);process.stdout.write(String((j.desks||[]).length))}catch(e){process.stdout.write("?")}' "$TD" 2>/dev/null)
if [ "$n" != "0" ]; then
  fail "desks.length=$n (lab requires desks=[] — refuse dogfood registry)"
fi
ok "desks=[]"

# Refuse kernel dogfood tree even if someone emptied desks mid-test (path heuristic)
if [ "${LAB_ALLOW_KERNEL_TREE:-0}" != "1" ]; then
  abs="$(cd "$PRODUCT" 2>/dev/null && pwd || echo "$PRODUCT")"
  if echo "$abs" | grep -q 'cockpit-kernel' && [ -f "$PRODUCT/KERNEL.md" ]; then
    if [ "$n" != "0" ]; then
      fail "kernel dogfood path with desks=$n refused: $abs"
    fi
    # empty kernel still warned — lab should use product
    echo "  · note: path looks like cockpit-kernel (prefer product SoR)"
  fi
fi
if [ -f "$PRODUCT/KERNEL.md" ] && [ "${LAB_ALLOW_KERNEL_TREE:-0}" != "1" ]; then
  ok "KERNEL.md present with desks=[] (edge)"
fi

# Research books should not be required; warn if house views exist (not fail — friend may have books later)
# For *lab clean* gate we only enforce desks=[]

ok "product path usable: $PRODUCT"
