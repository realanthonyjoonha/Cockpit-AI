#!/usr/bin/env bash
# ensure-product-empty.sh — local friend-shaped empty PRODUCT tree (desks=[]).
# Does NOT ship, push, ACCEPT house, or copy kernel dogfood desks/books/packs/store.
# Lab / factory gate helper. Decision-support only.
#
# Usage:
#   ./scripts/ensure-product-empty.sh [DEST]
# Env:
#   COCKPIT_KERNEL   default: this monorepo
#   COCKPIT_PRODUCT  default DEST if omitted: $HOME/Desktop/cockpit-product
set -euo pipefail

KERNEL="$(cd "$(dirname "$0")/.." && pwd)"
KERNEL="${COCKPIT_KERNEL:-$KERNEL}"
DEST="${1:-${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}}"

fail() { echo "ensure-product-empty: $*" >&2; exit 1; }
note() { echo "  · $*"; }

if [ ! -f "$KERNEL/AGENTS.md" ] || [ ! -d "$KERNEL/memory-cockpit-v2" ]; then
  fail "kernel does not look like a cockpit monorepo: $KERNEL"
fi

mkdir -p "$(dirname "$DEST")"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"

if [ "$DEST" = "$KERNEL" ]; then
  fail "refusing to turn kernel into product (would wipe dogfood desks). DEST=$DEST"
fi

KTD="$KERNEL/memory-cockpit-v2/config/thin-desks.json"
DTD="$DEST/memory-cockpit-v2/config/thin-desks.json"

desk_n() {
  env -u FORCE_COLOR NO_COLOR=1 node -e 'try{process.stdout.write(String(require(process.argv[1]).desks.length))}catch(e){process.stdout.write("?")}' "$1" 2>/dev/null
}

if [ -f "$DTD" ]; then
  n="$(desk_n "$DTD")"
  if [ "$n" != "0" ] && [ "$n" != "?" ]; then
    fail "dest already has desks=$n — will not overwrite a non-empty product registry: $DEST"
  fi
fi

echo "ensure-product-empty"
echo "  kernel: $KERNEL"
echo "  product: $DEST"

# Platform copy — never thin-desks desks, packs, compiled store, or research books.
copy_platform() {
  local excludes=(
    --exclude='.git'
    --exclude='node_modules'
    --exclude='dist'
    --exclude='*.log'
    --exclude='.DS_Store'
    --exclude='KERNEL.md'
    --exclude='PROJECT-STATE.md'
    --exclude='memory-cockpit-v2/config/thin-desks.json'
    --exclude='ontology/store/by_ticker/*.json'
    --exclude='ontology/packs/*.json'
    --exclude='research-wiki/house-view-*.md'
    --exclude='research-wiki/raw'
    --exclude='research-wiki/wiki/entities'
    --exclude='research-wiki/wiki/sources'
    --exclude='research-wiki/cockpit/street'
    --exclude='research-wiki/cockpit/briefs'
    --exclude='research-wiki/cockpit/proposals'
    --exclude='research-wiki/cockpit/research'
    --exclude='research-wiki/cockpit/compile'
    --exclude='research-wiki/cockpit/model'
  )
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${excludes[@]}" "$KERNEL/" "$DEST/"
    return
  fi
  # GNU tar fallback (this VM has no rsync)
  tar -C "$KERNEL" "${excludes[@]}" -cf - . | tar -C "$DEST" -xf -
}

copy_platform
rm -f "$DEST/KERNEL.md"
rm -f "$DEST/ontology/packs/"*.json 2>/dev/null || true
rm -f "$DEST/ontology/store/by_ticker/"*.json 2>/dev/null || true
mkdir -p "$DEST/ontology/packs" "$DEST/ontology/store/by_ticker"
touch "$DEST/ontology/packs/.gitkeep" "$DEST/ontology/store/by_ticker/.gitkeep"

# Empty registry: same factory rooms as kernel, desks always []
mkdir -p "$DEST/memory-cockpit-v2/config"
node -e "
const fs = require('fs');
const src = '$KTD';
const dest = '$DTD';
let j = {
  parity_group: 'thin_ontology_v1',
  write_path_mode: 'meta_only',
  contract_version: '1.1',
  rooms: ['overview','risks','house','sources','street','model','research','ask','update'],
  desks: []
};
if (fs.existsSync(src)) {
  const k = JSON.parse(fs.readFileSync(src, 'utf8'));
  j = { ...k, desks: [] };
}
fs.writeFileSync(dest, JSON.stringify(j, null, 2) + '\n');
"

# Friend-first README (FRIEND-START before DEVELOP) — do not keep kernel README
cat > "$DEST/README.md" <<'EOF'
# Cockpit

Blank **product** shell. Decision-support only — no buy/sell/hold, price targets, or sizing.

## First install

See **[FRIEND-START.md](./FRIEND-START.md)**. Then:

```bash
./scripts/bootstrap.sh
./scripts/run-glass.sh
```

Already using Cockpit? **[FRIEND-UPGRADE.md](./FRIEND-UPGRADE.md)**.

Empty `desks: []` is correct. Do not copy someone else’s books into this tree.

## Easy mode

| You want | Say / run |
|----------|-----------|
| Research day | [`OPERATE.md`](./OPERATE.md) |
| Build a feature | `/cockpit-feature` · [`docs/EASY.md`](./docs/EASY.md) |
| Ship to friends | `/cockpit-ship` (add `push` only when publishing) |

## Developers (platform depth)

[`docs/DEVELOP.md`](./docs/DEVELOP.md) · blank E2E [`docs/LAB.md`](./docs/LAB.md) · hard law [`AGENTS.md`](./AGENTS.md)
EOF

# Empty vault scaffold — no books, no fm.js copied from a vault (none on this VM)
mkdir -p \
  "$DEST/research-wiki/cockpit/lib" \
  "$DEST/research-wiki/cockpit/briefs/daily" \
  "$DEST/research-wiki/cockpit/series" \
  "$DEST/research-wiki/cockpit/desks" \
  "$DEST/research-wiki/cockpit/proposals" \
  "$DEST/research-wiki/wiki" \
  "$DEST/research-wiki/raw" \
  "$DEST/research-wiki/templates"
if [ ! -f "$DEST/research-wiki/wiki/index.md" ]; then
  printf '%s\n' '# Wiki index' '' 'Empty product shell — no company underwritten.' > "$DEST/research-wiki/wiki/index.md"
fi

# Glass tests need node_modules. Prefer copy from kernel; else npm install.
GLASS="$DEST/memory-cockpit-v2"
if [ ! -d "$GLASS/node_modules" ]; then
  if [ -d "$KERNEL/memory-cockpit-v2/node_modules" ]; then
    note "copy node_modules from kernel (test runtime; not desks/books)"
    mkdir -p "$GLASS/node_modules"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "$KERNEL/memory-cockpit-v2/node_modules/" "$GLASS/node_modules/"
    else
      tar -C "$KERNEL/memory-cockpit-v2/node_modules" -cf - . | tar -C "$GLASS/node_modules" -xf -
    fi
  else
    note "npm install in product glass"
    (cd "$GLASS" && npm install)
  fi
fi

n="$(desk_n "$DTD")"
[ "$n" = "0" ] || fail "internal error: dest desks=$n after provision"

# Prove we did not copy kernel desk list
kn="$(desk_n "$KTD")"
note "kernel desks=$kn (unchanged dogfood)"
note "product desks=0"

echo "ensure-product-empty OK"
echo "  $DEST"
echo "  (local lab shell — not shipped, not pushed)"
