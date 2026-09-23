---
description: Pin business engines from the CONFIRMED house. User names them. GO writes 09. Empty is valid.
argument-hint: "[desk] [--session]"
---

Parse `$ARGUMENTS`: desk; optional `--session` (OPEN GROK from Drivers).

Load **CONFIRMED house** (`get_house_view`). This is **personalization**, not a house TOC.

**Do not** KEEP Stance, flip-triggers, “linked register,” “load-bearing view,” or other headings.

Name **2–5 engines of the business** the user wants watched closer. Examples:
- Amazon: AWS growth and profitability
- NVDA: neoclouds they are backing
- META: FoA ads mix; Muse attach

Each engine needs a **house_cite** (quote from the live house) and a **watching** line. Optional **why** (one paragraph). If it is not in the house: STOP — they GO house first, then pin.

User **KEEP / SKIP / empty**. KEEP → `propose_keep_driver` (title, house_cite, watching, why). Then glass ACCEPT or **GO** `commit_on_go` kind=drivers (writes `09`, not 08, not the house). Never auto-keep.

There is **no status**. Do not say ON-PLAN, TRACK, or OFF-PLAN.

Cadence is **print, news, or on-demand**. A check later appends one log line (`propose_driver_log`) after they GO. The log does not edit the house.

If a proposed engine **contradicts** the house story, **ask** — house GO or drop the driver. Do not silent-rewrite house.

`node scripts/drivers-closeout.mjs --slug {desk}` — zero Dn = PASS.
