#!/usr/bin/env bash
# lab-e2e.sh — rigorous blank-product gate (Docker/Colima) + host fallbacks.
# Multi-instance safe: uses LAB_PORT default 4690 (not 4681/4682).
# Decision-support only. Does not push git.
#
# Usage:
#   ./scripts/lab-e2e.sh           # full gate
#   ./scripts/lab-e2e.sh --host    # host-only (no docker)
#   ./scripts/lab-e2e.sh --glass   # HTTP smoke on LAB_PORT (fails if port already bound)
#   ./scripts/lab-e2e.sh --negative   # isolation negative test then clean re-run
#   ./scripts/lab-e2e.sh --isolation  # extensive multi-instance contamination suite
#   ./scripts/lab-e2e.sh --isolation --isolation-live --isolation-docker
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
KERNEL="${COCKPIT_KERNEL:-$ROOT}"
LAB_PORT="${LAB_PORT:-4690}"
COMPOSE_FILE="$ROOT/docker/product-lab/docker-compose.yml"
HOST_ONLY=0
DO_GLASS=0
DO_NEGATIVE=0
DO_ISOLATION=0
ISO_DOCKER=0
ISO_LIVE=0
ISO_N="${LAB_ISOLATION_N:-3}"

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST_ONLY=1; shift ;;
    --glass) DO_GLASS=1; shift ;;
    --negative) DO_NEGATIVE=1; shift ;;
    --isolation) DO_ISOLATION=1; shift ;;
    --isolation-docker) ISO_DOCKER=1; DO_ISOLATION=1; shift ;;
    --isolation-live) ISO_LIVE=1; DO_ISOLATION=1; shift ;;
    --isolation-n) ISO_N="${2:?}"; DO_ISOLATION=1; shift 2 ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

export COCKPIT_PRODUCT="$PRODUCT"
export COCKPIT_KERNEL="$KERNEL"
export LAB_PORT

fail=0
pass() { echo "  ✓ $*"; }
bad() { echo "  ✗ $*"; fail=1; }

port_in_use() {
  local p="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if (echo >/dev/tcp/127.0.0.1/"$p") >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  LAB E2E — blank product ship gate                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  kernel:  $KERNEL"
echo "  product: $PRODUCT"
echo "  lab port:$LAB_PORT"
echo

# --- L0: paths ---
echo "→ L0 paths"
[ -f "$COMPOSE_FILE" ] && pass "compose present" || bad "missing $COMPOSE_FILE"
[ -d "$PRODUCT/memory-cockpit-v2" ] && pass "product monorepo" || bad "product missing"
[ -f "$PRODUCT/memory-cockpit-v2/config/thin-desks.json" ] && pass "thin-desks.json" || bad "no thin-desks"

n=$(node -e "console.log(require('$PRODUCT/memory-cockpit-v2/config/thin-desks.json').desks.length)" 2>/dev/null || echo "?")
if [ "$n" = "0" ]; then pass "product desks=[]"
else bad "product desks=$n — clear desks before lab (friend SoR empty)"
fi
echo

if [ "$fail" -ne 0 ]; then
  echo "LAB E2E FAIL (preflight)"
  exit 1
fi

# --- L5 negative (optional): non-empty desks must fail guards ---
if [ "$DO_NEGATIVE" -eq 1 ]; then
  echo "→ L5 negative isolation (desks non-empty must fail guard)"
  tmp=$(mktemp -d)
  cp -a "$PRODUCT/memory-cockpit-v2/config/thin-desks.json" "$tmp/thin-desks.json"
  node -e "
    const fs=require('fs');
    const p='$tmp/thin-desks.json';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.desks=[{slug:'fake',ticker:'FAKE',name:'Fake'}];
    fs.writeFileSync(p, JSON.stringify(j,null,2));
  "
  # run guards against fake tree
  faketree=$(mktemp -d)
  mkdir -p "$faketree/memory-cockpit-v2/config"
  echo "# fake" > "$faketree/AGENTS.md"
  cp "$tmp/thin-desks.json" "$faketree/memory-cockpit-v2/config/thin-desks.json"
  if bash "$ROOT/docker/product-lab/guards.sh" "$faketree" 2>/dev/null; then
    bad "guards accepted non-empty desks"
  else
    pass "guards reject non-empty desks"
  fi
  rm -rf "$tmp" "$faketree"
  echo
fi

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  if command -v colima >/dev/null 2>&1; then
    echo "  → colima start"
    colima start || true
  fi
  docker info >/dev/null 2>&1
}

run_host_suite() {
  echo "→ L1 host platform health (product empty)"
  (
    cd "$PRODUCT/memory-cockpit-v2"
    node scripts/thin-slug-resolve-test.mjs
    node scripts/desk-health.mjs --all
    node scripts/open-grok-prompt-test.mjs 2>/dev/null || node scripts/open-grok-prompt-test.mjs
    node scripts/street-schema-test.mjs 2>/dev/null || true
  )
  pass "host empty platform health"

  echo "→ L3 feature hooks (host)"
  for h in "$ROOT"/scripts/lab-feature-hooks/*.sh; do
    [ -f "$h" ] || continue
    echo "  → $(basename "$h")"
    bash "$h" "$PRODUCT"
  done
  pass "feature hooks"
}

run_docker_suite() {
  echo "→ L1/L3 docker product-lab test"
  if ! ensure_docker; then
    echo "  docker daemon not ready — host suite only"
    return 1
  fi

  docker build -t cockpit-product-lab:local \
    -f "$ROOT/docker/product-lab/Dockerfile" \
    "$ROOT"

  # -t so hook stdout is line-buffered (non-TTY docker run hid hook FAIL, then we printed PASS).
  # Do not write `local rc=$?` — `local` clobbers $? in bash.
  local rc
  set +e
  docker run --rm -t \
    -e COCKPIT_PRODUCT=/work/product \
    -v "$PRODUCT:/work/product:ro" \
    cockpit-product-lab:local
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "  ✗ docker lab-test FAIL (container exit $rc)" >&2
    return 1
  fi
  pass "docker lab-test PASS"
}

# --- develop discipline (docker if ready; host fallback otherwise) ---
echo "→ L6 develop-discipline"
ensure_docker || true
if [ -x "$KERNEL/docker/develop-discipline/run.sh" ]; then
  if COCKPIT_KERNEL="$KERNEL" COCKPIT_PRODUCT="$PRODUCT" \
    bash "$KERNEL/docker/develop-discipline/run.sh"; then
    pass "develop-discipline"
  else
    bad "develop-discipline FAIL"
  fi
elif [ -x "$KERNEL/scripts/test-develop-discipline.sh" ]; then
  if COCKPIT_KERNEL="$KERNEL" COCKPIT_PRODUCT="$PRODUCT" \
    bash "$KERNEL/scripts/test-develop-discipline.sh"; then
    pass "develop-discipline (host)"
  else
    bad "develop-discipline FAIL"
  fi
else
  bad "develop-discipline runner missing"
fi
echo

# --- main suites ---
if [ "$HOST_ONLY" -eq 1 ]; then
  run_host_suite
else
  if ensure_docker; then
    if ! run_docker_suite; then
      bad "docker lab-test FAIL"
    fi
  else
    echo "  · docker path unavailable — running host suite"
    run_host_suite
  fi
  echo "→ L1 host cross-check"
  (
    cd "$PRODUCT/memory-cockpit-v2"
    node scripts/thin-slug-resolve-test.mjs
    node scripts/desk-health.mjs --all
  )
  pass "host cross-check"
fi
echo

# --- optional glass HTTP ---
if [ "$DO_GLASS" -eq 1 ]; then
  echo "→ L2 glass HTTP smoke (compose profile glass, port $LAB_PORT)"
  if [ "$LAB_PORT" = "4681" ] || [ "$LAB_PORT" = "4682" ]; then
    bad "LAB_PORT=$LAB_PORT is reserved (product 4681 / kernel 4682) — set LAB_PORT=4690+"
  elif port_in_use "$LAB_PORT"; then
    bad "LAB_PORT $LAB_PORT already in use — refuse to smoke a foreign glass. Set LAB_PORT to a free port (4691+)."
  elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker build -t cockpit-product-lab:local -f "$ROOT/docker/product-lab/Dockerfile" "$ROOT" >/dev/null
    cid=$(docker run -d --rm \
      -e COCKPIT_PRODUCT=/work/product \
      -e LAB_PORT="$LAB_PORT" \
      -e HOST=0.0.0.0 \
      -p "${LAB_PORT}:${LAB_PORT}" \
      -v "$PRODUCT:/work/product:ro" \
      --entrypoint /entrypoint-glass.sh \
      cockpit-product-lab:local)
    echo "  container $cid"
    ready=0
    for i in $(seq 1 60); do
      if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${LAB_PORT}/api/thin-desks"; then
        ready=1
        break
      fi
      sleep 2
    done
    if [ "$ready" -eq 1 ]; then
      bash "$ROOT/docker/product-lab/smoke-http.sh" "http://127.0.0.1:${LAB_PORT}" \
        && pass "HTTP smoke" || bad "HTTP smoke FAIL"
    else
      bad "glass did not become ready on :$LAB_PORT"
      docker logs "$cid" 2>&1 | tail -40 || true
    fi
    docker stop "$cid" >/dev/null 2>&1 || true
  else
    bad "docker required for --glass"
  fi
  echo
fi

# --- L4 second clean run (host only quick) ---
echo "→ L4 resettable cross-check (second empty health)"
(
  cd "$PRODUCT/memory-cockpit-v2"
  node scripts/thin-slug-resolve-test.mjs
  node scripts/desk-health.mjs --all
)
pass "second clean health"
echo

# --- Isolation / contamination (optional, recommended long-run) ---
if [ "$DO_ISOLATION" -eq 1 ]; then
  echo "→ Isolation / contamination suite (N=$ISO_N)"
  iso_args=(--n "$ISO_N")
  [ "$ISO_DOCKER" -eq 1 ] && iso_args+=(--docker)
  [ "$ISO_LIVE" -eq 1 ] && iso_args+=(--live)
  if bash "$ROOT/scripts/lab-isolation-e2e.sh" "${iso_args[@]}"; then
    pass "lab-isolation-e2e"
  else
    bad "lab-isolation-e2e FAIL"
  fi
  echo
fi

if [ "$fail" -ne 0 ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  LAB E2E FAIL                                            ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  LAB E2E PASS                                            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo
echo "  Frontend (optional glass): http://127.0.0.1:${LAB_PORT}/#/start"
echo "  Multi-instance: docs/MULTI-INSTANCE.md"
echo "  Ship: lab-e2e PASS + release-check --full → human push"
echo "  Not pushed by this script."
