# Live numbers from SEC companyfacts

Design only. Anthony approved this source-of-truth change after three wording-rule rounds and one iXBRL-instance round failed PR #5 review. This file is committed before the implementation. It does not change product code, the empty desk registry, or the vault.

Decision-support only. No buy/sell/hold, price targets, or sizing. Numbers in fixtures are public SEC structured facts (trimmed) plus harness expected values, not a house view.

Related: [`HARNESS-FIX-PLAN.md`](./HARNESS-FIX-PLAN.md) principles + generalization. PR #5 review comments (goodwill wording, restatement order, sentence fill, dimensional members, 10-Q YTD, scale/sign) are the reasons this design exists.

## Why companyfacts

The live slot (`liveClaims` / `live_claims`) must hand an agent a consolidated, restated, period-correct figure for any public company. Sentence wording cannot do that. A local iXBRL instance parser cannot do that reliably either: restatements reuse a period, 10-Q files mix quarter and YTD, member tags are case-sensitive, and scale/sign/format disagree across documents.

The SEC already publishes one consolidated, non-dimensional JSON per CIK:

```text
https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
```

Each fact already carries `val`, `end`, optional `start`, `fy`, `fp`, `form`, `filed`, and `accn`. Units are explicit (`USD`, `USD/shares`, `EUR`, `shares`). That is the source of truth for headline numbers.

## Feature brief

```text
Feature: live numbers from SEC companyfacts
Class: PLATFORM
Works with product desks=[] ? yes
Scales via registry (desk N free)? yes — CIK + cache path from pack/desk config
Approach: fetch companyfacts on desk add/refresh only; parser and pack read the
local cache and never network. One shared concept→metric JSON. Sentences never
fill a structured numeric slot.
Files planned: docs/LIVE-NUMBERS-DESIGN.md (this file); then ontology/api/companyfacts.py,
memory-cockpit-v2/server/companyfacts.js, ontology/schema/taxonomy_xbrl.json,
ontology/api/companyfacts_fetch.py, ontology/compile/from_companyfacts.py,
harness-stress/fixtures/companyfacts/*, tests. Remove the iXBRL instance parser.
Sync allowlist update? no (server module already covered if xbrlFacts is replaced in place)
Lab hook needed? no
Verify: --assert p0, --assert sectors, parity, ontology unit tests, test:platform, run.mjs
Dogfood: none (no glass pixels; no private desk)
Content left on kernel only: none
Push: not done — awaiting human
```

## Binding laws (from the harness plan)

| Law | Force here |
| --- | --- |
| D-ONTO-5 — compile/retrieve deterministic, no LLM | No classifier model. No network inside parse or pack. |
| D-ONTO-3 — no ticker branch | Concept map has no ticker, product, or sector column. |
| D-ONTO-8 — 10k overview cap | Live-row shape stays compatible with PR #6's cutter. Cap is not raised. |
| D-ONTO-4 — do not hand-edit `ontology/store/` | Compile writes packs. This PR does not compile a private book. |
| AGENTS.md §0.6 / §0.8 | Cache lives under `raw/` (already gitignored). Product `desks: []`. |
| Generalization | Same rules for every filer. A DEMO-only needle is a failed fix. |

## Types

Shared by JavaScript and Python. JSON field names are stable. Values that must match expected fixtures use `value_text`, not a language-specific number type.

### Companyfacts document (SEC, on disk)

```text
{
  cik: number | string,
  entityName: string,
  facts: {
    [taxonomy: "us-gaap" | "ifrs-full" | "dei" | string]: {
      [localName: string]: {
        label?: string,
        description?: string,
        units: {
          [unit: string]: CompanyfactsPoint[]
        }
      }
    }
  }
}
```

`taxonomy` is the SEC group key (`us-gaap`, `ifrs-full`). Canonical concept is `{taxonomy}:{localName}`.

### CompanyfactsPoint (SEC)

```text
{
  end: "YYYY-MM-DD",          // required for a usable point
  start?: "YYYY-MM-DD",       // duration only
  val: number,                // already scaled
  accn: "##########-##-######",
  fy: number,
  fp: "FY" | "Q1" | "Q2" | "Q3" | "Q4",
  form: "10-K" | "10-Q" | "20-F" | "40-F" | "6-K" | "10-K/A" | …,
  filed: "YYYY-MM-DD",
  frame?: string              // SEC-derived (CY2024, CY2024Q2). Not preferred.
}
```

### NormalizedFact (internal)

Produced by the parser from one point. This is what compile stores in `pack.facts` and what `tagged_slots` consumes.

```text
{
  concept: "us-gaap:Revenues",
  value: number,              // JS Number / Python int|float; parity uses value_text
  value_text: string,         // canonical decimal, no scientific notation
  unit: "USD" | "EUR" | "USD/shares" | "shares" | string,
  currency: "USD" | "EUR" | null,   // ISO 4217 when unit is money or money/shares
  period: { type: "instant" | "duration", start: string | null, end: string },
  fy: number | null,
  fp: string | null,
  form: string,
  filed: string,
  accession: string,
  dimensional: false,         // companyfacts is non-dimensional; always false
  source_id: string           // cache path or "companyfacts:{accn}"
}
```

### MetricSpec (shared JSON)

```text
{
  period: "instant" | "duration",
  unit: "currency" | "per_share" | "shares",
  sentence_fill: false,       // structured metrics: always false
  concepts: string[]          // ordered us-gaap:* then ifrs-full:* ; first match wins a period
}
```

Phrase-only metrics (no concepts) are not in this structured list. They stay in `contextpack_metrics.json` for classification and tripwire names. They never overwrite a structured slot.

### Slot (live row)

```text
{
  id: "xbrl:{concept}:{start|end or end}",
  metric_id: string,
  text: string,               // local concept + unit + grouped value + period
  as_of: end date,
  grade: "A",
  source_id: string,
  origin: "companyfacts",
  confidence: "tagged",
  concept, value, value_text, unit, currency,
  period, fy, fp, form, filed, accession,
  prior?: {                   // superseded same-period value (restatement)
    end, value, value_text, filed, accession, restated: true
  },
  ytd?: {                     // same end, longer duration; 10-Q only
    start, end, value, value_text, concept
  }
}
```

`origin` was `xbrl` in the iXBRL round. New rows use `origin: "companyfacts"`. Pack readers that already accept `origin` plus `concept`/`value`/`unit` keep working. PR #6's cutter keys do not depend on `origin`.

### Gap strings

| When | Gap |
| --- | --- |
| Structured metric has no usable point | `{metric_id}: not reported in structured data` |
| Cache file missing | `companyfacts cache missing; headline slots empty` |
| Cache unreadable / not companyfacts-shaped | `companyfacts cache unreadable` |
| Unit is a non-USD currency | slot still fills; `currency` is set. No FX conversion. |
| Phrase-only sentence about a structured metric | context only; optional `{metric_id}: N sentence(s) in context` |
| Fiscal label on a sentence | existing `as_of is a fiscal label without a period-end date` |

Sentences never become the live value of a structured metric. There is no `confidence: low` sentence slot for those ids.

## Module layout

```text
ontology/schema/taxonomy_xbrl.json
    Shared concept → metric map. No ticker column. Read by JS and Python.

ontology/api/companyfacts.py
memory-cockpit-v2/server/companyfacts.js
    Parse a local cache. Select slots. No network. Same algorithm.

ontology/api/companyfacts_fetch.py
    Network fetch only. User-Agent with contact. Rate limit. Write cache.
    Not imported by contextpack, retrieve, ask, agent, or live_claims.

ontology/compile/from_companyfacts.py
    Compile reads raw/{slug}-research/sec/companyfacts.json (or pack override).
    Replaces compile/from_xbrl.py.

ontology/api/xbrl_facts.py
memory-cockpit-v2/server/xbrlFacts.js
    Keep as a thin facade: loadTaxonomy, taggedSlots, mappedFacts, sentenceFillAllowed.
    Delegate to companyfacts. Delete the iXBRL/HTML tokenizer (parse_xbrl_facts).

ontology/api/contextpack.py
memory-cockpit-v2/server/contextpack.js
    live_claims: structured slots from facts; sentences → context_claims.
    Keep parse_as_of, gradeWeight, parse_amounts, classify_metric, residual cap.

ontology/api/ask.py
    Keep the de-literal (no `what is micron`). Do not rewrite the contract scorer.

harness-stress/fixtures/companyfacts/<id>/companyfacts.json
harness-stress/fixtures/companyfacts/<id>/expected.json
harness-stress/fixtures/companyfacts/index.json
    Trimmed real companyfacts + hand-checkable expected headline values.

harness-stress/fixtures/review-sentences.json
    Unchanged corpus. Property tightens: no sentence changes any structured slot,
    including when that slot is empty.
```

Removed after the new parser is green:

- iXBRL instance tokenizer and format/scale/sign helpers that exist only for HTML/XML
- `harness-stress/fixtures/xbrl/*.htm` and `make-fixtures.mjs`
- Sentence-to-number fallback for any metric that has concepts

Kept because they still serve context, dates, and later phases:

- Phrase classification (`contextpack_metrics.json`) for context_claims and residual `other`
- Date parser and grade weighting (F1, F9)
- Unit/amount parser for residual detection and `stale_tripwires` currency match
- Router / `ask.py` de-literal
- `assemble_agent_pack` claim shape for PR #6 size-cap

## Data flow

```text
desk add / refresh (explicit)
    │
    │  GET data.sec.gov/api/xbrl/companyfacts/CIK##########.json
    │  User-Agent: required, must include contact
    │  Rate limit: ≥ 200 ms between requests; never burst
    ▼
raw/{slug}-research/sec/companyfacts.json     ← gitignored (research-wiki/raw/*)
    │
    │  compile / live_claims / retrieve / MCP snapshot
    │  READ ONLY. If the file is absent, slots are empty + gap.
    │  No HTTP client in this path.
    ▼
parse_companyfacts(cache) → NormalizedFact[]
    │
    ▼
tagged_slots(facts) → one Slot per structured metric
    │
    ├─ liveClaims rows (origin companyfacts)
    └─ classified sentences → context_claims (never a numeric slot)
```

Compile (`ontology/compile/run.py`) calls `load_companyfacts(cfg, wiki_root, slug)` instead of `load_filing_facts`. `pack.facts` remains an array of normalized facts so PR #6 and later phases that pass `store.facts` into `live_claims` do not change.

Glass is not edited. `memory-cockpit-v2/src/**` is not edited. `thin-desks.json` stays `desks: []`.

### Fetch rules

- Trigger: desk add (`scripts/scaffold-new-desk.sh` → `./ont facts-fetch`), or an explicit refresh (`./ont facts-fetch TICKER` or `POST /api/{slug}/pipeline/refresh`). Phone and desktop share that glass pipeline. Not on `retrieve`, `ask`, MCP snapshot, book refresh, or every compile.
- URL: `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik10}.json` with a zero-padded 10-digit CIK.
- `User-Agent` from `SEC_USER_AGENT` or pack `sec_user_agent`. Must contain a contact token (`@` or `http`). Fail closed if missing. No default that invents a private email.
- Status 429 / 503: wait and retry once, then fail. Do not spin.
- Write atomically (temp file + rename) to the desk raw folder.
- Tests and `--assert` never call the network. They read fixtures.

### Parser rules (no network)

1. Accept only an object with `facts` as an object. Anything else → unreadable gap.
2. Walk `us-gaap` and `ifrs-full` only for slot fill. Other taxonomies (dei, srt, custom) are ignored for headlines.
3. Emit one `NormalizedFact` per point that has `end`, `val` (number), and a unit key.
4. `period.type` is `duration` when `start` is present, else `instant`.
5. `value_text` is the decimal string of `val` (trim trailing zeros after a decimal; keep integer form when whole).
6. `dimensional` is always false. Companyfacts is the consolidated series.

## Selection rules

For each structured metric:

1. Candidates = facts whose `concept` is in that metric's ordered list, whose `period.type` matches the spec, whose unit kind matches, and whose `form` (strip `/A`) is one of `10-K`, `10-Q`, `20-F`, `40-F`, `6-K`.
2. Drop frame-only points that lack `accn` or `form` when a filing-backed point exists for the same concept+period+unit.
3. **Same period** (`end` + `start` or instant `end`): pick the latest `filed`. Tie → latest `accn` (string compare is the accession order the SEC issues). The displaced value, if `value_text` differs, is `prior` with `restated: true`.
4. **Current slot** among remaining period winners:
   - Latest `end` wins (most recent reported period).
   - Same `end`, duration metric:
     - If the winning form family is `10-Q` (or a 6-K with `fp` in Q1–Q3): prefer quarter duration (70–110 days) over YTD (111–340) over annual (≥ 341). Attach the YTD point as `ytd`.
     - If the winning form family is `10-K` / `20-F` / `40-F` (or 6-K with `fp=FY`): prefer annual duration. No `ytd`.
   - Then concept list order (earlier concept wins).
   - Then later `filed` / `accn`.
5. Instant metrics (cash, debt, goodwill): `end` only. No duration contest. Latest `end`, then latest `filed`.
6. Units:
   - `currency`: unit is a 3-letter ISO code (`USD`, `EUR`, …). Store it on the slot. Do not convert.
   - `per_share`: unit is `{ISO}/shares` (companyfacts `USD/shares`).
   - `shares`: unit is `shares`.
   - Other units do not fill.
7. Do not sum two concepts (no “current debt + noncurrent debt”). If the filer never reports a mapped total-debt concept, the slot is empty and the gap says so.
8. A reported zero is a value. Absence is a gap.

This is the opposite of the iXBRL round's “longer duration wins,” which made 10-Q YTD beat the quarter (PR #5 review). Restatements win by `filed`/`accn`, which is the opposite of “first definition kept.”

## Metric list

One shared file: `ontology/schema/taxonomy_xbrl.json`. Headline ids are short. Tripwire ids that already have concepts stay so `risk_metric` and `stale_tripwires` do not fork.

### Headline (always structured, never sentence-filled)

| id | period | unit | Ordered concepts |
| --- | --- | --- | --- |
| `company_revenue` | duration | currency | `us-gaap:Revenues`, `us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax`, `us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax`, `us-gaap:SalesRevenueNet`, `us-gaap:RegulatedAndUnregulatedOperatingRevenue`, `us-gaap:PremiumsEarnedNet`, `us-gaap:OperatingLeaseLeaseIncome`, `us-gaap:RevenueFromCollaborativeArrangementExcludingRevenueFromContractWithCustomer`, `ifrs-full:Revenue`, `ifrs-full:RevenueFromContractsWithCustomers` |
| `operating_income` | duration | currency | `us-gaap:OperatingIncomeLoss`, `ifrs-full:ProfitLossFromOperatingActivities` |
| `net_income` | duration | currency | `us-gaap:NetIncomeLoss`, `ifrs-full:ProfitLoss` |
| `diluted_eps` | duration | per_share | `us-gaap:EarningsPerShareDiluted`, `us-gaap:IncomeLossFromContinuingOperationsPerDilutedShare`, `ifrs-full:DilutedEarningsLossPerShare`, `ifrs-full:BasicAndDilutedEarningsLossPerShare` |
| `cash` | instant | currency | `us-gaap:CashAndCashEquivalentsAtCarryingValue`, `us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents`, `ifrs-full:CashAndCashEquivalents` |
| `operating_cash_flow` | duration | currency | `us-gaap:NetCashProvidedByUsedInOperatingActivities`, `us-gaap:NetCashProvidedByUsedInOperatingActivitiesContinuingOperations`, `ifrs-full:CashFlowsFromUsedInOperatingActivities` |
| `total_debt` | instant | currency | `us-gaap:LongTermDebt`, `us-gaap:LongTermDebtAndCapitalLeaseObligations`, `us-gaap:LongTermDebtNoncurrent`, `ifrs-full:LongtermBorrowings`, `ifrs-full:Borrowings` |
| `goodwill_impairment` | duration | currency | `us-gaap:GoodwillImpairmentLoss`, `ifrs-full:ImpairmentLossRecognisedInProfitOrLossGoodwill` |

`long_term_debt` remains an alias of `total_debt` in the map (same concepts, same slot id `total_debt`) so existing tripwire names that map to `long_term_debt` still resolve. Implementation: `risk_metric` “long-term debt” → `total_debt`, and `tagged_slots` emits `total_debt` only.

### Also structured (already used by tripwires / sector fixtures)

Same `sentence_fill: false` rule. Missing → gap, not a sentence.

`impairment`, `goodwill`, `inventory`, `net_interest_income`, `interest_revenue`, `credit_loss_provision`, `rnd_expense`, `rpo_backlog`, `purchase_commitments`, `capex`, `diluted_shares`, `guarantees`, `share_repurchase`, `dividends`.

Concepts stay the us-gaap / ifrs-full lists already in `taxonomy_xbrl.json` unless a fixture proves a better ordered head. Do not add a non-GAAP label (FFO, EBITDA).

### Phrase-only (no companyfacts concept)

`gross_margin`, `revenue_guide`, `concentration`, `export_controls`, `headcount`, `operating_segments`.

These are not headline totals. They may still appear as live rows from classified sentences so date-sorting, grade-weight, residual, and tripwire name tests keep passing. They cannot overwrite a structured slot (they have different ids).

## Fallback rules

| Situation | Behavior |
| --- | --- |
| No cache | All structured slots empty. Gap `companyfacts cache missing; headline slots empty`. |
| Cache present, concept absent | That slot empty. Gap `{id}: not reported in structured data`. |
| Cache present, only dimensional would have existed | N/A — companyfacts has no dimensions. |
| Sentence names a structured metric | `context_claims` with reason `structured_slot` or `no_structured_fact`. Live value unchanged. |
| Sentence names a phrase-only metric | Existing phrase rules. May be a live row. |
| Residual numbered sentence | `other`, cap 8, same as today. |
| Newer sentence than a tagged slot | Context + count gap. Not a replacement. |
| Cross-currency tripwire | Existing gap `cross-currency tripwire; currencies not compared`. |
| Custom extension concept | Unmapped. Not guessed. |
| 53-week year | Duration ≥ 341 counts as annual. Period end is the filed `end`, not snapped to a calendar quarter. |
| Unpadded / written dates on sentences | Existing `parse_as_of`. Not used to pick a companyfacts point. |

**Forbidden fallbacks.** Guess a year-end month from sector. Convert EUR to USD. Sum two debt concepts. Fill a headline from “Revenue was $X”. Parse iXBRL HTML when the cache is missing. Call the SEC from `live_claims`.

## Compatibility with later phases

| Phase | What this must not break |
| --- | --- |
| P1 / PR #6 | `live_claims` still returns one row per metric plus residual `other`. `assemble_agent_pack` still emits `schema: contextpack.v2` with `claims`, `context_claims`, `gaps`. Overview cap 10,000. No MU series filter reintroduced. |
| P2 / PR #7 | No GO / house-write changes. |
| P3 / PR #8 | No new-desk command growth beyond a one-line “fetch companyfacts on add” pointer if needed. Taxonomy stays out of the command. |
| P4 / PR #9 | MCP catalog untouched. |

Merge forward is rebase-or-merge of this branch into `#6` → `#7` → `#8` → `#9` after `--assert p0` is green. No force-push. PRs stay open drafts. Do not merge them to main.

## Fixture set

`harness-stress/fixtures/companyfacts/`. Public SEC data, trimmed to headline concepts plus the tripwire concepts the selector needs. Not a desk. Not a house view. Not Anthony’s vault.

Ten sectors from the plan, plus a restatement case and a 10-Q YTD case. Extra names only if needed to reach a clean expected.json. Avoid kernel dogfood tickers (`NVDA`, `MU`, `LLY`) and covered pack names used as product defaults.

| id | Sector / case | Form | Reporting | Why |
| --- | --- | --- | --- | --- |
| `bank` | Bank | 10-K | us-gaap | Top line + net interest; deposits must not become cash |
| `insurer` | Insurer | 10-K | us-gaap | Premiums concept |
| `reit` | REIT | 10-K | us-gaap | Rental / lease income concept |
| `utility` | Utility | 10-K | us-gaap | Operating / regulated revenue |
| `biotech` | Biotech | 10-K | us-gaap | Collaboration or product revenue |
| `retail` | Retail | 10-K | us-gaap | Net sales; 52/53-week `end` |
| `energy` | Energy | 10-K | us-gaap | Revenue; production units must not fill |
| `industrial` | Industrial | 10-K | us-gaap | Operating income |
| `software` | Software | 10-K | us-gaap | Revenue + RPO if present |
| `fpi` | Foreign private issuer | 20-F | ifrs-full | IFRS concepts; non-USD flagged |
| `restate` | Restatement | 10-K + later 10-K/A or later accn | us-gaap | Same `end`; later `filed` wins; `prior` is the old val |
| `qtd` | 10-Q YTD | 10-Q | us-gaap | Quarter duration is live; YTD is `ytd` |

Each folder:

```text
companyfacts.json   # trimmed SEC document (entityName, cik, facts for mapped concepts)
expected.json       # headline slots + gaps, hand-checkable against that filing
```

`expected.json` shape:

```text
{
  "id": "bank",
  "cik": "##########",
  "form": "10-K",
  "reporting": "us-gaap",
  "currency": "USD",
  "slots": {
    "company_revenue": {
      "value_text": "…",
      "end": "YYYY-MM-DD",
      "concept": "us-gaap:…",
      "form": "10-K",
      "filed": "YYYY-MM-DD",
      "unit": "USD"
    }
  },
  "empty": ["goodwill_impairment"],
  "gaps_contain": ["goodwill_impairment: not reported in structured data"]
}
```

CIK and entity name in a fixture are public registrant identifiers. They are not desks.

## Test plan

Proof is exit codes, not report prose.

1. **Exact slot match.** For every fixture id, JS `taggedSlots(parseCompanyfacts(cache))` and Python `tagged_slots(parse_companyfacts(cache))` equal `expected.json` on `value_text`, `end`, `concept`, `form`, `filed`, `unit`, `ytd.value_text` (when present), and `prior.value_text` (when present).
2. **Parity.** Same cache bytes → same normalized facts and same slots in both languages (`contextpack-parity.mjs` + `parity_live.py`).
3. **Review sentences.** Every sentence in `review-sentences.json` (reviews 1–3, held-out, reviewer pairs), alone and together, leaves every structured slot’s `value_text` unchanged. An empty structured slot stays empty. No sentence creates `origin: "sentence"` on a structured `metric_id`.
4. **Restatement.** `restate` expected: later `filed` wins; `prior` is the superseded val.
5. **10-Q YTD.** `qtd` expected: live duration in 70–110 days; `ytd` present and different.
6. **Date / grade (kept).** `--assert p0` still has `C-date-unpadded`, `C-date-iso`, `C-missing-grade`, `C-same-day-tie` on phrase-only `gross_margin` claims.
7. **De-literal (kept).** `ask.py` must not contain `what is micron`. New router needles are not issuer names.
8. **Issuer-token grep.** `taxonomy_xbrl.json` and `contextpack_metrics.json` contain none of the banned tokens.
9. **No network in parse.** Unit tests call parse with fixture paths only. A monkeypatch/assert that `https` is not opened from `companyfacts.py` / `companyfacts.js`.
10. **Empty product.** `thin-desks.json` `desks: []`. No `src/**`. No secrets. No `XAI_API_KEY`.
11. **Gates.** All must exit 0:

```text
node harness-stress/run.mjs --assert p0
node harness-stress/run.mjs --assert sectors
node memory-cockpit-v2/scripts/contextpack-test.mjs
node memory-cockpit-v2/scripts/contextpack-parity.mjs
python3 -m unittest tests.test_companyfacts tests.test_contextpack_live tests.test_ask_router_needles
npm run test:platform --prefix memory-cockpit-v2
node harness-stress/run.mjs
```

After merge-forward onto `cursor/harness-p5-tool-catalog-440b`: `--assert p0` through `--assert p5` and `--assert sectors`.

## Known limits (accepted)

- Companyfacts lags a new filing until the SEC rebuilds the JSON. Refresh is explicit.
- A filer that never tags a mapped concept has an empty slot, even if a prose sentence names the line.
- Total debt is one reported concept, not a computed sum.
- 6-K content is uneven; form + `fp` + duration decide whether it is treated as annual or interim.
- Custom extension taxonomies are unmapped.
- Phrase-only metrics can still misclassify; they are not headline totals.
- JS `Number` and Python `int` can disagree above 2^53. Headline money amounts in the fixture set are below that. `value_text` is the compared field.
- Fetch requires a contact User-Agent. Cloud CI without `SEC_USER_AGENT` does not fetch; it uses committed fixtures.

## Out of scope

- Glass UI, CSS, `src/**`, `model.js`, `from_cockpit.py`
- Merging PRs #5–#9 to main
- Registering fixture issuers as desks
- FX conversion, non-GAAP metrics, per-ticker concept overrides
- Calling a model to pick a line item
