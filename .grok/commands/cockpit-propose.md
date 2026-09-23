---
description: Interactive Grok Build session — dump the full house here. GO writes, SAVE DRAFT stays in Grok, EDIT revises with no write.
argument-hint: "[desk] [--session]"
---

Parse `$ARGUMENTS`: desk (slug/ticker); optional `--session` (default when OPEN GROK from House).

**Surface:** this Grok Build chat. **GO writes.** Glass ACCEPT of **CONFIRMED** is the alternate commit (friends / if commit_on_go missed). Never FORMING on glass.

Decision-support only. Never write `house-view-*.md` yourself. Never auto-write CONFIRMED without user GO.

## Three words

- **GO** (aliases: looks good, that’s my house, CONFIRM) — this is their stance. Propose markdown with `status: CONFIRMED`, then **`commit_on_go`** (or `node scripts/go-commit.mjs`). Live house becomes **CONFIRMED**. No Safari trip.
- **SAVE DRAFT** — stay in this chat. Do **not** `propose_house`. Do **not** call `commit_on_go`. Glass never gets a FORMING chip.
- **EDIT** (aliases: change / fix / rewrite / drop Rn / not yet) — **no propose, no write.** Apply their delta, dump the **full** house fence again, same three words. Wait.

Prompt under every fence:

**GO** (writes CONFIRMED) · **SAVE DRAFT** (Grok only, no glass chip) · **EDIT** (change it here, no write)

No CONFIRM button on glass. No lecture bar. **GO must produce a CONFIRMED proposal then commit_on_go.** EDIT must not call `commit_on_go` or `propose_house`.

## Session (mandatory order)

1. `list_desks` — if `pin_ok` is false, STOP.
2. `get_house_view` (full markdown). `get_pack_snapshot` for grades.
3. **First reply — dump the full current house** in one `markdown` fence. No summary-only. If scaffold, dump it and say so.
4. One line under the fence: **GO** (writes CONFIRMED) · **SAVE DRAFT** (Grok only, no glass chip) · **EDIT** (change it here, no write)
5. **Wait.**
6. **EDIT** (or a delta without GO/SAVE DRAFT) → apply, dump the **full** file again, wait. Do not propose.
7. **GO** → propose that dump as **CONFIRMED** (`intent: "go"`) → immediately **`commit_on_go` kind=house** with that proposal id and utterance GO.  
   **SAVE DRAFT** → no propose. Stop.  
   **STOP** → no proposal.

## Propose (only after GO — never after EDIT or SAVE DRAFT)

- Same markdown you just dumped (`propose_house_from_current` if tiny; else `/tmp/{desk}-house-propose.md` + `propose_house_view`).
- Pass `intent: "go"`. API rejects scaffold, FORMING, SAVE DRAFT, and `intent: "edit"`.
- Print proposal **id**. After GO, call **`commit_on_go`**. Print `live_status: CONFIRMED`. Glass `#/{desk}/house` is a **viewer**.
- GO + commit_on_go → CONFIRMED on disk. SAVE DRAFT / EDIT → dump only. No glass chip.

## After GO writes CONFIRMED — same terminal, register

Do **not** stop. Do **not** require a second OPEN GROK. Do **not** wait for glass ACCEPT.

1. Live house must be **CONFIRMED** (commit_on_go already wrote). If still FORMING, do **not** start register-closeout.
2. Load `08` + that house. **Align register** (ask; no silent-delete): WATCH what the stance lives on; drop/add only if they say so.
3. Dump **full proposed `08`** in one fence.
4. Same three words. **EDIT** → dump `08` again. **GO** (or ACCEPT REGISTER) → propose chips → **`commit_on_go` kind=register**. **SAVE DRAFT** → Grok only. Glass `#/{desk}/risks` is a viewer.
5. `node scripts/register-closeout.mjs --slug {desk}` must **PASS**. COMPILE BOOK if pack lags.

SAVE DRAFT house → do **not** flow into register-closeout.

## After register-closeout PASS — same terminal, drivers

Do **not** stop. Do **not** dump house headings as Drivers.

1. Live house **CONFIRMED**. Register-closeout **PASS**.
2. Ask which **business engines** they want watched closer (AWS growth, neoclouds, ads mix). Suggest only engines **quoted from that house**. **None auto-kept.**
3. User **KEEP / SKIP / empty**. KEEP → `propose_keep_driver` (**house_cite required**). Not in the house → house GO first, then KEEP.
4. **GO** → **`commit_on_go` kind=drivers** (writes 09, not 08). **SAVE DRAFT** → Grok only.
5. `node scripts/drivers-closeout.mjs --slug {desk}` — **zero Dn = PASS**.

SAVE DRAFT register → do **not** flow into drivers.

## Do not

- First message without the full markdown fence
- Propose before GO or SAVE DRAFT
- Propose or `commit_on_go` after **EDIT**
- Propose FORMING when they said GO
- Call `commit_on_go` after SAVE DRAFT
- Dump to glass and skip the terminal dump
- Wait for glass ACCEPT after GO
- Change a CONFIRMED stance unless they asked in this chat

Cap: conversation long; propose + commit ≤8 MCP calls.
