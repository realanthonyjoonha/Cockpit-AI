#!/usr/bin/env bash
# Wire Grok Build → cockpit-research MCP for THIS monorepo clone.
# Run once per machine after: git clone / git pull  (or via ./scripts/bootstrap.sh --with-mcp)
#
#   ./scripts/install-grok-mcp.sh
#
# Requires: Node 18+, Grok CLI (https://x.ai/cli), login with SuperGrok / X Premium+
# Does not invent research. Paths always point at THIS clone (not tribal ~/Trading).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/monorepo-env.sh"

echo "(install-grok-mcp uses monorepo env above)"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found (need Node 18+)"
  exit 1
fi

GROK_BIN="${GROK_BIN:-}"
if [ -z "$GROK_BIN" ]; then
  if [ -x "$HOME/.grok/bin/grok" ]; then
    GROK_BIN="$HOME/.grok/bin/grok"
  elif command -v grok >/dev/null 2>&1; then
    GROK_BIN="$(command -v grok)"
  fi
fi
if [ -z "${GROK_BIN:-}" ]; then
  echo "error: grok CLI not found"
  echo "  Install: https://x.ai/cli"
  echo "  or: curl -fsSL https://x.ai/cli/install.sh | bash"
  echo "  Then login, re-run this script."
  exit 1
fi
export GROK_BIN
echo "GROK_BIN=$GROK_BIN"

if [ ! -d "$COCKPIT_VAULT" ]; then
  echo "error: vault missing: $COCKPIT_VAULT"
  exit 1
fi
if [ ! -d "$ONTOLOGY_STORE" ]; then
  echo "error: ontology store missing: $ONTOLOGY_STORE"
  exit 1
fi

cd "$ROOT/memory-cockpit-v2"
if [ ! -d node_modules ]; then
  echo "npm install (memory-cockpit-v2)…"
  npm install
fi

echo "Installing MCP server cockpit-research for THIS monorepo…"
echo "  (writes user MCP + project pin .grok/config.toml so OPEN GROK cwd matches vault)"
npm run grok:mcp-install

echo ""
echo "=== verify (from monorepo root) ==="
(cd "$COCKPIT_REPO" && "$GROK_BIN" mcp list) || true
(cd "$COCKPIT_REPO" && "$GROK_BIN" mcp doctor) || true
echo ""
echo "Done. Product path (fresh machine = one folder only):"
echo "  1. Stay in this monorepo for glass + agents"
echo "  2. OPEN GROK from glass, or: cd \"$COCKPIT_REPO\" && grok \"/cockpit\""
echo "  3. list_desks must show monorepo_root=$COCKPIT_REPO"
echo ""
echo "If you ever have TWO monorepos on one Mac, OPEN GROK from each glass pins its own project MCP."
echo "Slash commands live under .grok/commands/ (cwd = monorepo)."
