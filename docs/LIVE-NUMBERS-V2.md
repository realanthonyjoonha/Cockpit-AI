# Live numbers V2 — latest filing, labeled facts, no ranking engine

Design only. Anthony chose this shape (option 4): drop the hand-written ranking engine. The model interprets labeled facts. This file is the architect sketch. It does not change product code, the empty desk registry, or the vault.

Decision-support only. No buy/sell/hold, price targets, or sizing.

Replaces the V1 ranking design in [`LIVE-NUMBERS-DESIGN.md`](./LIVE-NUMBERS-DESIGN.md) (PR #5 and the de-hardcode follow-ups on #6–#9). Do not implement from V1.

Related: [`HARNESS-FIX-PLAN.md`](./HARNESS-FIX-PLAN.md). D-ONTO-5 (deterministic parse, no LLM in pack), D-ONTO-3 (no ticker branch), D-ONTO-8 (10k overview cap stays).

```text
Feature: live numbers V2 — latest filing, unique-or-gap
Class: PLATFORM
Works with product desks=[] ? yes
Scales via registry (desk N free)? yes — CIK + cache path from pack/desk config
Approach: fetch companyfacts on desk add/refresh only; offline parser
emits at most one labeled fact per metric from the latest periodic filing.
Disagreeing same-filing candidates → empty slot + gap listing them.
Sentences never fill a structured number. Taxonomy is true totals only.
No ranking, no stale cutoff, no lease/sector special case, no frozen
issuer numbers in tests.
```

---

## Problem

V1 tried to hand an agent one “right” consolidated number per metric. That required a ranking engine: latest period end, then quarter vs YTD vs annual, then concept-list order, then span, then filed/accn, plus a stale window, plus total-vs-component kinds, plus 6-K / 10-KT duration special cases. Every new filer or tag produced another rule. Tests froze live SEC dollars and point counts so the engine would not drift. Anthony does not want that. The pack should show what the latest periodic filing tagged, fully labeled, or admit it cannot choose.

Constraints the sketch must honor:

- `live_claims` / `liveClaims` still returns **at most one live row per metric_id** plus residual `other`. P1’s 10k cutter and P3 cited cards consume that shape.
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
pack.gaps += loaded.notes          # includes unique-or-gap notes

# live row
live, context = live_claims(sentences, rules, facts=loaded.facts)
# structured metric → companyfacts row or empty; never origin:"sentence"
```

What a caller reads on a filled slot:

```text
Revenues USD 57,347,000,000 for 2026-04-01 to 2026-06-30
(form 10-Q fp=Q2 filed 2026-08-06 accn 0000019617-26-000423)
```

What a caller reads when the latest filing has more than one mapped total and they do not agree:

```text
gap: company_revenue: latest filing 0000019617-26-000423 has 2 disagreeing tagged facts
  - us-gaap:Revenues USD 57347000000 2026-04-01/2026-06-30 10-Q Q2
  - us-gaap:RevenuesNetOfInterestExpense USD 107183000000 2026-01-01/2026-06-30 10-Q Q2
```

The model, not the parser, decides what those two lines mean.

Glass / MCP (`get_pack_snapshot`) keep seeing `claims` + `gaps`. No new tool.

---

## Shape

### Latest filing, unique-or-gap

Public surface stays three functions: `parse_companyfacts`, `latest_filing_slots`, `load_companyfacts`. All ranking policy dies behind `latest_filing_slots`.

1. Parse the local SEC document into `NormalizedFact` rows (same as V1 parse; allowed forms only; `value_text` is the compared field).
2. **Latest periodic filing** = the accession with the maximum `(filed, accession)` among facts whose form family is one of `10-K`, `10-Q`, `20-F`, `40-F`, `6-K`, `10-KT`. `/A` is stripped before the family test; the amendment’s accession is a distinct filing.
3. For each structured metric, **candidates** = facts in that accession whose concept is in the metric’s true-total tag list and whose unit kind matches the spec.
4. Candidates **agree** when they share `value_text`, `unit`, `period.start`, and `period.end`.
5. If there is no candidate → no slot; gap `{id}: not reported in latest filing {accn}`.
6. If every candidate agrees → one slot from a stable pick (lexicographic `concept`, then `unit`). Label lists every agreeing tag. This is identity, not economic priority.
7. If any candidate disagrees → no slot; gap `{id}: latest filing {accn} has {n} disagreeing tagged facts` followed by one labeled line per candidate.
8. A sentence never fills a structured metric. Phrase-only metrics are unchanged.

The parser does **not**: prefer quarter over YTD; prefer `Revenues` over `RNIE`; drop old tags by day count; fill from a component; attach a YTD sidecar; guess a year-end month; sum two concepts; convert currency.

### Why this interface

Callers already know “one row or a gap.” Putting the contest in the gap hides the engine. An always-on bag of facts would force P1/P3/tripwires to learn a list. That is a shallower module: same complexity, larger surface.

---

## Types

Shared JSON field names. Parity compares `value_text`, not a language number.

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

### LabeledFact (slot or gap line)

```text
{
  concept: string,
  value_text: string,
  unit: string,
  currency: string | null,
  period: { type: "instant" | "duration", start: string | null, end: string },
  duration_days: number | null,
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

True totals only. No `kind`, no `fallback`, no `selection.stale_days`, no ticker/sector column. List order is unused for picking (lexicographic `concept` breaks an all-agree tie). An unmapped tag is not guessed.

Phrase-only metrics keep empty `concepts` and may still take a sentence row.

### Slot (filled)

```text
{
  id: "xbrl:{concept}:{start}/{end}",
  metric_id: "company_revenue",
  text: string,                  // full label; see Usage
  as_of: string,                 // period.end
  grade: "A",
  origin: "companyfacts",
  confidence: "tagged",
  concept, value_text, unit, currency, period, fy, fp, form, filed, accession,
  tags: string[],                // every agreeing concept
  prior: null,                   // restatement sidecar removed
  ytd: null                      // YTD sidecar removed
}
```

### Gap notes (strings, pack.gaps)

```text
companyfacts cache missing; headline slots empty
companyfacts cache unreadable
{mid}: not reported in latest filing {accn}
{mid}: latest filing {accn} has {n} disagreeing tagged facts
  - {concept} {unit} {value_text} {start}/{end} {form} {fp}
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

def candidates_for(metric_id: str, facts: list[dict], accession: str, tax: dict) -> list[dict]:
    """Mapped true-total facts in that accession with a matching unit kind."""

def agree(a: dict, b: dict) -> bool:
    """Same value_text, unit, period.start, period.end."""

def latest_filing_slots(facts: list[dict], tax: dict | None = None) -> tuple[dict, list[str]]:
    """
    Returns (slots, gaps).
    slots[mid] is a filled Slot or absent.
    gaps lists missing-cache / unreadable / not-reported / disagreeing notes.
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

`live_claims` / `liveClaims` keep their signature. They call `tagged_slots`. They stop attaching `ytd` / `prior`. They still refuse `origin: "sentence"` on a structured metric.

---

## Module layout

| Path | Owns | V2 change |
| --- | --- | --- |
| `ontology/schema/taxonomy_xbrl.json` | True-total tag lists | Drop `kind`, `fallback`, `selection`. Totals only. |
| `ontology/api/companyfacts.py` | Parse + unique-or-gap | Delete ranking. Add `latest_accession` / `latest_filing_slots`. |
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

- Duration classification (`duration_kind`, fp/form/relative-span, 10-KT FY, 6-K annual-anchor).
- Rank tuple (quarter > YTD > annual, concept-list index, span, filed/accn).
- Same-end YTD attach (`slot.ytd`).
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

Keep: a few **constructed** documents (not live CIKs) that show unique / disagree / none; review sentences that must not fill; the fetch mock tests.

### Docs

- V1 selection rules in `LIVE-NUMBERS-DESIGN.md` are historical. Implement from this file. A later commit can mark V1 superseded; do not edit V1 in the design PR.

---

## Migration for #6–#9

V2 is a new branch **off main**, not another commit on `cursor/harness-p0-live-claims-82aa`. The ranking engine and the de-hardcode follow-up (`1a24360` and its merges) stay on #5–#9 until a human says to replace them. Do not force-push those branches. Do not merge them to main as part of this design.

| PR | What it owns | V2 impact | How to migrate |
| --- | --- | --- | --- |
| #5 P0 | Companyfacts parse + ranking + fixtures | **Replace.** Ranking, kinds, stale, frozen snapshots go away. Fetch + offline parse + sentence ban stay. | Implement V2 on the new branch. Do not stack more ranking fixes on #5. |
| #6 P1 | 10k overview cap, no MU series filter | Live **row shape** unchanged. More gaps, fewer filled slots. Cap still applies. | Re-run `--assert p1` after V2. No cutter change unless a labeled gap string blows the budget (truncate the candidate list in the gap formatter, not the cap). |
| #7 P2 | GO / house-write refuse | Does not read ranking. More empty headline slots is fine. | Re-run `--assert p2`. No GO change. |
| #8 P3 | Slice cards, 32k tail | Cards cite live rows. Empty slots simply do not appear. | Re-run `--assert p3`. Citation code stays. |
| #9 P5 | MCP catalog trim | Catalog does not encode ranking. `get_pack_snapshot` may show more gaps. | Re-run `--assert p5`. No catalog change. |

Forward merge after V2 is green on its own branch:

```text
V2 branch (off main)
  → merge into P1 / P2 / P3 / P5 only when a human asks
  → do not merge #5’s ranking engine forward again
```

If #5–#9 must stay open as drafts, leave them. V2 is the SoR for the next implement pass.

Parity: JS and Python `latest_filing_slots` on the same cache bytes must match `value_text`, `accession`, `concept`, and the gap strings.

---

## Test strategy

No frozen live issuer numbers. No hardcoded point counts. `expected.json` is not an oracle.

### Properties (always, both languages)

1. **Shown value is a tagged fact in the latest filing.** If `slots[mid]` exists, some parsed fact has the same `concept` (or one of `tags`), `value_text`, `unit`, `period`, `form`, `filed`, and `accession`, and that accession equals `latest_accession(facts)`.
2. **No ranking leftovers.** A filled slot’s accession is the latest accession. No slot has `ytd` or `prior`.
3. **Disagree ⇒ empty.** If two mapped totals in the latest accession differ on `value_text`, `unit`, or period, `mid` is absent and the gap lists both labeled lines.
4. **None ⇒ empty.** No mapped total in the latest accession ⇒ `{id}: not reported in latest filing`.
5. **Sentences never fill.** Every review sentence, alone and together, leaves structured `metric_id`s without `origin: "sentence"`.
6. **Parse has no network.** `companyfacts.py` / `companyfacts.js` contain no HTTP client.
7. **Taxonomy is totals-only data.** No `kind`, no `stale_days`, no issuer token (existing banned-word grep).
8. **Agreeing tags do not invent a value.** The shown `value_text` equals each agreeing candidate.

### Constructed documents (tiny, not live CIKs)

Three synthetic files are enough:

- `unique` — one mapped tag in one 10-K → filled, fully labeled.
- `disagree` — two mapped tags, same accession, different `value_text` → empty + two candidate lines.
- `none` — latest 10-Q has cash, no revenue tag → `company_revenue` empty.

Values in these files are local to the test document. They are not live SEC figures and are not copied into other tests as literals.

### Opt-in live refresh-and-compare

`COCKPIT_LIVE_COMPANYFACTS=1` (plus contact `SEC_USER_AGENT`):

1. Fetch companyfacts for a small public CIK set used only as **input**.
2. Run `latest_filing_slots` on the fresh bytes.
3. Re-run on a second read of the same bytes → identical slots and gaps (determinism).
4. Assert properties 1–4 on the live parse.
5. Do **not** assert a dollar amount or a point count.

CI never sets the env. Cloud without a User-Agent does not fetch.

### What `--assert p0` becomes

Drop V1 ranking cases. Keep: review sentences vs structured slots, DEMO phrase-only date/grade cases, empty `desks: []`, banned issuer tokens, JS/PY parity on constructed + any cached sector extract **via properties**, not dollar equality.

`--assert p1`–`p5` stay their own gates.

### Delete

`prove_review_fixes.py` / `.mjs`, `expected.json` dollar snapshots, `source-concepts.json` count pins, review-check literals that name live amounts.

---

## Synthesis decision

Anthony already rejected V1 (ranking engine) and the de-hardcode-in-place follow-up (kinds + stale config + invariant tests still wrapping that engine).

Two V2 shapes were compared:

1. **Unique-or-gap (this file).** Latest accession. One slot if mapped totals agree; otherwise empty + labeled candidates. Public API stays `tagged_slots` → `live_claims`.
2. **Always-bag.** Latest accession always emits the list of labeled facts; there is never a single `value_text`. Callers must pick or display the list.

(2) is the shallower module: it leaks the contest into P1 caps, P3 cards, tripwires, and every prompt. (1) hides the contest in a gap string the model already reads. (1) was chosen.

Rejected without a third shape: keep V1 and only move constants into JSON. That is still a ranking engine.

---

## Tradeoffs accepted

- We accept **more empty headline slots** (especially 10-Q duration metrics that tag both quarter and YTD) in exchange for never ranking duration.
- We accept **lexicographic tag pick** when values already agree, in exchange for not encoding a primary/fallback order.
- We accept **dropping restatement `prior`** in exchange for “latest filing only.” An amendment is a new accession; if it is latest and unique, it shows. The superseded value is not a sidecar.
- We accept **no stale window** in exchange for honesty: a tag absent from the latest filing is a gap, even if an older filing had it.
- We accept **10-KT in `ALLOWED_FORMS`** (Anthony named 10-K / 10-Q / 20-F / 40-F / 6-K) so a transition report can be the latest filing, with **no** duration special case. Confirm or drop 10-KT before implement.

---

## Alternatives considered

- **V1 ranking (quarter > YTD > annual, concept order, stale, kinds).** Deep engine, small surface, but the depth is policy the human does not want. Lost because every new tag became another rule and tests froze live numbers to lock it.
- **Always-bag.** Hides nothing. Every caller learns the contest. Lost on interface depth.
- **Latest period end across all filings, then unique-or-gap.** Reintroduces a period contest (a 10-Q quarter vs a 10-K annual at different ends). Lost; “latest filing” is the only time key.

---

## Open questions and risks

- Should **10-KT** be allowed? This sketch includes it as a periodic form with no extra rule. Drop it if Anthony wants the named set only.
- A typical **10-Q** tags both quarter and YTD on the same total. Those disagree → **empty `company_revenue`** with two labeled lines. Is that the intended default, or should “latest value” mean latest `(filed, end)` and treat different `start` as different slots? The second reading sneaks duration ranking back in. Default is empty + list.
- **Same filed date, two accessions** (10-K and 10-K/A, or 10-K and 10-Q): latest accession string wins. Confirm that SEC accession order is the intended tie-break (V1 already used it).
- **Unit disagreement** (USD vs USD/shares on a mis-tagged filer) is a disagree, not a conversion.
- **P1 budget:** a long disagree gap could be large. Cap the printed candidate list (e.g. first 8 lines) in the gap formatter, not by dropping facts from the check.
- **#5–#9 already contain V1 + de-hardcode.** Leaving them open while V2 lands off main will confuse reviewers. Human should say whether to close, supersede, or wait.
- **D-ONTO-5:** the *parser* stays deterministic. The *model* interpreting a gap is outside the pack. Do not put an LLM in `latest_filing_slots`.

---

## Next implementation step

Do not start until Anthony says implement. First code change: replace `select_slots` with `latest_filing_slots` in both languages, shrink `taxonomy_xbrl.json` to totals-only lists, and rewrite `test_companyfacts.py` to the three constructed documents plus the properties above. No live dollar literals.
