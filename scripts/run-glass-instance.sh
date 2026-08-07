#!/usr/bin/env bash
# run-glass-instance.sh — start glass on an explicit port (multi-instance eng).
#
# Usage:
#   ./scripts/run-glass-instance.sh 4690
#   ./scripts/run-glass-instance.sh 4691 feature-lab
#
# Each instance = this monorepo directory + PORT. See docs/MULTI-INSTANCE.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT_ARG="${1:-}"
LABEL="${2:-instance}"

if [ -z "$PORT_ARG" ]; then
  echo "Usage: $0 <port> [label]"
  echo "Example: $0 4690 lab"
  echo "See docs/MULTI-INSTANCE.md"
  exit 1
fi

if ! [[ "$PORT_ARG" =~ ^[0-9]+$ ]]; then
  echo "error: port must be numeric (got $PORT_ARG)"
  exit 1
fi

# Best-effort busy check
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"$PORT_ARG" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "error: port $PORT_ARG already in use"
    echo "  pick another port or stop the other glass"
    exit 1
  fi
elif command -v nc >/dev/null 2>&1; then
  if nc -z 127.0.0.1 "$PORT_ARG" 2>/dev/null; then
    echo "error: port $PORT_ARG appears open"
    exit 1
  fi
fi

export PORT="$PORT_ARG"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Glass instance: $LABEL"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  monorepo: $ROOT"
echo "  port:     $PORT"
echo "  url:      http://127.0.0.1:${PORT}/#/start"
echo "  MCP:      re-pin with ./scripts/install-grok-mcp.sh from THIS root if agents needed"
echo

exec "$ROOT/scripts/run-glass.sh"
