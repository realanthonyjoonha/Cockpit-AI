# Cockpit-AI eval PILOT

**Question:** which context genuinely beats a strong bare model with web search?

Anthony approved the **pilot only**. The full 2,400-run job needs a separate GO after the cost quote in `REPORT.md`.

Decision-support only. Synthetic vault only. Product `thin-desks.json` stays `desks: []`. No `XAI_API_KEY`. Models run via Cursor, same host as `harness-stress`.

## Single command

```bash
npm install --ignore-scripts --no-audit --no-fund --prefix eval
node eval/run.mjs --self-test
node eval/run.mjs
```

`node eval/run.mjs` fetches live SEC companyfacts (contact User-Agent, ≤5 req/s), writes the answer key (gitignored), and emits job prompts. If `eval/results/traces/` already has Cursor replies, it scores and writes `eval/REPORT.md`.

```bash
node eval/run.mjs --prepare          # live fetch + keys + jobs
node eval/run.mjs --offline --jobs   # constructed fixture only
node eval/run.mjs --score --report   # after traces land
```

## Arms

Same model, same tasks, one change vs `0`:

| id | Change |
| --- | --- |
| `0` | bare model + web search |
| `0+a` | tagged latest-filing companyfacts (main) |
| `0+b` | synthetic house / risks / notes |
| `0+c` | GO gates, ~10k cap, empty-when-unsure |
| `0+d` | pre-stuffed background primer |
| `0+e` | slice-card step summaries from open PR #8 (`cursor/harness-p3-slice-cards-04a4`) — **do not merge** |
| `0+f` | trimmed 10-tool catalog from open PR #9 (`cursor/harness-p5-tool-catalog-440b`) — **do not merge** |
| `full` | all of the above |

Companies are a data list in `config/companies.json` (bank, mega-cap tech, 20-F IFRS, energy, healthcare). No per-ticker branches in code.

## Cursor model arm

The runner does not call xAI. Drop one JSON per job in `eval/results/traces/<job_id>.json`:

```json
{
  "job_id": "0__r1",
  "arm": "0",
  "repeat": 1,
  "model": "gpt-5.6-sol-high-fast",
  "item_ids": ["jpm::latest_quarter", "..."],
  "prompt_tokens": 0,
  "latency_ms": 0,
  "raw_text": "[...json array of answers...]"
}
```

Job prompts live in `eval/results/jobs/` (gitignored). The subject must not read `eval/results/keys/`.

## Scoring

Answer key is pulled **live** from companyfacts at prepare time (not frozen). Numeric tolerance ±0.5% or rounding. Trap items pass as honest-gap. Open-ended items use a 1–5 rubric; ~10% are marked for Anthony. Stats are paired by task with 95% bootstrap CIs clustered by company.

A difference **keeps** only if the CI excludes 0 and |Δacc| ≥ 5 points, or cost/correct is ≥20% cheaper at equal accuracy. Ties = cut.
