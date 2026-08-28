#!/usr/bin/env bash
# lab-seal.sh — helpers for sealed multi-instance lab trees (source me).
# Decision-support only. No kernel vault as SoR.
#
# shellcheck shell=bash

lab_seal_die() { echo "lab-seal: $*" >&2; return 1; }

# Refuse using kernel dogfood tree as a lab SoR (contamination).
lab_seal_refuse_kernel_path() {
  local p="${1:-}"
  [ -n "$p" ] || return 0
  local abs
  abs="$(cd "$p" 2>/dev/null && pwd)" || return 0
  if [ -f "$abs/KERNEL.md" ]; then
    local n
    n=$(node -e "try{const j=require('$abs/memory-cockpit-v2/config/thin-desks.json');console.log((j.desks||[]).length)}catch(e){console.log(0)}" 2>/dev/null || echo 0)
    if [ "$n" != "0" ]; then
      echo "lab-seal: REFUSE kernel dogfood path (desks=$n): $abs" >&2
      return 1
    fi
  fi
  # Heuristic: path named cockpit-kernel with non-empty desks
  if echo "$abs" | grep -q 'cockpit-kernel'; then
    n=$(node -e "try{const j=require('$abs/memory-cockpit-v2/config/thin-desks.json');console.log((j.desks||[]).length)}catch(e){console.log(0)}" 2>/dev/null || echo 0)
    if [ "$n" != "0" ]; then
      echo "lab-seal: REFUSE cockpit-kernel with desks=$n: $abs" >&2
      return 1
    fi
  fi
  return 0
}

# Materialize sealed instance dir from product SoR (platform copy, isolated data).
# lab_seal_materialize <product_src> <dest_dir> <instance_id>
lab_seal_materialize() {
  local src="${1:?}" dest="${2:?}" id="${3:?}"
  lab_seal_refuse_kernel_path "$src" || return 1
  rm -rf "$dest"
  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude node_modules \
      --exclude dist \
      --exclude .git \
      --exclude 'ontology/store/by_ticker/*.json' \
      --exclude 'ontology/packs/*.json' \
      --exclude 'research-wiki/raw/*' \
      --exclude 'research-wiki/house-view-*.md' \
      --exclude 'research-wiki/wiki/entities/**' \
      --exclude 'research-wiki/cockpit/street/**' \
      "$src/" "$dest/"
  else
    cp -a "$src/." "$dest/" 2>/dev/null || {
      # minimal
      mkdir -p "$dest/memory-cockpit-v2/config"
      cp -a "$src/memory-cockpit-v2" "$dest/" 2>/dev/null || true
    }
  fi
  # Force isolated empty-then-stamp desks
  local td="$dest/memory-cockpit-v2/config/thin-desks.json"
  mkdir -p "$(dirname "$td")"
  if [ ! -f "$td" ]; then
    printf '%s\n' '{"parity_group":"thin_ontology_v1","write_path_mode":"meta_only","contract_version":"1.1","rooms":["overview","risks","house","sources","street","model","research","reports","update"],"desks":[]}' >"$td"
  fi
  node -e "
    const fs=require('fs');
    const path=require('path');
    const p='$td';
    const id='$id';
    const slug='seal-'+id;
    const ticker=('S'+id).replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,6) || 'SEAL';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    const rawDir='raw/'+slug+'-research';
    j.desks=[{
      slug,
      ticker,
      id: slug,
      label: ticker,
      mark: String(id).slice(0,1),
      house_file: 'house-view-'+slug+'.md',
      name: 'Sealed instance '+id,
      rooms: j.rooms || ['overview','risks','house','sources','street','model','research','reports','update'],
      profile: {
        displayName: 'Sealed instance '+id,
        entitySlug: slug,
        rawDir,
        risksSource: rawDir+'/08-risks-catalysts.md',
        risksGenerated: rawDir+'/risks',
        sourcePrimaryRe: slug,
        stanceExtended: false,
        houseTitleDefault: 'House View — Sealed '+id,
        neverGeneratedNote: 'isolation test desk',
        ask: {
          houseConflictNeedles: [],
          claimRouteNeedles: [],
          claimTopicNeedles: [],
          claimTopicRe: slug,
          sourcePrimaryRe: slug,
          companyQuestionNeedles: ['seal', slug]
        }
      }
    }];
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
  # Isolation marker files (must not appear in sibling instances)
  echo "SEAL_ID=$id" >"$dest/.lab-seal-id"
  echo "unique-payload-$id-$(date +%s)" >"$dest/.lab-seal-payload"
  mkdir -p "$dest/research-wiki/raw/seal-${id}-research/risks"
  echo "vault-marker-$id" >"$dest/research-wiki/raw/.lab-isolation-marker-$id"
  # Minimal vault stubs so glass does not explode on missing paths
  : >"$dest/research-wiki/house-view-seal-${id}.md"
  echo "# risks" >"$dest/research-wiki/raw/seal-${id}-research/08-risks-catalysts.md"
  return 0
}

lab_seal_read_slug() {
  local dest="${1:?}"
  node -e "const j=require('$dest/memory-cockpit-v2/config/thin-desks.json');console.log((j.desks[0]&&j.desks[0].slug)||'')"
}

lab_seal_has_payload() {
  local dest="${1:?}" id="${2:?}"
  [ -f "$dest/.lab-seal-payload" ] && grep -q "unique-payload-$id" "$dest/.lab-seal-payload" 2>/dev/null
}

lab_seal_has_foreign_marker() {
  local dest="${1:?}" foreign_id="${2:?}"
  [ -f "$dest/research-wiki/raw/.lab-isolation-marker-$foreign_id" ]
}
