#!/usr/bin/env bash
# verify-feature.sh — named PLATFORM verify lever.
# Same checklist Glass posts as proof and Lab FAILs on:
#   1. test:platform
#   2. lab-e2e (host fallback if no Docker)
#   3. empty-shell PRODUCT desks=[] (hook 10)
#   4. VM-glass shots (fail closed unless --docs-only)
#
# Does not push, ACCEPT house, write vault, or wipe kernel thin-desks.json.
# Does not require /home/box/Trading/research-wiki or any vault path.
# Decision-support only.
#
# Usage:
#   ./scripts/verify-feature.sh              # layout/UI — shots required
#   ./scripts/verify-feature.sh --docs-only  # docs/scripts ticket; log must say so
#   ./scripts/verify-feature.sh --host       # force lab-e2e host path
# Env:
#   COCKPIT_KERNEL / COCKPIT_PRODUCT / VERIFY_SHOTS_DIR / LAB_PORT
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KERNEL="${COCKPIT_KERNEL:-$ROOT}"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
SHOTS_DIR="${VERIFY_SHOTS_DIR:-$ROOT/docs/proof/vm-glass}"
DOCS_ONLY=0
HOST_LAB=0

usage() {
  sed -n '2,22p' "$0"
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --docs-only) DOCS_ONLY=1; shift ;;
    --host) HOST_LAB=1; shift ;;
    --shots-dir) SHOTS_DIR="${2:?}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

# Never require Anthony's Mac vault path; never point tests at it if missing.
if [ "${COCKPIT_VAULT:-}" = "/home/box/Trading/research-wiki" ] \
  && [ ! -d "/home/box/Trading/research-wiki" ]; then
  unset COCKPIT_VAULT
fi
if [ "${ONTOLOGY_WIKI:-}" = "/home/box/Trading/research-wiki" ] \
  && [ ! -d "/home/box/Trading/research-wiki" ]; then
  unset ONTOLOGY_WIKI
fi

LOG_DIR="$ROOT/logs/verify-feature"
mkdir -p "$LOG_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$LOG_DIR/$STAMP.log"

exec > >(tee -a "$LOG") 2>&1

desk_count() {
  local td="$1/memory-cockpit-v2/config/thin-desks.json"
  if [ ! -f "$td" ]; then
    echo "?"
    return
  fi
  env -u FORCE_COLOR NO_COLOR=1 node -e \
    'try{process.stdout.write(String(require(process.argv[1]).desks.length))}catch(e){process.stdout.write("?")}' \
    "$td" 2>/dev/null
}

file_hash() {
  if [ -f "$1" ]; then
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
  else
    echo "missing"
  fi
}

KERNEL_TD="$KERNEL/memory-cockpit-v2/config/thin-desks.json"
KERNEL_N_BEFORE="$(desk_count "$KERNEL")"
KERNEL_HASH_BEFORE="$(file_hash "$KERNEL_TD")"

EC_MAP=0
EC_PLATFORM=0
EC_LAB=0
EC_EMPTY=0
EC_SHOTS=0
EC_KERNEL=0
FAIL=0

pass() { echo "  ✓ $*"; }
bad() { echo "  ✗ $*"; FAIL=1; }

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  VERIFY FEATURE — Lab checklist (Glass proof)            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  kernel:    $KERNEL"
echo "  product:   $PRODUCT"
echo "  shots dir: $SHOTS_DIR"
echo "  docs-only: $DOCS_ONLY"
echo "  log:       $LOG"
echo "  kernel desks before: $KERNEL_N_BEFORE"
echo "  vault required: no (Trading/research-wiki not required)"
echo

# --- 0. map wiring (this clone's factory rooms) ---
echo "→ 0 map wiring (docs/FEATURE-MAP.md)"
MAP="$KERNEL/docs/FEATURE-MAP.md"
if [ ! -f "$MAP" ]; then
  bad "missing docs/FEATURE-MAP.md"
  EC_MAP=1
else
  pass "FEATURE-MAP.md present"
  miss=0
  for needle in Start overview risks house sources street model research ask update \
    'verify-feature' 'test:platform' 'lab-e2e' 'empty-shell' 'VM-glass' \
    'background' 'Empty / parked' 'desks=\[\]'; do
    if grep -qE "$needle" "$MAP"; then
      :
    else
      echo "    missing map needle: $needle"
      miss=1
    fi
  done
  if [ "$miss" -eq 0 ]; then
    pass "map lists factory rooms + lever + parked background"
  else
    bad "FEATURE-MAP.md missing required needles"
    EC_MAP=1
  fi
  if [ -x "$KERNEL/scripts/verify-feature.sh" ] || [ -f "$KERNEL/scripts/verify-feature.sh" ]; then
    pass "scripts/verify-feature.sh present"
  else
    bad "scripts/verify-feature.sh missing"
    EC_MAP=1
  fi
fi
echo

# --- 1. test:platform ---
echo "→ 1 test:platform (kernel)"
if [ ! -d "$KERNEL/memory-cockpit-v2" ]; then
  bad "kernel memory-cockpit-v2 missing"
  EC_PLATFORM=1
else
  set +e
  (cd "$KERNEL/memory-cockpit-v2" && npm run test:platform)
  EC_PLATFORM=$?
  set -e
  if [ "$EC_PLATFORM" -eq 0 ]; then pass "test:platform"
  else bad "test:platform exit=$EC_PLATFORM"
  fi
fi
echo

# --- 2. lab-e2e (host fallback if no Docker) ---
echo "→ 2 lab-e2e"
LAB_ARGS=()
if [ "$HOST_LAB" -eq 1 ]; then
  LAB_ARGS+=(--host)
  echo "  · --host requested"
elif ! command -v docker >/dev/null 2>&1; then
  LAB_ARGS+=(--host)
  echo "  · docker missing — host fallback"
elif ! docker info >/dev/null 2>&1; then
  LAB_ARGS+=(--host)
  echo "  · docker daemon not ready — host fallback"
fi
if [ ! -x "$KERNEL/scripts/lab-e2e.sh" ] && [ ! -f "$KERNEL/scripts/lab-e2e.sh" ]; then
  bad "scripts/lab-e2e.sh missing"
  EC_LAB=1
else
  export COCKPIT_PRODUCT="$PRODUCT"
  export COCKPIT_KERNEL="$KERNEL"
  set +e
  bash "$KERNEL/scripts/lab-e2e.sh" "${LAB_ARGS[@]+"${LAB_ARGS[@]}"}"
  EC_LAB=$?
  set -e
  if [ "$EC_LAB" -eq 0 ]; then pass "lab-e2e"
  else bad "lab-e2e exit=$EC_LAB"
  fi
fi
echo

# --- 3. empty-shell on PRODUCT desks=[] (hook 10) ---
echo "→ 3 empty-shell (PRODUCT desks=[])"
if [ ! -d "$PRODUCT/memory-cockpit-v2" ]; then
  bad "PRODUCT missing: $PRODUCT"
  echo "    empty-shell FAIL: need PRODUCT desks=[] (friend SoR)."
  echo "    Provision: ./scripts/ensure-product-empty.sh"
  echo "    Kernel may keep dogfood desks. Do not wipe kernel thin-desks.json."
  EC_EMPTY=1
elif [ "$PRODUCT" = "$KERNEL" ]; then
  bad "PRODUCT path equals KERNEL — refusing to treat dogfood as empty-shell"
  EC_EMPTY=1
else
  n_prod="$(desk_count "$PRODUCT")"
  if [ "$n_prod" != "0" ]; then
    bad "PRODUCT desks=$n_prod (expected []) at $PRODUCT"
    echo "    Kernel may keep dogfood desks. Do not wipe kernel thin-desks.json."
    EC_EMPTY=1
  else
    HOOK="$KERNEL/scripts/lab-feature-hooks/10-empty-shell.sh"
    if [ ! -f "$HOOK" ]; then
      bad "missing $HOOK"
      EC_EMPTY=1
    else
      set +e
      bash "$HOOK" "$PRODUCT"
      EC_EMPTY=$?
      set -e
      if [ "$EC_EMPTY" -eq 0 ]; then pass "empty-shell PRODUCT desks=[]"
      else bad "empty-shell exit=$EC_EMPTY"
      fi
    fi
  fi
fi
echo

# --- 4. VM-glass shots (fail closed unless docs-only) ---
echo "→ 4 VM-glass shots"
if [ "$DOCS_ONLY" -eq 1 ]; then
  echo "  · docs-only: skipping VM-glass shots (ticket said so)"
  pass "VM-glass shots skipped (--docs-only)"
  EC_SHOTS=0
else
  mkdir -p "$SHOTS_DIR"
  shots=""
  if [ -d "$SHOTS_DIR" ]; then
    shots="$(find "$SHOTS_DIR" -maxdepth 2 -type f \( \
      -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \
    \) 2>/dev/null || true)"
  fi
  n_shots=0
  if [ -n "$shots" ]; then
    n_shots="$(printf '%s\n' "$shots" | grep -c . || true)"
  fi
  if [ "${n_shots:-0}" -gt 0 ]; then
    pass "VM-glass shots: $n_shots file(s) in $SHOTS_DIR"
    printf '%s\n' "$shots" | sed 's/^/      /'
    EC_SHOTS=0
  else
    bad "layout/UI proof missing — no PNG/JPG/WEBP in $SHOTS_DIR"
    echo "    Fail closed. Put VM-glass shots in that dir, or re-run with --docs-only."
    EC_SHOTS=1
  fi
fi
echo

# --- kernel thin-desks.json must be untouched ---
echo "→ kernel thin-desks.json (must not wipe dogfood)"
KERNEL_N_AFTER="$(desk_count "$KERNEL")"
KERNEL_HASH_AFTER="$(file_hash "$KERNEL_TD")"
if [ "$KERNEL_HASH_BEFORE" = "$KERNEL_HASH_AFTER" ] && [ "$KERNEL_N_BEFORE" = "$KERNEL_N_AFTER" ]; then
  pass "kernel desks unchanged ($KERNEL_N_AFTER) — not wiped"
  EC_KERNEL=0
else
  bad "kernel thin-desks.json changed (before desks=$KERNEL_N_BEFORE hash=${KERNEL_HASH_BEFORE:0:12} → after desks=$KERNEL_N_AFTER hash=${KERNEL_HASH_AFTER:0:12})"
  EC_KERNEL=1
fi
echo

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  PROOF CHECKLIST (Glass posts · Lab FAILs on)            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  map wiring        exit=$EC_MAP"
echo "  test:platform     exit=$EC_PLATFORM"
echo "  lab-e2e           exit=$EC_LAB"
echo "  empty-shell       exit=$EC_EMPTY   PRODUCT desks=$(desk_count "$PRODUCT")"
if [ "$DOCS_ONLY" -eq 1 ]; then
  echo "  VM-glass shots    exit=$EC_SHOTS   docs-only skip"
else
  echo "  VM-glass shots    exit=$EC_SHOTS"
fi
echo "  kernel desks      exit=$EC_KERNEL  count=$KERNEL_N_AFTER (not wiped)"
echo "  log: $LOG"
echo

if [ "$EC_MAP" -ne 0 ] || [ "$EC_PLATFORM" -ne 0 ] || [ "$EC_LAB" -ne 0 ] \
  || [ "$EC_EMPTY" -ne 0 ] || [ "$EC_SHOTS" -ne 0 ] || [ "$EC_KERNEL" -ne 0 ] \
  || [ "$FAIL" -ne 0 ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  VERIFY FEATURE FAIL                                     ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo "  Do not fake PASS. Fix the red gate(s)."
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  VERIFY FEATURE PASS                                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  Next for friends: /cockpit-ship (not this lever)."
echo "  Push only if human says push."
exit 0
