#!/usr/bin/env bash
# test-develop-discipline.sh — verify DEVELOP.md wiring + platform/privacy separation.
# Safe in Docker or on host. Does not push git. Decision-support only.
#
# Env:
#   COCKPIT_KERNEL   default: parent of this script's monorepo (this tree)
#   COCKPIT_PRODUCT  default: $HOME/Desktop/cockpit-product or /work/product in container
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KERNEL="${COCKPIT_KERNEL:-$ROOT}"
if [ -z "${COCKPIT_PRODUCT:-}" ]; then
  if [ -d "/work/product" ]; then
    PRODUCT="/work/product"
  else
    PRODUCT="${HOME}/Desktop/cockpit-product"
  fi
else
  PRODUCT="$COCKPIT_PRODUCT"
fi

fail=0
pass=0
ok() { echo "  ✓ $*"; pass=$((pass + 1)); }
bad() { echo "  ✗ $*"; fail=$((fail + 1)); }

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  DEVELOP discipline test (docs + separation gates)       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  kernel:  $KERNEL"
echo "  product: $PRODUCT"
echo

need_file() {
  local f="$1"
  local label="${2:-$1}"
  if [ -f "$f" ]; then ok "$label"
  else bad "missing: $label ($f)"
  fi
}

need_grep() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if [ ! -f "$file" ]; then
    bad "$label (file missing: $file)"
    return
  fi
  if grep -qE "$pattern" "$file"; then ok "$label"
  else bad "$label (pattern not found in $file)"
  fi
}

# --- 1. DEVELOP exists both trees ---
echo "→ DEVELOP.md present"
need_file "$KERNEL/docs/DEVELOP.md" "kernel docs/DEVELOP.md"
need_file "$PRODUCT/docs/DEVELOP.md" "product docs/DEVELOP.md"
echo

# --- 2. Discoverability (AGENTS + README) ---
echo "→ discoverability pointers"
need_grep "$KERNEL/AGENTS.md" 'docs/DEVELOP\.md' "kernel AGENTS task → DEVELOP"
need_grep "$PRODUCT/AGENTS.md" 'docs/DEVELOP\.md' "product AGENTS task → DEVELOP"
need_grep "$KERNEL/README.md" 'docs/DEVELOP\.md' "kernel README → DEVELOP"
need_grep "$PRODUCT/README.md" 'docs/DEVELOP\.md' "product README → DEVELOP"
# friends not forced into DEVELOP as first path
if [ -f "$PRODUCT/README.md" ]; then
  # FRIEND-START should appear before DEVELOP section for friend routing
  fs=$(grep -n 'FRIEND-START' "$PRODUCT/README.md" | head -1 | cut -d: -f1)
  dv=$(grep -n 'DEVELOP' "$PRODUCT/README.md" | head -1 | cut -d: -f1)
  if [ -n "$fs" ] && [ -n "$dv" ] && [ "$fs" -lt "$dv" ]; then
    ok "product README: FRIEND-START before DEVELOP (friend-first)"
  else
    bad "product README: FRIEND-START should appear before DEVELOP"
  fi
fi
echo

# --- 3. Sync allowlist ---
echo "→ sync allowlist"
need_grep "$KERNEL/scripts/sync-agent-surface.sh" 'docs/DEVELOP\.md' "sync-agent-surface allowlists DEVELOP"
need_grep "$KERNEL/docs/PRODUCT-KERNEL-SOR.md" 'docs/DEVELOP\.md' "PRODUCT-KERNEL-SOR lists DEVELOP"
echo

# --- 4. DEVELOP content contracts (procedure, not second constitution) ---
echo "→ DEVELOP content contracts"
D="$KERNEL/docs/DEVELOP.md"
need_grep "$D" 'PLATFORM|CONTENT|HYBRID' "classifies PLATFORM/CONTENT/HYBRID"
need_grep "$D" 'desks' "mentions empty desks litmus"
need_grep "$D" 'release-check' "mentions release-check"
need_grep "$D" 'No git push|no git push|Never.*git push|not push' "forbids push without human"
need_grep "$D" 'AGENTS\.md' "defers to AGENTS"
need_grep "$D" 'AGENTS wins|AGENTS\.md.*wins|If this file conflicts' "AGENTS wins on conflict"
need_grep "$D" 'Ship-ready|ship-ready' "defines ship-ready stage"
need_grep "$D" 'OPERATE\.md' "routes research to OPERATE"
need_grep "$D" 'FRIEND-' "routes friends away from DEVELOP"
need_grep "$D" 'Feature:' "includes feature brief template"
echo

# --- 5. Product privacy / empty shell ---
echo "→ product separation (empty shell)"
if [ ! -d "$PRODUCT" ]; then
  bad "product tree missing: $PRODUCT"
else
  TD="$PRODUCT/memory-cockpit-v2/config/thin-desks.json"
  if [ -f "$TD" ]; then
    n=$(node -e "const j=require('$TD'); console.log((j.desks||[]).length)" 2>/dev/null || echo "?")
    if [ "$n" = "0" ]; then ok "product thin-desks desks=[]"
    else bad "product thin-desks has $n desks (expected 0 for ship SoR)"
    fi
  else
    bad "product thin-desks.json missing"
  fi
  if [ -d "$PRODUCT/.git" ]; then
    leaks=$(cd "$PRODUCT" && git ls-files \
      'research-wiki/house-view-*.md' \
      'research-wiki/wiki/entities/*' \
      'research-wiki/wiki/sources/*' \
      'research-wiki/cockpit/street/*.json' \
      'research-wiki/cockpit/briefs/**' \
      'research-wiki/cockpit/proposals/**' \
      'ontology/packs/*.json' \
      'ontology/store/by_ticker/*.json' \
      2>/dev/null | grep -v gitkeep || true)
    if [ -z "$leaks" ]; then ok "product git: no research books tracked"
    else bad "product tracks research-shaped files:"; echo "$leaks" | sed 's/^/      /'
    fi
  else
    echo "  · product not a git repo — skip tracked-files privacy (container copy OK)"
  fi
fi
echo

# --- 6. Kernel dogfood can have desks (contrast) ---
echo "→ kernel dogfood contrast"
KTD="$KERNEL/memory-cockpit-v2/config/thin-desks.json"
if [ -f "$KTD" ]; then
  kn=$(node -e "const j=require('$KTD'); console.log((j.desks||[]).length)" 2>/dev/null || echo "0")
  ok "kernel thin-desks desks count=$kn (dogfood may be non-zero)"
else
  echo "  · kernel thin-desks missing (unusual)"
fi
echo

# --- 7. Platform health on product (empty install) ---
echo "→ product platform health (empty install)"
if [ -d "$PRODUCT/memory-cockpit-v2" ]; then
  (
    cd "$PRODUCT/memory-cockpit-v2"
    if [ -f scripts/thin-slug-resolve-test.mjs ]; then
      if node scripts/thin-slug-resolve-test.mjs; then ok "product thin-slug-resolve"
      else bad "product thin-slug-resolve FAIL"
      fi
    else
      bad "product thin-slug-resolve-test.mjs missing"
    fi
    if [ -f scripts/desk-health.mjs ]; then
      if node scripts/desk-health.mjs --all; then ok "product desk-health --all"
      else bad "product desk-health FAIL"
      fi
    else
      bad "product desk-health.mjs missing"
    fi
  ) || true
else
  bad "product memory-cockpit-v2 missing"
fi
echo

# --- 8. DEVELOP paths resolve (relative links sanity) ---
echo "→ DEVELOP link targets exist on kernel"
for rel in AGENTS.md RELEASE.md OPERATE.md docs/PRODUCT-KERNEL-SOR.md FRIEND-UPGRADE.md; do
  if [ -f "$KERNEL/$rel" ]; then ok "link target $rel"
  else bad "DEVELOP links to missing $rel"
  fi
done
echo

# --- summary ---
echo "╔══════════════════════════════════════════════════════════╗"
if [ "$fail" -eq 0 ]; then
  echo "║  DEVELOP DISCIPLINE PASS  ($pass checks)                   ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 0
else
  echo "║  DEVELOP DISCIPLINE FAIL  ($fail failed, $pass passed)     ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 1
fi
