# Background v3 — in-depth spine + HTML architecture + on-demand Study Tree

**As-of:** 2026-08-28  
**Tree:** `~/Desktop/cockpit-kernel` (dogfood `:4682`). Not ship. Not push.  
**Class:** PLATFORM — every `thin-desks.json` slug, zero per-ticker UI, product `desks: []` still works.  
**Decision-support only.** Not House · not Model numbers · not a rating · ≠ COMPILE BOOK · ≠ thesis lane.

This plan supersedes the *renderer* and *Study Tree object* of LEARN-ENGINE.md / LEARN-DIAGRAMS-V2. Schema (`product-map.json`, harvest, depth bar, photos) stays. SVG glass and “Study Tree = expand lesson.md” do not.

---

## Feature brief (`/cockpit-feature`)

```text
Feature: Background v3 (HTML architecture + unfired Study Tree deep-dives)
Class: PLATFORM
Works with product desks=[] ? yes
Scales via registry (desk N free)? yes
Approach: Keep harvest → product-map.json → spine primer + typed diagrams[] + photos[].
  Replace SVG architecture with HTML stack/flow/segments/attach from the same schema.
  Study Tree is a launcher (NOT RUN / RUNNING / FIRED), not the lesson list.
  Deepen OPEN GROK writes a product-mechanism deep-dive under learn/deep/{node}/
  (Reports craft: setup/mechanism/evidence/what-a-figure-is-not/GAP/exec — no house
  chapter, no register, no propose_*). Tutor parked this pass.
Files planned:
  NEW  server/learnDeep.js
  NEW  plans/LEARN-BACKGROUND-V3.md (this file)
  EDIT Background.jsx, LearnDiagrams.jsx, theme.css
  EDIT thinLearn.js, thinModel.js, thinDeskMount.js, index.js
  EDIT openGrok.js, learnAgentSeed.js, learnMap.js (meter counts)
  EDIT company-learn SKILL + cockpit-learn.md
  EDIT thin-learn-test.mjs, thin-learn-live-e2e.mjs, open-grok-prompt-test.mjs
  EDIT lab hook 95, sync-agent-surface.sh, PRODUCT-KERNEL-SOR.md
Sync allowlist update? yes (learnDeep.js + this plan)
Lab hook needed? yes (extend 95-company-learn.sh)
Verify: node scripts/thin-learn-test.mjs · learn-factory --dry-run · --fill exit 2
        open-grok-prompt-test · live e2e against :4682 · lab hook 95
Dogfood: http://127.0.0.1:4682/#/nvda/background  (also TSM empty-map / empty product)
Content left on kernel only: none (no vault book copies)
Push: not done — awaiting human
```

Factory checks:

- [x] No `pages/{ticker}/` or `server/{ticker}*.js`
- [x] Registry + `pages/thin/*` + shared `createThin*`
- [x] No hardcoded Anthony tickers as product defaults
- [x] Friend-facing paths on sync allowlist + PRODUCT-KERNEL-SOR
- [x] Litmus: desk N tomorrow works with no new code

---

## 1. What Anthony asked for (binding)

Two **separate** objects on `#/{slug}/background`:

| Loop | Object | Job |
|------|--------|-----|
| **1 — engine (already ported)** | Spine primer + `product-map.json` + HTML architecture | In-depth *what they build*. Harvest → map jail → fill → depth bar. |
| **2 — Study Tree (this build)** | Unfired launcher of topic-scoped **product-mechanism deep-dives** | Each map node is NOT RUN until Deepen. Output looks like a Reports deep-dive **in craft** (anchors, mechanism, GAP, long-form). |

Explicitly **not** this pass:

- Tutor / OPEN TUTOR pacing / learner.json writes (button may remain; YOUR LEVEL hides when empty)
- Thesis lane: house as input-to-copy, register chapter, checkpoints that wait, `propose_*`, `scripts/report` FIGMAP
- Per-ticker SVG/PNG, mermaid.js, NVDA/TSM special cases
- Ship / `git push`
- `--fill` (still refused, exit 2)

Correction that killed v2 Study Tree: expanding `lessons/{id}.md` inside the tree is the **wrong object**. Lessons remain the map-fill textbook (depth bar + parked tutor). The tree launches **deep notes**.

---

## 2. What the page looks like after this build

Top → bottom, every desk, including empty:

1. **Chrome** — `{label} · {TICKER} · BACKGROUND` · PRIMER/EMPTY · WAITING FOR PUBLISH when polling.
2. **Meter (factual, not mood)** — counts vs `LEARN_DEPTH_BAR`, not a “MAP THIN” vibe pill:
   - `SPINE {primer_words}/{primer_min_words}`
   - `NODES {ready_nodes}/{min_ready_nodes}`
   - `DIAGRAMS {diagram_count}/{min_diagrams}`
   - `LESSONS {deep_lessons}/{min_lessons_with_body}`
   - Depth bar reasons listed only when `depth_gate.ok === false`.
3. **Actions** — BUILD / REBUILD BACKGROUND. OPEN TUTOR stays but is not the story. Cancel wait.
4. **ARCHITECTURE** — **hidden** when `diagrams[]` and `photos[]` are both empty. Else HTML:
   - `stack` → layered bands (kind chip + label + optional filed share as text)
   - `flow` → ordered steps with CSS arrows
   - `segments` → grouped lanes / parent containment; **tile size never encodes $**; footnote
   - `interconnect` → **attach table** (From · Attach · To · Status)
   - GAP / unknown / stub → dashed GAP cell, never invented topology
   - Photos under the drawings (unchanged harvest)
5. **STUDY TREE** — **hidden** when no `map.nodes`. Else indented HTML list of nodes:
   - kind chip, title, one-line summary, not-this, source pins
   - node status (`ready` / `stub` / `gap`) is map health, **not** the fire state
   - fire state: **NOT RUN** · **RUNNING** · **FIRED**
   - Deepen → OPEN GROK `learn-deepen` + `node_id`
   - FIRED row expands the deep-dive note (wide prose + section nav)
   - Does **not** expand `lessons/{id}.md`
6. **PRIMER** — always present. Empty = BUILD CTA. Built = spine HTML (≥1400w bar; live short spines fail the meter honestly).
7. **YOUR LEVEL** — **hidden** when known/fuzzy/next are all empty (tutor parked).
8. **LESSONS fallback list** — **removed**. Lessons still exist in vault for the depth bar / future tutor.

Empty product (`desks: []`): Start page still works; no `/nvda` route; learn files and routes exist; GET unknown slug 404.

---

## 3. Loop 1 — spine + HTML architecture

Unchanged pipeline:

```text
vault 01/02 + pack claims  →  harvest (Node)
                               ↓
                          product-map.json (Grok POST, schema jail)
                               ↓
              primer.md spine    diagrams[]    photos[]    lessons/{id}.md
                               ↓
                         depth gate (Node)
                               ↓
                    glass: meter + HTML architecture + primer
```

### 3.1 Spine (primer)

Still one page, no longer a 500–750w pamphlet. Must include as-of sources in English, filed mix, named families, not-this, what a figure is not, GAP list. Floor: `LEARN_DEPTH_BAR.primer_min_words` (1400). **No mermaid in the primer.** Glass does not execute mermaid.

### 3.2 HTML architecture (same `diagrams[]`)

`learnDiagrams.js` schema is SoR. `learnDiagramLayout.js` stays as a **pure geometry helper for tests** (viewBox sanity). Glass **does not draw SVG**.

Fail-closed (already in schema, must survive the HTML skin):

- mix $ / % / SKU split without `filed` → reject at POST, not a pretty tile
- unknown attach → GAP cell / dashed row
- tile size ⊥ dollars
- no per-ticker art, no Reports PNGs, no vault SVG

Photos: still two lanes; missing file → GAP box; never hotlink `image_url`.

### 3.3 Hide empty

A section with nothing to show is omitted. EmptyD walls of “not yet” are not a product.

---

## 4. Loop 2 — Study Tree as launcher + product-mechanism deep-dive

### 4.1 Fire states

| State | Vault | Glass |
|-------|-------|-------|
| **NOT RUN** | no `deep/{node_id}/` (or empty) | Deepen |
| **RUNNING** | `meta.json` `status=running` | WAITING (poll) |
| **FIRED** | `note.md` + `meta.status=fired` | expand note · Deepen again = re-run |

Re-run: seed sets `running` again; **previous note stays readable** until the new POST lands.

Map `status` (ready/stub/gap) is independent. A GAP node can still be Deepened — the note’s job is to document the GAP honestly.

### 4.2 Vault (ops, never pack)

```text
$COCKPIT_VAULT/cockpit/learn/{TICKER}/
  primer.md
  product-map.json
  learner.json                 # tutor-owned; deepen must not remint
  lessons/{id}.md              # map-fill textbook (depth bar)
  photos/{id}.png|jpg|webp
  seed.md                      # last OPEN GROK seed (overwrite ok)
  deep/{node_id}/
    meta.json
    note.md                    # the research product
```

`meta.json` (schema_version 1):

```json
{
  "schema_version": 1,
  "ticker": "TEST",
  "node_id": "cuda",
  "title": "CUDA is not a chip",
  "status": "running",
  "started_at": "…",
  "published_at": null,
  "updated_at": "…",
  "n_chars": 0,
  "n_words": 0,
  "sections": [],
  "thin": true,
  "as_of": null,
  "sources": [],
  "decision_support_only": true
}
```

Path jail: `node_id` via `topicId` (same as lessons). No `..`, no extra dirs. GET missing → 404.

### 4.3 Routes (factory, on `thinDeskMount`)

| Method | Path | Effect |
|--------|------|--------|
| GET | `/api/:slug/learn` | snapshot gains `deep: [{ node_id, status, … }]` (no markdown) |
| POST | `/api/:slug/learn/deep` | publish `{ node_id, markdown, as_of?, sources? }` → write note + meta fired |
| GET | `/api/:slug/learn/deep/:id` | `{ ok, html, markdown, meta }` |
| POST | `/api/:slug/learn/deep/:id/start` | mark running (OPEN GROK seed also does this) |

Publish fail-closed: empty ticker, bad id, advice language, too long, must not remint `learner.json`.

Word floor: **hard reject below 400 words** (junk). **Score thin below 1800 words** or missing required headings — still FIRED, row shows THIN. This matches primer honesty: a short note is visible, not a pretty lie that it is a deep-dive.

Required headings (case-insensitive, `##` or `#`):

1. Setup  
2. Mechanism  
3. Evidence (or Anchors)  
4. What a figure is not (or Figure)  
5. GAP (or Gaps / UNKNOWN)  
6. Exec  

### 4.4 Craft copied from Reports — and what is forbidden

Copy **craft**, not the thesis **lane**.

**Copy**

- Structured ORDER, exec last
- Graded anchors `[A|B|C]` with venue + date in English (no `[[wikilinks]]`)
- Mechanism in company language
- What a figure is not
- Honest GAP
- Long-form (target ~8–12pp / ≥1800 words for one **node**, not 15–25pp of the whole company)
- Primary-first; soft press → `[soft]`
- Decision-support disclaimer

**Do not copy**

- House as a chapter / `delta-vs-house` as a required section (house is **read-once context**, never stance in the note)
- Register chapter, WATCH table, per-Rn test, tripwires-as-SoR
- Conversational checkpoints (Deepen is fire-and-forget from glass; **pace = through**)
- `propose_*` / compile / ontology writes
- `scripts/report` FIGMAP / thesis `config.py` / Reports room job `thesis_report`
- Ratings, PT, sizing

Default ORDER for a node deep-dive:

`setup · mechanism · evidence · what-a-figure-is-not · gaps · exec`

PDF: **out of this pass as a printer pipeline.** Glass wide-prose + section nav **is** the product. A later pass may add `note.pdf` without joining the thesis lane.

### 4.5 OPEN GROK

- Action `learn-deepen` is **allowed** but **not** in the desk AGENTS dropdown (needs `node_id`).
- POST `/api/open-grok` `{ action: "learn-deepen", desk, node_id }`.
- Prompt: `/cockpit-learn {desk} deepen {node_id}`.
- Seed: `writeLearnAgentSeed(..., { mode: 'deepen', node_id })` → marks running, harvest + **that node**, ORDER, publish shape.
- Fail closed if desk has no map or node id is missing/unknown.
- Launch prompt includes seed path + “pace through · no house/register/propose”.

`/cockpit-learn` args: `primer` | `tutor` | `deepen` + node id. Default still tutor-if-primer-else-primer (tutor parked in product story, not deleted).

---

## 5. Generalization (law)

- Family from harvest content (`LEARN_FAMILIES`), never `if (slug === 'nvda')`.
- Renderer, tree, deepen, seed: **zero ticker literals**.
- Tests may use `TEST` / `DEEP` / `WIDG` fixtures and live slugs from **registry**, not hardcoded product defaults.
- LLY is not a learn-map desk.
- `learn-factory --fill` stays refused.
- Product `desks: []` must keep `test:platform` + lab hook 95 green.

---

## 6. Meter vs depth bar

`scoreLearnDepth` already gates fill quality. Glass must **display the counts**, not a mood label.

Add to the gate payload (no new bar numbers except deep-note scoring, which is per-node and not part of map-fill PASS):

- `ready_nodes`
- `source_pins` (already computed internally)

MAP THIN / MAP READY as the only pill is forbidden after this build.

Lessons remain required for `depth_gate.ok` (map fill). They are not the Study Tree body.

---

## 7. Tests

Unit (`thin-learn-test.mjs`):

- HTML renderer source contains **no** `<svg` / `layoutDiagram(` import
- Renderer / Background / learnDeep contain no ticker literals
- startDeep → snapshot `deep[].status === 'running'`; learner.json bytes unchanged
- publishDeep → fired, html sanitized, wikilinks unwrapped, advice rejected
- traversal `../` 404
- missing node 404
- thin note (400–1799w) publishes with `thin: true`
- below 400w rejected
- missing required heading → thin
- factory `--fill` still exit 2
- empty snapshot `deep: []`

Prompt (`open-grok-prompt-test.mjs`):

- `learn-deepen` + desk + node → `/cockpit-learn {desk} deepen {node}`
- `learn-deepen` **not** required in desk catalog
- background / tutor prompts unchanged

Live e2e (kernel glass):

- GET every registry slug `/learn` includes `deep` array
- POST advice on `/learn/deep` rejected
- traversal on `/learn/deep/..` 404
- NVDA / TSM snapshots 200 (map may be thin — honest)

Lab hook 95: files + `learn/deep` route + `learn-deepen` action + HTML not SVG (`<svg` absent in LearnDiagrams.jsx) + unit tests.

---

## 8. Verify / dogfood

```bash
cd ~/Desktop/cockpit-kernel/memory-cockpit-v2
node scripts/thin-learn-test.mjs
node scripts/learn-factory.mjs --dry-run
node scripts/learn-factory.mjs --fill ; echo exit:$?   # must be 2
node scripts/open-grok-prompt-test.mjs
npm run build
# restart glass on :4682
LEARN_E2E_BASE=http://127.0.0.1:4682 node scripts/thin-learn-live-e2e.mjs
```

Browser:

- `#/nvda/background` — HTML architecture (no SVG), meter counts, Study Tree NOT RUN rows, Deepen present, primer below, YOUR LEVEL hidden if empty, no LESSONS dump
- `#/tsm/background` — same chrome; empty architecture/tree hidden if no map
- Product empty shell: lab hook 95

---

## 9. Out of scope / later

| Later | Why not now |
|-------|-------------|
| Tutor walk of the tree | Parked |
| PDF via `scripts/report` | Wrong lane |
| Click architecture tile → Deepen | Nice; tree is the launcher |
| Headless deepen worker | OPEN GROK is the writer |
| Raising live NVDA primer to 1400w | Content, not this engine pass |

---

## 10. Done means

1. Plan file on disk (this).  
2. SVG gone from glass architecture.  
3. Study Tree is NOT RUN / RUNNING / FIRED + Deepen OPEN GROK.  
4. Deep notes are product-mechanism research products in vault + glass.  
5. Factory tests green; `--fill` refused; desks=[] safe.  
6. Glass rebuilt + restarted; NVDA / TSM / empty verified.  
7. Not shipped. Not pushed.
