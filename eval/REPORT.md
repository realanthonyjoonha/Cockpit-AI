# Cockpit-AI eval PILOT

**Question:** Which context genuinely beats a strong bare model with web search?

Decision-support only. Synthetic vault only. Product `desks: []` unchanged. No `XAI_API_KEY`.

## Pins

- git commit: `7aa2c65763fee4223f2b4dab1c7b5a587794e088`
- companyfacts fetch: `2026-10-12T08:01:36.194Z`
- subject model: `gpt-5.6-sol-high-fast` via Cursor
- grader model: `gemini-3.8-flash-low`
- PR #8 slice cards: `99b31eb8c83731de2c40b2e4eadaca711f72a1d2` (not merged)
- PR #9 tool catalog: `bbf4d65fe9e616f471549aaabc973a062a2e8c63` (not merged)
- bundle: `arm_repeat` (pilot convenience; items still scored independently)

## Per-arm table

| Arm | Acc | Acc 95% CI | Honest-gap | Halluc | Rel pass^k | Tok in/out/cached | $/correct | p50/p95 ms | Signal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 87.8% | [81.1%, 94.4%] | 57.8% | 12.2% | 83.3% | 2488/4377/0 | $0.0028 | 180000/180000 | baseline |
| 0+a | 97.8% | [94.4%, 100.0%] | 61.1% | 2.2% | 96.7% | 14575/3680/0 | $0.0034 | 180000/180000 | cut |
| 0+b | 81.1% | [72.2%, 88.9%] | 23.3% | 17.8% | 56.7% | 4119/4584/0 | $0.0033 | 180000/180000 | cut |
| 0+c | 87.8% | [80.0%, 94.4%] | 55.6% | 11.1% | 80.0% | 2664/4225/0 | $0.0027 | 180000/180000 | cut |
| 0+d | 88.9% | [81.1%, 94.4%] | 56.7% | 10.0% | 83.3% | 2779/4231/0 | $0.0027 | 180000/180000 | cut |
| 0+e | 87.8% | [81.1%, 94.4%] | 57.8% | 12.2% | 86.7% | 3368/4300/0 | $0.0028 | 180000/180000 | cut |
| 0+f | 88.9% | [82.2%, 94.4%] | 56.7% | 10.0% | 80.0% | 2881/4428/0 | $0.0028 | 180000/180000 | cut |
| full | 96.7% | [92.2%, 100.0%] | 26.7% | 3.3% | 96.7% | 19605/4662/0 | $0.0044 | 180000/180000 | cut |

Difference vs 0 counts only if the clustered 95% CI excludes 0 **and** |Δacc| ≥ 5 pts, or cost/correct is ≥20% cheaper at equal accuracy. Ties = cut.

## Paired diffs vs arm 0

- **0+a**: Δacc 10.0 pts · CI [0.0, 25.6] · cut — tie / no material separation from 0
- **0+b**: Δacc -6.7 pts · CI [-15.6, 5.6] · cut — tie / no material separation from 0
- **0+c**: Δacc -0.0 pts · CI [-6.7, 6.7] · cut — tie / no material separation from 0
- **0+d**: Δacc 1.1 pts · CI [-3.3, 6.7] · cut — tie / no material separation from 0
- **0+e**: Δacc 0.0 pts · CI [0.0, 0.0] · cut — tie / no material separation from 0
- **0+f**: Δacc 1.1 pts · CI [-3.3, 6.7] · cut — tie / no material separation from 0
- **full**: Δacc 8.9 pts · CI [0.0, 22.2] · cut — tie / no material separation from 0

**No arm separated from 0 under the pre-registered rule.** A smaller full run is proposed below.

## Reading

The only directional candidate is **0+a** (tagged companyfacts): +10.0 pts vs 0, hallucination 2.2% vs 12.2%, pass^k 96.7% vs 83.3%. The clustered 95% CI still includes 0 (lo = 0.0) because there are only five company clusters, so the pre-registered rule marks **cut**.

What 0+a changed: the live key uses the latest-filing tagged concept. Bare+web consistently answered Exxon Mobil from a later 10-Q HTML total (`$116.017B` for 2026-04-01–2026-06-30) instead of the tagged `Revenues` slot (`$85.138B` for 2026-01-01–2026-03-31) and invented a YTD span the latest filing does not tag. Tagged facts also keep ASML (20-F) at GAP instead of substituting an untagged 6-K exhibit. JPM / AAPL / JNJ were already solved by web search, so they do not move the paired gap.

- **0+b** (synthetic vault, no facts): -6.7 pts. Open items improve when a house is present; numeric items do not, and XOM concept errors remain.
- **0+c / 0+d / 0+e / 0+f**: ties with 0. Guardrails, background, slice cards (PR #8, not merged), and the trimmed catalog (PR #9, not merged) did not move factual accuracy.
- **full**: +8.9 pts · cut. Cost/correct $0.0044 vs $0.0028. Vault/slice mix is not cheaper and does not beat tagged facts alone.
- Blinded grader (`gemini-3.8-flash-low`) scored all 240 open items **5/5**. Open-ended quality did not separate arms; the numeric XOM / ASML items did.
- GO-gate violations: 0 on every arm. Product `desks: []` unchanged. No `XAI_API_KEY`.
- Latency p50/p95 is the recorded subject-call placeholder (180s), not host telemetry.

## Top failure tags

- 0: wrong_number (9), invented_on_trap (5), wrong_period (3), missing_period (3)
- 0+a: wrong_number (2), missing_period (2)
- 0+b: wrong_number (12), missing_period (6), invented_on_trap (5), wrong_period (4)
- 0+c: invented_on_trap (6), wrong_number (6), wrong_period (2), missing_period (2)
- 0+d: wrong_number (6), invented_on_trap (5), wrong_period (2), missing_period (2)
- 0+e: wrong_number (9), invented_on_trap (5), wrong_period (3), missing_period (3)
- 0+f: wrong_number (6), invented_on_trap (5), wrong_period (2), missing_period (2)
- full: wrong_number (2), missing_period (2), invented_on_trap (1)

## GO-gate violations

- 0: 0
- 0+a: 0
- 0+b: 0
- 0+c: 0
- 0+d: 0
- 0+e: 0
- 0+f: 0
- full: 0

## Grader-agreement / Anthony spot-check sample

| id | company | question | arm (hidden in grader file) | rubric | mark |
| --- | --- | --- | --- | --- | --- |
| aapl::risk_propose#1 | aapl | risk_propose | 0+a | 5 | SPOT-01 |
| aapl::risk_propose#2 | aapl | risk_propose | 0+d | 5 | SPOT-02 |
| aapl::risk_propose#3 | aapl | risk_propose | 0 | 5 | SPOT-03 |
| aapl::steelman#1 | aapl | steelman | 0+c | 5 | SPOT-04 |
| aapl::steelman#2 | aapl | steelman | 0+f | 5 | SPOT-05 |
| asml::risk_propose#3 | asml | risk_propose | 0+a | 5 | SPOT-06 |
| asml::risk_propose#1 | asml | risk_propose | 0+e | 5 | SPOT-07 |
| asml::risk_propose#2 | asml | risk_propose | full | 5 | SPOT-08 |
| asml::steelman#3 | asml | steelman | 0+c | 5 | SPOT-09 |
| asml::steelman#1 | asml | steelman | 0 | 5 | SPOT-10 |
| jnj::risk_propose#2 | jnj | risk_propose | 0+b | 5 | SPOT-11 |
| jnj::risk_propose#3 | jnj | risk_propose | 0+e | 5 | SPOT-12 |
| jnj::steelman#1 | jnj | steelman | 0+a | 5 | SPOT-13 |
| jnj::steelman#2 | jnj | steelman | 0+d | 5 | SPOT-14 |
| jnj::steelman#3 | jnj | steelman | 0 | 5 | SPOT-15 |
| jpm::risk_propose#1 | jpm | risk_propose | 0+c | 5 | SPOT-16 |
| jpm::risk_propose#2 | jpm | risk_propose | 0+f | 5 | SPOT-17 |
| jpm::steelman#3 | jpm | steelman | 0+a | 5 | SPOT-18 |
| jpm::steelman#1 | jpm | steelman | 0+e | 5 | SPOT-19 |
| jpm::steelman#2 | jpm | steelman | full | 5 | SPOT-20 |
| xom::risk_propose#3 | xom | risk_propose | 0+c | 5 | SPOT-21 |
| xom::risk_propose#1 | xom | risk_propose | 0 | 5 | SPOT-22 |
| xom::steelman#2 | xom | steelman | 0+b | 5 | SPOT-23 |
| xom::steelman#3 | xom | steelman | 0+e | 5 | SPOT-24 |

## Measured cost and full-run quote

- Pilot traces: 24
- Pilot items scored: 720
- Pilot token cost (quote rates): $2.0242
- Mean $ / unbundled item: $0.0028
- Full run 10×6×8×5 = 2,400 unbundled items: **$6.7475** at these rates
- Smaller full run (10 held-out × 6 × 2 arms (0, 0+a) × 5 repeats = 600): **$1.6869**

Rates are in `eval/config/pilot.json` `pricing` and are a quote, not a Cursor invoice. Cached tokens were 0 unless the host returned them.

Pilot calls were **bundled** (30 items / Cursor subject call). An unbundled 2,400-call full run would repeat company context each time and cost more in wall-clock than the amortized $6.75 token line. If Anthony GOs a follow-up, prefer **10 held-out × 6 × 2 arms (0 vs 0+a) × 5 repeats = 600** to re-test the only 10-pt directional gap with more company clusters.

## How to rerun

```bash
npm install --ignore-scripts --no-audit --no-fund --prefix eval
node eval/run.mjs --self-test
node eval/run.mjs              # prepare live keys + job prompts; score if traces exist
```

Cursor subagent traces go in gitignored `eval/results/traces/`. Answer keys stay in `eval/results/keys/` — never give that path to the subject model.

