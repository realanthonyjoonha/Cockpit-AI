#!/usr/bin/env bash
# First-run HTTP smoke against a running glass (empty product).
set -euo pipefail

BASE="${1:-http://127.0.0.1:4690}"
BASE="${BASE%/}"

fail=0
ok() { echo "  ✓ http: $*"; }
bad() { echo "  ✗ http: $*"; fail=1; }

echo "→ HTTP smoke $BASE"

if ! curl -sf -o /dev/null --max-time 5 "$BASE/"; then
  # SPA may still 200 on /
  if ! curl -sf -o /dev/null --max-time 5 "$BASE/api/thin-desks"; then
    bad "glass not reachable at $BASE"
    exit 1
  fi
fi
ok "reachable"

# thin-desks empty
body=$(curl -sf --max-time 10 "$BASE/api/thin-desks" || true)
if [ -z "$body" ]; then
  bad "GET /api/thin-desks empty response"
else
  n=$(printf '%s' "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log((j.desks||[]).length)}catch(e){console.log('err')}})")
  if [ "$n" = "0" ]; then ok "thin-desks desks=[]"
  else bad "thin-desks desks=$n (expected 0)"
  fi
fi

# open-grok agents catalog (desk variant)
agents=$(curl -sf --max-time 10 "$BASE/api/open-grok/agents?variant=desk" || true)
if [ -z "$agents" ]; then
  bad "GET /api/open-grok/agents?variant=desk failed"
else
  ok "open-grok agents catalog returned"
  # soft: daily or street or research string somewhere
  if printf '%s' "$agents" | grep -qiE 'daily|street|research|new-desk|action'; then
    ok "agents catalog looks populated"
  else
    bad "agents catalog missing expected agent markers"
  fi
fi

# start variant often has new-desk
agents_start=$(curl -sf --max-time 10 "$BASE/api/open-grok/agents?variant=start" || true)
if [ -n "$agents_start" ]; then
  ok "open-grok agents variant=start returned"
else
  echo "  · start variant missing (non-fatal if desk works)"
fi

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "  HTTP smoke PASS"
