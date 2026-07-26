---
description: Research + propose a NEW risk for the register (glass ACCEPT; no silent write)
argument-hint: "[desk] [risk idea / mechanism]"
---

Parse `$ARGUMENTS`: desk (``slug`/`ticker`/ticker) + free-text risk idea.  
If desk missing, ask once. If idea missing, ask what risk to research.

**Job:** Help Anthony **research** whether a risk belongs on the register, then **propose_add_risk** (pending only). Never write SoR/house/ontology without glass ACCEPT.

## Efficiency

- MCP: `get_pack_snapshot` + `get_house_view` (≤2) to avoid duplicates.  
- Web search ≤4 for evidence.  
- Then `propose_add_risk` once if user wants it on the register.  
- Cap ≤8 tools. Decision-support only.

## Steps

1. `get_pack_snapshot(desk)` — list existing risk names; if idea already covered, say so and stop or suggest status_change instead.  
2. `get_house_view(desk)` — map to Exposed / contested if related.  
3. Web search for primary/secondary evidence (filings, IR, reputable press). Label soft items **[soft]**.  
4. Draft for user approval in chat:  
   - title (no Rn prefix)  
   - status (default **WATCH**)  
   - grade A|B|C  
   - summary (one line)  
   - mechanism  
   - 1–4 tripwires (signal / tripwire / state / as_of)  
5. If user confirms propose (or said “add” / “propose”): call MCP **`propose_add_risk`**.  
6. `list_risk_proposals` status=pending to confirm id.

## Output

1. **Research brief** — why it matters, evidence, vs existing register  
2. **Draft risk** — fields above  
3. **Proposal id** (if proposed) + glass: `http://127.0.0.1:4681/#/{desk}/risks` → ACCEPT  
4. After ACCEPT: COMPILE BOOK (glass may auto-compile)  
5. Footer: not book SoR until ACCEPT; no buy/sell/PT/sizing  

## Hard rules

- Do **not** invent graded primary facts. GAP if missing.  
- Do **not** write vault files yourself.  
- Prefer WATCH for new elevated risks; INTACT only if tracked but not priority.  
- Duplicate of existing Rn → refuse add; offer status change.

Decision-support only.
