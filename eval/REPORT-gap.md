# Cockpit-AI honest-gap check

**Question:** On items whose answer is not in tagged companyfacts or the pack, why does the full harness give honest GAP answers less often than bare + tagged SEC numbers?

Decision-support only. Synthetic vault only. Product `desks: []` unchanged. No `XAI_API_KEY`. Included subscription only. Token counts only.

## Pins

- git commit: `fc1171dee69ef21f292393f927ca09ba3e462f88`
- companyfacts fetch: `2026-10-12T19:48:54.700Z`
- subject model (exact): `cursor-grok-4.6-high-fast`
- grader model (exact): `cursor-grok-4.6-high-fast`
- harness under test: main + PR #12 (eval `full` arm = facts + vault + guardrails)
- repeats: 3
- questions: 10

## Model ids actually called

- `cursor-grok-4.6-high-fast`
- 100% exact pin `cursor-grok-4.6-high-fast`: **YES**
- XAI_API_KEY: absent
- on-demand: never enabled
- logged calls: 7

## Gap-item rule

```
A (company, catalog-ask) pair is a gap-item iff both hold:

1. Tagged slots: if the ask names a needed_slot, that metric id has no values
   in the company's latest-filing slots_summary (including metrics whose
   taxonomy concepts list is empty, and metrics that are not in the taxonomy).
2. Pack fields: if the ask names needed_pack_fields, none of those keys are
   populated on the generated desk. Populated keys are only the fields the
   vault generator actually writes (stance, watch, mechanism, flip, risk1_*,
   risk2_*, notes, house_canary). Qualitative flip/watch text does not count
   as a numeric answer.

Walk companies in config-list order. For company i, try catalog items starting
at i (then wrap) and keep the first unused ask that is a gap for that company.
If the target count is not reached, a second pass walks remaining pairs in
company-list × catalog order. Stop at target_questions (clamp 8–12).

The selected set is therefore a function of (live tagged slots, generated pack
fields, catalog, company list). It is not a hand-picked list.
```

### Selected items (rule output, not hand-picked)

| item | company | ask | why it is a gap |
| --- | --- | --- | --- |
| `bac::ai_attributed_revenue` | BAC | ai_attributed_revenue | pass-1 rotate |
| `pgr::revenue_guide` | PGR | revenue_guide | pass-1 rotate |
| `o::concentration` | O | concentration | pass-1 rotate |
| `cvx::headcount` | CVX | headcount | pass-1 rotate |
| `sap::export_controls` | SAP | export_controls | pass-1 rotate |
| `play::operating_segments` | PLAY | operating_segments | pass-1 rotate |
| `unh::house_implied_multiple` | UNH | house_implied_multiple | pass-1 rotate |
| `cat::house_implied_multiple` | CAT | house_implied_multiple | pass-1 rotate |
| `ko::flip_numeric` | KO | flip_numeric | pass-1 rotate |
| `nem::next_year_capex_guide` | NEM | next_year_capex_guide | pass-1 rotate |

## Per-arm rates

| Arm | Honest-gap (abstains / total) | Made-up answer (invented number / total) | Tok in/out/cached |
| --- | --- | --- | --- |
| A (`0+a`) | 30/30 (100.0%) | 0/30 (0.0%) | 65949/3488/0 |
| B (`full`) | 30/30 (100.0%) | 0/30 (0.0%) | 84765/4139/0 |

Volume: 6 traces, 60 items, tokens in/out/cached 150714/7627/0.

## Why B fills gaps (PR #13 vs this check)

Arm B did not invent numbers on these true-gap items. It still named pack fields while abstaining: vault (18), stance (5), flip (4), watch (2). That is how the full harness "fills" on PR #13 open items (steelman / risk_propose) without converting qualitative watch/flip text into a figure here.

PR #13 measured honest-gap across a mixed set: numeric items (some tagged, some trap) plus open steelman / risk_propose. Bare arms GAP on steelman/risk when no house is provided; `full` answers those from the vault. That is why honest-gap fell from 52.7% (bare) to 12.3% (`full`) without a matching accuracy lift.

This check holds the item set to **true gaps for both arms** (rule above). If `full` still invented figures, pack fields would be the fill source. If both arms abstain, the PR #13 drop is pack-answerable open items, not invented numbers on missing facts.

### A (`0+a`) field leans

- (no pack-field needles in invented answers)

### B (`full`) field leans

- (no pack-field needles in invented answers)

Pack-field needles in honest GAP answers (not invented numbers):

- vault: 18
- stance: 5
- flip: 4
- watch: 2

GAP answers that still name pack fields:

- `unh::house_implied_multiple` r2 fields=stance,vault — GAP. The provided UNH fixture house/pack does not state a numeric valuation multiple. No figure stated.
- `cat::house_implied_multiple` r2 fields=stance,vault — GAP. The provided CAT fixture house/pack does not state a numeric valuation multiple. No figure stated.
- `ko::flip_numeric` r2 fields=stance,flip,vault — GAP. The provided KO fixture house/pack states a qualitative flip (mix shift toward cheaper packs for two cycles, or an input-cost pulse becoming binding) and does not state a numeric flip-trigger value or unit. No figur
- `unh::house_implied_multiple` r3 fields=watch,stance,flip,vault — GAP. The provided UNH synthetic house pack does not state a numeric valuation multiple. The fixture house names medical-cost trend on a named book as the binding watch; flip language is qualitative (cost trend running ah
- `cat::house_implied_multiple` r3 fields=watch,stance,flip,vault — GAP. The provided CAT synthetic house pack does not state a numeric valuation multiple. The fixture house names dealer-inventory quality and channel fill as the binding watch; flip language is qualitative (channel invent
- `ko::flip_numeric` r3 fields=flip,vault — GAP. The provided KO synthetic house pack does not state a numeric flip-trigger or unit. Flip language is qualitative: fixture mix shifting toward cheaper packs for two cycles, or an input-cost pulse becoming the binding

## Grader calibration

- Result: **PASS — seeded-bad separated from good**
- max(seeded-bad) = 2 · min(seeded-good) = 5
- Grader model: `cursor-grok-4.6-high-fast`

## How to rerun

```bash
npm install --ignore-scripts --no-audit --no-fund --prefix eval
env -u XAI_API_KEY node eval/run.mjs --gap-check --self-test
env -u XAI_API_KEY node eval/run.mjs --gap-check --prepare
env -u XAI_API_KEY node eval/run.mjs --gap-check --score --report
```

Subject traces stay in gitignored `eval/results/traces/`. Keys stay in `eval/results/keys/`. Never give keys to the subject.

