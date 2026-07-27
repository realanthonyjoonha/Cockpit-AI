---
description: Load house + risks context for a desk; research only what the user asks
argument-hint: "[desk] [optional research question]"
---

Parse `$ARGUMENTS`: **desk** (slug/ticker) + optional **research question / focus** (free text after desk).  
If desk missing, `list_desks` then ask once for desk.

**Job:** Ground Grok in **this desk’s book** (house + risk register + pack), then research **only what the user wants**.  
Do **not** freestyle a multi-axis investigation without their input.

## Hard rules

1. Decision-support only — no buy/sell/hold, PT, or sizing.  
2. **Do not invent** pack claims or WATCH titles — copy from pack.  
3. **No research search until the user has stated what to research** (in args or a follow-up message).  
4. Soft press → **[soft]**. Missing → **GAP**.  
5. **No vault writes** unless user explicitly asks to propose (then propose tools only).  
6. Default: chat only.

## Efficiency

- Book: `get_pack_snapshot` + `get_house_view` (≤2) after desk resolved.  
- Search only **after** a clear user question; then ≤4–6 search/browse.  
- Cap ≤8 tools once research is authorized.

## Steps

### A — Load book context (always, first)

1. Resolve desk; confirm via MCP `list_desks` if needed.  
2. `get_pack_snapshot(desk)` — house_prior, WATCH/FIRED, claims, gaps, risk names.  
3. `get_house_view(desk)` — stance, exposed, flip triggers.  
4. Briefly confirm in chat that context is loaded (one short block: stance line, WATCH list, house status). **Do not** start web research yet unless step B is already satisfied.

### B — User prompt required

**If args already include a research question** (anything after the desk token that is not empty fluff): proceed to C.

**If no research question yet:**  
- **Stop.** Ask once, clearly, e.g.  
  `Context loaded for {DESK}. What do you want researched?`  
- Wait for their answer. **Do not** invent default axes (growth/competition/etc.) or run search while waiting.

### C — Research (only after B)

1. Investigate **their** question only (primary: filings/IR; secondary press **[soft]**).  
2. Map findings → existing Rn / house lever / flip trigger / **not in book**.  
3. GAP where evidence missing.  
4. Suggest optional next steps (risk-check, propose) — do not auto-run.

## Output

**After A (no question yet):** short “context ready” + ask for research question.  

**After C:**  
1. Restate their question  
2. Book anchors used (stance / relevant WATCH)  
3. Findings (primary first)  
4. Map to book  
5. GAPs  
6. Suggested next (optional)

## Vs other agents

| Agent | Use when |
|-------|----------|
| `/cockpit-daily` | Unprompted daybook “what moved” |
| `/cockpit-steelman` | House vs WATCH alignment only |
| `/cockpit-new-desk` | New company underwrite |
| `/cockpit-research` | **User-directed** research with book context loaded |

Footer: decision-support only; not book SoR until glass ACCEPT on any propose.
