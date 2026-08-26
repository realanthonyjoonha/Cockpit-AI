---
description: Research runs agent — on-demand deep compile archive (not live pack/house)
argument-hint: "[desk] [pipeline|chat] [run_id?]"
---

Parse `$ARGUMENTS`:

1. **desk** — slug or ticker  
2. **mode** — `pipeline` | `chat` (default chat; glass NEW COMPILE uses pipeline)  
3. **run_id** — optional; glass usually creates it first  

If desk missing, `list_desks` then ask once.

## Seed (mandatory)

```bash
DESK="<desk>"
cat "/tmp/cockpit-research-${DESK}-seed.md" 2>/dev/null
cat "${TMPDIR:-/tmp}/cockpit-research-${DESK}-seed.md" 2>/dev/null
```

## Product law

1. Decision-support only — no buy/sell/hold, no PT/fair value as advice, no sizing.  
2. Research run = **draft archive** under `cockpit/research/{TICKER}/runs/{run_id}/` — **not** live pack/house.  
3. Never invent — graded claims or **GAP**. Soft press → `[soft]`.  
4. **Write scope:** only that run folder via `POST /api/{slug}/research/runs/{run_id}/publish`.  
5. Never write house, risks SoR, `ontology/store/`, model `user_case` / print, or Street.  
6. Never COMPILE BOOK unless user explicitly asks **promote** after.  
7. Complete runs are **immutable** — new work = new run_id.  
8. Print Card arm/lock stays **human-only** on Model.

## Pipeline mode

1. Use **run_id** from seed/args (glass starts `queued` until worker attach).  
2. Job: `deep_compile` | `print_package` | `pack_refresh` from seed.  
3. Research public filings/IR (primary first). Fetch via `POST /api/{slug}/research/runs/{run_id}/acquire` — timeout; 403 → GAP; files in `acquired/` only (never `cockpit/compile/`).  
4. Build: summary.md (plain L0/L1), sources (url or accession), gaps, extracts. Financials/guide need `source_ids` + an **excerpt** that appears in `acquired/`. Grade A only if that excerpt hit an acquired primary. Do not copy prior-run numbers as A without a new fetch.  
5. Critic pass: contradictions / overclaim → fix or GAP.  
6. Publish complete body (schema v1).  
7. Report path, counts, promote options only.

### deep_compile bar
- Prefer primary 10-K/10-Q/8-K  
- Multiple graded claim lines with as_of + sources  
- Risk candidates as claims (not silent SoR write)  
- Honest gaps (estimates, FCF, etc.)

## Chat mode

Brief runs + follow user (re-read, promote discussion, re-run). No silent book writes.

## Promote (only if user asks)

| Target | How |
|--------|-----|
| Pack | entity/sources then `./ont compile` + verify — user CONFIRM |
| House | propose → glass ACCEPT |
| Risks | propose → glass ACCEPT |
| Model pack layers | pack_actual/guide only; never locked user_case |

## Footer

Draft archive · not live book · decision-support only.
