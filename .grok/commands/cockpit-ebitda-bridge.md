---
description: Revenue→EBITDA bridge from pack + user assumptions; no PT; optional save+compile
argument-hint: "[desk] [optional assumptions or period]"
---

Parse `$ARGUMENTS`: **desk** (slug/ticker) + optional period focus or assumptions notes.  
If desk missing, `list_desks` then ask once.

**Job:** Build a **simple EBITDA bridge** (reported and/or adjusted) for this desk: revenue → gross profit (if known) → opex sketch → **EBITDA** / **adj. EBITDA**, using **pack facts** and **user-supplied** lines. Decision-support only — not a multiple call or price target.

## Hard rules

1. Decision-support only — **no buy/sell/hold**, **no PT**, no sizing, no “cheap on EBITDA.”  
2. **Never invent** revenue, margins, or EBITDA — pack grades or user paste only; else **GAP**.  
3. Keep **GAAP / reported** separate from **adjusted**; never invent adjustments.  
4. Soft press → **[soft]**.  
5. If critical lines missing, **ask once** (or accept pack-only + GAP).  
6. **Never save** until user clearly says yes after reading the bridge.  
7. Never write house/risks/store except note path + compile below.

## Efficiency

- Book: `get_pack_snapshot` + `get_house_view` (≤2).  
- Search only if user asks for a primary figure (≤2).  
- Cap ≤8 tools (+ write + compile if save).

## Steps

### A — Load book

1. Resolve desk.  
2. Pack claims relevant to P&L (revenue, GM, op income, FCF if any) + grades/as_of.  
3. House stance + WATCH risks that hit margins/demand.  
4. State what is **missing** for an EBITDA bridge.

### B — Inputs

Need at least a path through revenue → EBITDA. Collect or confirm:

| Input | Source |
|-------|--------|
| Period (e.g. Q1 FY27, FY26) | user or pack as_of |
| Revenue | pack preferred |
| COGS / GM% | pack or user |
| OpEx buckets (R&D, S&M, G&A) if used | user or GAP |
| D&A (if bridging EBIT → EBITDA) | user or GAP |
| Adjustment list for adj. EBITDA | **user only** — never invent |

User may say “pack-only + GAP.”

### C — EBITDA bridge (chat)

1. **Header** — desk, period, house status, pack compiled_at.  
2. **Reported bridge** (label units; simplified is OK):

```text
Revenue
− COGS                    → Gross profit (or GAP)
− OpEx (sketch)           → EBIT / operating income (or GAP)
+ D&A (if known)          → EBITDA (or GAP)
```

3. **Adjusted bridge** (only if user gave adjustments):

```text
EBITDA (reported or GAP)
± User adjustments (each line sourced)
→ Adj. EBITDA
```

4. **Margin illustration** — EBITDA / rev % if both present; else GAP.  
5. **Optional sensitivity** (rev ±X% × margin ±Y pts) — caption: *illustration only, not a target*.  
6. **Map to book** — which WATCH risks break which lines (demand, GM, opex, mix).  
7. **GAPs**  
8. **Not in this note** — EV/EBITDA as advice, PT, buy/sell, invented adj.

### D — Offer save

> Save this EBITDA-bridge note for **{DESK}** and compile for Sources? (yes / save without compile / no)

### E — On yes

```text
research-wiki/raw/{slug}-research/ebitda-bridge-YYYY-MM-DD-HHMM.md
```

Frontmatter: `type: ebitda-bridge-note`, desk, ticker, as_of, period, `decision_support_only: true`.

Then:

```bash
export COCKPIT_REPO="<monorepo root>"
export COCKPIT_VAULT="$COCKPIT_REPO/research-wiki"
export ONTOLOGY_WIKI="$COCKPIT_VAULT"
export ONTOLOGY_STORE="$COCKPIT_REPO/ontology/store/by_ticker"
cd "$COCKPIT_REPO/ontology" && ./ont compile TICKER
```

Report path + compile + `#/{slug}/sources`.

## Vs other agents

| Agent | When |
|-------|------|
| `/cockpit-model-bridge` | Broader FCF / WACC framework |
| `/cockpit-ebitda-quality` | Adj. quality / one-time audit |
| `/cockpit-ebitda-bridge` | P&L → EBITDA focus |

Footer: decision-support only; illustration ≠ target.
