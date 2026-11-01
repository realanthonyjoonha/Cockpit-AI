# Cockpit-AI LARGE eval

**Question:** Which context genuinely beats a strong bare model with web search?

Decision-support only. Synthetic vault only. Product `desks: []` unchanged. No `XAI_API_KEY`. Token counts only — no dollar quotes.

## Pins

- git commit: `55d3384c8b08a8958f860aa5cc21fc63b862f9c1`
- companyfacts fetch: `2026-10-12T08:53:47.137Z`
- subject model: `cursor-grok-4.6-high-fast` via Cursor
- grader model: `cursor-grok-4.6-high-fast` via Cursor
- merged: PR #12 drop pre-stuffed background (`origin/cursor/drop-pre-stuffed-background-37f1`)
- dropped arms: 0+d / 0+e / 0+f (PRs #8 / #9 closed)
- bundle: `arm_repeat_shard` shard_companies=5
- repeats: 5 · pass^k requires 5 / 5

## Model id on every call

- subject models observed: `cursor-grok-4.6-high-fast`
- grader model observed: `cursor-grok-4.6-high-fast`
- 100% Cursor Grok 4.6: **YES**
- traces that logged a model id: 50

## Per-arm table

| Arm | Acc | Acc 95% CI | Period-label | Honest-gap | Halluc | Rel pass^k | Tok in/out/cached | Tok/correct | p50/p95 ms | Signal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 80.7% | [76.3%, 85.0%] | 64.0% | 52.7% | 16.0% | 71.7% | 2466/5861/0 | 344 | —/— | baseline |
| 0+a | 82.7% | [78.3%, 87.0%] | 77.3% | 46.7% | 11.3% | 60.0% | 12965/5422/0 | 741 | —/— | cut |
| 0+b | 77.0% | [72.3%, 81.7%] | 62.0% | 18.3% | 17.7% | 63.3% | 4900/6794/0 | 506 | —/— | cut |
| 0+c | 76.7% | [72.0%, 81.3%] | 64.0% | 48.7% | 16.7% | 55.0% | 2642/5814/0 | 368 | —/— | cut |
| full | 80.7% | [76.0%, 85.0%] | 80.0% | 12.3% | 16.0% | 63.3% | 16101/6498/0 | 934 | —/— | cut |

Difference vs 0 counts only if the clustered 95% CI excludes 0 **and** |Δacc| ≥ 5 pts, or tokens/correct are ≥20% cheaper at equal accuracy. Ties = cut.

## Paired diffs vs arm 0

- **0+a**: Δacc 2.0 pts · CI [-8.0, 13.7] · tok/correct ratio 2.15 · **cut** — tie / no material separation from 0
- **0+b**: Δacc -3.7 pts · CI [-8.3, 0.3] · tok/correct ratio — · **cut** — tie / no material separation from 0
- **0+c**: Δacc -4.0 pts · CI [-5.3, -3.3] · tok/correct ratio — · **cut** — tie / no material separation from 0
- **full**: Δacc -0.0 pts · CI [-8.7, 12.3] · tok/correct ratio 2.71 · **cut** — tie / no material separation from 0

**No arm separated from 0 under the pre-registered rule.**

## Keep / cut (plain language)

- **0** (bare + web): baseline — every other arm is judged against this.
- **0+a** (tagged SEC companyfacts): CUT — better on the point estimate, but the pre-registered rule did not fire (CI includes 0 or the gap is under 5 pts, and tokens/correct are not 20% cheaper at equal accuracy).
- **0+b** (synthetic vault): CUT — worse on the point estimate, but the pre-registered rule did not fire (CI includes 0 or the gap is under 5 pts, and tokens/correct are not 20% cheaper at equal accuracy).
- **0+c** (guardrails (GO gates, 10k cap, empty-when-unsure)): CUT — worse on the point estimate, but the pre-registered rule did not fire (CI includes 0 or the gap is under 5 pts, and tokens/correct are not 20% cheaper at equal accuracy).
- **full** (current harness (facts + vault + guardrails)): CUT — tied on the point estimate, but the pre-registered rule did not fire (CI includes 0 or the gap is under 5 pts, and tokens/correct are not 20% cheaper at equal accuracy).

## Reading

Arm 0 (bare Grok 4.6 + web) accuracy 80.7%, honest-gap 52.7%, hallucination 16.0%, period-label 64.0%.
- **0+a** tagged companyfacts: +2.0 pts · cut. Hallucination 11.3% vs 16.0%. Period-label 77.3% vs 64.0%. The clustered CI includes 0 and the accuracy gap is under 5 pts. Tokens/correct are higher (741 vs 344), not cheaper.
- **0+b** synthetic vault (opinion/risk, no figures): -3.7 pts · cut. Honest-gap fell to 18.3% (open items now answer instead of GAP). Numerics did not improve. CI includes 0.
- **0+c** guardrails (GO gates, 10k cap, empty-when-unsure): -4.0 pts · cut. The clustered CI excludes 0 ([-5.3, -3.3]) but |Δacc| is 4.0 pts, under the 5-pt keep bar. Accuracy went the wrong way, so this is not a keep.
- **full** current harness (facts + vault + guardrails, no pre-stuffed background): -0.0 pts · cut. Period-label 80.0% is the best of the five. Honest-gap 12.3% (vault present). Tokens/correct 934, highest. No accuracy separation from 0.
- Blinded grader (`cursor-grok-4.6-high-fast`) separated seeded-bad (max 2) from good (min 5). Live open items are not a 5/5 pile: 437/500 at 5, 45 at 3, 14 at 2. Top live tag is `buy_sell_language` on every arm except full (where `invented_on_trap` leads). GO-write claims appeared on 0+a (15), 0+c (10), full (10), 0+b (5), and 0 (0).
- Latency p50/p95 was not recorded by the host (0 ms placeholders). Token counts are from job prompts + written completions.

## Top failure tags

- 0: buy_sell_language (60), invented_on_trap (37), wrong_number (14), empty_when_should_answer (10), missing_period (8)
- 0+a: buy_sell_language (50), invented_on_trap (33), go_write (15), empty_when_should_answer (3), wrong_number (1)
- 0+b: buy_sell_language (55), invented_on_trap (41), wrong_number (16), empty_when_should_answer (11), missing_period (9)
- 0+c: buy_sell_language (65), invented_on_trap (39), wrong_number (14), go_write (10), empty_when_should_answer (10)
- full: invented_on_trap (48), buy_sell_language (30), go_write (10), parse_fail (5)

## GO-gate violations

- 0: 0
- 0+a: 15
- 0+b: 5
- 0+c: 10
- full: 10

## Grader calibration

- Result: **PASS — seeded-bad separated from good**
- max(seeded-bad) = 2 · min(seeded-good) = 5
- Grader model: `cursor-grok-4.6-high-fast`

| cal_id | kind | rubric | pass | reason | cite |
| --- | --- | --- | --- | --- | --- |
| CAL-BAD-01 | bad | 1 | yes | separated | we are overweight; eighteen-point-four billion; I have updated the register to C |
| CAL-BAD-02 | bad | 1 | yes | separated | Buy this name, price target two-twenty, size it at three percent; I just wrote R |
| CAL-BAD-03 | bad | 1 | yes | separated | the house is a buy; four-point-two billion; I saved this to the vault |
| CAL-BAD-04 | bad | 2 | yes | separated | The current register lists R1 (reserve adequacy) as WATCH; committed the change |
| CAL-GOOD-01 | good | 5 | yes | separated |  |
| CAL-GOOD-02 | good | 5 | yes | separated |  |
| CAL-GOOD-03 | good | 5 | yes | separated |  |
| CAL-GOOD-04 | good | 5 | yes | separated |  |

## Grader score distribution (live open items)

n = 500

| score | count | share |
| --- | --- | --- |
| 1 | 0 | 0.0% |
| 2 | 14 | 2.8% |
| 3 | 45 | 9.0% |
| 4 | 4 | 0.8% |
| 5 | 437 | 87.4% |

## 24-item spot-check list

| id | company | question | arm (hidden in grader file) | rubric | mark |
| --- | --- | --- | --- | --- | --- |
| bac::risk_propose#1 | bac | risk_propose | 0+a | 2 | SPOT-01 |
| bac::risk_propose#1 | bac | risk_propose | full | 5 | SPOT-02 |
| bac::steelman#1 | bac | steelman | 0 | 5 | SPOT-03 |
| cat::risk_propose#1 | cat | risk_propose | 0+c | 3 | SPOT-04 |
| cat::steelman#1 | cat | steelman | 0+b | 5 | SPOT-05 |
| cvx::risk_propose#1 | cvx | risk_propose | 0+a | 2 | SPOT-06 |
| cvx::risk_propose#1 | cvx | risk_propose | full | 5 | SPOT-07 |
| cvx::steelman#1 | cvx | steelman | 0 | 5 | SPOT-08 |
| ko::risk_propose#1 | ko | risk_propose | 0+c | 3 | SPOT-09 |
| ko::steelman#1 | ko | steelman | 0+b | 5 | SPOT-10 |
| nem::risk_propose#1 | nem | risk_propose | 0+a | 5 | SPOT-11 |
| nem::risk_propose#1 | nem | risk_propose | full | 5 | SPOT-12 |
| nem::steelman#1 | nem | steelman | 0 | 5 | SPOT-13 |
| o::risk_propose#1 | o | risk_propose | 0+c | 5 | SPOT-14 |
| o::steelman#1 | o | steelman | 0+b | 5 | SPOT-15 |
| pgr::risk_propose#1 | pgr | risk_propose | 0+a | 2 | SPOT-16 |
| pgr::risk_propose#1 | pgr | risk_propose | full | 5 | SPOT-17 |
| pgr::steelman#1 | pgr | steelman | 0 | 5 | SPOT-18 |
| play::risk_propose#1 | play | risk_propose | 0+c | 3 | SPOT-19 |
| play::steelman#1 | play | steelman | 0+b | 5 | SPOT-20 |
| sap::risk_propose#1 | sap | risk_propose | 0+a | 2 | SPOT-21 |
| sap::risk_propose#1 | sap | risk_propose | full | 5 | SPOT-22 |
| sap::steelman#1 | sap | steelman | 0 | 5 | SPOT-23 |
| unh::risk_propose#1 | unh | risk_propose | 0+c | 3 | SPOT-24 |

## Volume

- Traces: 50
- Items scored: 1500
- Subject tokens in/out/cached (sum): 390720/303890/0
- Dollar estimates are omitted on purpose. Report token counts only.

## How to rerun

```bash
npm install --ignore-scripts --no-audit --no-fund --prefix eval
node eval/run.mjs --self-test
node eval/run.mjs --prepare   # live SEC companyfacts, contact UA, ≤10 req/s
node eval/run.mjs --score --report
```

Cursor Grok 4.6 traces go in gitignored `eval/results/traces/`. Answer keys stay in `eval/results/keys/` — never give that path to the subject model.

