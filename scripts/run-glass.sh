#!/usr/bin/env bash
# run-glass.sh — start glass with monorepo env (Path 2).
# Kernel default PORT=4682 when KERNEL.md present (live monorepo often uses 4681).
#
#   ./scripts/run-glass.sh
#   PORT=4681 ./scripts/run-glass.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Prefer 4682 for empty kernel so live monorepo can keep 4681
if [ -f "$ROOT/KERNEL.md" ] && [ -z "${PORT:-}" ]; then
  export PORT=4682
fi
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/monorepo-env.sh"

GLASS="$COCKPIT_REPO/memory-cockpit-v2"
if [ ! -d "$GLASS" ]; then
  echo "error: missing $GLASS"
  exit 1
fi
if [ ! -f "$GLASS/dist/index.html" ]; then
  echo "dist/ missing — running bootstrap build…"
  "$ROOT/scripts/bootstrap.sh" --skip-doctor
fi

cd "$GLASS"
echo "Starting glass…"
echo "  vault=$COCKPIT_VAULT"
echo "  store=$ONTOLOGY_STORE"
echo "  → http://${HOST}:${PORT}"
echo "Ctrl-C to stop."
exec npm start
