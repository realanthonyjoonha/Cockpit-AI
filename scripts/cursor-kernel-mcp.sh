#!/usr/bin/env bash
# Cursor stdio MCP → kernel operate server (name: cockpit-research).
# Stdout must stay JSON-RPC. Mac OPEN GROK still uses scripts/install-grok-mcp.sh.
# Workspace-relative. Run from repo root via .cursor/mcp.json.
set -euo pipefail
[ -n "${BASH_VERSION:-}" ] || { echo "error: bash required" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export COCKPIT_ENV_QUIET=1
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/monorepo-env.sh"
export COCKPIT_EXPECT_ROOT="$COCKPIT_REPO"
export COCKPIT_MCP_NAME="${COCKPIT_MCP_NAME:-cockpit-research}"
exec node "$ROOT/memory-cockpit-v2/scripts/mcp-cockpit-research.mjs"
