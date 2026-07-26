#!/usr/bin/env bash
# export-kernel.sh — copy PRODUCT KERNEL into a new folder (empty cold start).
#
#   ./scripts/export-kernel.sh /path/to/cockpit-kernel
#
# Does NOT copy company research (MSFT/NBIS/MU books), filled house views,
# or thin-desk rows. Optional example: ./scripts/install-example-msft.sh DEST
#
# Decision-support only. Never invents research.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-}"

if [ -z "$DEST" ]; then
  echo "Usage: $0 /path/to/new-kernel-folder"
  echo "Example: $0 ~/Desktop/cockpit-kernel"
  exit 1
fi

if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null || true)" ]; then
  echo "error: DEST exists and is not empty: $DEST"
  echo "  pick a new path or empty the folder first"
  exit 1
fi

mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
echo "Exporting kernel → $DEST"
echo "Source monorepo → $ROOT"

rsync -a \
  --exclude node_modules \
  --exclude dist \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  "$ROOT/AGENTS.md" \
  "$ROOT/COLD-START.md" \
  "$ROOT/README.md" \
  "$ROOT/SETUP-GROK-COCKPIT.md" \
  "$ROOT/.gitignore" \
  "$DEST/" 2>/dev/null || true

# docs that may be missing in older clones
for f in AGENTS.md COLD-START.md README.md SETUP-GROK-COCKPIT.md .gitignore; do
  if [ -f "$ROOT/$f" ] && [ ! -f "$DEST/$f" ]; then
    cp "$ROOT/$f" "$DEST/$f"
  fi
done

# Optional PROJECT-STATE (handy; not required)
if [ -f "$ROOT/PROJECT-STATE.md" ]; then
  cp "$ROOT/PROJECT-STATE.md" "$DEST/PROJECT-STATE.md"
fi

rsync -a --exclude node_modules --exclude dist --exclude '.DS_Store' \
  "$ROOT/.grok/" "$DEST/.grok/"

rsync -a --exclude '.DS_Store' \
  "$ROOT/scripts/" "$DEST/scripts/"

rsync -a \
  --exclude node_modules \
  --exclude dist \
  --exclude '.DS_Store' \
  --exclude 'logs' \
  "$ROOT/memory-cockpit-v2/" "$DEST/memory-cockpit-v2/"

# Thin-only product surface (no Memory desk UI in kernel)
if [ -f "$ROOT/scripts/templates/App.kernel.jsx" ]; then
  cp "$ROOT/scripts/templates/App.kernel.jsx" "$DEST/memory-cockpit-v2/src/App.jsx"
else
  echo "error: missing scripts/templates/App.kernel.jsx" >&2
  exit 1
fi
if [ -f "$ROOT/scripts/templates/Start.kernel.jsx" ]; then
  cp "$ROOT/scripts/templates/Start.kernel.jsx" "$DEST/memory-cockpit-v2/src/pages/Start.jsx"
fi
for mempage in CockpitRead Overview Risks Risk Data Desks Analysts StreetRead Margins \
  LeverageMonitor DramNowcast Reports Catalysts Log House Companies Background Reader; do
  rm -f "$DEST/memory-cockpit-v2/src/pages/${mempage}.jsx"
done
# Legacy per-ticker page wrappers not needed (DeskRouter is shared)
rm -rf "$DEST/memory-cockpit-v2/src/pages/nbis" "$DEST/memory-cockpit-v2/src/pages/msft"
rm -rf "$DEST/memory-cockpit-v2/archive"
# Default glass port for kernel when live monorepo uses 4681
if [ -f "$DEST/scripts/run-glass.sh" ]; then
  # document dual-port in KERNEL.md only; PORT override still works
  true
fi
# Ensure empty-desk server code is current (allow desks: [])
if [ -f "$ROOT/memory-cockpit-v2/server/thinDeskProfiles.js" ]; then
  cp "$ROOT/memory-cockpit-v2/server/thinDeskProfiles.js" "$DEST/memory-cockpit-v2/server/"
  cp "$ROOT/memory-cockpit-v2/server/thinDeskMount.js" "$DEST/memory-cockpit-v2/server/"
  cp "$ROOT/memory-cockpit-v2/server/thinModel.js" "$DEST/memory-cockpit-v2/server/"
  cp "$ROOT/memory-cockpit-v2/server/thinAsk.js" "$DEST/memory-cockpit-v2/server/"
fi

# Ontology engine — no company packs or compiled books
mkdir -p "$DEST/ontology/packs" "$DEST/ontology/store/by_ticker"
rsync -a \
  --exclude 'store/by_ticker/*' \
  --exclude 'packs/MSFT.json' \
  --exclude 'packs/NBIS.json' \
  --exclude 'packs/MU.json' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  --exclude '*.pyc' \
  --exclude '.DS_Store' \
  "$ROOT/ontology/" "$DEST/ontology/"

# Keep packs/ and store dirs empty (drop any leftover json)
rm -f "$DEST/ontology/packs"/*.json 2>/dev/null || true
rm -f "$DEST/ontology/store/by_ticker"/*.json 2>/dev/null || true
touch "$DEST/ontology/packs/.gitkeep" "$DEST/ontology/store/by_ticker/.gitkeep"

# Vault scaffold only — no company research / house theses
mkdir -p \
  "$DEST/research-wiki/cockpit/lib" \
  "$DEST/research-wiki/cockpit/briefs/daily" \
  "$DEST/research-wiki/cockpit/series" \
  "$DEST/research-wiki/cockpit/desks" \
  "$DEST/research-wiki/cockpit/proposals" \
  "$DEST/research-wiki/wiki/entities" \
  "$DEST/research-wiki/wiki/sources" \
  "$DEST/research-wiki/wiki/concepts" \
  "$DEST/research-wiki/raw" \
  "$DEST/research-wiki/templates"

rsync -a "$ROOT/research-wiki/cockpit/lib/" "$DEST/research-wiki/cockpit/lib/"
if [ -d "$ROOT/research-wiki/templates" ]; then
  rsync -a "$ROOT/research-wiki/templates/" "$DEST/research-wiki/templates/"
fi
if [ -f "$ROOT/research-wiki/RESEARCH-PATHS.md" ]; then
  cp "$ROOT/research-wiki/RESEARCH-PATHS.md" "$DEST/research-wiki/RESEARCH-PATHS.md"
fi

# Minimal wiki stubs (no claims)
cat > "$DEST/research-wiki/wiki/index.md" <<'EOF'
# Wiki index

Cold-start kernel — no company underwritten yet.
EOF
cat > "$DEST/research-wiki/wiki/log.md" <<'EOF'
# Log

- Kernel exported — product shell only; no company research.
EOF

# Empty thin registry — no company desks
cat > "$DEST/memory-cockpit-v2/config/thin-desks.json" <<'EOF'
{
  "parity_group": "thin_ontology_v1",
  "write_path_mode": "meta_only",
  "contract_version": "1.1",
  "rooms": ["overview", "risks", "house", "sources", "ask", "update"],
  "desks": []
}
EOF

# Examples docs (how to add MSFT later) — not the research files
mkdir -p "$DEST/examples/microsoft"
if [ -f "$ROOT/examples/README.md" ]; then
  cp "$ROOT/examples/README.md" "$DEST/examples/README.md"
fi
if [ -d "$ROOT/examples/microsoft" ]; then
  rsync -a \
    --exclude '.DS_Store' \
    "$ROOT/examples/microsoft/README.md" \
    "$ROOT/examples/microsoft/MANIFEST.txt" \
    "$ROOT/examples/microsoft/thin-desk-fragment.json" \
    "$DEST/examples/microsoft/" 2>/dev/null || true
fi

# Mark as kernel
cat > "$DEST/KERNEL.md" <<EOF
# Cockpit kernel (empty cold start)

Exported from: $ROOT  
Date: $(date -u +%Y-%m-%dT%H:%MZ)

- **No company underwritten**
- **No** MSFT/NBIS/MU research or packs
- Thin desks registry is **empty**
- Glass: open http://127.0.0.1:4681/#/start

## Boot

\`\`\`bash
./scripts/bootstrap.sh
./scripts/run-glass.sh
# optional: ./scripts/install-grok-mcp.sh
\`\`\`

## Optional Microsoft reference

From the **source monorepo** (not this kernel alone if example files were not vendored):

\`\`\`bash
# if you still have the live monorepo:
/path/to/live-monorepo/scripts/install-example-msft.sh $DEST
\`\`\`

Or copy files listed in \`examples/microsoft/MANIFEST.txt\` then merge
\`examples/microsoft/thin-desk-fragment.json\` into \`memory-cockpit-v2/config/thin-desks.json\`.

## First real company

You pick ticker → research → pack → verify → house/risk ACCEPT → thin-desks.json row.
See NEW-DESK-PLAYBOOK.md and COLD-START.md.
EOF

chmod +x "$DEST/scripts/"*.sh 2>/dev/null || true

echo ""
echo "=== kernel export done ==="
echo "  $DEST"
echo "Next:"
echo "  cd \"$DEST\""
echo "  ./scripts/bootstrap.sh"
echo "  # If live monorepo already uses :4681, run kernel on :4682:"
echo "  PORT=4682 ./scripts/run-glass.sh"
echo "  open http://127.0.0.1:4682/#/start"
echo ""
echo "Optional MSFT example (from live monorepo):"
echo "  $ROOT/scripts/install-example-msft.sh \"$DEST\""
echo "  # then restart kernel glass on PORT=4682"
