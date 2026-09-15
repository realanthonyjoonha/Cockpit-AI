#!/usr/bin/env bash
# dogfood-down.sh — stop testing-cockpit glass. --wipe removes the sealed dir.
# Does not touch kernel/product/vault. Decision-support only.
set -euo pipefail
[ -n "${BASH_VERSION:-}" ] || { echo "error: bash required (not zsh)" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/dogfood-paths.sh"
DEST="$(dogfood_default_dest "$ROOT")"
WIPE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DEST="${2:?}"; shift 2 ;;
    --wipe) WIPE=1; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "unknown: $1" >&2; exit 1 ;;
  esac
done

if [ ! -d "$DEST" ] && [ ! -L "$DEST" ]; then
  echo "no testing cockpit at $DEST"
  exit 0
fi
ABS="$(cd "$DEST" && pwd)"
if is_live_tree "$ABS"; then
  echo "error: refusing dogfood-down on live tree $ABS" >&2
  exit 1
fi
META="$ABS/.cockpit-dogfood.json"
if [ -f "$META" ]; then
  pid=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).pid||'')}catch(e){console.log('')}" "$META")
  port=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).port||'')}catch(e){console.log('')}" "$META")
  case "$port" in
    4681|4682|4683)
      echo "error: refusing to kill reserved port $port" >&2
      exit 1
      ;;
  esac
  if [ -n "$pid" ] && [ "$pid" != "null" ]; then
    kill "$pid" 2>/dev/null || true
    echo "  stopped pid $pid"
  fi
  if [ -n "$port" ] && command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
  fi
fi
if [ "$WIPE" -eq 1 ]; then
  echo "  wipe $ABS"
  rm -rf "$ABS"
else
  echo "  left $ABS (pass --wipe to delete)"
fi
