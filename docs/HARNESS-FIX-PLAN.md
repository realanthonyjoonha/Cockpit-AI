# Harness fix plan

Plan only. This document does not change product code, the empty desk registry, or the vault. Implementation is five later draft PRs stacked on `cursor/harness-context-tools-stress-77e7` (harness PR #3). None of them merge to main from this workstream.

Source of the flaws: `harness-stress/REPORT.md` (run 2026-10-11T04:55:06.669Z). Scope stays context and tools.

## Phone summary

The stress run showed the live-claim picker and the 24-tool list can hand an agent the wrong figure, drop a figure, or stamp a register that is still open. This plan fixes that in five reviewable PRs. Glass on the phone and on the MacBook does not change visually. Product desks stay empty. No private books. No API key.

The same code has to work for any public company. The current rules do not. They use English stems (`guid`, `inventor`), they sort dates as strings, and the risks pack keeps series ids that start with `mu`. A fix that only makes the DEMO canaries pass is a failed fix. Every phase is proved on one shared fixture of ten sectors: a bank, an insurer, a REIT, a utility, biotech, retail, energy, an industrial, software, and a foreign private issuer on a 20-F. Numbers in those fixtures are harness constants, not a house view.

**P0 — the live number.** Parse real dates, including unpadded dates, “53 weeks ended …”, and a fiscal year-end that is written out. Do not guess a year-end month from the sector. Classify with a taxonomy id or an XBRL tag when the claim has one, otherwise with exact phrases, word boundaries, and negative rules. A missing grade sorts the same way in JavaScript and Python. No model call.

**P1 — the cap.** `retrieve()` says 10,000 characters and returns more. The MCP pack snapshot has no cap. `ont agent` cuts at 28,000 characters and drops the line `END CONTEXT`. Make the cap a post-condition, keep that closing line, and delete the MU series filter.

**P2 — the GO gate.** Register GO returns ok when four pending chips exist even if three chips share one risk number and the file still has two risks. Drivers then correctly refuses. A shell append can change the house file with no GO. Stamp the register only when the closeout would pass, and record authorized house writes so a raw append is visible. Do not jail the shell.

**P3 — long new-desk runs.** An eight-slice transcript is about 62k tokens. A 32k tail-keep at the end holds 0 of 8 seeded facts. Write a short slice card to disk and repeat the seed at the end of the note. No summarizer model inside the pack.

**P4 — tools.** Drop the two tools that always refuse. Keep every real write on the default list, including KEEP, because the cheap model called drivers-GO when KEEP was missing. Return one error object with a next step. A shorter optional list is for a capable host, and it still contains KEEP.

**Exit.** Re-run the harness on the ten-sector fixture, then on `gpt-5.6-sol-high` and `gemini-3.8-flash-low`, with no `XAI_API_KEY`. A green report that does not exit 1 on a failed assert is not a pass.

Three findings from the stress report bind the design. Rule-based elision runs before any summary model (`ontology/DECISIONS.md` D-ONTO-5). A budget is true only for the bytes returned (D-ONTO-8, `ontology/CONTRACT.md` §7). A short tool list plus bash reads is enough for a strong model; a short list that omits the real write makes a cheap model pick the wrong one (`harness-stress/REPORT.md` F16).

## How a phase is proved

`node harness-stress/run.mjs` today writes a report and exits 0 even when the flaws are present. It exits non-zero only if the product tree or `thin-desks.json` changes (`harness-stress/run.mjs`). That is not a pass.

Each implementation PR adds `node harness-stress/run.mjs --assert <phase>` and that command exits 1 when any case in that phase fails. The case list includes the original DEMO repro ids and every issuer in `harness-stress/fixtures/sectors.json`. Existing unit tests stay in the same PR. `npm run test:platform` stays green when server code changes. No phase is “done” because the report prose looks quieter.

## Binding design laws

| Law | Where it is written | What it forces here |
| --- | --- | --- |
| Compile and retrieve stay deterministic. No LLM in the pack. | D-ONTO-5 (`ontology/DECISIONS.md`) | No classifier model. No summary model inside `retrieve`, `live_claims`, or `build_agent_context`. |
| Overview pack ≤ 10,000 characters. | D-ONTO-8; `ontology/CONTRACT.md` §7; `ontology/paths.py` `OVERVIEW_BUDGET_CHARS` | Do not raise the cap per sector or per ticker. Return a pack that is actually under the cap, with a gap naming what was omitted. |
| No ticker branch in compile or retrieve. | D-ONTO-3 kill criterion | Delete the `mu` series filter. Do not add a bank list or a semi list in its place. |
| House is human-owned. Silent mutation fails the decision. | D-ONTO-7; `AGENTS.md` §0.3 | Shell appends are detected. They are not treated as GO. |
| Desk N uses the same rules. No issuer names in the metric JSON. | `ontology/schema/contextpack_metrics.json` comment, line 2 | Phrase rules and the XBRL map have no ticker, product, or sector brand. |
| Rule-based elision before any LLM summary. | Stress hypothesis in `harness-stress/REPORT.md` “What was treated as a hypothesis”; D-ONTO-5 | Fix the rules. The slice card is a structured extract, not a second model. |
| Overflow prevention. | F5, F6; D-ONTO-8 | A cutter that sets `trimmed: true` while `used_chars` stays over the limit is a failed budget. A hard slice that drops `END CONTEXT` is a failed cut. |
| Core tools plus bash reads for a capable model. | F12, F16 | Bash is a read path. Writes stay on `commit_on_go`. The cheap-model miss means the default list still contains the KEEP tool. |

## Generalization

Every fix in this plan has to behave the same way for any publicly traded company, in any sector, at any market cap, with any reporting calendar. A rule that exists so one DEMO sentence or one Micron 10-K passes, and that misfires on a bank, an insurer, or a 20-F, is not accepted.

The stress fixture is one synthetic desk. The bugs are real. The repair is not allowed to overfit that fixture, MU, AMZN, or semiconductors.

### Classification

**What is wrong today.** `classifyMetric` (`memory-cockpit-v2/server/contextpack.js` lines 15–32) and `classify_metric` (`ontology/api/contextpack.py` lines 25–45) walk `ontology/schema/contextpack_metrics.json` and accept a needle with `includes` / `in`. First hit wins.

Stems and OR-lists that the stress run caught:

| Needle | File:line | What it does |
| --- | --- | --- |
| `revenue_guide.any` includes `guid` | `contextpack_metrics.json` lines 22–24 | Any sentence containing “guidance” becomes revenue guidance, including a cash sentence. |
| `inventory.any` is `inventor` | lines 55–57 | “Inventory impairment” matches inventory. The same stem is in `risk_metric` line 119. |
| `goodwill_impairment.any` is `goodwill` OR `impairment` | lines 95–97 | A goodwill balance with no impairment takes the impairment id. `risk_metric` lines 135–136 repeat the OR. |
| `cash.any` is only the long equivalents phrase | lines 51–53 | “Cash was $222 million” misses cash. The older equivalents sentence stays live (F3). |
| `guarantees.any` includes the stem `indemnit` | line 83 | Prefix match, not a word. |
| `rpo_backlog.any` includes ` rpo ` with spaces | line 76 | A spacing trick, not a word boundary. |
| Boilerplate `number of employees` | line 13 | Drops a headcount sentence even when it contains a figure (F4). Checked in `contextpack.js` lines 53–54 before the amount test. |
| Residual test `\$[\d,]+` or a `%` sign | `contextpack.js` line 8; `contextpack.py` line 16 | Drops “45 percent”, “$ 12”, and a segment sentence with no dollar sign (F4). |

The revenue regex (lines 27–28) is the line-item language of a US operating company (“net sales”, “consolidated revenue”). It does not name MU, and it still misses a bank’s net interest income (that id exists, lines 31–33), an insurer’s premiums, a REIT’s rental revenue, a utility’s operating revenues, and a biotech collaboration line. Folding all of those into new issuer rules would overfit. Mapping them through a shared taxonomy does not.

**Options.**

1. Keep substring rules and add the DEMO phrases (`cash was`, `45 percent`, `segments`). Small, and it fails the next sector.
2. Hand the sentence to a model. Breaks D-ONTO-5. Different packs for the same input.
3. Per-sector rule files. That is a ticker branch by another name (D-ONTO-3).
4. Taxonomy id or XBRL tag when present; otherwise exact phrases with word boundaries and negative lists. One rule file for every filer.

**Chosen: option 4.**

Layer A, preferred. If the claim has `concept` set to a taxonomy id, that id is the metric. Text is not scanned. Compile may set `concept` from a static map of `us-gaap:*` and `ifrs-full:*` tags. The map is concept to taxonomy id. It has no ticker column and no sector column. An unmapped tag does not get a guessed id. The claim stays on layer B or becomes residual, and the pack can record `unmapped_concept`.

Layer B, prose with no concept. Needles are full words or full phrases. `all` means every needle. `any` means any whole phrase. `none` excludes. Matching uses word boundaries in both languages, not `includes`. Most specific rule first: goodwill-and-impairment before goodwill; impairment before inventory; operating cash flow before cash; revenue guidance before revenue; concentration before revenue.

Layer C, residual. A sentence that hits no concept and no phrase is kept only when the shared amount parser finds a currency amount or a percent. Cap stays 8. A gap counts how many residual sentences were omitted (F10). Boilerplate does not drop a sentence that the amount parser or the headcount phrase accepts.

Starter taxonomy (ids, not issuers). Keep the current ids that name a financial concept. Add only concepts that the phrase layer needs and that GAAP/IFRS already name:

- `goodwill` for a goodwill balance, with `none: impairment`
- `impairment` for an impairment that is not goodwill-and-impairment
- `headcount` for “number of employees” plus a count
- `operating_segments` for the phrases “operating segments” and “reportable segments” plus a count

Do not add a metric because one sector likes a non-GAAP label. Funds from operations stay residual or an explicit gap (`non-GAAP measure, no taxonomy id`). Do not add DRAM, HBM, data center, Azure, or a customer name. `memory-cockpit-v2/scripts/contextpack-test.mjs` already bans issuer and product tokens in the JSON. Extend that ban to `guid` and `inventor` as needles, and to ticker symbols.

Revenue phrases on layer B, after the more specific rules, and only with negatives: “net sales”, “total revenue”, “total revenues”, “operating revenues”, “premiums earned”, “rental revenue”, “collaboration revenue”, and the existing consolidated-revenue regex rewritten with word boundaries. Negatives include guidance, outlook, deferred, and the concentration phrases. A cash sentence that also says “see guidance” hits cash first because cash is more specific and because guidance’s `none` list contains the cash phrases.

XBRL starter map (illustrative, not a dump of the whole taxonomy). `CashAndCashEquivalentsAtCarryingValue` and `ifrs-full:CashAndCashEquivalents` → `cash`. Revenue and `RevenueFromContractWithCustomerExcludingAssessedTax` → `company_revenue`. `InterestIncomeExpenseNet` → `net_interest_income`. `Goodwill` → `goodwill`. `GoodwillImpairmentLoss` → `goodwill_impairment`. `InventoryNet` → `inventory`. Premium and rental revenue tags that are the filer’s top line → `company_revenue`. Unmapped tags stay unmapped.

**Rejected special cases.** No rule whose only job is the DEMO string “See guidance.” or “CANARY-SEGMENTS”. Those sentences pass only if the general rule covers them.

### Dates

**What is wrong today.** `claimKey` (`contextpack.js` lines 40–41) and `_claim_key` (`contextpack.py` lines 74–75) build a string `as_of|gradeWeight` and sort it. `2026-9-30` beats `2026-10-01` because the character `9` sorts after `1` (F1). The same pair with zero-padded ISO dates sorts correctly. `_trim_claims` in `ontology/api/retrieve.py` lines 55–59 sorts the raw `as_of` string too. The grade half of the key disagrees across languages (F9): Python treats a missing grade as C (`contextpack.py` line 75); JavaScript uses `GRADE_W[grade] || 0` (`contextpack.js` line 41), so a blank loses to an explicit C on the same day.

**Options.**

1. Zero-pad the string and keep sorting strings. Breaks “September 30, 2026”, “53 weeks ended January 28, 2026”, and “fiscal year ended 31 March 2026”.
2. Snap every fiscal year to a calendar quarter, or snap semis to August and retail to January. That invents a day and overfits a sector.
3. Parse a civil date when the text contains one. If the text is only a fiscal label, do not invent the day.

**Chosen: option 3.** One parser, used by JavaScript and Python, returns `{ sort_key: "YYYY-MM-DD" | null, precision, raw }`.

Accepted forms:

- `YYYY-MM-DD` and `YYYY-M-D` (the unpadded F1 pair). The sort key is zero-padded. The stored `as_of` string is not rewritten.
- An ISO datetime. The sort key is the calendar date in the string, not a timezone conversion that moves the day.
- `Month D, YYYY` and `D Month YYYY` with an English month name. SEC filings and English 20-Fs use these.
- `fiscal year ended <date>`, `year ended <date>`, `52 weeks ended <date>`, `53 weeks ended <date>`. The sort key is that civil date. A 53-week retail year ended January 28 stays January 28. It is not moved to January 31. A 52-week year ended August 29 stays August 29. It is not moved to August 31 because a semiconductor fiscal calendar often lands there.

Not accepted as a day:

- `FY2026`, `fiscal 2026`, `fiscal year 2026` with no period-end date. `sort_key` is null. The claim does not win on recency. The pack gap says `as_of is a fiscal label without a period-end date`. Do not look up a per-ticker fiscal-year-end month. A 53-week year moves the weekday, so a stored month would still invent the day.

Compare a tuple `(sort_key or "0000-00-00", gradeWeight, originalIndex)`, not a concatenated string. Missing or blank grade has weight 1, the same as C, in both languages. Same day and same weight keep the earlier array element (the stable-sort behavior already recorded as `C-same-day-tie`). An unparseable value sorts oldest and cannot beat a real date by character order.

### Units and scale

**What is wrong today.** `parse_amounts` (`contextpack.py` lines 54–71) reads `$`, optional space, then a scale word, and returns a bare float. The residual test does not allow the space, the word “percent”, or a non-dollar sign. A table header “in millions” on a different line is invisible, so a bare `$ 12` can be read as twelve dollars or dropped.

**Chosen parser**, shared by residual detection and by `stale_tripwires` (`contextpack.py` lines 133–181):

- Currency: `$`, `US$`, `USD`, `€`, `EUR`, `£`, `GBP`, `¥`, `JPY`, `CNY`, `RMB`, `KRW`, and an ISO 4217 code next to the number. The result keeps the currency code. EUR and USD are not compared and are not converted. A cross-currency tripwire check records a gap.
- Scale words, with word boundaries: thousand, million, billion, trillion, and the abbreviations only when they are tokens. The abbreviation `m` must not match inside a word.
- A scale clause in the same sentence (`in thousands`, `in millions`, `in billions`) applies to amounts in that sentence. It does not apply to the next claim. There is no document-level scale in this stack. Applying one would invent a magnitude.
- Percent: `%`, `percent`, `pct`. Basis points stay a different unit and do not enter the percent bucket.
- Spaced signs: `$ 12`, `€ 1,200`, `US$ 12`.
- Headcount is a count, not a currency amount. “42.4 thousand employees” does not become cash.

`stale_tripwires` today reduces a sentence to `max(amounts)` with no currency (`contextpack.py` lines 150–153). After this change it compares amounts only when the currency matches.

### The ten-sector fixture

One file, `harness-stress/fixtures/sectors.json`, added in the P0 implementation PR and imported by later phases. Ten issuers. Each claim is one original sentence that uses a standard line-item name and a harness number. The record names `sector`, `form` (`10-K` or `20-F`), `reporting` (`us-gaap` or `ifrs-full`), and `currency`. It does not copy an Item 1, a private vault note, or a covered desk. A real public filing sentence is allowed only as a single line with the form and period in the record. These sentences are not house views and are not registered as desks.

| # | Sector | Form | What the fixture must include |
| --- | --- | --- | --- |
| 1 | Bank | 10-K | Net interest income; provision for credit losses; a deposit sentence that must not become cash |
| 2 | Insurer | 10-K | Premiums earned; a claims sentence that must not become company revenue |
| 3 | REIT | 10-K | Rental revenue; a real-estate sentence that must not become inventory; an FFO sentence that stays off the GAAP impairment and revenue ids |
| 4 | Utility | 10-K | Operating revenues; a regulatory-asset sentence that must not become cash |
| 5 | Biotech | 10-K | Collaboration revenue; research and development; no requirement that “net sales” appear |
| 6 | Retail | 10-K | Net sales; inventory; “45 percent”; a 53-weeks-ended date |
| 7 | Energy | 10-K | Revenue; capex; a production sentence in barrels that must not become revenue because it contains “million” |
| 8 | Industrial | 10-K | Backlog; operating income; purchase commitments |
| 9 | Software | 10-K | Remaining performance obligations; deferred revenue that must not become company revenue |
| 10 | Foreign private issuer | 20-F | Fiscal year ended 31 March; an amount in EUR millions with a spaced sign; an unpadded ISO date on a second claim; IFRS tag on at least one claim |

P0 asserts classification, the date winner, and the parsed unit for every issuer. Later phases run their own bug repro on this set as well as on DEMO. A phase that passes DEMO and fails one sector exits 1.

### Rules that stay company-specific

These are still issuer-shaped after this plan unless a row says the stack removes them. Leaving a row in place is a known limit, not a silent pass.

| Location | What is issuer-shaped | In this stack? |
| --- | --- | --- |
| `ontology/api/retrieve.py` lines 176–181 | Risks intent keeps series whose id starts with `mu`, plus `price-mu`, `micron-capex`, `dram-spot-ddr5`, `price-dram-etf`. This is the F7 bug and the D-ONTO-3 kill criterion. | **Remove in P1.** The store file is already one company. Do not replace the prefix with a list of tickers. |
| `ontology/api/retrieve.py` lines 21–28 and 39 | `FOCUS_ALIASES` maps only Micron and Nebius names. An unknown focus reports that list as the known universe. | **Narrow fix in P1.** Keep the aliases so `resolve_ticker("micron")` still works (`ontology/tests/test_ontology.py`). Change the error to “no compiled pack for this focus”. Do not add aliases for the ten fixture sectors. |
| `ontology/api/ask.py` lines 148–149 | The stance branch matches the literal `what is micron`. | **Remove the issuer literal in P0.** Keep the generic words `stance`, `advantaged`, `exposed`, `contested`. |
| `ontology/api/ask.py` lines 157–187 | Contract scoring boosts `Microsoft`, `Meta`, `100 B`, and `$100`. A question that mentions a customer name pulls this branch for every company. | **Flagged, not rewritten here.** Deleting the boosts changes which claim `ont agent` highlights, and that text is part of agent context. A full router rewrite is a separate change. P0 adds a test that a new needle may not be an issuer name. The existing Microsoft/Meta boosts stay on this list until that separate change. |
| `ontology/compile/from_cockpit.py` lines 143–146 | Catalyst import keeps a row that failed the alias test when the name contains `micron`, `mu`, `hyperscaler`, or `hbm`. | **Out of this stack.** It can change which catalysts a compiled pack carries into glass. That is glass-visible. Principle 6: leave it for Opus or the owner. It remains company-specific. |
| `memory-cockpit-v2/server/model.js` lines 143–154, 495, 611–616 | Legacy Memory desk series ids (`mu-short-interest`, `price-mu`, `micron-capex`). | **Out of this stack.** UI-adjacent. Do not edit. Pixels stay as they are. |
| `memory-cockpit-v2/server/driverProposals.js` lines 341–342 | The driver hint examples name AWS, NVDA, and a single ads mix. The model sees this string. | **Neutralize in P4.** Three sector-neutral examples. No ticker. |
| `ontology/fixtures/MU.*.json`, `ontology/CONTRACT.md` line 42, `ontology/PLAN.md` MU sections | Iteration-1 gold and historical scope. | **Leave.** D-ONTO-9. They are not the generalization proof. The ten-sector fixture is. |

A grep gate in `--assert sectors` fails if `contextpack_metrics.json` or the XBRL map contains a ticker, a product family, or a geography used as a brand. The historical MU fixtures are not part of that grep.

## Cockpit principles compliance

Owner principles for this workstream, and the repo text that already states the same rule.

| # | Principle | Repo citation | What this plan does |
| --- | --- | --- | --- |
| 1 | Private data never enters the public repo. Product desks stay empty. | `AGENTS.md` §0.6 and §0.8; `RELEASE.md` privacy table; `KERNEL.md` (`desks: []`); `memory-cockpit-v2/config/thin-desks.json` | Fixtures are new harness files. No `research-wiki` copy, no vault path, no personal desk. Probes keep using `/tmp` and a DEMO fixture. `thin-desks.json` is not edited. The ten sectors are not registered as desks. |
| 2 | House and risks are human-owned. Agents propose. Nothing commits without an explicit GO. Fixes strengthen the gate, they do not loosen it. | `AGENTS.md` §0.3; D-ONTO-7 | P2 makes register GO fail when the closeout would fail. It does not lower the four-risk bar. A shell write is marked unauthorized. Glass save and GO still go through `saveHouseMarkdown`. |
| 3 | Decision-support only. No invented claims. Every number cites its source. | `AGENTS.md` §0.1 and §0.2; `ontology/CONTRACT.md` §8 | No new claim text in the vault. Reclassification only relabels text that is already stored. Fixture numbers are harness constants labeled as fixtures. Fiscal labels do not gain an invented day. Currencies are not converted. |
| 4 | Done means an exit-0 check. No faked pass. A UI change also needs one real phone screenshot. | `AGENTS.md` §7; stress `run.mjs` exits 0 on known flaws | `--assert` exits 1 on failure. Report prose is not the gate. No phase changes UI, so no phone screenshot is required. If a diff touches `memory-cockpit-v2/src` or CSS, the phase stops. |
| 5 | MacBook desktop stays visually untouched. Phone follows the Jobs-level bar. | `docs/FEATURE-MAP.md` phone desks vs desktop rail | No edits under `memory-cockpit-v2/src/**`. No CSS, no copy on glass, no layout change. Server JSON may add fields (`budget`, `next`, `concept`). Existing keys keep their meaning. The Jobs bar is not an invitation to polish phone CSS in these PRs. |
| 6 | Grok builds the harness and the data path. UI that is not already locked belongs to Opus or the owner. | This workstream; D-ONTO-6 (ontology stays off the React schema) | All five phases are harness, ontology, MCP, and command text. `model.js` and `from_cockpit.py` stay untouched because they move glass-visible Memory data. |
| 7 | No Mac and no `XAI_API_KEY`. Builds run on cloud agents. | `harness-stress/README.md`; `harness-stress/REPORT.md` F16 | Tests are `node` and `python3` on the cloud agent. The model arm uses Cursor subagents `gpt-5.6-sol-high` and `gemini-3.8-flash-low`, the same pair as the stress run. The key is not set. If a subagent cannot be launched, record the block. Do not mark the model arm green. |
| 8 | Lean on bandwidth. | This workstream | One fixture file for every phase. Model calls happen once, at the exit gate, not in P0–P4. The new-desk command gains a short card rule, not a paste of the taxonomy. The XBRL map is a starter list, not the full taxonomy. |

### Conflicts

| Conflict | Resolution |
| --- | --- |
| A missing house-write log that auto-trusts the current file would hide a shell append on first read. That loosens principle 2. | Do not treat “no log” as authorized on every read. P2 states the migration. The regression appends after a real authorized write and expects a mismatch. |
| Tightening the 10k cap drops claims a long pack used to return. Principle 3 wants the figure available. | The cap stays 10,000 for every sector (D-ONTO-8). The omitted count is a gap line. The cap is not raised for banks or for MU. |
| Guessing August for a semiconductor fiscal year, or January for retail, would make dates “work” and would invent a day. | Forbidden. Only an explicit period-end date sorts as a day. |
| The eight-tool core from the stress report omits `propose_keep_driver`. The cheap model then called `commit_on_go kind=drivers` for KEEP (F16). Shipping that list as the default saves tokens and breaks principle 3’s write path. | Default list stays the full catalog minus the two dead tools. The optional short list includes KEEP. |
| Putting the taxonomy into `cockpit-new-desk.md` would teach the model and would make F11 worse. The command is already 4,184 tokens (`harness-stress/REPORT.md` F11). | The taxonomy lives in schema files. The command only says where to write the card and that the next turn reads the file. |
| `ask.py` Microsoft/Meta boosts and `from_cockpit.py` HBM/Micron keeps violate generalization and D-ONTO-3. Rewriting them here can change glass-visible packs. | Flagged above. Not in the five PRs, except deleting the single `what is micron` literal and banning new issuer needles. |
| A green `run.mjs` today coexists with confirmed flaws. Calling that a pass violates principle 4. | `--assert` is the gate. Exit 0 with findings still open is a fail. |
| Principle 4 asks for a phone screenshot when UI changes. These phases do not change UI. | No screenshot in the proof. A later edit that touches UI leaves this workstream and goes to Opus or the owner, with a real phone shot. |

## P0 — Live-claim correctness

**Flaws:** F1, F2, F3, F4, F9, F17. **Also:** the date, unit, and taxonomy work in Generalization. **PR:** one draft, after this plan. **UI:** none.

### Root cause

The live slot is `liveClaims` / `live_claims`. Both sort with a string key and classify with substring `any` lists. See Generalization for the line numbers. F2, F3, F4, and F17 are that matcher. F1 and F9 are that key. Python and JavaScript share the JSON and disagree on the grade default, so the same claim pair has two winners.

`buildHouseAssistContext` (`memory-cockpit-v2/server/assistContext.js` lines 64–69) and `get_pack_snapshot` (`memory-cockpit-v2/scripts/mcp-cockpit-research.mjs` lines 264–269) repeat the string sort when rules fail to load. Those fallbacks move in this PR so a rules-load failure cannot reintroduce F1.

### Design

Options and the chosen taxonomy, parser, and unit rules are in Generalization. This phase does not add a model, a per-ticker exception, or a DEMO-only needle.

`goodwill_impairment` becomes `all` of goodwill and impairment, and it is ordered before a generic impairment rule and before inventory. Inventory’s needle is the word `inventory`, with `none` containing impairment. Cash is ordered before revenue guidance and gains phrase coverage for “cash was”, “cash were”, “cash balance”, and the equivalents phrases, with negatives for cash flow. Guidance requires a guidance or outlook word and a revenue or sales word, with the cash phrases on `none`. The stem `guid` is deleted.

Headcount and operating segments are taxonomy ids, not boilerplate drops. “45 percent” and “$ 12” are accepted by the shared unit parser and can remain residual when no phrase hits. A qualitative sentence with no number and no phrase still drops. That is elision, and the sector fixture does not treat it as a classified metric.

### Files and functions

- `ontology/schema/contextpack_metrics.json` — phrases, boundaries, negatives. No issuer tokens.
- `ontology/schema/taxonomy_xbrl.json` — new starter map. New file, ontology only.
- `ontology/api/contextpack.py` — `classify_metric`, `_claim_key`, `parse_amounts`, `live_claims`. Add `parse_as_of`.
- `memory-cockpit-v2/server/contextpack.js` — `classifyMetric`, `claimKey`, `liveClaims`, the residual test. Same parse results as Python.
- `memory-cockpit-v2/server/assistContext.js` — fallback sort calls the shared key.
- `memory-cockpit-v2/scripts/mcp-cockpit-research.mjs` — same fallback, lines 264–269 only.
- `ontology/api/ask.py` — delete the `what is micron` literal. Add a unit test that new router needles are not issuer names. Do not rewrite the contract scorer.
- Tests listed below. No `src/**`. No `model.js`. No `from_cockpit.py`.

### Migration

Claim `as_of` strings in the vault stay as the author wrote them. The sort key is computed at read time. `ontology/store/` is not hand-edited (D-ONTO-4, `AGENTS.md` §0.4). A later human COMPILE BOOK on a private tree can change which claim is live. This public PR does not compile a private book and does not add desks.

`concept` is optional. Claims without it use layer B. Old packs keep loading.

Glass reads compiled pack fields, not `liveClaims`. This phase does not change glass markup. If a future compile changes a number on a private desk’s glass, that is a data change on that desk, outside this PR.

### Tests

- `ontology/tests/test_contextpack_live.py` — new. The DEMO repro sentences and all ten sectors. Assert metric id, date winner, currency, and scale.
- `memory-cockpit-v2/scripts/contextpack-test.mjs` — the same sentences through the JS mirror. Extend the issuer-token ban.
- A tiny parity driver: same fixture JSON in, same winners out of Python and JS.
- `node harness-stress/run.mjs --assert p0` — cases `C-date-unpadded`, `C-date-iso`, `C-guid-steals-cash`, `C-cash-phrase`, `C-drops`, `C-goodwill-any`, `C-missing-grade`, plus `sectors`.
- Expected winners on the original repros: unpadded October beats September; the outlook sentence keeps `revenue_guide` and the cash-plus-“guidance” sentence stays `cash`; “Cash was $222 million” is the live cash claim; inventory impairment is `impairment`; a goodwill balance is `goodwill`; “45 percent”, spaced `$ 12`, employees-with-a-count, and “operating segments” plus a count are present; blank grade and explicit C on the same day pick the same id in both languages.

### Acceptance

`--assert p0` exits 0. `contextpack-test.mjs` exits 0. Parity has zero mismatches. The metric JSON and the XBRL map contain none of the banned tokens. `C-same-day-tie` still keeps the earlier element. No file under `memory-cockpit-v2/src` changes. `thin-desks.json` stays `desks: []`.

### Risk

A broader revenue phrase can steal a sentence that also says “revenue” in a concentration clause. The negative list and the earlier concentration rule are the control. The sector fixture includes a deposit sentence, a deferred-revenue sentence, and a barrels sentence so that failure is visible.

Word-boundary code differs between Python and JS on Unicode. These needles are ASCII. The parity test is the check.

Changing live winners on a future compile can change what an agent repeats. It does not write the house. The number has to already be in the claim text.

### Change size

Medium. Two parsers and one JSON ruleset, on the order of a few hundred lines, plus the fixture file. No UI.

**Principles:** 1 pass (fixtures only) · 2 pass (no house write) · 3 pass (no invented day, no FX conversion, no new vault claims) · 4 pass (`--assert p0`) · 5 pass (no `src/`) · 6 pass (data path; `model.js` untouched) · 7 pass · 8 pass (one fixture file). **Conflicts:** none inside this phase if the Microsoft/Meta scorer is left flagged rather than rewritten. **UI:** no.

## P1 — Caps and the MU filter

**Flaws:** F5, F6, F7, F8, F10. **Depends on:** P0 parsers, so a trimmed pack still shows the right live claim. **UI:** none.

### Root cause

D-ONTO-8 and `CONTRACT.md` §7 say the overview pack is at most 10,000 characters. `retrieve` calls `_budget_cut` (`ontology/api/retrieve.py` lines 69–146) and then still returns the pack when it is over the limit (lines 135–146), with `trimmed: true`. The cutter only shrinks known keys. `house_prior` is copied whole at line 166, so an unknown `notes` field of 20,000 characters survives (F5).

`assembleAgentPack` (`contextpack.js` lines 72–105) has no budget field. `get_pack_snapshot` (`mcp-cockpit-research.mjs` lines 246–330) returns ranked claims and the full `house_prior` with no character cap. The fat DEMO snapshot was 46,089 characters.

`build_agent_context` (`ontology/api/agent.py` lines 199–206) appends `END CONTEXT` and then slices `text[:max_chars]` (default 28,000, line 111). The closer is in the sliced region, so it disappears. The marker is added after the slice, so the result is longer than `max_chars` (28,042 in the probe). The cut is mid-token.

`_trim_claims` (retrieve.py lines 51–61 and 218) keeps the 12 newest claims by string `as_of`. Ten newer revenue lines plus cash and debt fill the twelve slots. Gross margin from an older year is dropped (F8). That is a different algorithm from one-claim-per-metric.

The risks intent filters series with `id.startswith("mu")` (lines 176–181). On a DEMO store that filter kept `mu-price` and dropped `demo-price` (F7).

F10 is the residual cap of 8, which works and is silent.

`buildHouseAssistContext` embeds the full house markdown (`assistContext.js` lines 130–134) and unsliced claim text (lines 120–122). On a short fixture that was 2,608 characters. On a long house it is the same class of leak as F5.

### Design

**Options.** Raise the 10k cap. Rejected by D-ONTO-8. Cap only `retrieve()` and leave MCP uncapped. Rejected because MCP is the path the agent uses. Truncate with `text[:N]` again. Rejected because that drops the closer.

**Chosen.** One allowlist cutter. Keys that may appear in an overview pack are listed. Unknown `house_prior` fields are dropped, not preserved. String fields shrink in a fixed order. After the last step, if the JSON is still over the limit, replace the body with a stub that is under the limit and a gap that says the pack was over budget. `used_chars <= limit` is the post-condition. `trimmed: true` with `used_chars` over the limit is a test failure.

The limit stays `OVERVIEW_BUDGET_CHARS` (10,000) for `retrieve`, for `assemble_agent_pack` / `assembleAgentPack`, for `get_pack_snapshot`, and for the assist clipboard. Do not add a second, larger budget for banks or for a named ticker.

Protected content, dropped last: `gaps`, focus identity, house status and date, and the string `END CONTEXT` on the agent path. Claim bodies shrink before those.

Overview claims go through `live_claims` first (one per metric, P0 rules), then the budget cutter. `_trim_claims`’s newest-12 pass is removed from the overview path. Twelve copies of revenue cannot crowd out cash, debt, or gross margin. If the live set itself exceeds the budget, the cutter drops residual `other` first and records the count.

`build_agent_context` reserves the closing block, including `END CONTEXT`, then fills the body up to `max_chars` minus that block, on a newline boundary. The final string length is at most `max_chars`. A canary that exists only in the closer survives. A canary that exists only in a dropped middle section may be absent, and the gap says the middle was omitted.

Risks-intent series: return the series on that store. Delete the `mu` prefix and the Micron id list. Do not add a replacement list.

Residual cap stays 8. When the cap bites, append a gap `N unclassified numbered claims omitted`.

Assist context: cap the embedded house with an explicit line that the full file is `get_house_view`. That changes the tool payload, not glass.

The `FOCUS_ALIASES` error text loses the implication that only MU and NBIS exist. The aliases themselves stay.

### Files and functions

- `ontology/api/retrieve.py` — `_budget_cut`, `retrieve`, delete the series filter, stop using `_trim_claims` for overview.
- `ontology/api/contextpack.py` — `assemble_agent_pack` gains the same post-condition. `to_agent_markdown` does not grow past the cap by re-expanding a field the cutter removed.
- `ontology/api/agent.py` — `build_agent_context`.
- `memory-cockpit-v2/server/contextpack.js` — `assembleAgentPack`.
- `memory-cockpit-v2/scripts/mcp-cockpit-research.mjs` — `get_pack_snapshot`.
- `memory-cockpit-v2/server/assistContext.js` — clipboard cap.
- `ontology/tests/test_ontology.py` — `test_retrieve_overview_budget` already asserts `<= 10_000`. Keep it. It must still see a non-empty `claims` list when the MU store is present. Do not weaken it.
- No `src/**`.

### Migration

No vault rewrite. No store hand-edit. Agents that depended on a 46k snapshot will receive a capped snapshot plus a gap. That is the contract they were already supposed to have. Glass overview reads the compiled store through its own model, not `get_pack_snapshot`. Leave those render paths alone.

### Tests

- `--assert p1` on `C-js-no-char-cap`, `C-retrieve-fat-claims`, `C-retrieve-unknown-house-field`, `C-agent-tail-cut`, `C-retrieve-crowd`, `C-retrieve-risks-mu-filter`, `C-residual-cap`.
- For each of the ten sectors, a fat `notes` field and a repeated top-line claim: `used_chars <= 10000`, `END CONTEXT` present on the agent string, and the sector’s distinctive metric still present when it fits.
- `C-retrieve-risks-mu-filter`: `demo-price` is kept. `mu-price` is kept only because it was inside that store, not because of the prefix. A second case with only `demo-price` must not drop it.
- Crowd case: `gm-old` remains after ten newer revenue lines.
- Unknown `notes` is absent or shortened, and the pack is under the cap.
- Residual case: 12 in, 8 out, and a gap names the omission.

### Acceptance

`--assert p1` exits 0. `test_retrieve_overview_budget` still passes where the MU store exists, and is skipped rather than faked where the public tree has no MU pack. No snapshot result in the tool probe is over 10,000 characters. Agent context contains `END CONTEXT` and is at most `max_chars`.

### Risk

The cutter can drop a useful claim on a genuinely fat pack. The gap line is the signal. Raising the cap instead would hide the bug the stress test measured.

Allowlisting `house_prior` drops unrecognized keys. Today only `play`, `status`, `date`, and `view_excerpt` are read by the markdown renderer (`contextpack.py` lines 265–268). A private fork that stuffed research into `notes` would lose it from the agent pack. The vault file is untouched. The gap names the dropped key.

### Change size

Medium. One cutter shared by four builders, plus the agent-context reservation. No UI.

**Principles:** 1 pass · 2 pass · 3 pass (omissions are gaps, not invented replacements) · 4 pass · 5 pass · 6 pass · 7 pass · 8 pass (same cap for every sector, no extra model). **Conflicts:** the 10k cap versus “show every figure” is resolved by the gap, not a bigger cap. **UI:** no.

## P2 — GO-gate integrity

**Flaws:** F18, F15. **UI:** none. **This phase strengthens the gate. It does not add a bypass.**

### Root cause

`goCommitRegister` (`memory-cockpit-v2/server/goCommit.js` lines 238–239) refuses only when `08` has fewer than four `### R` headings **and** fewer than four pending chips. Four pending chips pass even when the file has a single risk.

`proposeAddRisk` assigns `r_num` from `nextRiskNumber(text)` (`riskProposals.js` lines 399–406 and 570). The file does not change until accept, so four proposals against a file whose max is R1 all receive R2.

`acceptRiskProposal` throws when that number is already present (lines 835–836). `goCommitRegister` catches `already exists`, records a skip (lines 256–258), then still writes the ACCEPTED header and stamps `REGISTER_COMMITTED` (lines 265–272 and 287–294).

`goCommitDrivers` (lines 323–326) calls `registerCloseout`, which requires four headings and four tripwire tables (`register-closeout.mjs` lines 18 and 48–56, failure at 101–108). The drivers refusal is correct. The false `ok: true` on the register call is the bug. The stress evidence was `### Rn 2, tripwire tables 2` after three of four chips were skipped.

F15 is a different hole. `propose_house_view` refuses FORMING. `saveHouseMarkdown` (`memory-cockpit-v2/server/thinHouseSave.js` line 57) is the allowlisted writer used by glass save and by `acceptHouseProposal`. A shell append never calls it. The probe appended to a `/tmp` fixture and the bytes changed (`harness-stress/REPORT.md` F15). The product tree was not the target. A host with bash can do the same to a real vault. This repo cannot prevent a process that has filesystem rights from writing. It can refuse to treat that write as a GO.

### Design

**Options for F18.** Lower the closeout bar to match the loose GO. Rejected. That loosens principle 2. Trust the session stamp and skip `registerCloseout` on drivers. Rejected. Same loosening. Re-check the file after apply and stamp only if `registerCloseout` would pass. Chosen.

**Chosen register behavior.**

- Pending `add_risk` chips take distinct numbers: `next = max(file, already-pending proposals) + 1`.
- Before any write, build the projected `08` from the current file plus the distinct pending sections. Require the same `risksDrafted` test `registerCloseout` uses (four headings, four tripwire tables). If the projection fails, return `ok: false`, write nothing, do not touch the header, do not stamp the session.
- If an accept throws, stop. Do not stamp. Leave already-applied sections as they are only if the post-state passes `registerCloseout`; otherwise the call returns `ok: false` and the next steps say to re-draft. Do not flip the header on a thin file.
- Drivers stay as they are: they refuse until `registerCloseout` passes.

**Options for F15.** Ignore bash because the host is outside Cockpit. Rejected as the whole answer. Revert the file from a watcher. Rejected. It races a human save. Record the hash inside `saveHouseMarkdown` and treat a mismatch as unauthorized. Chosen.

**Chosen house audit.** `saveHouseMarkdown` appends a hash line after a successful rename. GO and glass ACCEPT already use that function, so they stay authorized. A reader compares the file hash to the last line. A mismatch adds a pack gap `house file changed outside saveHouseMarkdown` and `house-closeout` fails. The bytes are not reverted. Compile may still run so the operator can see the pack, and the gap travels with it.

Do not implement “if the log is missing, trust the file and write a baseline” on every read. That launders a shell append. Migration: a one-shot baseline may be recorded only by an explicit command the owner runs, or by the next real `saveHouseMarkdown`. Until then, a file with no log is “no audit yet”, which is not the same as a mismatch. The regression creates a log through `saveHouseMarkdown`, appends with the shell, and expects the mismatch.

Tool descriptions say bash may read and may not write `house-view-*.md`, `08-risks-catalysts.md`, or `09`. That sentence does not make the filesystem safe. The audit is the control.

### Files and functions

- `memory-cockpit-v2/server/goCommit.js` — `goCommitRegister`.
- `memory-cockpit-v2/server/riskProposals.js` — `proposeAddRisk`, `nextRiskNumber`.
- `memory-cockpit-v2/server/thinHouseSave.js` — hash line inside `saveHouseMarkdown`.
- A small reader used by house-closeout and by the pack gap. Prefer an existing closeout script over a new glass route.
- `memory-cockpit-v2/scripts/go-commit-test.mjs` and `desk-engine-order-test.mjs` — keep the happy path and the “thin file” refusal. Add the four-colliding-chips case.
- No `src/**`. The save API response may add `saved_at`’s existing fields only. Do not add a banner on the house page.

### Migration

Sessions already stamped `REGISTER_COMMITTED` on a thin `08` are not rewritten by a migration script. The next drivers GO still fails closed, which is the safe direction. A human re-drafts and says GO again.

House files with no hash log stay readable. They are not auto-baselined. Glass save and GO start the log from that point.

No change to the four-risk minimum.

### Tests

- `--assert p2` on tool-probe ids `register-go` and `drivers-go`, and on `bash_bypass`.
- Four `propose_add_risk` calls against a one-risk file receive four different `r_num` values.
- `commit_on_go kind=register` on that projected file returns `ok: false` when the projection has fewer than four risks with tripwire tables, and the session phase is not `REGISTER_COMMITTED`.
- A projection that does reach four distinct risks with tables returns `ok: true`, and the following drivers GO is not rejected for a thin register.
- `saveHouseMarkdown` then a shell append: audit mismatch is true. Glass-save bytes without an append: mismatch is false.
- The ten-sector fixture is not a vault. The GO tests use a `/tmp` desk, one sector’s risk headings as the sample text, and a second sector’s headings as a repeat, so the gate is not proved only on the DEMO wording.
- `desk-engine-order-test.mjs` still refuses register GO while `08` is thin, and still refuses it before the house is CONFIRMED.

### Acceptance

`--assert p2` exits 0. Existing GO tests exit 0. A register response with `ok: true` implies `registerCloseout` would pass on the written file. An append that skipped `saveHouseMarkdown` cannot clear house-closeout.

### Risk

Failing closed on colliding chips blocks a GO that used to return ok. That is the intended strengthening. The agent must re-propose with distinct numbers. The error `next` step (P4) tells it so. Until P4, the existing error string still has to say the file was not stamped.

A hash log inside the vault is new metadata. It is not a research book. It must not contain house prose, only the hash, the house filename, and the time. Do not commit a log from a private vault into this public repo.

### Change size

Medium. Write-path logic in two server modules and a hash line. Highest care in the stack because it touches GO. No UI.

**Principles:** 1 pass (tmp fixtures, hash only) · 2 pass, and this is the phase that strengthens the gate · 3 pass · 4 pass · 5 pass · 6 pass · 7 pass · 8 pass. **Conflicts:** auto-baseline is forbidden, see the table above. **UI:** no.

## P3 — Slice cards for long runs

**Flaw:** F11. **UI:** none.

### Root cause

`/cockpit-new-desk` has no summarize step. `harness-stress/lib/flow-sim.mjs` loads `.grok/commands/cockpit-new-desk.md` (4,184 tokens) and `AGENTS.md` (2,933 tokens), appends eight slice notes, and ends near 62,382 tokens. The first step that overflows a 32k budget is step 4. A tail-keep at the last step retains 0 of 8 seeded facts. A 128k window still holds 8 of 8. Twelve repeated pack snapshots fit in 32k and keep the canaries. The loss is the head of a long transcript, not the pack schema. Command files that mention summarize: none (`REPORT.md` F6). `implementation-notes.md` is a prose anchor, not a compactor.

### Design

**Options.** An LLM compactor inside Cockpit. Rejected by D-ONTO-5 and by the elision-before-summary finding. Tell the host to “remember the facts”. The stress sim shows a tail-keep drops the head. A longer command that pastes the taxonomy. Rejected under principle 8 and F11.

**Chosen.** The slice agent’s deliverable is a card on disk, `raw/{slug}-research/slices/0N.md`, at most 1,500 tokens: graded bullets, source slugs, and GAPs. The orchestrator does not paste the raw slice back into the next turn. The next turn’s note ends with the seed block and the list of card paths. The host may tail-keep. The seed is at the end, so a tail-keep still sees it. The cards are the memory. The transcript is scratch.

A checker, `scripts/slice-card-check.mjs`, fails a card that is over the token cap, that contains a number with no source slug, or that contains buy/sell/target/sizing language. The checker does not summarize. It accepts or refuses.

The command edit is short. It points at the checker and the path. It does not include the taxonomy, the ten-sector table, or a second copy of `AGENTS.md`.

`flow-sim.mjs` gains a card trajectory beside the current raw trajectory. The raw trajectory stays as a negative control (0 of 8 at 32k). The card trajectory must keep 8 of 8 at 32k. Product code does not tail-keep. The sim is the proof that the command’s shape survives the host behavior the stress test measured.

The seed block is harness canaries in the sim and, in real use, the facts already written in the cards. The command does not invent facts to “keep the canaries warm.”

### Files and functions

- `.grok/commands/cockpit-new-desk.md` — the card rule and the tail seed. Keep the edit small. `scripts/lab-feature-hooks/99-house-closeout.sh` reads this file. Do not remove the closeout phrases it looks for.
- `memory-cockpit-v2/scripts/slice-card-check.mjs` — new checker. No network.
- `harness-stress/lib/flow-sim.mjs` — card trajectory.
- No `src/**`. No ontology store.

### Migration

Desks with no `slices/` directory are unchanged. The command creates the directory when a new underwrite runs. Old transcripts are not rewritten.

### Tests

- `--assert p3` reads `flow.json`: card trajectory `last_32k.canaries_kept == 8`. Raw trajectory may still be 0. That raw result is the control, not a failure, as long as the card result is 8.
- `slice-card-check.mjs` on ten tiny cards, one sentence each from the ten sectors, each with a source slug: pass. A card with a bare number and no slug: fail. A card over the cap: fail. A card with a price target: fail.
- The command file’s token count does not grow by more than 400 tokens versus the current 4,184. The assert measures this so the instruction cannot absorb the taxonomy.

### Acceptance

`--assert p3` exits 0. The checker exits 0 on the good cards and 1 on the bad ones. No model is called. `implementation-notes.md` is not wired in as a compactor.

### Risk

A host that ignores the command and pastes full slices will still overflow. The checker cannot force the host. The exit-gate model arm is where that shows up. The deterministic gate is the card trajectory in the sim, which is the failure mode the stress test actually measured.

Cards live under `raw/` in a vault. This public PR adds the checker and the command, not sample cards from a real company.

### Change size

Small. One short command edit, one checker, one sim path. No UI.

**Principles:** 1 pass · 2 pass (cards are not a GO) · 3 pass (checker rejects an unsourced number) · 4 pass · 5 pass · 6 pass · 7 pass · 8 pass (command growth capped). **Conflicts:** none if the taxonomy stays out of the command. **UI:** no.

## P4 — Tool catalog, error shape, next step

**Flaws:** F12, F13, F14, F16. **Depends on:** P1 for the pack snapshot cap, P2 for the register error text. **UI:** none.

### Root cause

`tools/list` returns 24 tools and 3,011 tokens of name, description, and schema. An eight-tool core is 1,103 tokens (`REPORT.md` F12). `propose_add_metric` (`mcp-cockpit-research.mjs` lines 608–631) and `get_metric_sor` (lines 680–691) always return `not wired` and still occupy 226 and 81 tokens. `mcp-metrics-failclosed-test.mjs` requires those stubs to exist and not to call `proposeAddRisk`.

Malformed `desk` is MCP `-32602` with `isError: true` and a Zod message, because the schema requires a string before the handler runs (probe ids `missing-desk`, `desk-type`). An unknown desk throws in `resolveDesk` (line 151). `get_pack_snapshot` does not catch it, so the client sees `isError` plain text (id `unknown-desk`). FORMING, SAVE DRAFT, and a bad risk status are `{ ok: false }` with `isError: false` (F13). None of the envelopes contain a next step. The probe’s `retry_hint` regex looks for “retry”, and every row is false.

Description overlap is highest for `accept_house_proposal` / `accept_risk_proposal` (Jaccard 0.625). `get_house_assist_context` embeds the house that `get_house_view` also returns (F14). P1 caps that payload. This phase shortens the description so the tool says it is rules plus a pointer, not a second copy of the house.

F16, measured, not a logic bug in one function. On the full catalog both models scored 11/11 tool identity. On the eight-tool core, `gpt-5.6-sol-high` stayed 11/11 and abstained where the tool was absent. `gemini-3.8-flash-low` once called `commit_on_go kind=drivers` for KEEP. That core list omits `propose_keep_driver` (`harness-stress/lib/tool-probe.mjs` lines 498–507). Both models sometimes emitted `go-commit.mjs` for a GO write, which skips propose. One strong-model read used `house-view-DEMO.md` on a case-sensitive filesystem.

The driver hint in `driverProposals.js` lines 341–342 names NVDA and AWS. That is the company-specific string this phase neutralizes.

### Design

**Options.** Publish only the eight-tool core. Rejected. It caused the cheap-model miss, and operate commands still need tripwires, lists, and the driver tools. Delete `commit_on_go` and let bash write. Rejected by principle 2 and F15. Leave the dead metric tools as expensive refusals. Rejected by F12.

**Chosen catalog.**

- Unregister `propose_add_metric` and `get_metric_sor`. Update `mcp-metrics-failclosed-test.mjs` and `mcp-risks-restore-test.mjs` to assert the names are absent and that no handler under those names calls `proposeAddRisk` or reads `08`. A cached client that still calls the name gets an unknown-tool error. The descriptions already said not wired.
- Default `tools/list` is the remaining tools. Capable hosts may set `COCKPIT_MCP_TOOL_PROFILE=core` to a closed set that includes every write the desk loop uses: the current eight, plus `propose_keep_driver` and `get_driver_sor`. KEEP is not optional on that list. Default is the long list, not `core`, so a cheap model is not shown a list that omits the right write.
- `commit_on_go` with `kind=drivers` when the user verb is KEEP returns `ok: false` and `next` pointing at `propose_keep_driver`. It does not write `09`.
- Descriptions: `commit_on_go` is the GO write. `propose_*` stores a pending chip. `accept_*` is the scenario grant, not the Grok GO path. Drop shared boilerplate so the Jaccard pairs fall because the words no longer overlap on “proposal” alone. Do not mention a ticker in an example.
- Driver hint examples become sector-neutral (“a subscription line”, “a regulated rate base”, “a rental portfolio”). No NVDA, AWS, or ads-mix proper noun.

**Chosen errors.**

A `defineTool` wrapper safe-parses arguments and catches handler throws. Every failure this server produces is one JSON object:

```json
{ "ok": false, "error": "...", "next": "call list_desks", "retryable": false }
```

`retryable` is false for FORMING, SAVE DRAFT, unknown desk, thin register, and a wrong kind. The `next` string tells the model what to call instead. It does not say “retry” or “try again”, because those words would send the same bad payload. Update the harness so the assert looks for `next` and `retryable: false`, not for the word retry.

Schema failures go through the wrapper as the same object, instead of a bare `-32602` string. The `error` text still includes the field name. Unknown desk is caught and returned as that object, not a thrown plain string.

`kind=metrics` stays a refusal (`mcp-cockpit-research.mjs` lines 456–457).

### Files and functions

- `memory-cockpit-v2/scripts/mcp-cockpit-research.mjs` — wrapper, unregister two tools, descriptions, drivers-kind guard.
- `memory-cockpit-v2/server/driverProposals.js` — `DRIVER_CANDIDATE_HINT` only.
- `memory-cockpit-v2/scripts/mcp-metrics-failclosed-test.mjs`, `mcp-risks-restore-test.mjs`.
- `harness-stress/lib/tool-probe.mjs` expected names, once this phase lands. The probe’s expected list is updated in the same PR so `--assert p4` matches the new catalog.
- No `src/**`.

### Migration

Grok sessions pick up `tools/list` on the next connect. Old transcripts may still try the metric tools. Unknown-tool is the outcome. Document that in the PR. Do not keep the tools registered “for compatibility”; that is the token bug.

`COCKPIT_MCP_TOOL_PROFILE` defaults to unset, which means the long list. Existing pins do not lose tripwire or accept tools.

Error JSON replaces plain-text throws. Callers that looked for the substring `unknown desk` still find it inside `error`. Callers that required `-32602` specifically will see the JSON instead. Glass does not call MCP.

### Tests

- `--assert p4`: tool count is 22 on the default list; the two metric names are absent; `propose_add_metric` schema tokens are 0; every probed failure has `next` and `retryable: false`; FORMING still does not write; `kind=drivers` on a KEEP-shaped call without a keep chip returns `ok: false` and names `propose_keep_driver`.
- Core profile list contains `propose_keep_driver` and does not contain the metric tools.
- Description grep: no ticker symbols in tool descriptions or `DRIVER_CANDIDATE_HINT`.
- The ten-sector fixture is used as the `desk` value only inside `/tmp` registries, one sector slug per call, so unknown-desk and a good desk are both proved. Those slugs are not added to the product registry.
- `npm run test:platform` includes the updated fail-closed tests.

### Acceptance

`--assert p4` exits 0. Default catalog has no always-refusing metric tool. A KEEP mistake does not commit drivers. No description contains a ticker.

### Risk

Unregistering tools surprises a cached session once. The failure is loud and does not write.

Shortening descriptions can remove a warning a model relied on. The `next` field carries the warning that used to live only in prose. The exit-gate model arm is the check that identity did not fall below the stress baseline (11/11 on the full list).

The wrapper must not catch a successful write and relabel it. Tests cover FORMING refusal and a valid propose on `/tmp` separately.

### Change size

Medium. One large MCP file, mostly a wrapper and description edits. No UI.

**Principles:** 1 pass · 2 pass (wrong kind does not write; FORMING still refused) · 3 pass · 4 pass · 5 pass · 6 pass · 7 pass · 8 pass (dead tools gone; default list unchanged for the cheap model). **Conflicts:** the eight-tool core is not the default. **UI:** no.

## Exit gate

After P4 is green, one cloud-agent run. No Mac. `XAI_API_KEY` is unset. Product `thin-desks.json` is read before and after and must stay `desks: []`.

Deterministic, all must exit 0:

```bash
npm install --ignore-scripts --no-audit --no-fund --prefix memory-cockpit-v2
npm install --ignore-scripts --no-audit --no-fund --prefix harness-stress
node harness-stress/run.mjs --assert p0
node harness-stress/run.mjs --assert p1
node harness-stress/run.mjs --assert p2
node harness-stress/run.mjs --assert p3
node harness-stress/run.mjs --assert p4
node harness-stress/run.mjs --assert sectors
```

`--assert sectors` loads `harness-stress/fixtures/sectors.json`, requires ten issuers and the sector list in Generalization, and fails if any issuer’s expected metric, date winner, or unit is wrong. It also runs the mu-filter case, the budget post-condition, and the GO projection on two sectors’ heading text. It greps the metric JSON and the XBRL map for issuer tokens.

Then the model arm, once, on `gpt-5.6-sol-high` and `gemini-3.8-flash-low`, using the prompts under `harness-stress/prompts/` plus one extra recall prompt built from the ten-sector seed (eight labeled facts, no private names). Score with `node harness-stress/score-models.mjs`.

Pass bar:

- Recall 8/8 on `recall-s`, `recall-l`, and the sector seed, both models.
- Tool identity on the default catalog stays at the stress baseline, 11/11, both models.
- On the core profile, both models pick `propose_keep_driver` for KEEP. A `commit_on_go kind=drivers` answer for KEEP fails the gate.
- Bash reads use the vault-root basename `house-view-demo.md`. A bash command that writes a house file, `08`, `09`, or pipes into `go-commit.mjs` fails the gate.
- No reply is edited to manufacture a pass. If a subagent cannot run, the deterministic asserts still stand and the model arm is recorded as blocked.

`node harness-stress/run.mjs` without `--assert` may still write `REPORT.md`. That file is not the gate.

## Rollout and rollback

This plan PR is a draft against `cursor/harness-context-tools-stress-77e7`. It does not merge, and it does not target main.

Implementation PRs are drafts, one per phase, each stacked on the previous phase’s branch. Merge inside the stack only after that phase’s `--assert` exits 0 and the named unit tests exit 0. Do not push main. Do not ship to friends from this stack. `RELEASE.md` lab and release-check are for a later ship ask, not for these drafts.

Each phase PR leaves `memory-cockpit-v2/config/thin-desks.json` with `desks: []` and does not add files under a private vault.

Rollback is `git revert` of that phase.

- P0 revert restores the old JSON rules. Already-compiled packs keep whatever classification the last compile wrote. Do not hand-edit `ontology/store/`.
- P1 revert restores the leaky cutter. No data migration.
- P2 revert stops recording new hashes. Old hash lines sit unread. Sessions are not rewritten.
- P3 revert restores the command text. Cards already on disk in a private vault are inert notes.
- P4 revert registers the two metric tools again and restores the old error strings.

No phase needs a phone screenshot, because no phase changes pixels. A revert that somehow included `src/**` would be out of scope and would need the owner’s UI review before it landed.

## Fences

- This PR and the five implementation PRs: public kernel only.
- No product-code edits in the plan PR. The implementation PRs stay inside the files named above.
- No `memory-cockpit-v2/src/**`, no CSS, no glass copy.
- Product desks stay `[]`. The ten sectors and DEMO are fixtures, not desks.
- No vault, no `cockpit-vault`, no personal tree, no `.access.json`, no `.env`.
- No `XAI_API_KEY`.
- Do not merge these branches to main from this workstream.
- Decision-support only. The plan does not rate a company, set a target, or size a position.

**Principles for the plan PR itself:** documentation only. 1 pass · 2 pass · 3 pass · 4 not yet (the asserts land with the implementation) · 5 pass · 6 pass · 7 pass · 8 pass. **UI:** no.
