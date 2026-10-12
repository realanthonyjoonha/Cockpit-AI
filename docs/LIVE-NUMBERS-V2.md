# Live numbers V2 — latest filing, labeled facts, no ranking engine

Design only. Anthony chose this shape (option 4): drop the hand-written ranking engine. The model interprets labeled facts. This file is the architect sketch. It does not change product code, the empty desk registry, or the vault.

Decision-support only. No buy/sell/hold, price targets, or sizing.

Replaces the V1 ranking design in [`LIVE-NUMBERS-DESIGN.md`](./LIVE-NUMBERS-DESIGN.md) (PR #5). Do not implement from V1. The cancelled de-hardcode commits on #5–#9 were rolled back; those branches are the last reviewed tips.

Related: [`HARNESS-FIX-PLAN.md`](./HARNESS-FIX-PLAN.md). D-ONTO-5 (deterministic parse, no LLM in pack), D-ONTO-3 (no ticker branch), D-ONTO-8 (10k overview cap stays).

```text
Feature: live numbers V2 — latest filing, per-period labeled values
Class: PLATFORM
Works with product desks=[] ? yes
Scales via registry (desk N free)? yes — CIK + cache path from pack/desk config
Approach: fetch companyfacts on desk add/refresh only; offline parser
groups the latest periodic filing's true-total tags by period
(start/end). Quarter, YTD, and annual are different periods and all
show, each fully labeled. A period is empty only when two true-total
tags disagree on that same period. Sentences never fill a structured
number. Taxonomy is true totals only. No ranking, no stale cutoff, no
lease/sector special case, no frozen issuer numbers in tests.
```

---

## Problem

V1 tried to hand an agent one “right” consolidated number per metric. That required a ranking engine: latest period end, then quarter vs YTD vs annual, then concept-list order, then span, then filed/accn, plus a stale window, plus total-vs-component kinds, plus 6-K / 10-KT duration special cases. Every new filer or tag produced another rule. Tests froze live SEC dollars and point counts so the engine would not drift. Anthony does not want that.

The pack should show what the latest periodic filing tagged, fully labeled, **for each distinct period**. Quarter, YTD, and annual are different periods (different `start`/`end`), not a fight. The only time the parser cannot choose is when two true-total tags give different values for the **same** period.

Constraints the sketch must honor:

- `live_claims` / `liveClaims` still returns **at most one live row per metric_id** plus residual `other`. That one row may list several labeled periods. P1’s 10k cutter and P3 cited cards consume the row, not a hidden winner.
- Parse and pack stay offline and deterministic. No network inside `companyfacts.py` / `companyfacts.js`. No model in the parser.
- Fetch stays on desk add / pipeline refresh only (`companyfacts_fetch.py` / `companyfactsFetch.js`).
- Product `thin-desks.json` stays `desks: []`. Cache lives under `raw/` (gitignored).
- JS and Python stay twins.

---

## Usage (caller’s view)

Compile and the JS pack host already do this. V2 does not add a new caller API.

```text
# desk add / refresh (network, once)
refresh_desk_companyfacts(cfg, wiki, slug)
  → raw/{slug}-research/sec/companyfacts.json
  → companyfacts.status.json on failure

# compile / retrieve (no network)
loaded = load_companyfacts(cfg, wiki, slug)
pack.facts = loaded.facts
pack.gaps += loaded.notes          # missing filing / same-period tag conflict

# live row
live, context = live_claims(sentences, rules, facts=loaded.facts)
# structured metric → companyfacts row (one or more labeled periods) or empty
# never origin:"sentence"
```

What a caller reads on a typical latest 10-Q (quarter and YTD are both shown):

```text
company_revenue:
  Revenues USD 57,347,000,000 for 2026-04-01 to 2026-06-30
  (quarter, form 10-Q fp=Q2 filed 2026-08-06 accn 0000019617-26-000423)
  Revenues USD 107,183,000,000 for 2026-01-01 to 2026-06-30
  (ytd, form 10-Q fp=Q2 filed 2026-08-06 accn 0000019617-26-000423)
```

What a caller reads when two true-total tags disagree on the **same** period:

```text
gap: company_revenue 2026-04-01/2026-06-30: latest filing 0000019617-26-000423
     has 2 disagreeing tagged facts
  - us-gaap:Revenues USD 57347000000 10-Q Q2
  - us-gaap:RevenuesNetOfInterestExpense USD 48000000000 10-Q Q2
```

Other periods in that filing still show if they uniquely agree.

The model, not the parser, reads the labels. Glass / MCP (`get_pack_snapshot`) keep seeing `claims` + `gaps`. No new tool.

---

## Shape

### Latest filing, group by period

Public surface stays three functions: `parse_companyfacts`, `latest_filing_slots`, `load_companyfacts`. All selection policy dies behind `latest_filing_slots`.

**Period key** = `(period.start, period.end)`. Instant facts use `(null, end)`. A 90-day quarter and a 180-day YTD that share an `end` are **two periods**. An annual with a different `start` is a third. Duration length is a label (`duration_days`, and a display word `quarter` / `ytd` / `annual` / `other` derived from day count only for the text), never a rank key and never a reason to drop a period.

1. Parse the local SEC document into `NormalizedFact` rows (allowed forms only; `value_text` is the compared field).
2. **Latest periodic filing** = the accession with the maximum `(filed, accession)` among facts whose form family is one of `10-K`, `10-Q`, `20-F`, `40-F`, `6-K`, `10-KT`. `/A` is stripped before the family test; the amendment’s accession is a distinct filing.
3. For each structured metric, **candidates** = facts in that accession whose concept is in the metric’s true-total tag list and whose unit kind matches the spec.
4. **Group candidates by period key.**
5. Inside one period, candidates **agree** when they share `value_text` and `unit`.
6. If a period has no candidates → that period is simply absent (not a gap).
7. If a period’s candidates all agree → emit one `LabeledFact` for that period. Stable tag pick is lexicographic `concept` (identity, not economic priority). `tags` lists every agreeing concept.
8. If a period’s candidates disagree → omit that period from the slot’s `values`; gap `{id} {start}/{end}: latest filing {accn} has {n} disagreeing tagged facts` plus one labeled line per candidate.
9. If the metric has **no** unique periods → no live row; if there were also no candidates at all, gap `{id}: not reported in latest filing {accn}`.
10. A sentence never fills a structured metric. Phrase-only metrics are unchanged.

The parser does **not**: prefer quarter over YTD over annual; hide YTD as a sidecar; prefer `Revenues` over `RNIE`; drop old tags by day count; fill from a component; guess a year-end month; sum two concepts; convert currency.

### Why this interface

Callers still see one row per metric. The row’s `values[]` is the list of unique periods. Same-period tag fights stay in the gap. That is deeper than an always-on bag (callers do not have to ignore duplicates) and honest than V1 (no hidden duration winner).

---

## Types

Shared JSON field names. Parity compares `value_text` on each `values[]` entry, not a language number.

### Companyfacts document (SEC, on disk)

Unchanged. `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` cached at `raw/{slug}-research/sec/companyfacts.json`.

### NormalizedFact

```text
{
  concept: "us-gaap:Revenues",
  value_text: "57347000000",     // canonical decimal; no scientific notation
  unit: "USD" | "EUR" | "USD/shares" | "shares" | string,
  currency: "USD" | "EUR" | null,
  period: { type: "instant" | "duration", start: string | null, end: string },
  duration_days: number | null,  // labeled only; never a rank key
  fy: number | null,
  fp: string | null,
  form: string,                  // as filed, including /A
  filed: string,                 // YYYY-MM-DD
  accession: string,
  source_id: string
}
```

`dimensional` is gone (companyfacts has no dimensions). `value` may still exist for display; tests and parity use `value_text`.

### PeriodKey

```text
{ start: string | null, end: string }
```

Two facts share a period iff `start` and `end` are equal. Display span (`quarter` / `ytd` / `annual` / `other`) is derived from `duration_days` for the label only:

```text
instant            → (no span word)
70–130 days        → "quarter"
131–340 days       → "ytd"
≥ 341 days         → "annual"
anything else      → "other"
```

These buckets are **labels**, not a contest. A 111-day point and a 180-day point with different starts both show.

### LabeledFact (one shown period, or one gap line)

```text
{
  concept: string,
  tags: string[],                // agreeing concepts on this period
  value_text: string,
  unit: string,
  currency: string | null,
  period: { type: "instant" | "duration", start: string | null, end: string },
  duration_days: number | null,
  span: "quarter" | "ytd" | "annual" | "other" | null,
  form: string,
  fp: string | null,
  fy: number | null,
  filed: string,
  accession: string
}
```

### MetricSpec (`taxonomy_xbrl.json`)

```text
{
  sentence_fill: false,
  period: "duration" | "instant",   // filter only; not a rank
  unit: "currency" | "per_share" | "shares",
  concepts: ["us-gaap:Revenues", "us-gaap:SalesRevenueNet", "..."]
}
```

True totals only. No `kind`, no `fallback`, no `selection.stale_days`, no ticker/sector column. List order is unused for picking. An unmapped tag is not guessed.

Phrase-only metrics keep empty `concepts` and may still take a sentence row.

### Slot (filled — at least one unique period)

```text
{
  id: "xbrl:{metric_id}:{accession}",
  metric_id: "company_revenue",
  text: string,                  // one labeled block per values[] entry
  as_of: string | null,          // values[0].period.end only when len(values)==1
  grade: "A",
  origin: "companyfacts",
  confidence: "tagged",
  values: LabeledFact[],         // unique periods, sorted by end then start
  concept: string | null,        // copied from the sole value when len==1
  value_text: string | null,     // sole value only; null when 2+ periods
  unit: string | null,
  currency: string | null,
  period: object | null,
  fy, fp, form, filed, accession // from the sole value, else accession + nulls
}
```

`value_text` is set **only** when there is exactly one shown period. Two periods (quarter + YTD) must not pick a silent winner for tripwires. Callers that need a single number read `values[]` and choose a period explicitly, or they read `text`.

No `ytd` sidecar. No `prior` sidecar. YTD is a first-class `values[]` entry.

### Gap notes (strings, pack.gaps)

```text
companyfacts cache missing; headline slots empty
companyfacts cache unreadable
{mid}: not reported in latest filing {accn}
{mid} {start}/{end}: latest filing {accn} has {n} disagreeing tagged facts
  - {concept} {unit} {value_text} {form} {fp}
```

---

## Function signatures

Python names; JS is the camelCase twin. Bodies are `not implemented` until the implement pass.

```python
ALLOWED_FORMS = {"10-K", "10-Q", "20-F", "40-F", "6-K", "10-KT"}

def parse_companyfacts(doc: object, *, source_id: str | None = None) -> dict:
    """NormalizedFact list. No network. No ranking."""

def latest_accession(facts: list[dict]) -> str | None:
    """max (filed, accession) among ALLOWED_FORMS. None if empty."""

def period_key(fact: dict) -> tuple:
    """(period.start, period.end). Instant → (None, end)."""

def span_label(duration_days: int | None, period_type: str) -> str | None:
    """Display word only. Not a rank key."""

def candidates_for(metric_id: str, facts: list[dict], accession: str, tax: dict) -> list[dict]:
    """Mapped true-total facts in that accession with a matching unit kind."""

def group_by_period(facts: list[dict]) -> dict[tuple, list[dict]]:
    """Partition by period_key."""

def agree(a: dict, b: dict) -> bool:
    """Same value_text and unit. Period is already equal inside a group."""

def latest_filing_slots(facts: list[dict], tax: dict | None = None) -> tuple[dict, list[str]]:
    """
    Returns (slots, gaps).
    slots[mid] is a Slot with values[] (unique periods) or absent.
    gaps: missing cache / not reported / same-period tag conflicts.
    """

def tagged_slots(facts: list[dict], tax: dict | None = None) -> dict:
    """latest_filing_slots(...)[0]. Name kept so live_claims does not fork."""

def headline_gaps(slots: dict, tax: dict | None = None, facts: list[dict] | None = None) -> list[str]:
    """latest_filing_slots(...)[1] when facts is provided."""

def load_companyfacts(cfg: dict, wiki_root: Path, slug: str) -> dict:
    """Read cache or override path. Missing → empty facts + cache gap. Never fetches."""

def sentence_fill_allowed(metric_id: str, tax: dict | None = None) -> bool:
    """False when the metric lists any concept."""

def structured_metric(metric_id: str, tax: dict | None = None) -> bool:
    """True when the metric lists any concept or is an alias."""
```

Fetch (unchanged ownership; still the only network):

```python
def refresh_desk_companyfacts(cfg, wiki_root, slug, *, user_agent_value=None) -> dict:
    """Resolve CIK, GET companyfacts, atomic write cache + status. Not imported by parse/pack."""
```

Delete these V1 names (do not leave aliases):

```text
select_slots, duration_kind, fact_is_stale, stale_days, staleDays,
concept_kind, conceptKind, KIND_TOTAL, KIND_COMPONENT,
COMPONENT_ONLY_GAP, STALE_GAP, STALE_DAYS,
slot_snapshot, expected_snapshot, selection_errors, taxonomy_errors
```

`live_claims` / `liveClaims` keep their signature. They call `tagged_slots`. They do not attach `ytd` / `prior`. They still refuse `origin: "sentence"` on a structured metric.

---

## Module layout

| Path | Owns | V2 change |
| --- | --- | --- |
| `ontology/schema/taxonomy_xbrl.json` | True-total tag lists | Drop `kind`, `fallback`, `selection`. Totals only. |
| `ontology/api/companyfacts.py` | Parse + per-period unique-or-gap | Delete ranking. Add `latest_accession` / `group_by_period` / `latest_filing_slots`. |
| `memory-cockpit-v2/server/companyfacts.js` | JS twin | Same. |
| `memory-cockpit-v2/server/xbrlFacts.js` | Facade | Re-export the new names; drop ranking exports. |
| `ontology/api/xbrl_facts.py` | Facade | Same. |
| `ontology/api/companyfacts_fetch.py` | Network | Keep. |
| `memory-cockpit-v2/server/companyfactsFetch.js` | Network twin | Keep. |
| `ontology/compile/from_companyfacts.py` | Cache load into pack | Keep; `mapped_facts` = listed totals only. |
| `ontology/api/contextpack.py` | `live_claims` | Call `tagged_slots`; no `ytd`/`prior`. |
| `memory-cockpit-v2/server/contextpack.js` | `liveClaims` | Same. |
| `scripts/refresh-companyfacts-fixtures.py` | Live refresh helper | Keep as **opt-in test input**, not a snapshot oracle of dollars. |

No new per-ticker module. No Glass UI. No MCP tool.

---

## What gets deleted

### Engine

- Duration classification used as a **winner** (`duration_kind` as rank, 10-KT FY force-annual, 6-K annual-anchor). Day-count span remains a **label** only.
- Rank tuple (quarter > YTD > annual, concept-list index, span, filed/accn).
- Same-end YTD **sidecar** (`slot.ytd`). YTD is a normal period in `values[]`.
- Restatement `prior` sidecar (later filed in an **older** accession is not in the latest filing).
- Stale window (`selection.stale_days`, `fact_is_stale`, `STALE_DAYS`).
- Total vs component / lease-only / `COMPONENT_ONLY_GAP`.
- Fallback-vs-primary contest. One concept list per metric.

### Fixtures and tests

- Frozen issuer amounts and point counts in tests (`57347000000`, `149`, and the rest).
- `expected.json` as a hand-edited or script-locked dollar oracle for live sectors.
- Synthetic ranking cases that exist only to pin V1 rules: `primary-ytd`, `span-tie`, `span-tie-rev`, `sixk-fy-q`, `tenkt-short`, `tenkt-q`, `k-vs-q4`, `lease-only`, `stale-pad`, `stale-slot`, `old-primary`, `concept-priority`, `q111` / `q111-rev` as **ranking** locks.
- `prove_review_fixes.py` / `.mjs` (they prove ranking needles).
- Completeness pins that exist to freeze a live point count.

Keep: a few **constructed** documents (not live CIKs) that show unique period / two periods / same-period disagree / none; review sentences that must not fill; the fetch mock tests.

### Docs

- V1 selection rules in `LIVE-NUMBERS-DESIGN.md` are historical. Implement from this file. A later commit can mark V1 superseded; do not edit V1 in the design PR.

---

## Migration for #6–#9

V2 is this design branch **off main** (PR #10), not a commit on `cursor/harness-p0-live-claims-82aa`. #5–#9 were reset to the last reviewed tips (`cbe6eed` / `9143b2d` / `c91da88` / `a73bbca` / `9ac529b`). Do not merge V1 ranking forward. Do not merge #5–#9 to main as part of this design.

| PR | What it owns | V2 impact | How to migrate |
| --- | --- | --- | --- |
| #5 P0 | Companyfacts parse + ranking + fixtures | **Replace.** Ranking, stale, frozen snapshots go away. Fetch + offline parse + sentence ban stay. | Implement V2 on this design’s follow-up branch. Do not stack ranking fixes on #5. |
| #6 P1 | 10k overview cap, no MU series filter | One row per metric still. `text` is longer when quarter + YTD both show. `value_text` is null when 2+ periods. | Re-run `--assert p1`. Cutter still applies. If labeled text is long, trim display lines in the formatter, not the cap. Tripwires that read `value_text` must use `values[]` when there are two periods. |
| #7 P2 | GO / house-write refuse | Does not read ranking. | Re-run `--assert p2`. No GO change. |
| #8 P3 | Slice cards, 32k tail | Cards cite the live row. Several labeled periods are one card, not two metrics. | Re-run `--assert p3`. Citation code stays. |
| #9 P5 | MCP catalog trim | Catalog does not encode ranking. Snapshot text lists periods. | Re-run `--assert p5`. No catalog change. |

Forward merge after V2 is implemented and green:

```text
V2 implement branch (off main or off this design commit)
  → merge into P1 / P2 / P3 / P5 only when a human asks
  → do not merge #5’s ranking engine forward again
```

Parity: JS and Python `latest_filing_slots` on the same cache bytes must match each `values[]` entry’s `value_text`, `period`, `accession`, `concept`, and the gap strings.

---

## Test strategy

No frozen live issuer numbers. No hardcoded point counts. `expected.json` is not an oracle.

### Properties (always, both languages)

1. **Each shown period value is a tagged fact in the latest filing.** For every `values[]` entry, some parsed fact has the same `concept` (or one of `tags`), `value_text`, `unit`, `period`, `form`, `filed`, and `accession`, and that accession equals `latest_accession(facts)`.
2. **No ranking leftovers.** Every shown fact’s accession is the latest accession. No slot has `ytd` or `prior` sidecars. `value_text` on the slot is null unless `len(values)==1`.
3. **Different periods are not a conflict.** A latest 10-Q that tags a quarter and a YTD (different `start`, same or different `end`) yields **two** `values[]` entries when each period’s tags agree. Tests must fail if the parser empties the metric or keeps only one span.
4. **Same-period tag disagree ⇒ that period omitted.** If two mapped totals share `start`/`end` and differ on `value_text` or `unit`, that period is absent from `values[]` and the gap lists both labeled lines. Other periods still show.
5. **None ⇒ empty.** No mapped total in the latest accession ⇒ `{id}: not reported in latest filing`.
6. **Sentences never fill.** Every review sentence, alone and together, leaves structured `metric_id`s without `origin: "sentence"`.
7. **Parse has no network.** `companyfacts.py` / `companyfacts.js` contain no HTTP client.
8. **Taxonomy is totals-only data.** No `kind`, no `stale_days`, no issuer token (existing banned-word grep).
9. **Agreeing tags on one period do not invent a value.** The shown `value_text` equals each agreeing candidate in that group.

### Constructed documents (tiny, not live CIKs)

Four synthetic files are enough:

- `unique` — one mapped tag, one period, one 10-K → filled, one `values[]` entry, `value_text` set, fully labeled.
- `two-periods` — one mapped tag, same accession, quarter + YTD (different `start`) → **two** `values[]` entries; slot `value_text` is null; no conflict gap.
- `same-period-disagree` — two mapped tags, same accession, **same** `start`/`end`, different `value_text` → that period omitted; gap lists both; no other period unless present.
- `none` — latest 10-Q has cash, no revenue tag → `company_revenue` empty.

Values in these files are local to the test document. They are not live SEC figures and are not copied into other tests as literals.

### Opt-in live refresh-and-compare

`COCKPIT_LIVE_COMPANYFACTS=1` (plus contact `SEC_USER_AGENT`):

1. Fetch companyfacts for a small public CIK set used only as **input**.
2. Run `latest_filing_slots` on the fresh bytes.
3. Re-run on a second read of the same bytes → identical slots and gaps (determinism).
4. Assert properties 1–5 on the live parse (including: if the latest filing has both a short and a long duration on a total tag, both periods appear when each is unique).
5. Do **not** assert a dollar amount or a point count.

CI never sets the env. Cloud without a User-Agent does not fetch.

### What `--assert p0` becomes

Drop V1 ranking cases. Keep: review sentences vs structured slots, DEMO phrase-only date/grade cases, empty `desks: []`, banned issuer tokens, JS/PY parity on constructed + any cached extract **via properties**, not dollar equality.

`--assert p1`–`p5` stay their own gates.

### Delete

`prove_review_fixes.py` / `.mjs`, `expected.json` dollar snapshots, `source-concepts.json` count pins, review-check literals that name live amounts.

---

## Synthesis decision

Anthony rejected V1 (ranking engine) and the de-hardcode-in-place follow-up (kinds + stale config wrapping that engine; rolled back).

V2 shapes compared:

1. **Per-period unique-or-gap (this file, Anthony’s fix).** Latest accession. Group by `(start, end)`. Show every unique period. Conflict only when two true totals disagree on the same period.
2. **Filing-level unique-or-gap (draft #10 before this fix).** Any two facts that differed in value *or period* emptied the whole metric. That treated quarter vs YTD as a conflict. Rejected.
3. **Always-bag.** Latest accession always emits every tagged fact; callers pick. Shallower module. Lost.

Rejected: keep V1 and only move constants into JSON.

---

## Tradeoffs accepted

- We accept **a longer live-row `text`** (quarter + YTD + maybe annual) in exchange for never ranking duration.
- We accept **`value_text` null when two+ periods show** in exchange for not silently feeding tripwires the quarter (or the YTD).
- We accept **lexicographic tag pick** when several totals already agree on one period, in exchange for not encoding a primary/fallback order.
- We accept **dropping restatement `prior`** in exchange for “latest filing only.” An amendment is a new accession.
- We accept **no stale window** in exchange for honesty: a tag absent from the latest filing is a gap, even if an older filing had it.
- We accept **10-KT in `ALLOWED_FORMS`** (Anthony named 10-K / 10-Q / 20-F / 40-F / 6-K) so a transition report can be the latest filing, with **no** duration special case. Confirm or drop 10-KT before implement.

---

## Alternatives considered

- **V1 ranking (quarter > YTD > annual, concept order, stale, kinds).** Lost: policy the human does not want; tests froze live numbers to lock it.
- **Filing-level unique-or-gap.** Lost: Anthony said quarter / YTD / annual are different periods, not a conflict.
- **Always-bag.** Lost on interface depth.
- **Latest period end across all filings.** Lost; “latest filing” is the only time key.

---

## Open questions and risks

- Should **10-KT** be allowed? This sketch includes it as a periodic form with no extra rule.
- **Callers that assume one `value_text` per metric** (tripwires, some P1 DEMO cases) will see `null` on a 10-Q that reports both quarter and YTD. They must read `values[]` or `text`. That is the main product risk, replacing the old “10-Q always empty” risk.
- **P1 budget:** listing three labeled periods is longer than one V1 number. Cap is unchanged; formatter may shorten labels, not drop a period.
- **Same filed date, two accessions:** latest accession string wins. Confirm SEC accession order (V1 already used it).
- **Unit disagreement** on the same period (USD vs USD/shares) is a same-period conflict, not a conversion.
- **Same-period, same value, different tags** (Revenues and RNIE both 57B for Q2) shows once, `tags` lists both.
- **D-ONTO-5:** the parser stays deterministic. The model interpreting labels is outside the pack. Do not put an LLM in `latest_filing_slots`.

---

## Next implementation step

Do not start until Anthony says implement. First code change: replace `select_slots` with `latest_filing_slots` (group by period) in both languages, shrink `taxonomy_xbrl.json` to totals-only lists, and rewrite `test_companyfacts.py` to the four constructed documents plus the properties above. No live dollar literals.
