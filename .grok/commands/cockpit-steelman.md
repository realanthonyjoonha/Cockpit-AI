---
description: Steelman house vs pack WATCH for a desk (MCP cockpit-research)
argument-hint: "[desk e.g. slug|ticker]"
---

Desk = `$ARGUMENTS` if non-empty, else ask once for a desk from list_desks.

## Steps (MCP only)

1. `get_pack_snapshot` for that desk  
2. `get_house_view` for that desk  
3. Optional: `get_house_assist_context` if you need the full rules pack  

## Output

1. One line: house stance/status/date + WATCH names (from pack) + fired  
2. **5 bullets**: steelman house vs those WATCH risks (mechanism, not surprise kills)  
3. **GAP** line if pack/house lack support  
4. Decision-support only — no buy/sell, PT, or sizing  

Do not invent numbers or risk names. Do not propose/write house unless user asks `/cockpit-propose`.

**Efficiency:** Do not mine chat history or unrelated files. Tools only: pack + house. Aim for 2–3 MCP calls.

