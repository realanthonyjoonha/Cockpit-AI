---
description: General research for an existing desk — pack/house ground + open investigation
argument-hint: "[desk] [optional focus]"
---

Parse `$ARGUMENTS`: **desk** (slug/ticker) + optional free-text **focus** (topic/question).  
If desk missing, `list_desks` then ask once. If focus missing, use default investigation axes (below).

**Job:** General-purpose research for **this ticker desk** — broader than steelman, not limited to 24h tape like daily.  
Ground in the book first, then primary-first external evidence. **Not** new-desk underwrite (use `/cockpit-new-desk` if desk missing).

## Efficiency

- MCP: `list_desks` if needed, then `get_pack_snapshot` + `get_house_view` (≤2 book calls).  
- Web search ≤4–6 (filings, IR, reputable press).  
- Total ≤8 tools unless user asks to go deep.  
- Decision-support only.

## Hard rules

1. No buy/sell/hold, price targets, or position sizing.  
2. Do **not** invent graded pack claims or WATCH titles — copy from pack.  
3. Soft secondary press → **[soft]**. Missing → **GAP**.  
4. Do **not** write house, risks SoR, or `ontology/store/` unless user explicitly asks to **propose** (then use propose tools only).  
5. Default: **chat only** (no vault brief save).

## Steps

1. Resolve desk; confirm in `list_desks` (monorepo pin).  
2. `get_pack_snapshot` — house_prior, WATCH/FIRED, ≤5 claims, gaps.  
3. `get_house_view` — stance, exposed, flip triggers.  
4. Research (search/browse) against **focus**, or default axes:  
   growth spine · concentration · competition · regulatory/geo · financials/FCF · vs house flip triggers.  
5. Map each finding → existing Rn / house lever / flip trigger / **not in book**.  
6. Suggest next (optional): risk-check Rn, propose house, file claim path — do not auto-run.

## Output

1. **Header** — desk · pack as_of · house status  
2. **Book spine** — stance one-liner + ≤5 load-bearing claims / WATCH names  
3. **Research findings** — primary first; **[soft]** secondary  
4. **Map to book** — Rn / house / not in book  
5. **GAPs**  
6. **Suggested next** — commands only, no silent writes  

## Vs other agents

| Agent | Use instead when |
|-------|------------------|
| `/cockpit-daily` | Pure daybook “what moved” last 24–72h |
| `/cockpit-steelman` | Only house vs WATCH alignment |
| `/cockpit-new-desk` | No desk yet / first underwrite |
| `/cockpit-risk-check` | Single risk DD |

Footer: decision-support only; not book SoR until glass ACCEPT on any propose.
