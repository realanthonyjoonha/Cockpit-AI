#!/usr/bin/env bash
# Build + run DEVELOP discipline tests in Docker.
# Mounts local kernel + product read-only (no research copy into image layers).
#
# Usage (from monorepo root or any cwd):
#   ./docker/develop-discipline/run.sh
#
# Env:
#   COCKPIT_KERNEL   default: repo root containing this script's ../../
#   COCKPIT_PRODUCT  default: $HOME/Desktop/cockpit-product
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
KERNEL="${COCKPIT_KERNEL:-$(cd "$HERE/../.." && pwd)}"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "docker not ready — running host path instead:"
  echo "  COCKPIT_KERNEL=$KERNEL COCKPIT_PRODUCT=$PRODUCT $KERNEL/scripts/test-develop-discipline.sh"
  echo
  exec env COCKPIT_KERNEL="$KERNEL" COCKPIT_PRODUCT="$PRODUCT" \
    bash "$KERNEL/scripts/test-develop-discipline.sh"
fi

if [ ! -d "$KERNEL/docs" ] || [ ! -d "$PRODUCT/memory-cockpit-v2" ]; then
  echo "error: need kernel docs/ and product memory-cockpit-v2" >&2
  echo "  KERNEL=$KERNEL" >&2
  echo "  PRODUCT=$PRODUCT" >&2
  exit 1
fi

IMAGE="cockpit-develop-discipline:local"
echo "→ build $IMAGE"
docker build -t "$IMAGE" -f "$HERE/Dockerfile" "$KERNEL"

echo "→ run (mount kernel + product read-only)"
docker run --rm \
  -e COCKPIT_KERNEL=/work/kernel \
  -e COCKPIT_PRODUCT=/work/product \
  -v "$KERNEL:/work/kernel:ro" \
  -v "$PRODUCT:/work/product:ro" \
  "$IMAGE"
