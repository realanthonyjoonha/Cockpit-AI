---
description: Propose house draft via efficient MCP from-current replacements (glass ACCEPT)
argument-hint: "[desk] [brief edit intent]"
---

Parse `$ARGUMENTS`: first token desk if ``slug`/`ticker`/ticker-like; rest = edit intent.  
If desk missing, ask once. If intent missing, ask for a **minimal** edit (stance unchanged unless they say otherwise).

## Efficiency (mandatory)

- **Do not** mine chat history, session files, or home greps for wording unless user says “use prior draft.”
- **Do** use only `get_house_view` + `get_pack_snapshot` as sources.
- Prefer **`propose_house_from_current`** (exact find→replace). Each `find` must appear **exactly once** in current house.
- Cap at ~6 tool calls. If a find is not unique, widen context in `find` or fail clearly.

## Steps

1. `get_house_view` + `get_pack_snapshot` for the desk  
2. Identify the **exact** substrings to change from current house markdown  
3. Call **`propose_house_from_current`** with:
   - `desk`
   - `replacements`: `[{ "find": "…exact…", "replace": "…new…" }, …]`
   - `summary`: short banner
   - `rationale`: pack-grounded (2–4 sentences)
4. `list_house_proposals` status=pending to verify id  

Only if from_current cannot express the edit (true full rewrite): write `/tmp/{desk}-house-propose.md` and `propose_house_view` with `markdown_path`.

## Output

- Proposal **id**  
- What changed (list finds) / what did not (stance, numbers unless asked)  
- Glass: `http://127.0.0.1:4681/#/{desk}/house` → REVIEW → **ACCEPT** or REJECT  
- COMPILE BOOK + REFRESH after ACCEPT  
- **Do not** claim vault house is written until ACCEPT  

Decision-support only. Never change CONFIRMED stance unless user explicitly asks.
