---
description: Model-read PDF — teach the working Model ledger (company guide bar, offset, GAP). Not thesis, not UPDATE MODEL, not a PT.
argument-hint: "[desk] [run_id]"
---

Execute **`.grok/skills/model-read/SKILL.md`** on kernel (`~/Desktop/cockpit-kernel`). That file is SoR for this job.

Parse `$ARGUMENTS`: desk (slug/ticker) · optional `run_id`. If desk missing, `list_desks` and ask once. If glass already created `run_id`, use it — do not POST a second start.

**Job:** On-demand taught PDF of **this desk’s Model**. Glass: Model room → **READ MODEL** (`run_id` = `{stamp}_model_read_{TICKER}`). PDF is ops, never pack SoR.

## Non-negotiable

1. Decision-support only — no buy/sell/hold, PT, sizing.
2. Read `numbers-graph.json` first. If `ok` is false, stop (UPDATE MODEL). Do not invent the ledger.
3. Bar = last **company** guide with the offset. Never Street consensus as the scorecard.
4. ORDER exact: `thermometer · print-vs-guide · quality · new-guide · still-gap · next-print`.
5. Teach in layman terms. Do not compress into unexplained headlines.
6. Render `scripts/report/build.py --config $RUN/config.py`.
7. Publish complete. **No** `propose_*`. Do not write house/risks/YOUR CASE.

If anything in the skill conflicts with a shorter habit, **the skill wins**.
