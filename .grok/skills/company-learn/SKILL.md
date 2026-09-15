---
name: company-learn
description: >
  Cockpit Background: technical product map on glass (harvest → map → HTML
  architecture + spine), then on-demand Study Tree deep-dives. Optional Grok
  tutor remembers this desk. Vault cockpit/learn/{TICKER}/. Not thesis, not House,
  not Model numbers. Triggers: /cockpit-learn, BUILD BACKGROUND, DEEPEN, OPEN TUTOR.
argument-hint: "[desk] [primer|tutor|deepen] [node_id]"
user-invocable: true
---

# Company learn (Background + tutor)

Tree: **`~/Desktop/cockpit-kernel`**. Vault sibling `../cockpit-vault` (or `$COCKPIT_VAULT`). Glass often `:4682`.
Design: `memory-cockpit-v2/plans/LEARN-BACKGROUND-V3.md` (engine: LEARN-ENGINE.md).

**Not this skill:** `/cockpit-report` (thesis) · `/cockpit-model` · `/cockpit-model-read` · `/cockpit-coverage`.

Decision-support only: no buy/sell/hold, no PT, no sizing.

---

## Job

Glass `#/{desk}/background`:

- **Build / rebuild background** → this skill `primer` — **learn-map engine**: harvest vault 01/02 + pack claims → `product-map.json` (nodes + **architecture diagrams**) → spine primer + lessons (depth bar). Glass architecture is **HTML** from `diagrams[]` (not SVG, not mermaid).
- **Deepen** a Study Tree node → this skill `deepen` — one **product-mechanism deep-dive** (Reports *craft*: setup · mechanism · evidence · what a figure is not · GAP · exec). Not the thesis lane (no house chapter, no register, no propose_*). Pace **through**.
- **Open tutor** → this skill `tutor` — parked this pass; still works. Teach in this terminal. Do not wipe learner on rebuild.

Vault (ops, never pack SoR):

```text
$COCKPIT_VAULT/cockpit/learn/{TICKER}/
  primer.md
  product-map.json
  learner.json
  lessons/{id}.md
  photos/{id}.png|jpg|webp
  deep/{node_id}/meta.json
  deep/{node_id}/note.md
```

---

## Modes

Parse args: desk + `primer` | `tutor` | `background` | `deepen` + node_id (default **tutor** if a primer exists, else **primer**).

### Primer (learn-map fill)

Read the OPEN GROK **seed** (includes deterministic harvest). Then:

1. Primary-first: harvest 01/02 + 10-K Item 1 / IR / graded pack claims. Soft press → **[soft]**. Missing mix $ / named customers / utilization → **GAP** or node `unknown`.
2. POST `/api/{slug}/learn/map` — family + as_of + sources + not_this + gaps + nodes (required kinds for that family) + **`diagrams[]`** (family required types: stack / flow / segments / interconnect). See LEARN-ENGINE.md depth bar.
3. POST `/api/{slug}/learn/primer` — **spine** (≥ ~1400 words): as-of, filed mix, named families, not-this, what a figure is not, GAP list. Not a thesis PDF. **Do not paste mermaid or SVG into the primer** — glass renders HTML architecture from the map.
4. POST `/api/{slug}/learn/lessons` **one per ready node** (≥ ~450 words): mechanism, named products, source/as-of, what a figure is not, GAP. Upsert by id.
5. **Do not wipe `learner.json`.** Optional `next` only if next is empty. Never POST known/fuzzy/last_session on a rebuild.
6. **No `[[wikilinks]]`** in published markdown. Name the filing in English.
7. Never write house, 08-risks, ontology/store/, Model, Street, or COMPILE BOOK.
8. Diagrams teach architecture as **HTML** (stack / flow / segments / attach table). Unknown attach / mix $ / SKU split → **GAP** box, not a pretty lie. No SVG, no mermaid, no price charts, ratings, Reports PNGs, or COMPILE BOOK art. `segments` may use `group` (period lanes) and `parent` (containment). **Tile size never encodes $.**
9. `fabless_platform` maps need `mechanism` and `process` kinds, and ≥2 ready mechanism/process nodes.
10. **Photos (optional):** two lanes on `photos[]`. Primary = company IR/newsroom/SEC hosts from graded `wiki/sources` (allowlist is a projection — file a source slug to admit a host). Tape = Google Images on **engine-built** queries (`node scripts/learn-photos.mjs --desk {slug} --queries`). Identification gate: publish tape only when the result page names the study-tree product; else GAP. POST `/api/{slug}/learn/photos` — server downloads bytes (no SERP scrape, no Google API key, no GenerateImage, no gstatic thumbs). Caps ≤8 / ≤4 tape. Captions carry no `$`. Tape captions say **web, not a filing**. Tape never mints pack/house/mix $. Do not write `learner.json`.

Depth bar (gate, not a vibe): primer ≥1400 words · ≥9 ready nodes covering family kinds · ≥9 lessons ≥450 words · ≥4 source pins · ≥3 diagrams meeting per-type floors · family required types. Factory: `node memory-cockpit-v2/scripts/learn-factory.mjs --dry-run`. NEXT chips are a snapshot **view** (do not write `learner.json` to “fix” NEXT).

### Deepen (one Study Tree node)

Read the OPEN GROK **seed**. Then:

1. Confirm `node_id` is on `product-map.json`. If no map, run primer first.
2. House prior in the seed is **read-once context**. Do not copy stance. Do **not** write a register chapter. Do **not** `propose_*`.
3. Pace **through** — glass fired this; do not wait at checkpoints.
4. Write ORDER: `setup · mechanism · evidence · what-a-figure-is-not · gaps · exec`. Exec last. Graded anchors `[A|B|C]` with venue + date in English. Soft press → **[soft]**. Missing mix $ / named customers / utilization → **GAP**.
5. Target ≥1800 words. POST `/api/{slug}/learn/deep` `{ "node_id": "…", "markdown": "# …" }`.
6. **Do not wipe `learner.json`.** Do not POST known/fuzzy/last_session.
7. **No `[[wikilinks]]`.** Never write house / 08-risks / ontology/store / Model / Street / COMPILE BOOK.

### Tutor

1. Read learner.json + primer + map + lessons **before** teaching. Do not restart from zero.
2. Classroom is this terminal. Walk uncovered / fuzzy map nodes. One check question at a time. No quiz LMS.
3. Write/update a lesson when a node should live on the Background page.
4. After a resolved chunk, POST `/api/{slug}/learn/learner` with **upserts**. Omit arrays you are not changing. **Silence is not contradiction.**
5. Never write house / 08-risks / ontology/store / Model / Street.

---

## Learner POST shape

```json
{
  "known": [{ "id": "custom-asic", "label": "Custom ASICs / XPU" }],
  "fuzzy": [{ "id": "cpo", "label": "CPO vs LPO", "note": "still mixes them" }],
  "next": [{ "id": "optics", "label": "Electro-optics attach" }],
  "last_session": { "covered": ["custom-asic"], "note": "one sitting" },
  "style": { "experience": "learning", "depth": "moderate" }
}
```

`experience`: learning | intermediate | experienced. `depth`: quick | moderate | deep — **tutor pacing only**. BUILD BACKGROUND fill always uses the product-map bar.

Lesson: POST `/api/{slug}/learn/lessons` `{ "id": "cpo", "markdown": "# CPO\n\n…" }`.  
Map: POST `/api/{slug}/learn/map` `{ "family": "custom_silicon", "as_of": "…", "sources": […], "nodes": […], "diagrams": [{ "id": "stack", "type": "stack", "title": "…", "as_of": "…", "sources": […], "blocks": […] }] }`.

---

## Hard rules

1. Decision-support only.
2. Primer/map/learner/lessons are ops, not pack.
3. Do not invent dollars / SKU splits / customer identities / utilization. Diagrams: GAP, not a pretty topology.
4. Do not run thesis ORDER or propose_* on a deepen. Do not import Reports `diagrams/*.png`. Glass does not execute mermaid or SVG dumps.
5. Do not add LLY as a desk. Do not `git push`. Do not write product `thin-desks.json` desks.
6. Factory-wide: one engine. No per-ticker UI fork. No per-ticker SVG. Study Tree is NOT RUN / RUNNING / FIRED — not a lesson expander.
