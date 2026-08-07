#!/usr/bin/env bash
# Runs inside container. Expects:
#   /work/kernel  — cockpit-kernel (or monorepo with docs/DEVELOP.md)
#   /work/product — cockpit-product (empty desks SoR)
set -euo pipefail

export COCKPIT_KERNEL="${COCKPIT_KERNEL:-/work/kernel}"
export COCKPIT_PRODUCT="${COCKPIT_PRODUCT:-/work/product}"

echo "container: node $(node -v) · git $(git --version | head -1)"
echo "COCKPIT_KERNEL=$COCKPIT_KERNEL"
echo "COCKPIT_PRODUCT=$COCKPIT_PRODUCT"
echo

if [ ! -x "$COCKPIT_KERNEL/scripts/test-develop-discipline.sh" ]; then
  echo "error: test-develop-discipline.sh not found or not executable under kernel" >&2
  ls -la "$COCKPIT_KERNEL/scripts" 2>&1 | head -20
  exit 1
fi

exec "$COCKPIT_KERNEL/scripts/test-develop-discipline.sh"
