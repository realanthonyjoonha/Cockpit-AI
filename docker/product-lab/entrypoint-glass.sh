#!/usr/bin/env bash
# Long-run blank product glass for multi-instance eng use.
set -euo pipefail

PRODUCT="${COCKPIT_PRODUCT:-/work/product}"
WORKDIR="${LAB_WORKDIR:-/tmp/lab-product}"
export PORT="${LAB_PORT:-4690}"
export HOST="${HOST:-0.0.0.0}"

# shellcheck disable=SC1091
source /guards.sh "$PRODUCT"

if [ ! -d "$WORKDIR/memory-cockpit-v2/node_modules" ]; then
  echo "→ first-time materialize + npm install"
  rm -rf "$WORKDIR"
  mkdir -p "$WORKDIR"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude node_modules --exclude dist --exclude .git "$PRODUCT/" "$WORKDIR/"
  else
    cp -a "$PRODUCT/." "$WORKDIR/"
  fi
  node -e "
    const fs=require('fs');
    const p='$WORKDIR/memory-cockpit-v2/config/thin-desks.json';
    if(fs.existsSync(p)){const j=JSON.parse(fs.readFileSync(p,'utf8'));j.desks=[];fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');}
  "
  cd "$WORKDIR/memory-cockpit-v2"
  npm install
  npm run build || true
else
  cd "$WORKDIR/memory-cockpit-v2"
fi

export COCKPIT_REPO="$WORKDIR"
export COCKPIT_VAULT="$WORKDIR/research-wiki"
export ONTOLOGY_WIKI="$COCKPIT_VAULT"
export ONTOLOGY_STORE="$WORKDIR/ontology/store/by_ticker"
export COCKPIT_ENV_QUIET=1

if [ ! -f dist/index.html ]; then
  npm run build || npm install && npm run build
fi

echo "Lab glass → http://127.0.0.1:${PORT}/#/start  (START only, desks=[])"
echo "Ctrl-C to stop."
exec npm start
