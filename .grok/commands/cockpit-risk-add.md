---
description: Research + propose a NEW risk (GO writes; no silent write)
argument-hint: "[desk] [risk idea / mechanism]"
---

Parse `$ARGUMENTS`: desk (`slug`/`ticker`) + free-text idea.
If desk missing, ask once. If idea missing, ask what risk to research.

**Job:** Research whether a **risk** belongs on the register, draft it, wait for **GO**, then `propose_add_risk` + `commit_on_go` kind=register. Never silent-write SoR/house/ontology.

## Efficiency

- MCP: `get_pack_snapshot` + `get_house_view` (≤2) to avoid duplicates.
- Web search ≤4.
- Propose only after **GO**. Cap ≤8 tools.

## Steps

1. `get_pack_snapshot(desk)` — existing titles; if already covered, say so.
2. `get_house_view(desk)` — map to Exposed / contested.
3. Web search; label soft **[soft]**.
4. Draft in chat: title (no Rn prefix), status (default **WATCH**), grade A|B|C, summary, mechanism, 1–4 tripwires.
5. Wait for **GO** / **SAVE DRAFT** / **EDIT**. Until GO, do not `propose_*`.
6. If **GO**: `propose_add_risk` then `commit_on_go` kind=register.
7. Confirm pending id. Glass: `http://127.0.0.1:4682/#/{desk}/risks`
8. **House:** do **not** auto-propose an updated house. **Ask** (no `propose_house_*` until they yes) only if:
   - the new risk **contradicts** the live stance, or
   - it is a **flip trigger** the house does not have, or
   - they say **“this is now on the house.”**
   If yes → dump house patch → they **GO** `kind=house`. Tripwire-only or WATCH↔INTACT → do not ask.

Footer: not book SoR until GO. No buy/sell/PT/sizing.
