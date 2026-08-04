#!/usr/bin/env bash
# sync-agent-surface.sh — mirror platform/agent surface between cockpit-kernel and cockpit-product.
# Does NOT copy vault, packs, thin-desks.json, secrets, or house.
# Decision-support only.
set -euo pipefail

KERNEL="${COCKPIT_KERNEL:-$HOME/Desktop/cockpit-kernel}"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
FROM=""
TO=""
DRY=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/sync-agent-surface.sh --from kernel --to product [--dry-run]
  ./scripts/sync-agent-surface.sh --from product --to kernel [--dry-run]

Env:
  COCKPIT_KERNEL   default ~/Desktop/cockpit-kernel
  COCKPIT_PRODUCT  default ~/Desktop/cockpit-product

Copies agent slash commands, Street/daybook glass+server, openGrok/MCP/pack/live-registry
platform files, and related docs.
Never copies research-wiki, ontology/store, thin-desks.json, or secrets.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="${2:-}"; shift 2 ;;
    --to) TO="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1"; usage; exit 1 ;;
  esac
done

if [ -z "$FROM" ] || [ -z "$TO" ]; then
  usage
  exit 1
fi

resolve_tree() {
  case "$1" in
    kernel|k) echo "$KERNEL" ;;
    product|p) echo "$PRODUCT" ;;
    *) echo "bad tree name: $1 (kernel|product)" >&2; exit 1 ;;
  esac
}

SRC="$(resolve_tree "$FROM")"
DST="$(resolve_tree "$TO")"

if [ ! -d "$SRC/memory-cockpit-v2" ]; then
  echo "error: source missing memory-cockpit-v2: $SRC" >&2
  exit 1
fi
if [ ! -d "$DST/memory-cockpit-v2" ]; then
  echo "error: dest missing memory-cockpit-v2: $DST" >&2
  exit 1
fi
if [ "$SRC" = "$DST" ]; then
  echo "error: source and dest are the same path" >&2
  exit 1
fi

# Platform files only — keep thin-desks.json / vault out.
FILES=(
  ".grok/commands/cockpit.md"
  "docs/FINANCE-AGENT-PORTS.md"
  "docs/AGENT-AUTHORING.md"
  "docs/PRODUCT-KERNEL-SOR.md"
  "FRIEND-UPGRADE.md"
  "memory-cockpit-v2/server/openGrok.js"
  "memory-cockpit-v2/server/pack.js"
  "memory-cockpit-v2/server/thinDeskProfiles.js"
  "memory-cockpit-v2/server/thinModel.js"
  "memory-cockpit-v2/server/thinStreet.js"
  "memory-cockpit-v2/server/streetSchema.js"
  "memory-cockpit-v2/server/streetProvider.js"
  "memory-cockpit-v2/server/streetAgentSeed.js"
  "memory-cockpit-v2/server/thinDeskMount.js"
  "memory-cockpit-v2/server/index.js"
  "memory-cockpit-v2/src/pages/thin/GrokAgents.jsx"
  "memory-cockpit-v2/src/pages/thin/Street.jsx"
  "memory-cockpit-v2/src/pages/thin/DeskRouter.jsx"
  "memory-cockpit-v2/src/thinDesks.js"
  "memory-cockpit-v2/scripts/open-grok-prompt-test.mjs"
  "memory-cockpit-v2/scripts/street-seed-mode-test.mjs"
  "memory-cockpit-v2/scripts/thin-street-test.mjs"
  "memory-cockpit-v2/scripts/street-schema-test.mjs"
  "memory-cockpit-v2/scripts/mcp-cockpit-research.mjs"
  "memory-cockpit-v2/scripts/thin-desk-format-check.mjs"
  "memory-cockpit-v2/scripts/thin-desk-rigor.mjs"
  "memory-cockpit-v2/scripts/pack-cache-test.mjs"
  "memory-cockpit-v2/scripts/live-registry-test.mjs"
  "memory-cockpit-v2/package.json"
  "memory-cockpit-v2/plans/THIN-DESK-CONTRACT.md"
  "memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md"
  "memory-cockpit-v2/plans/2026-08-04-street-refresh-ontology.md"
)

echo "sync-agent-surface"
echo "  from: $SRC"
echo "  to:   $DST"
echo "  dry:  $DRY"
echo

copy_one() {
  local rel="$1"
  local s="$SRC/$rel"
  local d="$DST/$rel"
  if [ ! -e "$s" ]; then
    echo "  skip (missing src): $rel"
    return 0
  fi
  if [ "$DRY" -eq 1 ]; then
    echo "  would copy: $rel"
    return 0
  fi
  mkdir -p "$(dirname "$d")"
  cp "$s" "$d"
  echo "  copied: $rel"
}

# All cockpit slash commands (platform agents) — daybook + street + finance + operate
if [ -d "$SRC/.grok/commands" ]; then
  if [ "$DRY" -eq 1 ]; then
    echo "  would rsync: .grok/commands/cockpit*.md"
  else
    mkdir -p "$DST/.grok/commands"
    # shellcheck disable=SC2086
    rsync -a --include='cockpit*.md' --exclude='*' "$SRC/.grok/commands/" "$DST/.grok/commands/"
    echo "  rsynced: .grok/commands/cockpit*.md"
  fi
fi

if [ -f "$SRC/.grok/skills/cockpit/SKILL.md" ]; then
  copy_one ".grok/skills/cockpit/SKILL.md"
fi

# Friend upgrade helpers
[ -f "$SRC/scripts/friend-upgrade.sh" ] && copy_one "scripts/friend-upgrade.sh"
[ -f "$SRC/scripts/ensure-thin-rooms.mjs" ] && copy_one "scripts/ensure-thin-rooms.mjs"
[ -f "$SRC/scripts/sync-agent-surface.sh" ] && copy_one "scripts/sync-agent-surface.sh"

for rel in "${FILES[@]}"; do
  copy_one "$rel"
done

echo
if [ "$DRY" -eq 1 ]; then
  echo "dry-run only — no files written"
else
  echo "done. Next:"
  echo "  cd $DST && ./scripts/friend-upgrade.sh --no-pull   # if dest is product install"
  echo "  or: cd $DST/memory-cockpit-v2 && npm run test:platform"
  echo "  restart glass if server files changed"
  echo "  (no git unless you ask)"
fi
