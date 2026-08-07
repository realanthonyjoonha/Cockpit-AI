#!/usr/bin/env bash
# lab-isolation-e2e.sh — extensive contamination / cross-instance leak tests.
# Long-run posture: N sealed trees, no kernel dogfood as SoR, no cross-marker leaks.
# Decision-support only. Does not push git.
#
# Usage:
#   ./scripts/lab-isolation-e2e.sh           # default N=3
#   ./scripts/lab-isolation-e2e.sh --n 5
#   ./scripts/lab-isolation-e2e.sh --docker  # also dual docker mount isolation
#   ./scripts/lab-isolation-e2e.sh --live    # start N host glasses + HTTP cross-check
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/lab-seal.sh"

PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
KERNEL="${COCKPIT_KERNEL:-$ROOT}"
N=3
DO_DOCKER=0
DO_LIVE=0
BASE_PORT="${LAB_ISOLATION_BASE_PORT:-4711}"
WORKDIR="${LAB_ISOLATION_WORKDIR:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --n) N="${2:?}"; shift 2 ;;
    --docker) DO_DOCKER=1; shift ;;
    --live) DO_LIVE=1; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

if ! [[ "$N" =~ ^[0-9]+$ ]] || [ "$N" -lt 2 ] || [ "$N" -gt 8 ]; then
  echo "error: --n must be 2..8 (got $N)"
  exit 1
fi

if [ -z "$WORKDIR" ]; then
  # Prefer $HOME so Colima/Docker can bind-mount ( /tmp often not shared into VM )
  WORKDIR="$(mktemp -d "${HOME}/.cockpit-lab-isolation-XXXXXX")"
else
  mkdir -p "$WORKDIR"
fi
cleanup() {
  if [ -n "${LIVE_PIDS:-}" ]; then
    for pid in $LIVE_PIDS; do kill "$pid" 2>/dev/null || true; done
  fi
}
trap cleanup EXIT

fail=0
pass_n=0
pass() { echo "  ✓ $*"; pass_n=$((pass_n + 1)); }
bad() { echo "  ✗ $*"; fail=$((fail + 1)); }

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  LAB ISOLATION E2E — contamination suite                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  product:  $PRODUCT"
echo "  kernel:   $KERNEL"
echo "  N:        $N instances"
echo "  workdir:  $WORKDIR"
echo "  base port:$BASE_PORT"
echo

# ─── I0: product clean SoR ─────────────────────────────────
echo "→ I0 product SoR preflight"
if [ ! -d "$PRODUCT/memory-cockpit-v2" ]; then
  bad "product missing"
  echo "ISOLATION FAIL"; exit 1
fi
pn=$(node -e "console.log(require('$PRODUCT/memory-cockpit-v2/config/thin-desks.json').desks.length)")
if [ "$pn" = "0" ]; then pass "product desks=[]"
else bad "product desks=$pn (ship SoR should stay empty; isolation still uses copies)"
fi
echo

# ─── I1: refuse kernel dogfood as lab SoR ───────────────────
echo "→ I1 refuse kernel contamination as lab SoR"
if lab_seal_refuse_kernel_path "$KERNEL" 2>/dev/null; then
  # kernel with desks should refuse
  kn=$(node -e "try{console.log(require('$KERNEL/memory-cockpit-v2/config/thin-desks.json').desks.length)}catch(e){console.log(0)}")
  if [ "$kn" != "0" ]; then
    bad "kernel path with desks=$kn was NOT refused"
  else
    pass "kernel path empty or missing desks (refuse soft)"
  fi
else
  pass "kernel dogfood path refused (desks present)"
fi
# guards.sh should fail on kernel with desks
if [ -x "$ROOT/docker/product-lab/guards.sh" ]; then
  if bash "$ROOT/docker/product-lab/guards.sh" "$KERNEL" 2>/dev/null; then
    kn=$(node -e "try{console.log(require('$KERNEL/memory-cockpit-v2/config/thin-desks.json').desks.length)}catch(e){console.log(0)}")
    if [ "$kn" != "0" ]; then bad "guards.sh accepted kernel with desks"
    else pass "guards on kernel (empty desks edge)"
    fi
  else
    pass "guards.sh rejects kernel non-empty desks"
  fi
fi
echo

# ─── I2: materialize N sealed instances ─────────────────────
echo "→ I2 materialize $N sealed instances"
for i in $(seq 1 "$N"); do
  dest="$WORKDIR/i$i"
  if lab_seal_materialize "$PRODUCT" "$dest" "$i"; then
    slug=$(lab_seal_read_slug "$dest")
    if [ "$slug" = "seal-$i" ]; then pass "i$i slug=$slug"
    else bad "i$i unexpected slug=$slug"
    fi
  else
    bad "materialize i$i failed"
  fi
done
echo

# ─── I3: no cross-marker filesystem leaks ───────────────────
echo "→ I3 cross-instance filesystem isolation"
for i in $(seq 1 "$N"); do
  di="$WORKDIR/i$i"
  if ! lab_seal_has_payload "$di" "$i"; then
    bad "i$i missing own payload"
  else
    pass "i$i owns payload"
  fi
  for j in $(seq 1 "$N"); do
    [ "$i" = "$j" ] && continue
    dj="$WORKDIR/i$j"
    if lab_seal_has_foreign_marker "$di" "$j"; then
      bad "LEAK: i$i contains vault marker from i$j"
    fi
    # foreign seal id file
    if [ -f "$di/.lab-seal-id" ] && grep -q "SEAL_ID=$j" "$di/.lab-seal-id" 2>/dev/null; then
      bad "LEAK: i$i seal-id claims $j"
    fi
    # foreign slug in desks
    slug_i=$(lab_seal_read_slug "$di")
    if [ "$slug_i" = "seal-$j" ]; then
      bad "LEAK: i$i desks slug is seal-$j"
    fi
  done
done
# explicit: after all materialize, i1 marker must not be in i2
if [ -f "$WORKDIR/i2/research-wiki/raw/.lab-isolation-marker-1" ]; then
  bad "LEAK: i2 has marker-1"
else
  pass "i2 lacks i1 vault marker"
fi
echo

# ─── I4: mutate i1, siblings unchanged ──────────────────────
echo "→ I4 mutation isolation (write i1, assert others)"
MUT="mutation-$(date +%s)-$$"
echo "$MUT" >"$WORKDIR/i1/research-wiki/raw/.lab-mutation"
node -e "
  const fs=require('fs');
  const p='$WORKDIR/i1/memory-cockpit-v2/config/thin-desks.json';
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  j.desks[0].name='MUTATED-I1';
  fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
"
for j in $(seq 2 "$N"); do
  if [ -f "$WORKDIR/i$j/research-wiki/raw/.lab-mutation" ]; then
    bad "LEAK: mutation file appeared in i$j"
  else
    pass "i$j has no mutation file"
  fi
  name=$(node -e "console.log(require('$WORKDIR/i$j/memory-cockpit-v2/config/thin-desks.json').desks[0].name)")
  if [ "$name" = "MUTATED-I1" ]; then
    bad "LEAK: i$j desk name mutated"
  else
    pass "i$j desk name intact ($name)"
  fi
done
name1=$(node -e "console.log(require('$WORKDIR/i1/memory-cockpit-v2/config/thin-desks.json').desks[0].name)")
if [ "$name1" = "MUTATED-I1" ]; then pass "i1 shows mutation"
else bad "i1 mutation missing"
fi
echo

# ─── I5: shared path hazard (document + simulate) ───────────
echo "→ I5 shared-mount hazard simulation"
SHARED="$WORKDIR/shared-bad"
lab_seal_materialize "$PRODUCT" "$SHARED" "shared" || true
# Two logical instances pointing at SAME dest → contamination by definition
if [ "$(lab_seal_read_slug "$SHARED")" = "seal-shared" ]; then
  pass "shared dir single slug (baseline)"
fi
# Prove: writing via alias path hits same inode
ln -sfn "$SHARED" "$WORKDIR/alias-a"
ln -sfn "$SHARED" "$WORKDIR/alias-b"
echo "via-alias" >"$WORKDIR/alias-a/research-wiki/raw/.alias-write"
if [ -f "$WORKDIR/alias-b/research-wiki/raw/.alias-write" ]; then
  pass "alias-a and alias-b share data (hazard demonstrated — do not multi-mount one tree)"
else
  bad "alias demo unexpected"
fi
echo

# ─── I6: docker dual-mount (optional) ───────────────────────
if [ "$DO_DOCKER" -eq 1 ]; then
  echo "→ I6 Docker dual-container mount isolation"
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    bad "docker not available for --docker"
  else
    # Run two alpine cats of seal markers — must only see own mount
    out1=$(docker run --rm \
      -v "$WORKDIR/i1:/seal:ro" \
      alpine:3.20 cat /seal/.lab-seal-id 2>/dev/null || echo FAIL)
    out2=$(docker run --rm \
      -v "$WORKDIR/i2:/seal:ro" \
      alpine:3.20 cat /seal/.lab-seal-id 2>/dev/null || echo FAIL)
    if echo "$out1" | grep -q 'SEAL_ID=1' && echo "$out2" | grep -q 'SEAL_ID=2'; then
      pass "docker mount i1 sees SEAL_ID=1 only context"
      pass "docker mount i2 sees SEAL_ID=2 only context"
    else
      bad "docker mount read unexpected: i1=$out1 i2=$out2"
    fi
    # Container with i1 must not see i2 path
    leak=$(docker run --rm \
      -v "$WORKDIR/i1:/seal:ro" \
      alpine:3.20 sh -c 'ls /seal/research-wiki/raw/.lab-isolation-marker-2 2>/dev/null || echo ABSENT')
    if echo "$leak" | grep -q ABSENT; then
      pass "docker i1 mount cannot see marker-2"
    else
      bad "docker i1 mount saw marker-2"
    fi
    # Parallel two containers
    docker run --rm -v "$WORKDIR/i1:/seal:ro" alpine:3.20 cat /seal/.lab-seal-payload >/tmp/iso-d1.$$ &
    p1=$!
    docker run --rm -v "$WORKDIR/i2:/seal:ro" alpine:3.20 cat /seal/.lab-seal-payload >/tmp/iso-d2.$$ &
    p2=$!
    wait $p1 $p2 || true
    if grep -q 'unique-payload-1' /tmp/iso-d1.$$ && grep -q 'unique-payload-2' /tmp/iso-d2.$$; then
      if grep -q 'unique-payload-2' /tmp/iso-d1.$$ 2>/dev/null; then
        bad "parallel docker i1 output contains payload-2"
      else
        pass "parallel docker containers isolated payloads"
      fi
    else
      bad "parallel docker payload read failed"
    fi
    rm -f /tmp/iso-d1.$$ /tmp/iso-d2.$$
  fi
  echo
fi

# ─── I7: live multi-glass HTTP (optional, heavy) ────────────
LIVE_PIDS=""
if [ "$DO_LIVE" -eq 1 ]; then
  echo "→ I7 live multi-instance glass HTTP isolation"
  # Need node_modules — use product host modules via symlink for speed
  if [ ! -d "$PRODUCT/memory-cockpit-v2/node_modules" ]; then
    echo "  · installing product deps once"
    (cd "$PRODUCT/memory-cockpit-v2" && npm install) || bad "npm install product"
  fi
  for i in $(seq 1 "$N"); do
    dest="$WORKDIR/i$i"
    # share node_modules + dist from product to avoid N full installs
    rm -rf "$dest/memory-cockpit-v2/node_modules"
    ln -sfn "$PRODUCT/memory-cockpit-v2/node_modules" "$dest/memory-cockpit-v2/node_modules"
    if [ -d "$PRODUCT/memory-cockpit-v2/dist" ]; then
      rm -rf "$dest/memory-cockpit-v2/dist"
      ln -sfn "$PRODUCT/memory-cockpit-v2/dist" "$dest/memory-cockpit-v2/dist"
    else
      (cd "$PRODUCT/memory-cockpit-v2" && npm run build) || true
      ln -sfn "$PRODUCT/memory-cockpit-v2/dist" "$dest/memory-cockpit-v2/dist" 2>/dev/null || true
    fi
    port=$((BASE_PORT + i - 1))
    export COCKPIT_REPO="$dest"
    export COCKPIT_VAULT="$dest/research-wiki"
    export ONTOLOGY_WIKI="$COCKPIT_VAULT"
    export ONTOLOGY_STORE="$dest/ontology/store/by_ticker"
    export PORT="$port"
    export HOST=127.0.0.1
    export COCKPIT_ENV_QUIET=1
    (
      cd "$dest/memory-cockpit-v2"
      exec npm start
    ) >"$WORKDIR/glass-i$i.log" 2>&1 &
    LIVE_PIDS="$LIVE_PIDS $!"
    echo "  started i$i pid $! port $port"
  done
  # wait ready
  for i in $(seq 1 "$N"); do
    port=$((BASE_PORT + i - 1))
    ready=0
    for _ in $(seq 1 40); do
      if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${port}/api/thin-desks"; then
        ready=1
        break
      fi
      sleep 1
    done
    if [ "$ready" -eq 1 ]; then pass "glass i$i ready :$port"
    else bad "glass i$i not ready :$port"; tail -20 "$WORKDIR/glass-i$i.log" || true
    fi
  done
  # cross-check HTTP bodies
  for i in $(seq 1 "$N"); do
    port=$((BASE_PORT + i - 1))
    body=$(curl -sf --max-time 5 "http://127.0.0.1:${port}/api/thin-desks" || echo '{}')
    echo "$body" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
        const j=JSON.parse(d);
        const desks=j.desks||[];
        const expect='seal-$i';
        if(desks.length!==1){console.error('count',desks.length); process.exit(2)}
        if(desks[0].slug!==expect){console.error('slug',desks[0].slug); process.exit(3)}
        // foreign seals
        for(const x of desks){
          if(x.slug && x.slug!==expect) process.exit(4);
        }
        console.log('ok');
      });
    " && pass "HTTP i$i only seal-$i" || bad "HTTP i$i desk leak or mismatch"
    # ensure no other seal id in body
    for j in $(seq 1 "$N"); do
      [ "$i" = "$j" ] && continue
      if echo "$body" | grep -q "seal-$j"; then
        bad "LEAK HTTP i$i body mentions seal-$j"
      fi
    done
  done
  # kernel port must not equal our base (soft)
  if lsof -nP -iTCP:4682 -sTCP:LISTEN >/dev/null 2>&1; then
    pass "kernel :4682 still separate from isolation ports $BASE_PORT+"
  fi
  echo
fi

# ─── I8: summary matrix ────────────────────────────────────
echo "→ I8 instance matrix"
printf '  %-6s %-12s %-10s\n' "inst" "slug" "payload"
for i in $(seq 1 "$N"); do
  printf '  %-6s %-12s %-10s\n' "i$i" "$(lab_seal_read_slug "$WORKDIR/i$i")" "payload-$i"
done
echo

echo "╔══════════════════════════════════════════════════════════╗"
if [ "$fail" -eq 0 ]; then
  echo "║  LAB ISOLATION PASS  ($pass_n checks, N=$N)                  ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo "  workdir kept for inspection: $WORKDIR"
  echo "  (delete when done: rm -rf $WORKDIR)"
  # don't delete workdir on success so user can inspect; trap only kills glasses
  trap - EXIT
  cleanup
  exit 0
else
  echo "║  LAB ISOLATION FAIL  ($fail failed, $pass_n passed)          ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo "  workdir: $WORKDIR"
  exit 1
fi
