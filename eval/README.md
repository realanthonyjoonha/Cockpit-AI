# Cockpit-AI LARGE eval

**Question:** which context genuinely beats a strong bare model with web search?

Decision-support only. Synthetic vault only. Product `thin-desks.json` stays `desks: []`. No `XAI_API_KEY`. **Every subject and grader call is Cursor Grok 4.6** (`cursor-grok-4.6-high-fast`). The runner aborts if the configured subject or grader is not Grok 4.6.

Harness under test = `main` + PR #12 (pre-stuffed background removed). Closed PRs #8 / #9: arms `0+d` / `0+e` / `0+f` are dropped.

## Single command

```bash
npm install --ignore-scripts --no-audit --no-fund --prefix eval
node eval/run.mjs --self-test
node eval/run.mjs --prepare
node eval/run.mjs --score --report
```

`--prepare` fetches live SEC companyfacts (contact User-Agent, ≤10 req/s), writes the answer key (gitignored), and emits job prompts. If `eval/results/traces/` already has Cursor Grok 4.6 replies, `--score` grades and writes `eval/REPORT-large.md`.

```bash
node eval/run.mjs --prepare          # live fetch + keys + jobs
node eval/run.mjs --offline --jobs   # constructed fixture only
node eval/run.mjs --persist JOB_ID /tmp/eval-subject/JOB_ID.json
node eval/run.mjs --score --report   # after traces land
```

## Arms (5)

Same model, same tasks, one change vs `0`:

| id | Change |
| --- | --- |
| `0` | bare Grok 4.6 + web search |
| `0+a` | tagged latest-filing companyfacts |
| `0+b` | synthetic house / risks / notes (opinion/risk; no SEC figures) |
| `0+c` | GO gates, ~10k cap, empty-when-unsure |
| `full` | current harness: facts + vault + guardrails |

Companies are a data list in `config/companies.json` (bank, insurer, REIT, energy, 20-F IFRS, small-cap, plus sector diversity). No per-ticker branches in code. Vault text is generated from `fixtures/vault-templates.json` by sector.

## Cursor model arm

The runner does not call xAI. Drop one JSON per job in `eval/results/traces/<job_id>.json`. Every trace must log `model: "cursor-grok-4.6-high-fast"`.

```json
{
  "job_id": "0__s0__r1",
  "arm": "0",
  "repeat": 1,
  "model": "cursor-grok-4.6-high-fast",
  "item_ids": ["bac::latest_quarter", "..."],
  "prompt_tokens": 0,
  "latency_ms": 0,
  "raw_text": "[...json array of answers...]"
}
```

Job prompts live in `eval/results/jobs/` (gitignored). The subject must not read `eval/results/keys/`. If subscription usage runs out, stop and score what landed.

## Scoring

Answer key is pulled **live** from companyfacts at prepare time (not frozen). Numeric tolerance ±0.5% or rounding. Trap items pass as honest-gap. Open-ended items use a 1–5 anchored rubric; the grader must cite the missing/incorrect element. Seeded-bad calibration answers must score ≤2; the run fails if the grader cannot separate them from good. Stats are paired by task with 95% bootstrap CIs clustered by company.

A difference **keeps** only if the CI excludes 0 and |Δacc| ≥ 5 points, or tokens/correct are ≥20% cheaper at equal accuracy. Ties = cut. Report token counts only — no dollar quotes.
