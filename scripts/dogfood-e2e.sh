#!/usr/bin/env bash
# dogfood-e2e.sh — agent-runnable dogfood of platform features in the testing cockpit.
# Unique MCP name + fixture desk DOGF. Never pins kernel vault. Decision-support only.
#
#   ./scripts/dogfood-e2e.sh
#   COCKPIT_DOGFOOD=$PWD/.cockpit-dogfood DOGFOOD_PORT=4695 ./scripts/dogfood-e2e.sh
set -euo pipefail
[ -n "${BASH_VERSION:-}" ] || { echo "error: bash required (not zsh)" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/dogfood-paths.sh"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
DEST="$(dogfood_default_dest "$ROOT")"
PORT="${DOGFOOD_PORT:-4695}"
MCP_NAME="${COCKPIT_MCP_NAME:-cockpit-research-dogfood}"
SLUGS="${COCKPIT_DOGFOOD_SLUGS:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --slugs) SLUGS="${2:?}"; shift 2 ;;
    --dir) DEST="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    *) echo "unknown: $1" >&2; exit 1 ;;
  esac
done

fail=0
pass_n=0
ok() { echo "  ✓ $*"; pass_n=$((pass_n + 1)); }
bad() { echo "  ✗ $*"; fail=$((fail + 1)); }

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  DOGFOOD E2E — testing cockpit                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  dest: $DEST"
echo "  port: $PORT"
echo "  mcp:  $MCP_NAME"
echo "  slugs:${SLUGS:-dogf}"
echo
PRIMARY=$(echo "${SLUGS:-dogf}" | cut -d, -f1 | tr 'A-Z' 'a-z')

if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  if is_live_tree "$DEST"; then
    bad "testing cockpit dest is a live tree ($DEST)"
    echo "DOGFOOD E2E FAIL"; exit 1
  fi
fi

UP_ARGS=(--dir "$DEST" --port "$PORT" --mcp-name "$MCP_NAME")
if [ -n "$SLUGS" ]; then UP_ARGS+=(--slugs "$SLUGS"); fi
if [ ! -f "$DEST/.cockpit-dogfood.json" ] || [ -n "$SLUGS" ]; then
  echo "→ dogfood-up ${SLUGS:+slugs=$SLUGS}"
  bash "$ROOT/scripts/dogfood-up.sh" "${UP_ARGS[@]}"
fi

if [ ! -f "$DEST/.cockpit-dogfood.json" ]; then
  bad "dogfood-up did not write .cockpit-dogfood.json"
  echo "DOGFOOD E2E FAIL"; exit 1
fi

if ! curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/api/thin-desks"; then
  echo "→ glass down — dogfood-up"
  bash "$ROOT/scripts/dogfood-up.sh" "${UP_ARGS[@]}"
fi

ABS="$(cd "$DEST" && pwd)"
if is_live_tree "$ABS"; then
  bad "testing cockpit dest is a live tree"
  echo "DOGFOOD E2E FAIL"; exit 1
fi

echo "→ D0 isolation"
if [ -L "$ABS/research-wiki" ]; then
  bad "research-wiki is a symlink (would collide with cockpit-vault)"
else
  ok "vault is a real dir in the seal"
fi
if ls -d "$ABS"/research-wiki.moved* >/dev/null 2>&1; then
  bad "kernel vault archive (research-wiki.moved*) leaked into seal"
else
  ok "no research-wiki.moved archive in seal"
fi
if grep -xF "[mcp_servers.${MCP_NAME}]" "$ABS/.grok/config.toml" >/dev/null 2>&1; then
  ok "project pin server is $MCP_NAME"
else
  bad "project pin missing $MCP_NAME"
fi
if grep -xF '[mcp_servers.cockpit-research]' "$ABS/.grok/config.toml" >/dev/null 2>&1; then
  bad "dogfood pin still declares cockpit-research (collision with kernel)"
else
  ok "dogfood pin does not declare cockpit-research"
fi
if grep -q 'cockpit-vault' "$ABS/.grok/config.toml" 2>/dev/null; then
  bad "pin vault points at cockpit-vault"
else
  ok "pin vault is not cockpit-vault"
fi
KPIN="${HOME}/Desktop/cockpit-kernel/.grok/config.toml"
if [ -f "$KPIN" ]; then
  if grep -xF '[mcp_servers.cockpit-research]' "$KPIN" >/dev/null && ! grep -q 'cockpit-dogfood' "$KPIN"; then
    ok "kernel project pin still cockpit-research (not seal)"
  else
    bad "kernel project pin contaminated"
  fi
fi
UPIN="${HOME}/.grok/config.toml"
if [ -f "$UPIN" ]; then
  if node -e "
    const fs=require('fs');
    const t=fs.readFileSync(process.argv[1],'utf8').split(/\\r?\\n/);
    let s=false;
    for (const line of t) {
      if (line === '[mcp_servers.cockpit-research]') { s=true; continue; }
      if (line.startsWith('[') && s) s=false;
      if (s && line.includes('cockpit-dogfood')) process.exit(2);
    }
  " "$UPIN"; then
    ok "user cockpit-research pin is not the seal"
  else
    bad "user cockpit-research pin points at dogfood seal"
  fi
fi

echo "→ D1 live HTTP"
BASE="http://127.0.0.1:${PORT}"
body=$(curl -sf --max-time 5 "$BASE/api/thin-desks" || true)
if [ -z "$body" ]; then bad "thin-desks empty body"
else
  printf '%s' "$body" | DEST_ABS="$ABS" EXPECT_SLUGS="${SLUGS:-dogf}" node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const desks=j.desks||[];
      const want=(process.env.EXPECT_SLUGS||'dogf').split(',').filter(Boolean).sort();
      const got=desks.map(x=>String(x.slug||'').toLowerCase()).sort();
      if (got.join(',') !== want.join(',')) { console.error('got',got,'want',want); process.exit(2); }
      const reg=j.registry_path||'';
      const dest=process.env.DEST_ABS||'';
      if (dest && !reg.startsWith(dest)) { console.error('registry',reg,'dest',dest); process.exit(4); }
      if (reg.includes('cockpit-kernel') && !reg.includes('.cockpit-dogfood') && !reg.includes('cockpit-dogfood')) { console.error(reg); process.exit(4); }
      console.log('ok');
    });
  " && ok "live desks = [${SLUGS:-dogf}]" || bad "live desks contract"
fi

PRIMARY=$(echo "${SLUGS:-dogf}" | cut -d, -f1 | tr 'A-Z' 'a-z')
for slug in $(echo "${SLUGS:-dogf}" | tr ',' ' '); do
  slug=$(echo "$slug" | tr 'A-Z' 'a-z')
  code=$(curl -sS -o /tmp/df-house.json -w "%{http_code}" --max-time 5 "$BASE/api/$slug/house" || echo 000)
  if [ "$code" = "200" ]; then ok "GET /api/$slug/house → 200"
  else bad "GET /api/$slug/house → $code"
  fi
done
pipe=$(curl -sf --max-time 15 "$BASE/api/$PRIMARY/pipeline" || true)
echo "$pipe" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    if (!j.available) { console.error('available false', j.reason||j); process.exit(2); }
    console.log('ok');
  });
" && ok "GET /api/$PRIMARY/pipeline catalog" || bad "pipeline catalog"

map=$(curl -sf --max-time 8 -X POST "$BASE/api/$PRIMARY/research/runs" -H 'Content-Type: application/json' -d '{"job":"filing_map"}' || true)
echo "$map" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    if (!j.ok && !j.run_id && !(j.runs||[]).length) { console.error(j); process.exit(2); }
    console.log('ok');
  });
" && ok "POST $PRIMARY filing_map starts (or already in flight)" || bad "filing_map start"
if [ -z "$SLUGS" ]; then
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "$BASE/api/nvda/house" || echo 000)
  if [ "$code" = "404" ]; then ok "GET /api/nvda/house → 404 (kernel desk not in seal)"
  else bad "GET /api/nvda/house → $code"
  fi
else
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "$BASE/api/nbis/house" || echo 000)
  if [ "$code" = "404" ]; then ok "GET /api/nbis/house → 404 (not in 3-desk seal)"
  else bad "GET /api/nbis/house → $code"
  fi
fi

agents=$(curl -sf --max-time 5 "$BASE/api/open-grok/agents?variant=desk" || true)
if printf '%s' "$agents" | grep -q 'filing-map' && printf '%s' "$agents" | grep -q 'background'; then
  ok "desk agents include filing-map + background"
else
  bad "desk agents missing filing-map/learn"
fi

html=$(curl -sf --max-time 5 "$BASE/" || true)
if printf '%s' "$html" | grep -q 'index-'; then ok "SPA served"
else bad "SPA missing"
fi

echo "→ D2 house files"
for slug in $(echo "${SLUGS:-dogf}" | tr ',' ' '); do
  slug=$(echo "$slug" | tr 'A-Z' 'a-z')
  lo="$ABS/research-wiki/house-view-${slug}.md"
  up="$ABS/research-wiki/house-view-$(echo "$slug" | tr 'a-z' 'A-Z').md"
  if [ -f "$lo" ] || [ -f "$up" ]; then
    ok "house file for $slug"
  else
    bad "no house file for $slug"
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  DOGFOOD E2E PASS  ($pass_n checks)                      ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo "  URL: http://127.0.0.1:${PORT}/#/${PRIMARY}/filings"
  echo "  MCP: $MCP_NAME  — kernel operate remains cockpit-research"
  exit 0
else
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  DOGFOOD E2E FAIL  ($fail failed, $pass_n passed)        ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 1
fi
