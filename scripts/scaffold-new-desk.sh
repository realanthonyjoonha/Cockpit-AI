#!/usr/bin/env bash
# scaffold-new-desk.sh — create EMPTY structure for a new company desk (no invented research).
#
#   ./scripts/scaffold-new-desk.sh TICKER [slug] [Display Name]
#   ./scripts/scaffold-new-desk.sh NVDA
#   ./scripts/scaffold-new-desk.sh NVDA nvda "NVIDIA Corporation"
#
# Creates vault folders, minimal FORMING house stub, empty risks SoR skeleton,
# pack config, and thin-desks.json row. Does NOT invent claims or WATCH risks.
# Does NOT write ontology/store (compile when you have real content).
# User still owns house CONFIRM and risk ACCEPT.
#
# Run inside cockpit-kernel (or any monorepo root). Restart glass after.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TICKER_IN="${1:-}"
if [ -z "$TICKER_IN" ]; then
  echo "Usage: $0 TICKER [slug] [Display Name]"
  echo "  TICKER  e.g. NVDA"
  echo "  slug    optional kebab id (default: lowercased ticker)"
  echo "  name    optional display name (default: ticker)"
  exit 1
fi

TICKER="$(echo "$TICKER_IN" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9.-')"
SLUG_IN="${2:-}"
if [ -n "$SLUG_IN" ]; then
  SLUG="$(echo "$SLUG_IN" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
else
  SLUG="$(echo "$TICKER" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
fi
NAME="${3:-$TICKER}"
LABEL="$(echo "$TICKER" | tr '[:lower:]' '[:upper:]')"
MARK="$(echo "$TICKER" | cut -c1)"
HOUSE="house-view-${SLUG}.md"
RAW="raw/${SLUG}-research"
RISKS_SRC="${RAW}/08-risks-catalysts.md"
RISKS_GEN="${RAW}/risks"
ENTITY="wiki/entities/${SLUG}.md"
TODAY="$(date -u +%Y-%m-%d)"

echo "Scaffold new desk (empty — no invented research)"
echo "  ROOT    $ROOT"
echo "  TICKER  $TICKER"
echo "  slug    $SLUG"
echo "  name    $NAME"

if [ ! -d "$ROOT/research-wiki" ] || [ ! -d "$ROOT/memory-cockpit-v2" ]; then
  echo "error: run from a cockpit monorepo/kernel root"
  exit 1
fi

REG="$ROOT/memory-cockpit-v2/config/thin-desks.json"
if [ ! -f "$REG" ]; then
  echo "error: missing $REG"
  exit 1
fi

if python3 -c "import json; d=json.load(open('$REG')); exit(0 if any(x.get('slug')=='$SLUG' or x.get('ticker')=='$TICKER' for x in d.get('desks',[])) else 1)"; then
  echo "error: desk already registered (slug=$SLUG or ticker=$TICKER)"
  exit 1
fi

# --- vault structure ---
mkdir -p "$ROOT/research-wiki/${RAW}/risks" \
  "$ROOT/research-wiki/wiki/entities" \
  "$ROOT/research-wiki/wiki/sources" \
  "$ROOT/ontology/packs" \
  "$ROOT/ontology/store/by_ticker"

# House stub — FORMING only, no thesis
if [ ! -f "$ROOT/research-wiki/$HOUSE" ]; then
  cat > "$ROOT/research-wiki/$HOUSE" <<EOF
---
type: house-view
scope: single-name
entity: "$NAME"
ticker: $TICKER
updated: $TODAY
status: FORMING
owner: "Anthony — FORMING; not CONFIRMED. Edit only on explicit save / glass ACCEPT."
governance: |
  USER-OWNED, SAVE-ON-COMMAND.
  Decision-support only: no buy/sell/hold, no price target, no position sizing.
  Scaffold only — fill stance and body after real research. Never invent.
---

# House View — $NAME ($TICKER) · **FORMING**

> **FORMING** — not CONFIRMED. Decision-support only. No buy/sell/PT/sizing.

---

**Stance:** (edit after research — do not invent)

Scaffold created $TODAY. Replace this body with your underwriting. Agents may propose; you ACCEPT.

## Acceptance log

| Date | Status |
|------|--------|
| $TODAY | Scaffold only — FORMING |
EOF
  echo "  + $HOUSE (FORMING stub)"
else
  echo "  · $HOUSE exists (left unchanged)"
fi

# Risks SoR skeleton — no Rn invented
if [ ! -f "$ROOT/research-wiki/$RISKS_SRC" ]; then
  cat > "$ROOT/research-wiki/$RISKS_SRC" <<EOF
# Risks & catalysts — $NAME ($TICKER)

**Scaffold only.** Add \`### Rn — Title\` under section A after research.  
Status/Grade required. Tripwire tables optional until filled.  
Insert new risks **before** \`## B)\`. Decision-support only.

## A) Risks (register)

<!-- Add risks as:
### R1 — Title
- **Status:** INTACT|WATCH|FIRED · **Grade:** [A|B|C] · …
-->

## B) Catalysts

<!-- Optional catalysts after risks -->
EOF
  echo "  + $RISKS_SRC (empty section A)"
else
  echo "  · $RISKS_SRC exists (left unchanged)"
fi

touch "$ROOT/research-wiki/${RISKS_GEN}/.gitkeep"

# Entity stub — key facts heading, zero invented claims
if [ ! -f "$ROOT/research-wiki/$ENTITY" ]; then
  cat > "$ROOT/research-wiki/$ENTITY" <<EOF
# $NAME ($TICKER)

Scaffold entity. Add graded claims under the heading below after research.

## Key facts (timestamped · graded · sourced)

<!-- Each claim:
- fact text (YYYY-MM-DD) [A|B|C] [[source-slug]]
-->
EOF
  echo "  + $ENTITY (no claims yet)"
else
  echo "  · $ENTITY exists (left unchanged)"
fi

# Pack config (structure only — compile when claims/risks exist)
PACK="$ROOT/ontology/packs/${TICKER}.json"
if [ ! -f "$PACK" ]; then
  python3 - <<PY
import json
from pathlib import Path
pack = {
  "focus_id": "$SLUG",
  "ticker": "$TICKER",
  "entity_slug": "$SLUG",
  "aliases": ["$NAME", "$TICKER"],
  "themes": [],
  "house_view_path": "$HOUSE",
  "house_view_play_match": "$NAME",
  "series_allowlist": [],
  "risks_dir": "$RISKS_GEN",
  "risks_source": "$RISKS_SRC",
  "source_globs": [
    "$RAW/*.md",
    "wiki/entities/${SLUG}.md",
  ],
  "source_roots": ["$RAW"],
  "sources": [],
}
Path("$PACK").write_text(json.dumps(pack, indent=2) + "\n")
print("  + ontology/packs/${TICKER}.json")
PY
else
  echo "  · packs/${TICKER}.json exists (left unchanged)"
fi

# thin-desks.json row
python3 - <<PY
import json
from pathlib import Path

reg_path = Path("$REG")
reg = json.loads(reg_path.read_text())
slug, ticker = "$SLUG", "$TICKER"
name, label, mark = "$NAME", "$LABEL", "$MARK"
house, raw, rs, rg = "$HOUSE", "$RAW", "$RISKS_SRC", "$RISKS_GEN"

desk = {
  "slug": slug,
  "ticker": ticker,
  "id": slug,
  "label": label,
  "mark": mark,
  "house_file": house,
  "profile": {
    "displayName": name,
    "entitySlug": slug,
    "rawDir": raw,
    "risksSource": rs,
    "risksGenerated": rg,
    "sourcePrimaryRe": f"{slug}|{ticker.lower()}",
    "stanceExtended": False,
    "houseTitleDefault": f"House View — {name} ({ticker})",
    "neverGeneratedNote": f"SoR is {rs} (not generated risks/*.md)",
    "ask": {
      "houseConflictNeedles": ["sca", "backlog", "earnings"],
      "claimRouteNeedles": [],
      "claimTopicNeedles": [],
      "claimTopicRe": slug,
      "sourcePrimaryRe": f"{slug}|{ticker.lower()}",
      "companyQuestionNeedles": [
        f"what is {name.lower()}",
        f"who is {name.lower()}",
        "company",
        "summary",
        f"what is {ticker.lower()}",
      ],
    },
  },
}
desks = [d for d in (reg.get("desks") or []) if d.get("slug") != slug]
desks.append(desk)
reg["desks"] = desks
reg_path.write_text(json.dumps(reg, indent=2) + "\n")
print(f"  + thin-desks.json row slug={slug}")
PY

# log
LOG="$ROOT/research-wiki/wiki/log.md"
if [ -f "$LOG" ]; then
  echo "- $TODAY · scaffold desk $TICKER ($SLUG) — FORMING, no invented claims" >> "$LOG"
fi

cat <<EOF

=== scaffold done (empty — no invented research) ===

Files:
  research-wiki/$HOUSE
  research-wiki/$RISKS_SRC
  research-wiki/$ENTITY
  ontology/packs/${TICKER}.json
  memory-cockpit-v2/config/thin-desks.json  (+ $SLUG)

Canonical glass URL (slug = lowercased ticker):
  http://127.0.0.1:4682/#/${SLUG}/overview
  http://127.0.0.1:4682/#/${SLUG}/house

Live registry: glass reloads thin-desks.json on change — no rebuild/restart required
for the desk to appear (GET /api/thin-desks). Optional aliases in thin-desks.json
map friendly names (e.g. tsmc → tsm).

Next (you + agents; you gate the book):
  1. Research into research-wiki/${RAW}/ and entity claims
  2. Fill house stance; CONFIRM only when ready
  3. Add ### Rn risks under section A in 08-risks-catalysts.md
  4. cd ontology && ./ont compile ${TICKER} && ./ont verify ${TICKER}
  5. Open #/${SLUG}/… (not a random spelling of the company name)

Decision-support only. No buy/sell/PT/sizing.
EOF
