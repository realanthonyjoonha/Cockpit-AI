#!/usr/bin/env bash
# release-check.sh — gate before "features are ready for friends"
# Run from monorepo root (kernel or product). Fails closed on privacy + platform health.
# Decision-support only. Does not push git.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

KERNEL="${COCKPIT_KERNEL:-$HOME/Desktop/cockpit-kernel}"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
SKIP_SYNC=0
SKIP_TESTS=0
FROM_TREE=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release-check.sh              # detect tree; run local gates
  ./scripts/release-check.sh --full       # also sync kernel→product + product tests
  ./scripts/release-check.sh --skip-tests # docs/privacy only

Exit 0 = OK to consider shipping (still requires human git push).
EOF
}

FULL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --full) FULL=1; shift ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown: $1"; usage; exit 1 ;;
  esac
done

fail=0
ok() { echo "  ✓ $*"; }
bad() { echo "  ✗ $*"; fail=1; }

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  RELEASE CHECK — platform to friends (no vault ship)     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  root: $ROOT"
echo

# --- Detect tree ---
if [ -f "$ROOT/KERNEL.md" ] || [ -d "$ROOT/memory-cockpit-v2" ]; then
  :
fi
if [ -f "$ROOT/FRIEND-START.md" ] && [ -d "$ROOT/.git" ]; then
  FROM_TREE="product"
elif [ -f "$ROOT/KERNEL.md" ]; then
  FROM_TREE="kernel"
else
  FROM_TREE="unknown"
fi
echo "→ tree guess: $FROM_TREE"
echo

# --- Privacy: product must not track research books ---
echo "→ privacy (product SoR)"
if [ -d "$PRODUCT/.git" ]; then
  (
    cd "$PRODUCT"
    # desks must stay empty on product SoR (friends start blank)
    if [ -f memory-cockpit-v2/config/thin-desks.json ]; then
      n=$(node -e "const j=require('./memory-cockpit-v2/config/thin-desks.json'); console.log((j.desks||[]).length)")
      if [ "$n" = "0" ]; then ok "product thin-desks desks=[]"
      else bad "product thin-desks has $n desks — friends would inherit your registry; clear desks before push"
      fi
    fi
    # staged or tracked research-shaped paths
    leaks=$(git ls-files \
      'research-wiki/house-view-*.md' \
      'research-wiki/wiki/entities/*' \
      'research-wiki/wiki/sources/*' \
      'research-wiki/cockpit/street/*.json' \
      'research-wiki/cockpit/briefs/**' \
      'research-wiki/cockpit/proposals/**' \
      'ontology/packs/*.json' \
      'ontology/store/by_ticker/*.json' \
      2>/dev/null | grep -v gitkeep || true)
    if [ -z "$leaks" ]; then ok "no research books tracked in product git"
    else
      bad "research-shaped files TRACKED in product — remove before push:"
      echo "$leaks" | sed 's/^/      /'
    fi
    # staged but not committed
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      staged=$(git diff --cached --name-only 2>/dev/null | grep -E 'house-view-|wiki/entities/|wiki/sources/|cockpit/street/.*\.json|packs/.*\.json|store/by_ticker/.*\.json|cockpit/briefs/|cockpit/proposals/' || true)
      if [ -z "$staged" ]; then ok "no research books in git index (staged)"
      else bad "research-shaped files STAGED:"; echo "$staged" | sed 's/^/      /'
      fi
    fi
  )
else
  bad "product tree not a git repo: $PRODUCT"
fi
echo

# --- Docs present ---
echo "→ release docs"
for f in OPERATE.md RELEASE.md docs/PRODUCT-KERNEL-SOR.md FRIEND-UPGRADE.md; do
  if [ -f "$KERNEL/$f" ] || [ -f "$PRODUCT/$f" ] || [ -f "$ROOT/$f" ]; then ok "$f present"
  else bad "missing $f"
  fi
done
echo

# --- Platform tests on current tree ---
if [ "$SKIP_TESTS" -eq 0 ] && [ -d "$ROOT/memory-cockpit-v2" ]; then
  echo "→ platform tests ($ROOT)"
  (
    cd "$ROOT/memory-cockpit-v2"
    if [ -f scripts/thin-slug-resolve-test.mjs ]; then
      node scripts/thin-slug-resolve-test.mjs || bad "thin-slug-resolve failed"
      ok "thin-slug-resolve"
    fi
    if [ -f scripts/desk-health.mjs ]; then
      node scripts/desk-health.mjs --all || bad "desk-health failed"
      ok "desk-health --all"
    fi
  ) || fail=1
  # re-print ok lines if subshell absorbed - actually bad sets fail in subshell wrongly
fi
echo

# Run tests in current shell for correct fail flag
if [ "$SKIP_TESTS" -eq 0 ] && [ -d "$ROOT/memory-cockpit-v2" ]; then
  echo "→ re-run health in-process"
  if ! (cd "$ROOT/memory-cockpit-v2" && node scripts/thin-slug-resolve-test.mjs); then
    bad "thin-slug-resolve"
  else ok "thin-slug-resolve"; fi
  if ! (cd "$ROOT/memory-cockpit-v2" && node scripts/desk-health.mjs --all); then
    bad "desk-health"
  else ok "desk-health"; fi
fi
echo

# --- Full: sync + product tests ---
if [ "$FULL" -eq 1 ]; then
  echo "→ --full: sync kernel → product"
  if [ -x "$ROOT/scripts/sync-agent-surface.sh" ]; then
    "$ROOT/scripts/sync-agent-surface.sh" --from kernel --to product || bad "sync failed"
    ok "sync-agent-surface kernel→product"
  elif [ -x "$KERNEL/scripts/sync-agent-surface.sh" ]; then
    "$KERNEL/scripts/sync-agent-surface.sh" --from kernel --to product || bad "sync failed"
    ok "sync-agent-surface kernel→product"
  else
    bad "sync-agent-surface.sh not found"
  fi
  echo
  echo "→ product tests after sync"
  if [ -d "$PRODUCT/memory-cockpit-v2" ]; then
    if ! (cd "$PRODUCT/memory-cockpit-v2" && node scripts/thin-slug-resolve-test.mjs); then
      bad "product thin-slug-resolve"
    else ok "product thin-slug-resolve"; fi
    if ! (cd "$PRODUCT/memory-cockpit-v2" && node scripts/desk-health.mjs --all); then
      bad "product desk-health"
    else ok "product desk-health"; fi
  fi
fi
echo

echo "╔══════════════════════════════════════════════════════════╗"
if [ "$fail" -eq 0 ]; then
  echo "║  RELEASE CHECK PASS                                      ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo
  echo "Next (human only):"
  echo "  cd $PRODUCT"
  echo "  git status   # confirm no vault research"
  echo "  git add … && git commit && git push origin main"
  echo "  tell friends: ./scripts/friend-upgrade.sh"
  echo
  echo "Operate day-to-day: OPERATE.md (not full underwrite)"
  exit 0
else
  echo "║  RELEASE CHECK FAIL — do not push                        ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo "  Fix issues above. See RELEASE.md"
  exit 1
fi
