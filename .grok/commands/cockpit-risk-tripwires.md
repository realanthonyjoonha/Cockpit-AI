---
description: Research tripwires for a risk; iterate with user; propose set_tripwires (glass ACCEPT)
argument-hint: "[desk] [risk id or Rn or name]"
---

Parse `$ARGUMENTS`: desk + risk selector (pack id, `R3`, or full `Rn — Title` from glass OPEN GROK).  
If desk missing, ask once. **If risk is present, do not re-ask** — glass Due Diligence seeds this risk.

**Job:** Help Anthony fill **monitorable tripwires** for a risk (especially newly added ones with empty/GAP tables). **Go back and forth** — do not dump 10 tripwires and propose without his cull. Final list = only monitors he deems important.

## Efficiency

- MCP: `get_pack_snapshot` + **`get_risk_sor`** (current SoR tripwires).  
- Web search ≤4 for concrete tells.  
- Propose only after user confirms the shortlist: **`propose_risk_tripwires`**.  
- Cap ≤8 tools before first draft; more rounds of chat OK without tools.

## Steps (iterative)

1. Load pack risk + **`get_risk_sor(desk, risk)`** — show current tripwires (may be empty/GAP).  
2. Research 4–8 **candidate** monitors (primary preferred). Each candidate: signal · tripwire (falsifiable) · current state · as_of · source.  
3. Present candidates as a **menu** — ask which to keep, merge, or drop.  
4. Revise until Anthony says e.g. “propose these” / “lock tripwires”.  
5. Call **`propose_risk_tripwires`** with the **final** list only (replace mode).  
6. Tell him glass: `#/{desk}/risks` → ACCEPT pending **set_tripwires** → COMPILE BOOK.

## Tripwire quality bar

- **Falsifiable** (“prints X below Y”) not vague (“sentiment worsens”).  
- Prefer **A/B** sources for state/as_of; mark soft **[soft]**.  
- Usually **2–5** tripwires — not a laundry list.  
- Empty/GAP state is OK if the tell is clear.

## Output each round

1. Current SoR tripwires  
2. Candidate set (numbered)  
3. Question: keep / drop / edit?  
4. When proposing: proposal id + glass ACCEPT link  

## Hard rules

- No SoR write from agent.  
- No buy/sell/PT/sizing.  
- Do not propose until user confirms the shortlist (unless they said “propose all of these” in one message).  

Decision-support only.
