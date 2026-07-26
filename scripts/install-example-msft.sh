#!/usr/bin/env bash
# install-example-msft.sh — copy optional Microsoft thin reference into a KERNEL folder.
#
#   ./scripts/install-example-msft.sh /path/to/cockpit-kernel
#
# Source = this live monorepo (has research). Dest = empty kernel from export-kernel.sh.
# NOT cold start — explicit example install. User still owns ACCEPT on live books.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-}"

if [ -z "$DEST" ] || [ ! -d "$DEST" ]; then
  echo "Usage: $0 /path/to/cockpit-kernel"
  echo "  Dest should be output of ./scripts/export-kernel.sh"
  exit 1
fi
DEST="$(cd "$DEST" && pwd)"

if [ ! -f "$DEST/KERNEL.md" ] && [ ! -f "$DEST/COLD-START.md" ]; then
  echo "warn: DEST does not look like a kernel (missing KERNEL.md / COLD-START.md)"
fi

MANIFEST="$ROOT/examples/microsoft/MANIFEST.txt"
if [ ! -f "$MANIFEST" ]; then
  echo "error: missing $MANIFEST"
  exit 1
fi

echo "Installing Microsoft EXAMPLE into $DEST"
echo "Source monorepo $ROOT"

while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"
  line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -z "$line" ] && continue
  src="$ROOT/$line"
  if [ ! -e "$src" ]; then
    echo "  skip missing: $line"
    continue
  fi
  if [ -d "$src" ]; then
    mkdir -p "$DEST/$line"
    rsync -a --exclude '.DS_Store' "$src/" "$DEST/$line/"
    echo "  dir  $line"
  else
    mkdir -p "$(dirname "$DEST/$line")"
    cp "$src" "$DEST/$line"
    echo "  file $line"
  fi
done < "$MANIFEST"

# Merge msft desk into thin-desks.json
FRAGMENT="$ROOT/examples/microsoft/thin-desk-fragment.json"
REG="$DEST/memory-cockpit-v2/config/thin-desks.json"
if [ ! -f "$FRAGMENT" ] || [ ! -f "$REG" ]; then
  echo "error: need $FRAGMENT and $REG"
  exit 1
fi

python3 - <<PY
import json
from pathlib import Path

reg_path = Path("$REG")
frag_path = Path("$FRAGMENT")
reg = json.loads(reg_path.read_text())
frag = json.loads(frag_path.read_text())
frag.pop("_comment", None)
desks = reg.get("desks") or []
desks = [d for d in desks if d.get("slug") != "msft"]
desks.append(frag)
reg["desks"] = desks
reg_path.write_text(json.dumps(reg, indent=2) + "\n")
print("  registry: msft desk row installed →", reg_path)
PY

echo ""
echo "=== Microsoft example installed ==="
echo "  Restart glass if running: cd \"$DEST\" && ./scripts/run-glass.sh"
echo "  START = still the cold-start front door"
echo "  MICROSOFT button = optional reference desk"
echo "  This is EXAMPLE content — not automatic underwriting."
