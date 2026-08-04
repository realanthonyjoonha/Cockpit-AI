---
description: Peer comps table from user peers/metrics + pack; optional save+compile
argument-hint: "[desk] [optional peers or paste]"
---

Parse `$ARGUMENTS`: **desk** (slug/ticker) + optional peer list or notes.  
If desk missing, `list_desks` then ask once.

**Job:** Build a **comparable companies** style note for this desk. User supplies peers and/or metrics; pack grounds the subject company. **Descriptive only** — not valuation advice.

## Hard rules

1. Decision-support only — no buy/sell/hold, **no price target**, no sizing, no “cheap/expensive” as advice.  
2. Do **not invent** peer EV, shares, multiples, or market share — use pack, filings, or **user-pasted** numbers; else **GAP**.  
3. Soft press → **[soft]**.  
4. Load pack+house first. If no peers/metrics in args, **ask once** before building the table.  
5. **Never save** until user clearly says yes after reading the comps note.  
6. Never write house/risks/store except save path + compile below.

## Efficiency

- Book: `get_pack_snapshot` + `get_house_view` (≤2).  
- Search ≤4 after peers known (for primary filings only if needed).  
- Cap ≤10 tools (+ write + compile if save).

## Steps

### A — Book context
1. Resolve desk.  
2. Pack + house snapshot.  
3. List subject-company metrics available from pack (with grades/as_of).

### B — User inputs required
Need at least one of:
- Peer tickers/names, and/or  
- Pasted metrics table  

If missing: ask. Do not invent a peer set.

### C — Comps note (chat)
1. **Subject company** metrics from pack (GAP if thin).  
2. **Peer table** — only rows with sourced or user-provided data.  
3. **Dispersion / observations** — factual, not recommendations.  
4. **Map to book** — concentration, competition risks, house levers.  
5. **GAPs** — missing peers, missing multiples, no Bloomberg.  
6. **Not in this note** — PT, sizing, buy/sell.

### D — Offer save
> Save this comps note for **{DESK}** and compile for Sources? (yes / save without compile / no)

### E — On yes
Write:

```text
research-wiki/raw/{slug}-research/comps-YYYY-MM-DD-HHMM.md
```

Then `./ont compile TICKER` (same env pattern as Research).  
Report path + compile result + `#/{slug}/sources`.

## Vs other agents
| Agent | When |
|-------|------|
| `/cockpit-research` | Free-form question |
| `/cockpit-coverage` | Full coverage skeleton |
| `/cockpit-comps` | Peer table focus |
| `/cockpit-model-bridge` | FCF/assumptions bridge |

Footer: decision-support only.
