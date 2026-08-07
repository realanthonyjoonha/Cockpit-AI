#!/usr/bin/env bash
# customer-sim-e2e.sh — aggressive automated tests for first-time customer simulation.
# Decision-support only. Does not push. Does not underwrite real books.
#
# Usage:
#   ./scripts/customer-sim-e2e.sh
#   CUSTOMER_SIM_PORT=4690 COCKPIT_PRODUCT=~/Desktop/cockpit-product ./scripts/customer-sim-e2e.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
KERNEL="${COCKPIT_KERNEL:-$ROOT}"
# If this script lives in kernel, KERNEL=ROOT; product is separate
if [ -f "$ROOT/KERNEL.md" ] && [ -d "$PRODUCT/memory-cockpit-v2" ]; then
  :
elif [ -d "$ROOT/memory-cockpit-v2" ] && [ ! -f "$ROOT/KERNEL.md" ]; then
  PRODUCT="$ROOT"
fi
PORT="${CUSTOMER_SIM_PORT:-4690}"
PF="$PRODUCT/scripts/customer-sim-preflight.sh"
# prefer product copy; fall back to kernel copy of script
if [ ! -x "$PF" ]; then
  PF="$ROOT/scripts/customer-sim-preflight.sh"
fi

fail=0
pass_n=0
ok() { echo "  ✓ $*"; pass_n=$((pass_n + 1)); }
bad() { echo "  ✗ $*"; fail=$((fail + 1)); }

TD_PROD="$PRODUCT/memory-cockpit-v2/config/thin-desks.json"
TD_BACKUP=""
restore_desks() {
  if [ -n "$TD_BACKUP" ] && [ -f "$TD_BACKUP" ]; then
    cp "$TD_BACKUP" "$TD_PROD"
    echo "  · restored product thin-desks.json from backup"
  fi
}
trap restore_desks EXIT

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  CUSTOMER SIM E2E — from-scratch product use             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  product: $PRODUCT"
echo "  kernel:  $KERNEL"
echo "  port:    $PORT"
echo "  preflight script: $PF"
echo

# Snapshot + force empty shell for true first-run (restore on exit)
if [ -f "$TD_PROD" ]; then
  TD_BACKUP="$(mktemp /tmp/thin-desks-backup.XXXXXX)"
  cp "$TD_PROD" "$TD_BACKUP"
  node -e "
    const fs=require('fs');
    const p='$TD_PROD';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.desks=[];
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
  echo "  · forced product desks=[] for customer e2e (will restore)"
  # give glass a moment to reload mtime if running
  sleep 1
fi

# ─── C0 artifacts ──────────────────────────────────────────
echo "→ C0 artifacts on product"
for f in \
  docs/CUSTOMER-SIM.md \
  CUSTOMER-SIM-PROMPT.md \
  .grok/commands/cockpit-customer-sim.md \
  scripts/customer-sim-preflight.sh
do
  if [ -f "$PRODUCT/$f" ]; then ok "product has $f"
  else bad "product missing $f"
  fi
done
if grep -q 'cockpit-customer-sim' "$PRODUCT/.grok/commands/cockpit.md" 2>/dev/null; then
  ok "cockpit.md menu lists customer-sim"
else
  bad "cockpit.md missing customer-sim menu row"
fi
if grep -q 'CUSTOMER-SIM' "$PRODUCT/AGENTS.md" 2>/dev/null || grep -q 'customer-sim' "$PRODUCT/AGENTS.md" 2>/dev/null; then
  ok "AGENTS points at customer sim"
else
  echo "  · AGENTS.md may lack customer-sim row (warn)"
fi
echo

# ─── C1 preflight isolation matrix ─────────────────────────
echo "→ C1 preflight isolation matrix"
# Kernel must FAIL
set +e
out_k=$(CUSTOMER_SIM_PORT="$PORT" bash "$ROOT/scripts/customer-sim-preflight.sh" 2>&1)
ec_k=$?
set -e
# Force kernel root: run with cwd kernel and no COCKPIT_PRODUCT
set +e
out_k2=$(cd "$KERNEL" && env -u COCKPIT_PRODUCT CUSTOMER_SIM_PORT="$PORT" bash "$KERNEL/scripts/customer-sim-preflight.sh" 2>&1)
ec_k2=$?
set -e
if [ "$ec_k2" -ne 0 ]; then ok "preflight FAIL on kernel cwd (ec=$ec_k2)"
else bad "preflight unexpectedly PASS on kernel"
fi
if echo "$out_k2" | grep -qiE 'dogfood|forbidden|desks='; then ok "kernel failure mentions dogfood/desks"
else echo "  · kernel fail output: $(echo "$out_k2" | tail -3)"
fi

# Product must PASS
set +e
out_p=$(cd "$PRODUCT" && env -u COCKPIT_PRODUCT CUSTOMER_SIM_PORT="$PORT" bash "$PRODUCT/scripts/customer-sim-preflight.sh" 2>&1)
ec_p=$?
set -e
if [ "$ec_p" -eq 0 ]; then ok "preflight PASS on product cwd"
else
  bad "preflight FAIL on product"
  echo "$out_p" | tail -25
fi

# COCKPIT_PRODUCT override from kernel script path
set +e
out_o=$(cd /tmp && COCKPIT_PRODUCT="$PRODUCT" CUSTOMER_SIM_PORT="$PORT" bash "$ROOT/scripts/customer-sim-preflight.sh" 2>&1)
ec_o=$?
set -e
if [ "$ec_o" -eq 0 ]; then ok "COCKPIT_PRODUCT override PASS from foreign cwd"
else
  bad "COCKPIT_PRODUCT override failed"
  echo "$out_o" | tail -15
fi

# Mismatch: product env but if glass were kernel... we check registry match on product
if echo "$out_p" | grep -q 'GLASS/TREE MISMATCH'; then
  bad "product preflight reported glass/tree mismatch"
else
  ok "no glass/tree mismatch on product preflight"
fi
echo

# ─── C2 ensure glass (start if needed) ──────────────────────
echo "→ C2 glass availability"
if ! curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/api/thin-desks"; then
  echo "  starting glass…"
  set +e
  cd "$PRODUCT" && CUSTOMER_SIM_PORT="$PORT" bash "$PRODUCT/scripts/customer-sim-preflight.sh" --start-glass
  set -e
fi
if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:${PORT}/api/thin-desks"; then
  ok "glass reachable :$PORT"
else
  bad "glass still down on :$PORT"
fi
echo

# ─── C3 first-run HTTP journey ──────────────────────────────
echo "→ C3 first-run HTTP journey (customer day-0)"
BASE="http://127.0.0.1:${PORT}"

# SPA
code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "$BASE/" || echo 000)
if [ "$code" = "200" ]; then ok "GET / → $code"
else bad "GET / → $code"
fi

# thin-desks empty + registry on product
body=$(curl -sf --max-time 5 "$BASE/api/thin-desks" || true)
if [ -z "$body" ]; then bad "thin-desks empty body"
else
  echo "$body" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      if(!j.ok) process.exit(2);
      if((j.desks||[]).length!==0){console.error('desks',j.desks.length);process.exit(3)}
      const reg=j.registry_path||'';
      if(!reg.includes('cockpit-product')){console.error('registry',reg);process.exit(4)}
      // contamination: no dogfood slugs
      const s=JSON.stringify(j);
      for (const t of ['nvda','nbis','msft','mu','avgo']) {
        // registry path may contain nothing; desks empty already
      }
      console.log('ok');
    });
  " && ok "thin-desks empty + registry on product" || bad "thin-desks customer contract fail"
fi

# start agents: Build next company
agents_start=$(curl -sf --max-time 5 "$BASE/api/open-grok/agents?variant=start" || true)
if [ -z "$agents_start" ]; then bad "agents?variant=start failed"
else
  echo "$agents_start" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const acts=(j.agents||[]).map(a=>a.action);
      if(!acts.includes('new-desk')) {console.error(acts); process.exit(2)}
      if(j.default_action && j.default_action!=='new-desk') process.exit(3);
      const lab=(j.agents||[]).find(a=>a.action==='new-desk');
      if(!lab || !/Build next company/i.test(lab.label||'')) process.exit(4);
      console.log('ok');
    });
  " && ok "start variant: new-desk / Build next company" || bad "start agents catalog wrong"
fi

# desk agents: daily present (for after underwrite UX)
agents_desk=$(curl -sf --max-time 5 "$BASE/api/open-grok/agents?variant=desk" || true)
if [ -z "$agents_desk" ]; then bad "agents?variant=desk failed"
else
  echo "$agents_desk" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const acts=(j.agents||[]).map(a=>a.action);
      for (const need of ['daily','research','street']) {
        if(!acts.includes(need)) {console.error('missing',need,acts); process.exit(2)}
      }
      if(acts.includes('new-desk')) process.exit(3); // new-desk is start-only
      console.log('ok');
    });
  " && ok "desk variant: daily/research/street; no new-desk" || bad "desk agents catalog wrong"
fi

# open-grok prompt mapping (may spawn Terminal — once)
og=$(curl -sf --max-time 15 -X POST "$BASE/api/open-grok" \
  -H 'Content-Type: application/json' \
  -d '{"action":"new-desk","desk":"start"}' || true)
if [ -z "$og" ]; then bad "POST open-grok new-desk failed"
else
  echo "$og" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      if(!j.ok) process.exit(2);
      if(!String(j.initial_prompt||'').includes('cockpit-new-desk')) process.exit(3);
      if(!String(j.repo||'').includes('cockpit-product')) process.exit(4);
      console.log('ok');
    });
  " && ok "open-grok new-desk → product repo + /cockpit-new-desk" || bad "open-grok new-desk contract fail"
fi
echo

# ─── C4 command + prompt quality ────────────────────────────
echo "→ C4 command/prompt isolation language"
CMD="$PRODUCT/.grok/commands/cockpit-customer-sim.md"
for needle in 'dogfood' 'preflight' 'list_desks' 'CUSTOMER SIM REPORT' 'kernel' 'push'; do
  if grep -qi "$needle" "$CMD"; then ok "command mentions $needle"
  else bad "command missing $needle"
  fi
done
if grep -q 'Build next company\|FRIEND-START\|thin-desks' "$PRODUCT/docs/CUSTOMER-SIM.md"; then
  ok "CUSTOMER-SIM.md has journey anchors"
else
  bad "CUSTOMER-SIM.md thin on journey"
fi
echo

# ─── C5 contamination red team ──────────────────────────────
echo "→ C5 contamination red team"
# Running product preflight while documenting kernel still has desks
kn=$(node -e "console.log(require('$KERNEL/memory-cockpit-v2/config/thin-desks.json').desks.length)")
pn=$(node -e "console.log(require('$PRODUCT/memory-cockpit-v2/config/thin-desks.json').desks.length)")
if [ "$kn" -gt 0 ] && [ "$pn" = "0" ]; then
  ok "kernel desks=$kn product desks=0 (parallel worlds OK)"
else
  echo "  · kernel=$kn product=$pn"
fi
# Live API must not list kernel slugs
body=$(curl -sf "$BASE/api/thin-desks" || echo '{}')
for slug in nvda nbis mu avgo tsm amd shaz mrvl; do
  if echo "$body" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const slugs=(j.desks||[]).map(x=>x.slug);
      process.exit(slugs.includes('$slug')?1:0);
    });
  "; then
    : # exit 0 means not includes
    ok "live API lacks dogfood slug $slug"
  else
    bad "LEAK live API has dogfood slug $slug"
  fi
done
# registry_path must not be kernel
reg=$(printf '%s' "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).registry_path||'')}catch(e){console.log('')}})")
if echo "$reg" | grep -q cockpit-kernel; then
  bad "LEAK registry_path points at kernel: $reg"
else
  ok "registry_path not kernel ($reg)"
fi
echo

# ─── C6 dual preflight stability ────────────────────────────
echo "→ C6 dual product preflight (stability)"
set +e
bash -c "cd '$PRODUCT' && CUSTOMER_SIM_PORT=$PORT ./scripts/customer-sim-preflight.sh" >/tmp/cs-pf1.out 2>&1
e1=$?
bash -c "cd '$PRODUCT' && CUSTOMER_SIM_PORT=$PORT ./scripts/customer-sim-preflight.sh" >/tmp/cs-pf2.out 2>&1
e2=$?
set -e
if [ "$e1" -eq 0 ] && [ "$e2" -eq 0 ]; then ok "two consecutive product preflights PASS"
else bad "preflight flaky e1=$e1 e2=$e2"
fi
echo

# ─── C7 customer report template completeness ───────────────
echo "→ C7 report template"
for field in monorepo desks glass 'PASS' contamination push; do
  if grep -qi "$field" "$PRODUCT/docs/CUSTOMER-SIM.md"; then ok "report/docs field $field"
  else bad "docs missing $field"
  fi
done
echo

echo "╔══════════════════════════════════════════════════════════╗"
if [ "$fail" -eq 0 ]; then
  echo "║  CUSTOMER SIM E2E PASS  ($pass_n checks)                   ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo "  Customer URL: http://127.0.0.1:${PORT}/#/start"
  echo "  Agent: pin MCP to product → /cockpit-customer-sim or CUSTOMER-SIM-PROMPT.md"
  exit 0
else
  echo "║  CUSTOMER SIM E2E FAIL  ($fail failed, $pass_n passed)      ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 1
fi
