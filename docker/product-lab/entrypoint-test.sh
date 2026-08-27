#!/usr/bin/env bash
# One-shot blank product tests inside container.
set -euo pipefail

PRODUCT="${COCKPIT_PRODUCT:-/work/product}"
HOOKS="${LAB_HOOKS_DIR:-/lab-feature-hooks}"
WORKDIR="${LAB_WORKDIR:-/tmp/lab-product}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  PRODUCT LAB — blank E2E (container)                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  product mount: $PRODUCT"
echo "  workdir:       $WORKDIR"
echo "  node:          $(node -v)"
echo

# shellcheck disable=SC1091
source /guards.sh "$PRODUCT"

echo "→ materialize writable worktree (exclude huge/noise)"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
# Prefer rsync; fallback cp
if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude node_modules \
    --exclude dist \
    --exclude .git \
    --exclude 'ontology/store/by_ticker/*.json' \
    --exclude 'ontology/packs/*.json' \
    "$PRODUCT/" "$WORKDIR/"
else
  # minimal copy
  for d in memory-cockpit-v2 scripts docs ontology research-wiki .grok; do
    if [ -e "$PRODUCT/$d" ]; then
      mkdir -p "$WORKDIR/$(dirname "$d")"
      cp -a "$PRODUCT/$d" "$WORKDIR/$d"
    fi
  done
  for f in AGENTS.md package.json RELEASE.md OPERATE.md; do
    [ -f "$PRODUCT/$f" ] && cp -a "$PRODUCT/$f" "$WORKDIR/$f" || true
  done
fi

# Ensure desks empty in work copy
TD="$WORKDIR/memory-cockpit-v2/config/thin-desks.json"
if [ -f "$TD" ]; then
  node -e "
    const fs=require('fs');
    const p='$TD';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.desks=[];
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
fi
# shellcheck disable=SC1091
source /guards.sh "$WORKDIR"

export COCKPIT_REPO="$WORKDIR"
export COCKPIT_VAULT="$WORKDIR/research-wiki"
export ONTOLOGY_WIKI="$COCKPIT_VAULT"
export ONTOLOGY_STORE="$WORKDIR/ontology/store/by_ticker"
export COCKPIT_ENV_QUIET=1

echo "→ npm install (glass — full deps for tests)"
cd "$WORKDIR/memory-cockpit-v2"
npm install

echo "→ platform health (empty install)"
node scripts/thin-slug-resolve-test.mjs
node scripts/desk-health.mjs --all

if [ -f scripts/open-grok-prompt-test.mjs ]; then
  echo "→ open-grok-prompt-test"
  node scripts/open-grok-prompt-test.mjs || {
    echo "  · open-grok-prompt-test failed (non-fatal if env-specific); retry full"
    node scripts/open-grok-prompt-test.mjs
  }
fi

if [ -f scripts/street-schema-test.mjs ]; then
  echo "→ street-schema-test"
  node scripts/street-schema-test.mjs
fi

echo "→ feature hooks"
if [ -d "$HOOKS" ]; then
  found=0
  # shellcheck disable=SC2044
  for h in $(ls -1 "$HOOKS"/*.sh 2>/dev/null | sort); do
    found=1
    echo "  → hook $(basename "$h")"
    if ! bash "$h" "$WORKDIR"; then
      echo "  ✗ hook $(basename "$h") FAIL" >&2
      exit 1
    fi
  done
  if [ "$found" -eq 0 ]; then echo "  · no hooks"; fi
fi

echo
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  PRODUCT LAB TEST PASS                                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
