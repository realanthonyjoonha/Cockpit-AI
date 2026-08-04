---
description: "Legacy alias → /cockpit-street (prefer that). Refresh path still valid."
argument-hint: "[desk]"
---

**Prefer `/cockpit-street [desk]`** (unified Street agent with house + risk seed from glass OPEN GROK).

Parse `$ARGUMENTS`: **desk**.

**Job:** When new targets/articles appear, **update** curated Street models. Same completeness bar as `/cockpit-street`: every firm needs PT, rating, **3–5 sentence why**, **https source_url**. Dual format + info loops before publish.

If `/tmp/cockpit-street-{desk}-seed.md` exists, read it first (page + house + risks).

## Rules
Same product law as street-build. **Do not** reintroduce Nasdaq coverage-list rows without PTs/why/links.

## Steps
1. Load current `cockpit/street/{TICKER}.json` if complete; else run full **street-build**.  
2. Research new raises/cuts since `as_of` / `built_at` (free search + subagents OK).  
3. Merge into firms[] — every row still complete.  
4. **Loop A** format verify (max 3) → **Loop B** info verify (max 3) → re-format if needed.  
5. Publish via `refreshStreet` / POST street/refresh.  
6. Report n firms + Δ vs prior + `#/{slug}/street`.

Footer: street ≠ house PT.
