---
name: model-read
description: >
  Cockpit model_read: on-demand taught PDF of the working Model ledger.
  Jail is numbers-graph.json (company guide bar, offset, GAP). Not thesis,
  not UPDATE MODEL, not a rating. Triggers: /cockpit-model-read, READ MODEL,
  explain the model numbers, model PDF.
argument-hint: "[desk] [run_id]"
user-invocable: true
---

# Model read (ledger PDF)

Tree: **`~/Desktop/cockpit-kernel`**. Vault sibling `../cockpit-vault` (or `$COCKPIT_VAULT`). Glass often `:4682`.

**Not this skill:** `/cockpit-report` (thesis vs house) · `/cockpit-model` (UPDATE MODEL) · `/cockpit-model-audit` (pasted model). This job **reads** the vault Model and teaches it.

Decision-support only: no buy/sell/hold, no price target, no sizing. Bar = **last company guide**, never Street consensus.

---

## Job

Glass **READ MODEL** on `#/{desk}/model` creates Research job **`model_read`**:

```text
$COCKPIT_VAULT/cockpit/research/{TICKER}/runs/{YYYYMMDDTHHMMSSZ}_model_read_{TICKER}/
  numbers-graph.json   # written by glass on start — JAIL
  seed.md
  config.py
  sections/            # thermometer.md …
  output/              # PDF (ops, never pack SoR)
```

`run_id` = folder name. If glass already created it, **do not** start a second run.

---

## Jail (fail closed)

1. Read **`numbers-graph.json`** before any draft.
2. If `ok` is false or `cells` is empty: **stop**. Tell Anthony to click UPDATE MODEL. Do not invent a ledger.
3. Every load-bearing number in the PDF must be a `cells[].id`, an `offset_pairs[]` field, or a `quality_flags[]` sentence. Otherwise **GAP**.
4. **Never invent** Street consensus, whisper, units × ASP, YOUR CASE values, or a prior guide vintage that is not in the graph.
5. Midpoint of a guide is **not** an actual. `vs_band: bar_only` means the quarter has not printed.
6. Offset law: Q(N) guide applies to Q(N+1) actual. Completed pairs in the graph already map “prior $XB ±Y%” on a print cell. Open bars are the new homework.

Write `baseline-anchors.md` as a dump of cell id · label · value · layer so you cannot smuggle numbers.

---

## ORDER (exact — do not add sections)

```text
thermometer · print-vs-guide · quality · new-guide · still-gap · next-print
```

`config.py` `ORDER` must match that list. `PAGE_BREAK = False`. Section files start with **`##`** (not `#`) so CSS does not force a page per chapter.

Teach. Do **not** emit three unexplained headlines. The locked mock is the voice: first-structure tables **plus** layman unpacking (what a guide is, what ±2% means, why last call is this quarter’s bar, why an exclusion makes a beat cleaner).

---

## Draft (per section)

**thermometer** — Why 2–3 rows exist (use `thermometer[]` + `why`). Rest of the Model is support or empty YOUR CASE. Optional ASCII tree from those cells only.

**print-vs-guide** — Offset table from `offset_pairs`. Explain: a guide is last quarter’s promise; ±N% is a band; beat = above the top of the band. Separate vs last quarter (growth) from vs guide (homework). Street is GAP here by design.

**quality** — Use `quality_flags`. Size of beat ≠ quality. If China is zero, say the beat is without that slice. Mix (compute/networking) is mix, not volume/price. Gross margin bounce is a print, not a floor. Cash vs commitments is two-sided.

**new-guide** — Open `bar_*` pairs. New homework vs last actual (sequential). Range width. Exclusions on the guide cell note. Do not call sandbagging from one mapped print.

**still-gap** — `still_gap[]` user_case rows. Empty is honest. Concentration structural cells may be facts; YOUR max-customer line may still be GAP — do not say “too concentrated.”

**next-print** — What the next actual has to clear (`guide_low`–`guide_high`) and what must stay excluded. Quote `house_excerpt` as read-only. **Do not write House. Do not propose_*.** End with “look at these Model row ids…” from the thermometer + completed print + open bar + still_gap.

Voice: short paragraphs, then a grey “In plain terms.” box when a mechanic is new (guide, offset, exclusion).

Forbidden grep on the master (except the disclaimer line): `overweight|buy rating|price target|fair value|we recommend|you should buy`.

---

## config.py (new file — do not copy thesis fixtures)

```python
from pathlib import Path

RUN = Path(__file__).resolve().parent
PIPELINE = Path.home() / "Desktop" / "cockpit-kernel" / "scripts" / "report"

NAME = "model-read"
OUTDIR = RUN / "output"
DIAGRAMS = (RUN / "diagrams").resolve()
SEC_PREFIX = ""
PDF_STEM = "model-read"
TITLE = "{TICKER} — Model read"
SUBTITLE = "Company guide bar · decision-support only · not a price target"
AUTHOR = "Cockpit model read"
DATE = "YYYY-MM-DD"
FOOTNOTES = True
PAGE_BREAK = False

ORDER = [
    "thermometer",
    "print-vs-guide",
    "quality",
    "new-guide",
    "still-gap",
    "next-print",
]

FIGMAP = {}
CSS = PIPELINE / "report_styles.css"
SECTIONS_DIR = RUN / "sections"
MASTER = OUTDIR / f"{PDF_STEM}-master.md"
HTML = OUTDIR / f"{PDF_STEM}.html"
PDF = OUTDIR / f"{PDF_STEM}.pdf"
```

Section files: `sections/thermometer.md` … matching ORDER ids.

---

## Render + publish

```bash
python3 ~/Desktop/cockpit-kernel/scripts/report/build.py --config $RUN/config.py
```

If Chrome is missing, leave HTML in `output/` and say so — publish still needs html or pdf.

POST `/api/{slug}/research/runs/{run_id}/publish`:

```json
{
  "job": "model_read",
  "status": "complete",
  "summary": "One sentence: print vs last company guide, next bar, biggest GAP."
}
```

No pack_claims, no house_proposed, no risks_proposed.

---

## Hard rules

1. Decision-support only.
2. Graph jail — no invented bars.
3. Do not write house / 08-risks / ontology/store / YOUR CASE / print arm-lock.
4. Do not run thesis ORDER or register chapters.
5. PDF is ops, never pack SoR.
6. Do not `git push`. Do not write product `thin-desks.json`.
