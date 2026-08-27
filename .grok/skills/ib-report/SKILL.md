---
name: ib-report
description: >
  Cockpit thesis-lane report: interactive, web-research-allowed, judgment-shaped
  (deep-dive / earnings-update / initiation). Load house + register first;
  checkpoints (stop default, or through); PDF via scripts/report; closeout via propose_* only.
  Triggers: /cockpit-report, IB report, thesis report, earnings update note,
  initiating coverage note, report factory. Decision-support only.
argument-hint: "[desk] [deep-dive|earnings-update|initiation] [all|pick|skim] [R1,R2…] [stop|through]"
user-invocable: true
---

# Thesis lane (IB report factory)

Tree: **`~/Desktop/cockpit-kernel`**. Vault is sibling `../cockpit-vault` (or `$COCKPIT_VAULT`).  
Glass often `:4682`. Distinct from deterministic deep-compile / FactSet book — do **not** weaken that trust boundary.

**Not this skill:** `/cockpit-daily` (daybook) · `/cockpit-research` (one question) · `/cockpit-coverage` (short coverage note). This is a **checkpointed report** with anchors + PDF.

Decision-support only: no buy/sell/hold, no price target, no sizing. **Initiation** = coverage *structure*, not a rating. If Anthony asks for Overweight/Buy/PT, refuse and stay on this lane.

---

## Four touchpoints (do not relitigate)

1. **START** — load this desk’s CONFIRMED house (+ version) **and** the risk register (pack/SoR). Protocol: **steelman house → delta vs house → red-team → flag contradictions loudly.**
2. **REGISTER AS CO-INPUT** — depth is a **glass/arg choice** (`all` | `pick` | `skim`). House is never off. Status is **TESTED, never cited as evidence**. Propose only A/B-anchored moves — else **GAP**. Never silent-write.
3. **REPORT STRUCTURE** — risk section is the **register UPDATED** (in-scope Rn → test → evidence → tripwires), never a fresh risks essay. Out-of-scope Rn: one line `not tested this note`. **Delta vs house is mandatory.**
4. **CLOSEOUT (fail-closed)** — file anchors per vault claim format → `./ont compile TICKER && ./ont verify TICKER` exit 0 → house/risk implications **only** via `propose_*` MCP → PDF in the run archive. **PDF is ops, never pack SoR.**

---

## Parse arguments

`$ARGUMENTS` / user text:

| Token | Meaning |
|-------|---------|
| desk-like (slug/ticker) | Desk. If missing: `list_desks`, ask once |
| `deep-dive` / `earnings-update` / `initiation` | Mode |
| `all` / `pick` / `skim` / `house-only` | Register scope (default **all**) |
| `R1`, `R9` or `R1,R9` | Pick ids (with `pick`) |
| `stop` / `through` | Pace (default **stop**) |
| page count (`12pp`, `20 pages`) | Page budget |
| remaining text | Optional focus (print, product, one risk) |

If **mode or desk missing**, ask once (do not research yet). If glass already chose register scope or pace (seed / `$ARGUMENTS`), **do not re-ask**.

---

## Phase 0 — scope (confirm, then stop if unclear)

Ask only what is still open:

1. **Desk** — from registry, not invented  
2. **Mode** — deep-dive · earnings-update · initiation  
3. **Page budget** — default: earnings-update **8–12**; deep-dive **15–25**; initiation **20–30**  
4. **Section ORDER** — propose the default below; get a nod or edits  
5. **Focus** — optional (one print, one product, one Rn)  
6. **Register scope** — `all` (default: WATCH in depth, INTACT/FIRED short) · `pick` + ids · `skim` (titles+status table). **House is never off.** If the seed already set this, print it and continue.  
7. **Pace** — `stop` (default: wait at Checkpoint 1 and 2) · `through` (end to end, no conversational waits). If the seed already set this, print it and continue.

Then print the scope block (include register scope + pace) and proceed only if desk+mode are set. On **through**, do not wait for an ORDER nod — print defaults and go.

### Default ORDER (exec always drafted last)

**earnings-update:** `print-vs-house` · `register-updated` · `tripwires` · `gaps` · `exec`  
**deep-dive:** `setup` · `delta-vs-house` · `register-updated` · `mechanism` · `monitorables` · `exec`  
**initiation:** `spine` · `delta-vs-house` · `financials` · `register-updated` · `monitorables` · `exec`

`delta-vs-house` and `register-updated` are mandatory in every mode (`print-vs-house` counts as delta for earnings-update). On **skim**, `register-updated` is the titles+status table — not a mechanism essay.

### Per-Rn (in-scope only)

Each in-scope Rn in `register-updated` / anchors:

1. **Mechanism** — what would fire  
2. **Tripwires** — from SoR (`get_risk_sor`); do not invent  
3. **Evidence this note** — A/B/C from `baseline-anchors.md`  
4. **Test** — INTACT / WATCH / FIRED (test, **not a write**)  
5. **GAP** if unverified  

Out of scope: `Rn Title — not tested this note.`  
**skim:** id · name · pack status. Still print the WATCH title list. No deep test.  
**all:** WATCH in depth; INTACT/FIRED short; still hunt add-risk *candidates* outside the register.

---

## Run folder (ops archive)

Glass Research job **`thesis_report`** (Phase 3): NEW REPORT on `#/{desk}/research` creates this folder (`run_id` from POST `/api/{slug}/research/runs`). Checkpoints are glass-visible via POST `.../checkpoint`. Still write here — not house, not `08-risks-catalysts.md`, not `ontology/store/`:

```text
$COCKPIT_VAULT/cockpit/research/{TICKER}/runs/{YYYYMMDDTHHMMSSZ}_thesis_report_{TICKER}/
  baseline-anchors.md
  config.py          # FIGMAP + ORDER + paths for scripts/report/build.py
  sections/          # {SEC_PREFIX}{id}.md
  diagrams/          # PNGs; paths in FIGMAP must be absolute
  output/            # master.md / html / pdf (git-ignored locally is fine)
```

`run_id` = folder name.

**Do not copy** `scripts/report/fixtures/two-section/config.py` into a live run. That file is the Phase 1 printer gate (`ORDER = exec, register` + `PRE_WIRE` demo chart). Write a **new** `config.py` with this desk’s `ORDER`, empty-or-real `FIGMAP`, `SEC_PREFIX` matching section filenames, `DIAGRAMS`/`CSS`/`OUTDIR` as absolute paths, `PIPELINE = ~/Desktop/cockpit-kernel/scripts/report`. Omit `PRE_WIRE` unless you have a real figure script.

---

## START — load book (always first)

1. `list_desks` if desk is uncertain.  
2. `get_house_view` — stance, status, version/date, flip triggers.  
3. `get_pack_snapshot` — house_prior, **SoR-aware** WATCH/INTACT/FIRED, claims, gaps. Copy WATCH **titles** from pack; never invent.  
4. Tripwires: MCP `get_risk_sor` per **in-scope** Rn (`all` → every WATCH plus any FIRED in play; `pick` → listed ids; `skim` → skip deep SoR, still list WATCH titles). If that fails, read vault `raw/{slug}-research/08-risks-catalysts.md` — do not invent tables.  
5. Short “context loaded” blurb: house status + WATCH list + register scope. **No web yet** if scope is still open.  
6. If `list_desks` does not include this desk, **stop** — MCP is pinned to the wrong tree. Re-run `./scripts/install-grok-mcp.sh` from kernel (or OPEN GROK from kernel glass). Do not silently use another vault.

House protocol in every later phase: steelman → **delta** → red-team → loud contradiction.

---

## Research → `baseline-anchors.md`

One anchors file per run. **No writer may use a number absent from it.**

Each load-bearing number:

```text
[Source, venue, date] [A|B|C]
```

- **A** filed/primary/transcript  
- **B** reputable secondary  
- **C** vendor/estimate/weak  

Also keep vault-claim form ready for closeout:

```markdown
- <fact> (YYYY-MM-DD) [A|B|C] [[source-slug]]
```

### How to research

- Fan out by thread (filings, the print, WATCH risks, outside-register hunt). Primary first. Soft press → **[soft]**.  
- **Tier-2 (skeptics)** first on claims that move **in-scope** WATCH names or tripwires (2–5 contested facts). Independent corroboration required.  
- For each **in-scope** Rn: evidence → INTACT / WATCH / FIRED **test** (not a write). Out of scope: one line.  
- Hunt risks **not** on the register → add-risk *candidates* only (`all` and `pick`; on `skim` note candidates in GAP, do not deep-dive).  
- Register status is never a citation.

Anchors file must contain: FRAMEWORK, VERDICT draft, delta-vs-house bullets, per-Rn test table, contested-fact resolutions, figure list (`[[FIG:key]]` = FIGMAP keys), hedges, evidence ledger.

---

## CHECKPOINT 1 — STOP (unless pace=through)

Present:

- Verdict draft  
- Delta vs house  
- Contested facts and how they resolved  
- Anchor grade mix (count A/B/C)  
- Proposed ORDER / page budget if still floating  

POST checkpoint `research`. On **stop**, **wait for Anthony** (conversational; not a glass run state). Do **not** draft until he steers or says proceed. On **through**, write this block into `baseline-anchors.md` and continue — do not wait.

---

## Draft

- Exec **last**.  
- Contested / WATCH-bearing sections: analyst + red-team, then synthesize. Descriptive sections: one strong pass.  
- Put FRAMEWORK + ANCHORS in both drafter and verifier context.  
- Expect overshoot → **compression pass** (keep every citation, table, figure).  
- `[[FIG:key]]` must exist in FIGMAP; drop = silent. Illustrative charts: caption **illustrative**.  
- Dollar amounts: keep `$` as dollars (`pandoc -f markdown-tex_math_dollars` is in `build.py`).

### Verify (before asking to render)

- Every load-bearing number appears in `baseline-anchors.md`.  
- Mode-discipline: draft+anchors must **fail** this grep except the decision-support disclaimer line:

  `overweight|buy rating|price target|fair value`

- **0.6× merge guard:** if a verifier returns `corrected_markdown`, accept only when `len(corrected) >= 0.6 * len(draft)`. Else keep draft and say so. `ok=false` means issues were found/fixed — not “broken.”

---

## Render

```bash
cd ~/Desktop/cockpit-kernel/scripts/report
python3 build.py --config $RUN/config.py
```

Chain: wire_figures → assemble → footnote_citations (**one footnote per occurrence, no dedup**) → pandoc → Chrome PDF. Figure paths **absolute**.

---

## CHECKPOINT 2 — QA, then STOP (unless pace=through)

- N/N sections present; no empty/truncated section.  
- Endnotes **1:1** (in-text refs == defs). **Zero** leftover `[^fn` in section sources.  
- Figure count: `data:image/png;base64` in HTML == FIGMAP hits.  
- Page count vs budget (forced `h1` page-breaks inflate count — say so).  
- ≥10 headline numbers spot-checked against anchors (or all of them if fewer than 10).  
- Mode-discipline grep again on the master.  
- Other desks’ PDFs / books untouched.

POST checkpoint `qa`. On **stop**, wait for Anthony before closeout writes. On **through**, continue to closeout — do not wait.

---

## Closeout (after Checkpoint 2 nod, or immediately on through)

1. **File** A/B (and agreed C) claims into vault per `research-wiki/RESEARCH-PATHS.md` — typically `wiki/sources/{slug}-*.md` and/or entity Key facts. Never `ontology/store/`. Never overwrite house or `08-risks-catalysts.md`.  
2. From kernel: `./ont compile {TICKER} && ./ont verify {TICKER}` — **exit 0 required**.  
3. Implications: **MCP only** — `propose_risk_status`, `propose_add_risk`, `propose_house_from_current` (or `propose_house_view`). A/B evidence only; else GAP. Print proposal **id** + glass `#/{desk}/risks` or `#/{desk}/house`. Human **ACCEPT**.  
4. PDF stays in the run `output/` folder (ops). Not pack SoR.  
5. Do not `git push`. Do not write product `thin-desks.json`.

---

## Hard rules

1. Decision-support only.  
2. Do not invent WATCH titles or pack numbers.  
3. Do not skip Checkpoint 1 or 2 **work**. On `stop`, wait. On `through`, do the checks and continue — never skip the QA list.  
4. Do not cite register status as evidence.  
5. Do not silent-write house/risks.  
6. Do not mix this lane’s judgment with deep-compile’s fact tables as if they were the same SoR. Cite pack/house; GAP if missing.
