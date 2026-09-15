---
description: Filing map — SEC accession → house / register (jailed inbox.json). On demand. Optional later propose.
argument-hint: "[desk] [run_id]"
---

Execute **`.grok/skills/filing-map/SKILL.md`** on kernel (`~/Desktop/cockpit-kernel`).

Parse `$ARGUMENTS`: desk (slug/ticker) · optional `run_id` · optional `chat`. If desk missing, ask once. If glass already created the run, **do not start a second**. If `chat` (or the run is already complete): talk to that map — do **not** POST a new run.

**Job:** Map EDGAR accessions in `inbox.json` to this desk’s house flip-triggers and named risks. Not a 10-K essay. Not `/cockpit-report`.

1. Decision-support only — no buy/sell/PT/sizing.  
2. Jail: `inbox.json`. No invented accessions.  
3. Acquire then quote or GAP.  
4. Publish `summary` + `rows[]`. `pack_claims` false.  
5. **Do not propose_*** until a later pass. Never silent-write the book.

Glass: `#/{desk}/overview` · **MAP FILINGS** (on demand).
