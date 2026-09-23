---
name: filing-map
description: >
  Cockpit filing map: jailed SEC accession → house flip-triggers and named risks.
  Jail is inbox.json. Not a 10-K essay, not thesis, not COMPILE BOOK.
  Triggers: /cockpit-filing-map, MAP FILINGS.
argument-hint: "[desk] [run_id] [chat]"
user-invocable: true
---

# Filing map

Tree: **`~/Desktop/cockpit-kernel`**. Glass often `:4682`. Overview **MAP FILINGS** is **on demand** (not cron).

**Not this skill:** `/cockpit-report` · `/cockpit-daily` · `/cockpit-research-compile`.

Decision-support only: no buy/sell/hold, no PT, no sizing.

## Job

Glass creates `job: filing_map`. **Read `inbox.json` first.** Map only those accessions.

```text
$COCKPIT_VAULT/cockpit/research/{TICKER}/runs/{stamp}_filing_map_{TICKER}/
  inbox.json     # JAIL — server
  acquired/
  delta.json     # publish
  summary.md
```

## Steps

1. If no `run_id`, stop — glass should have started the run.
2. Read inbox. Missing → tell Anthony to open Overview (warm EDGAR cache) and click MAP FILINGS again.
3. Acquire each `last_print` + `material_not_in_book` URL via `POST /api/{slug}/research/runs/{run_id}/acquire`. GAP on 403.
4. For each accession write an **in-depth digest vs last COMPILE BOOK** (facts, not a 10-K essay, not a register scorecard):
   - Results: revenue / mix / margins vs prior print or pack language (quote or GAP).
   - Cash / liquidity / FCF vs net income if the filing speaks.
   - Capital: share count, commitments, guarantees, covenants, dilution, material contracts.
   - 8-K item meaning if this row is an 8-K.
   - House/Rn tests are optional overlay in `house_hits` / `risk_hits` — do **not** lead the digest with “does not trip.”
5. Publish:

```json
{
  "job": "filing_map",
  "status": "complete",
  "summary": "8–12 sentences. Load-bearing delta vs pack. No accession numbers.",
  "digest": "Same or longer; Filings page paints this first if present.",
  "rows": [{ "accession": "", "form": "", "filed": "", "in_book": false,
    "what": { "text": "multi-sentence what-changed for this accession", "excerpt": "verbatim from acquired/", "grade": "A" },
    "house_hits": [], "risk_hits": [], "driver_hits": [], "add_risk_candidates": [], "gaps": [] }]
}
```

6. **Do not `propose_*` this pass.** Do not write house / 08-risks / `ontology/store/` / COMPILE BOOK.

Pace **through**. Form 3/4/5 are not in the inbox — do not add them.

Unknown accession → publish will reject. Invented dollars → GAP.

## Chat (existing complete run)

Args include `chat` or glass OPEN GROK `mode: chat` on a **complete** `run_id`:

1. Do **not** start a new `filing_map`. Do not POST `/research/runs`.
2. Read `inbox.json` + `delta.json` + `summary.md`.
3. Talk: explain tests, argue house hits, dig deeper (`/cockpit-risk-check` / `/cockpit-report`) **only citing those accessions**.
4. Book edits: `propose_house_from_current` / `propose_risk_status` / `propose_add_risk` / `propose_keep_driver` (house_cite required) as **distinct** tools. User **GO**. No silent write. Never FORMING.
5. **Glass closeout:** on a complete map, Filings dossier **PROPOSE FROM MAP** → dry-run preview → **CONFIRM PROPOSE** calls `POST /api/{slug}/research/runs/{run_id}/propose-from-map`. Same propose_* stores; still GO / ACCEPT + COMPILE BOOK if pack lags. Fill pass remains no-propose.
