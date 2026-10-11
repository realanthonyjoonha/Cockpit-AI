# Cockpit harness stress — context and tools

Measured on this tree. A flaw is listed below only when this run still reproduces it.

Run at: 2026-10-11T07:21:02.990Z
Tokenizer: gpt-tokenizer@2.9.0 default encode
Product desks unchanged during the run: yes

## How to rerun

From a clean checkout of this branch, with Node 22 and Python 3:

```bash
npm install --ignore-scripts --no-audit --no-fund --prefix memory-cockpit-v2
npm install --ignore-scripts --no-audit --no-fund --prefix harness-stress
node harness-stress/run.mjs
```

That rewrites `harness-stress/results/*.json`, `harness-stress/prompts/`, and this report's deterministic sections when you pass `--report` after replacing `results/models.json`. The tool probe copies `memory-cockpit-v2` to `/tmp`, points MCP at a DEMO fixture, and deletes the copy. It does not edit `memory-cockpit-v2/config/thin-desks.json`. Do not set `XAI_API_KEY`. The model arm is replayable from `harness-stress/prompts/` on any chat model; score replies with `node harness-stress/score-models.mjs` after placing responses in `harness-stress/results/model-raw/`.

## What was treated as a hypothesis

The 2026-10-10 code-read audit said context handling and the 24-tool surface were okay, with these specific claims: a hard 10k-character cap; rule-based elision that keeps the latest claim per metric; no in-Cockpit overflow summarizer; predefined tools that cost tokens and exist mainly to gate writes; no retry or backoff. The probes below confirm or refute those claims on this tree (`realanthonyjoonha/Cockpit-AI`), using a synthetic DEMO fixture. No private vault and no product desk was added.

## Flaws

| ID | Sev | Area | Verdict | Title |
| --- | --- | --- | --- | --- |

Severity: P0 means a later step can treat a wrong figure as the live metric. P1 means seeded facts disappear, or the documented budget is not the path the agent uses. P2 means token cost, overlap, or errors without a retry hint.

## Refuted or narrowed

- Phase-1 repros not reproduced on this run: F1 unpadded 2026-10-01 beats 2026-9-30; C-date-iso keeps October; F2 cash-plus-guidance stays cash and the outlook sentence stays revenue_guide; F3 “Cash was $222 million” is the live cash claim; F4 employees, “45 percent”, and spaced “$ 12” stay; the qualitative canary is elided; F9 missing grade and explicit C pick bare in both languages; F17 inventory impairment is impairment and a goodwill balance is goodwill.
- Phase-2 repros not reproduced on this run: F5 assemble, retrieve, and get_pack_snapshot stay within 10000 characters; unknown house notes do not survive; F6 END CONTEXT is inside max_chars; F7 risks intent keeps demo-price; F8 older cash, debt, and gross margin stay beside newer revenue; F10 the residual cap of 8 names the omitted claims.
- Phase-3 repros not reproduced on this run: F18 register ok=true and drivers is not rejected for a thin register (drivers ok=true); F15 a shell append still changes bytes (254 → 274) and is not a GO: audit mismatch, house-closeout fails.
- Phase-4 repros not reproduced on this run: F11 slice cards keep 8 of 8 seeded facts in a 32k tail (raw notes still keep 0; that control is the old trajectory).
- Phase-5 repros not reproduced on this run: F12 always-loaded catalog is 22 tools and 2414 tokens (before this phase: 24 tools, 3063 tokens). Core profile is 10 tools and 1264 tokens. The two always-refusing metric names are absent; F13 refused calls return next and retryable false; F14 metric trap is gone and the highest description Jaccard is 0; F16 a KEEP utterance does not write drivers and names propose_keep_driver; the core profile includes that tool and get_driver_sor. The earlier model miss stays in models.json and was not re-scored.
- Unpadded and padded dates keep the newer claim (C-date-unpadded winner=oct, C-date-iso winner=new). A bare FY label still has no invented month.
- Same-day ties keep the earlier array element (C-same-day-tie winner=first). That matches a stable sort. It is an arbitrary pick when two filings share a date, and it is visible in the case.
- Unpadded dates and a cash sentence that also says "guidance" no longer pick the wrong live claim. Slice cards keep the eight seeded facts in a 32k tail. The raw-note trajectory remains the control.
- Model arm: 32 Cursor subagent replies. Strong model gpt-5.6-sol-high. Cheaper model gemini-3.8-flash-low. No XAI_API_KEY. Recall of 8 seeded facts was 8/8 on recall-s (513 tokens) and recall-l (15485 tokens), 3 and 2 repeats. A 4-turn resume kept all 8 facts at the end (n=1 chain per model). The host did not error, and the replies contain no compaction notice. Tool identity on the full 24-tool catalog was 11/11 for both models across 3 repeats. Argument values were placeholders when the prompt had no real proposal id. On the 8-tool core, gpt-5.6-sol-high stayed 11/11 (null where the tool is absent). gemini-3.8-flash-low missed once in 3: it called commit_on_go kind=drivers for KEEP, a tool that is in the core list but is the wrong write. Bash-only reads of thin-desks.json, the house file, DEMO.json, and 08-risks matched the layout. Both models sometimes emitted go-commit.mjs for a GO write, which skips propose. One strong-model read used house-view-DEMO.md (wrong case on Linux). The host did not return token-usage counters for these subagents. A few long awk expressions in the bash logs are shortened; the path and whether the command writes are unchanged.

## Raw logs

- `harness-stress/results/context.json`
- `harness-stress/results/tools.json`
- `harness-stress/results/flow.json`
- `harness-stress/results/run-meta.json`
- `harness-stress/results/models.json` when the model arm has been scored
- `harness-stress/results/model-raw/` replies
- `harness-stress/prompts/` exact prompts

Decision-support only. The DEMO desk is a fixture inside the harness and is not a house view.
