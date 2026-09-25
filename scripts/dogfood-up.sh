#!/usr/bin/env bash
# dogfood-up.sh — sealed testing cockpit: unique PORT + unique MCP name + fixture desk DOGF.
# Does not touch kernel :4682, product :4681, or cockpit-vault.
# Decision-support only. Does not push.
#
# Usage:
#   ./scripts/dogfood-up.sh
#   ./scripts/dogfood-up.sh --port 4695 --dir "$PWD/.cockpit-dogfood"
#   ./scripts/dogfood-up.sh --no-glass
#   ./scripts/dogfood-up.sh --slugs nvda,mu,lly   # real desks from vault → seal only
#   COCKPIT_MCP_NAME=cockpit-research-dogfood ./scripts/dogfood-up.sh
#
# Defaults (Cursor / any clone): --from = this repo, --dir = $ROOT/.cockpit-dogfood
set -euo pipefail
# bash only — zsh's `path` array is tied to PATH and would clobber the environment if sourced.
[ -n "${BASH_VERSION:-}" ] || { echo "error: bash required (not zsh)" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/dogfood-paths.sh"
PRODUCT="${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}"
DEST="$(dogfood_default_dest "$ROOT")"
PORT="${DOGFOOD_PORT:-4695}"
MCP_NAME="${COCKPIT_MCP_NAME:-cockpit-research-dogfood}"
NO_GLASS=0
FROM="$ROOT"
SLUGS="${COCKPIT_DOGFOOD_SLUGS:-}"

usage() { sed -n '2,14p' "$0"; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DEST="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --from) FROM="${2:?}"; shift 2 ;;
    --mcp-name) MCP_NAME="${2:?}"; shift 2 ;;
    --slugs) SLUGS="${2:?}"; shift 2 ;;
    --no-glass) NO_GLASS=1; shift ;;
    -h|--help) usage ;;
    *) echo "unknown: $1" >&2; exit 1 ;;
  esac
done

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "error: port must be numeric" >&2
  exit 1
fi
for busy in 4681 4682 4683; do
  if [ "$PORT" = "$busy" ]; then
    echo "error: port $PORT is reserved (product/kernel/personal). Use 4695+." >&2
    exit 1
  fi
done
if [ -z "$MCP_NAME" ] || [ "$MCP_NAME" = "cockpit-research" ]; then
  echo "error: testing cockpit MCP name must not be cockpit-research (got '${MCP_NAME:-empty}')" >&2
  exit 1
fi

FROM="$(cd "$FROM" 2>/dev/null && pwd || echo "$FROM")"
if [ ! -d "$FROM/memory-cockpit-v2" ]; then
  echo "error: --from must be a Cockpit monorepo (got $FROM)" >&2
  exit 1
fi

if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  :
else
  mkdir -p "$(dirname "$DEST")"
  mkdir -p "$DEST"
fi
DEST="$(cd "$DEST" && pwd)"
KERNEL_ABS="$(cd "$ROOT" 2>/dev/null && pwd -P)"
PRODUCT_ABS="$(cd "$PRODUCT" 2>/dev/null && pwd -P || true)"
ROOT_PHYS="$(cd "$ROOT" && pwd -P)"
if is_live_tree "$DEST"; then
  echo "error: dest must not be kernel, product, vault, or personal ($DEST)" >&2
  exit 1
fi
# This clone is always a valid --from (Cursor / product / kernel platform).
# Refuse only foreign live vaults. rsync excludes research-wiki.
if is_live_tree "$FROM"; then
  from_phys="$(cd "$FROM" && pwd -P)"
  product_phys="$(cd "$PRODUCT" 2>/dev/null && pwd -P || true)"
  if [ "$from_phys" = "$ROOT_PHYS" ]; then
    :
  elif [ -n "$product_phys" ] && [ "$from_phys" = "$product_phys" ]; then
    :
  else
    echo "error: --from is a foreign live vault/personal tree (would copy books)." >&2
    exit 1
  fi
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  DOGFOOD UP — testing cockpit (MCP isolated)             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  from:     $FROM"
echo "  dest:     $DEST"
echo "  port:     $PORT"
echo "  mcp name: $MCP_NAME"
echo

echo "→ materialize platform (no books)"
# Exclude live vault + any moved kernel vault archive. --safe-links skips
# symlinks that would point outside dest (kernel research-wiki → cockpit-vault).
if command -v rsync >/dev/null 2>&1; then
  rsync -a --safe-links \
    --exclude node_modules \
    --exclude .git \
    --exclude .grok/config.toml \
    --exclude 'ontology/packs/*.json' \
    --exclude 'ontology/store/by_ticker/*.json' \
    --exclude research-wiki \
    --exclude 'research-wiki/**' \
    --exclude 'research-wiki.moved*' \
    --exclude 'research-wiki.*' \
    "$FROM/" "$DEST/"
else
  echo "error: rsync required" >&2
  exit 1
fi

rm -rf "$DEST/research-wiki"
find "$DEST" -maxdepth 1 \( -name 'research-wiki.moved*' -o -name 'research-wiki.*' \) -exec rm -rf {} +
mkdir -p "$DEST/research-wiki"
if [ -L "$DEST/research-wiki" ]; then
  echo "error: dest research-wiki is a symlink after materialize (vault leak)" >&2
  exit 1
fi
# Glass imports research-wiki/cockpit/lib/fm.js (platform parser, not a book).
# rsync excludes the wiki so we copy only *.js from lib (ok through a kernel symlink).
LIBSRC=""
if [ -f "$FROM/research-wiki/cockpit/lib/fm.js" ]; then
  LIBSRC="$FROM/research-wiki/cockpit/lib"
elif [ -f "$ROOT/research-wiki/cockpit/lib/fm.js" ]; then
  LIBSRC="$ROOT/research-wiki/cockpit/lib"
fi
if [ -z "$LIBSRC" ]; then
  vault_src="$(dogfood_resolve_vault "$ROOT" || true)"
  if [ -n "$vault_src" ] && [ -f "$vault_src/cockpit/lib/fm.js" ]; then
    LIBSRC="$vault_src/cockpit/lib"
  fi
fi
if [ -n "$LIBSRC" ]; then
  mkdir -p "$DEST/research-wiki/cockpit/lib"
  cp "$LIBSRC"/*.js "$DEST/research-wiki/cockpit/lib/"
fi
if [ ! -f "$DEST/research-wiki/cockpit/lib/fm.js" ]; then
  echo "error: dest missing cockpit/lib/fm.js (platform parser). Tracked on product as research-wiki/cockpit/lib/." >&2
  exit 1
fi

if [ ! -d "$FROM/memory-cockpit-v2/node_modules/express" ]; then
  echo "→ npm install in --from (Cursor/fresh clone)"
  (cd "$FROM/memory-cockpit-v2" && npm install)
fi
if [ -d "$FROM/memory-cockpit-v2/node_modules" ]; then
  rm -rf "$DEST/memory-cockpit-v2/node_modules"
  ln -sfn "$FROM/memory-cockpit-v2/node_modules" "$DEST/memory-cockpit-v2/node_modules"
fi

ABS="$DEST"
SLUGS_CSV="dogf"
if [ -n "$SLUGS" ]; then
  echo "→ seed desks from vault ($SLUGS) — seal only, not product"
  VAULT_SRC="$(dogfood_resolve_vault "$ROOT" || true)"
  if [ -z "$VAULT_SRC" ] || [ ! -d "$VAULT_SRC" ]; then
    echo "error: --slugs needs a vault (COCKPIT_VAULT, /home/ubuntu/cockpit-vault, or ~/Desktop/cockpit-vault). Not copying books into git." >&2
    exit 1
  fi
  echo "  vault src: $VAULT_SRC"
  REG="$ROOT/memory-cockpit-v2/config/thin-desks.json"
  node "$ROOT/memory-cockpit-v2/scripts/dogfood-seed-desks.mjs" \
    --root "$DEST" --slugs "$SLUGS" --registry "$REG" --vault "$VAULT_SRC" --ontology "$ROOT/ontology"
  SLUGS_CSV=$(echo "$SLUGS" | tr 'A-Z' 'a-z' | tr -d ' ')
else
  echo "→ inject fixture desk DOGF"
  node "$ROOT/memory-cockpit-v2/scripts/dogfood-fixture.mjs" --root "$DEST"
  SLUGS_CSV="dogf"
fi
ALLOWED_JSON=$(node -e "console.log(JSON.stringify(String(process.argv[1]).split(',').map(s=>s.trim()).filter(Boolean)))" "$SLUGS_CSV")

cat > "$ABS/.cockpit-scenario.json" <<EOF
{
  "name": "dogfood",
  "expect_root": "$ABS",
  "allowed_slugs": $ALLOWED_JSON,
  "port": $PORT,
  "mcp_name": "$MCP_NAME",
  "agent_accept": true,
  "mode": "testing-cockpit"
}
EOF

export COCKPIT_MCP_NAME="$MCP_NAME"
export COCKPIT_VAULT="$ABS/research-wiki"
export ONTOLOGY_STORE="$ABS/ontology/store/by_ticker"
export ONTOLOGY_ROOT="$ABS/ontology"
export COCKPIT_EXPECT_ROOT="$ABS"
export COCKPIT_ALLOWED_SLUGS="$SLUGS_CSV"
export COCKPIT_SCENARIO_NAME="dogfood"
export COCKPIT_AGENT_ACCEPT="1"

echo "→ project MCP pin ($MCP_NAME) — does not overwrite cockpit-research"
cp "$ROOT/memory-cockpit-v2/server/cockpitMcpProject.js" "$ABS/memory-cockpit-v2/server/cockpitMcpProject.js"
cp "$ROOT/memory-cockpit-v2/server/mcpPinGuard.js" "$ABS/memory-cockpit-v2/server/mcpPinGuard.js"
cp "$ROOT/memory-cockpit-v2/server/secEdgar.js" "$ABS/memory-cockpit-v2/server/secEdgar.js"
cp "$ROOT/memory-cockpit-v2/scripts/dogfood-fixture.mjs" "$ABS/memory-cockpit-v2/scripts/dogfood-fixture.mjs"
if [ ! -f "$ABS/memory-cockpit-v2/scripts/mcp-cockpit-research.mjs" ]; then
  cp "$ROOT/memory-cockpit-v2/scripts/mcp-cockpit-research.mjs" "$ABS/memory-cockpit-v2/scripts/mcp-cockpit-research.mjs"
fi
if [ ! -e "$ABS/memory-cockpit-v2/node_modules/express" ]; then
  echo "→ npm install in dest"
  (cd "$ABS/memory-cockpit-v2" && npm install)
fi
if [ ! -f "$ABS/memory-cockpit-v2/dist/index.html" ]; then
  echo "→ npm run build in dest (clone has no dist)"
  (cd "$ABS/memory-cockpit-v2" && npm run build)
fi
if [ ! -f "$ABS/memory-cockpit-v2/dist/index.html" ]; then
  echo "error: dest missing dist/index.html after build" >&2
  exit 1
fi
if [ ! -e "$ABS/memory-cockpit-v2/node_modules/express" ]; then
  echo "error: dest missing node_modules (express)" >&2
  exit 1
fi
PIN_JS="$ROOT/memory-cockpit-v2/scripts/write-dogfood-pin.mjs"
if [ ! -f "$PIN_JS" ]; then
  echo "error: missing $PIN_JS" >&2
  exit 1
fi
node "$PIN_JS" --root "$ABS" --name "$MCP_NAME"

PID=""
dogfood_desks_ok() {
  DEST_ABS="$ABS" EXPECT_SLUGS="$SLUGS_CSV" curl -sf --max-time 2 "http://127.0.0.1:${PORT}/api/thin-desks" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const desks=j.desks||[];
      const want=(process.env.EXPECT_SLUGS||'dogf').split(',').filter(Boolean);
      const got=desks.map(x=>String(x.slug||'').toLowerCase()).sort();
      if (got.join(',') !== want.slice().sort().join(',')) process.exit(2);
      const dest=process.env.DEST_ABS||'';
      const reg=j.registry_path||'';
      if (dest && !reg.startsWith(dest)) process.exit(3);
    });
  " >/dev/null 2>&1
}
if [ "$NO_GLASS" -eq 0 ]; then
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    if dogfood_desks_ok; then
      echo "  · port $PORT already listening — reuse (desks=[dogf])"
    else
      echo "error: port $PORT is in use by a non-dogfood process" >&2
      exit 1
    fi
  else
    echo "→ start glass :$PORT"
    (
      cd "$ABS/memory-cockpit-v2"
      export COCKPIT_REPO="$ABS" COCKPIT_VAULT="$ABS/research-wiki"
      export ONTOLOGY_WIKI="$COCKPIT_VAULT" ONTOLOGY_STORE="$ABS/ontology/store/by_ticker"
      export ONTOLOGY_ROOT="$ABS/ontology" PORT="$PORT" HOST=127.0.0.1 COCKPIT_ENV_QUIET=1
      export COCKPIT_MCP_NAME="$MCP_NAME"
      export COCKPIT_EXPECT_ROOT="$ABS"
      export COCKPIT_ALLOWED_SLUGS="$SLUGS_CSV"
      export COCKPIT_SCENARIO_NAME="dogfood"
      export COCKPIT_AGENT_ACCEPT="1"
      exec node server/index.js
    ) >"$ABS/.cockpit-dogfood-glass.log" 2>&1 &
    PID=$!
    echo "  pid $PID"
    ready=0
    for i in $(seq 1 40); do
      if curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:${PORT}/api/thin-desks"; then
        ready=1
        break
      fi
      sleep 0.25
    done
    if [ "$ready" -ne 1 ]; then
      echo "error: glass did not become ready on :$PORT" >&2
      tail -30 "$ABS/.cockpit-dogfood-glass.log" >&2 || true
      kill "$PID" 2>/dev/null || true
      exit 1
    fi
  fi
fi

cat > "$ABS/.cockpit-dogfood.json" <<EOF
{
  "mode": "testing-cockpit",
  "dir": "$ABS",
  "port": $PORT,
  "mcp_name": "$MCP_NAME",
  "slugs": $ALLOWED_JSON,
  "slug": "$(echo "$SLUGS_CSV" | cut -d, -f1)",
  "ticker": "$(echo "$SLUGS_CSV" | cut -d, -f1 | tr 'a-z' 'A-Z')",
  "pid": ${PID:-null},
  "kernel": "$KERNEL_ABS",
  "product": "$PRODUCT_ABS"
}
EOF

echo
echo "  URL:      http://127.0.0.1:${PORT}/#/$(echo "$SLUGS_CSV" | cut -d, -f1)/filings"
echo "  MCP name: $MCP_NAME  (kernel operate stays cockpit-research)"
echo "  Agent:    ./scripts/dogfood-e2e.sh   (Cursor: see docs/CURSOR-E2E.md)"
echo "  Down:     ./scripts/dogfood-down.sh"
echo "  Isolation: this vault is $ABS/research-wiki — not cockpit-vault"
echo
