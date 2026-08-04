---
description: "Legacy alias → /cockpit-street (prefer that). Full Street build path still valid."
argument-hint: "[desk]"
---

**Prefer `/cockpit-street [desk]`** (unified Street agent with house + risk seed from glass OPEN GROK).

Parse `$ARGUMENTS`: **desk**. If missing, `list_desks` then ask once.

**Job:** Fully **agent-built** Street models for this desk (Memory-style). You research freely, then **loop until format and information both pass**. Glass only displays **complete** rows — never empty cells.

If `/tmp/cockpit-street-{desk}-seed.md` exists, read it first (page + house + risks).

## Product law

1. Decision-support only — **no house PT**, no “you should buy/sell,” no sizing.  
2. **Never invent** PTs, ratings, or why text. If no source → **omit firm** (do not publish blanks).  
3. Prefer **5–15 complete firms** over many partial rows.  
4. Never write house, risks, or `ontology/store/`.  
5. Publish path only: `research-wiki/cockpit/street/{TICKER}.json`

## Required firm row (no empty fields)

Every firm **must** include:

| Field | Rule |
|-------|------|
| `firm` | Name |
| `rating` | Published rating |
| `pt` | **Number** (required) |
| `date` | Note/revision date |
| `why` | **3–5 sentences** (≥180 chars) on **why the firm set this PT** |
| `source_url` | **https://** link to article/note for depth |

Optional: `flag` bull|bear|stale|anchor, `source_note`.

Also required at snapshot level: `frame`, `bull`, `bear`, `consensus` { pt_avg, pt_low, pt_high, tally or rating }.

## Agentic freedom

You **may**:

- Use web search, parallel subagents (e.g. one per firm cluster), pack load for frame/actuals only  
- Choose which reputable firms to include based on evidence  
- Drop firms you cannot fully document  

You **may not**: invent links, invent PTs, fill “why” without a source.

## Dual verify loops (mandatory)

### Loop A — Format (code), max 3 attempts

1. Write draft JSON to `/tmp/street-{TICKER}-draft.json`.  
2. Run:

```bash
cd memory-cockpit-v2
node --input-type=module -e '
import { validateStreetSnapshot } from "./server/streetSchema.js";
import fs from "fs";
const raw = JSON.parse(fs.readFileSync("/tmp/street-TICKER-draft.json","utf8"));
const r = validateStreetSnapshot(raw, { ticker: "TICKER" });
console.log(JSON.stringify(r, null, 2));
'
```

3. If `ok: false` → fix **all** `errors` → re-run. Cap **3**.  
4. If still failing → stop; report errors; **do not publish**.

### Loop B — Information (you as critic), max 3 attempts

For **each** firm after format pass:

| Check | Action on fail |
|-------|----------------|
| Open/skim `source_url` (or reliable excerpt) | Drop firm or find real URL |
| PT/rating appear in / match source | Fix or drop |
| `why` is 3–5 sentences grounded in source (not generic filler) | Rewrite why |
| No advice-to-reader language | Rewrite |
| Date plausible | Fix or stale flag |

After edits → **re-run Loop A** (format again). Cap **3** combined repair cycles.

Only when **both** loops pass → publish.

## Publish

```bash
# Prefer glass if running:
# POST /api/{slug}/street/refresh  with full schema_version 2 body

node --input-type=module -e '
import { refreshStreet } from "./server/thinStreet.js";
import fs from "fs";
const body = JSON.parse(fs.readFileSync("/tmp/street-TICKER-draft.json","utf8"));
const r = await refreshStreet("TICKER", body);
console.log(JSON.stringify({ ok: r.ok, n: r.firms?.length, error: r.error, format_errors: r.format_errors, info_issues: r.info_issues }, null, 2));
'
```

API rejects incomplete rows. Server also re-checks format + structural info.

## Report to user

- n complete firms, consensus high/mean/low  
- verify loops used (format attempts / info attempts)  
- `#/{slug}/street`  
- Reminder: not house PT; partial universe OK if every **shown** row is complete  

## Efficiency

Cap ~15 web tools + verify runs. Depth over breadth.

Footer: decision-support only; street ≠ house.
