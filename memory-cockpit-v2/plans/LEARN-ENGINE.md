# Learn-map engine — technical product Background (factory-wide)

**Renderer / Study Tree object (2026-08-28):** see [`LEARN-BACKGROUND-V3.md`](./LEARN-BACKGROUND-V3.md) — HTML architecture (not SVG); Study Tree is an unfired deep-dive launcher, not a lesson expander.

**As-of:** 2026-08-28  
**Tree:** cockpit-personal (private). Not friend-upgrade / export-kernel / product `desks: []` ship.  
**Status:** design + schema spike. Live primers are **not** rewritten in this change.  
**Decision-support only.** Not House · not Model numbers · not a rating · ≠ COMPILE BOOK.

---

## 1. What is wrong with the page today

Glass `#/{slug}/background` looks “done”: a PRIMER pill, a ~600-word one-pager, YOUR LEVEL empty, one 50-word lesson. That is the **ceiling the first-pass contract asked for**, not a renderer bug.

Verified on this tree (nine registry desks + LLY ops files; LLY is **not** a desk):

| Fact | Evidence |
|------|----------|
| Primer contract is “moderate one sitting” | Skill, OPEN GROK seed, glass copy, default `style.depth = moderate` |
| Generation is **one** OPEN GROK pass | `BUILD BACKGROUND` → `open-grok` `action: background` → `/cockpit-learn {desk} primer` → POST `primer.md` |
| Seed starves the writer | `learnAgentSeed.js` truncates current primer to **1800 chars**, packs **12 claims**, **does not attach** vault `01-overview` / `02-*` |
| Lessons are optional | Skill: “write a lesson only when a chunk should live on the page.” First pass wrote one ~50–70 word “confusion killer” per desk (MRVL two) |
| Factory floor is 400 chars | `thin-learn-live-e2e.mjs` `n_chars < 400` — 500–750 word primers pass |
| Glass is one HTML blob | No study tree, no source pins as first-class, no map |
| Deeper product notes already exist | Every registry desk has `raw/{ticker}-research/01-*.md` and `02-*.md` (AVGO: `02-ai-semiconductor.md`). NVDA 02 names CUDA-X / NIM / NeMo / DRIVE — the live primer does not |

Anthony’s guess (moderate contract + single OPEN GROK pass) is **correct**. The extra failure: the writer never sees the vault product notes that already exist.

This is **not** a missing LLM in glass. Ask stays deterministic pack Q&A. Grok remains the writer via OPEN GROK / MCP. The engine’s job is to **jail the fill** (map + harvest + depth bar) so a sitting produces a curriculum, not another moderate one-pager.

---

## 2. Engine choice: **learn-map** (harvest → map → fill → gate)

**One engine for all nine desks.** Same vault folder (`cockpit/learn/{TICKER}/`). Same room. No per-ticker UI. No second wiki.

```text
vault 01/02 + pack claims     product-map.json           primer.md spine
        │                          │                     lessons/{id}.md
        ▼                          ▼                            ▲
   harvest (deterministic) → map (schema jail) → Grok fill (OPEN GROK)
                                      │
                                      ▼
                              depth gate (like ont verify, ops only)
                                      │
                                      ▼
                         glass: spine + ARCHITECTURE + STUDY TREE + learner (untouched)
```

| Stage | Who | Writes | LLM? |
|-------|-----|--------|------|
| **Harvest** | Node (`learnHarvest.js`) | nothing required (seed text only) | No |
| **Map** | Grok POST `/api/{slug}/learn/map` | `product-map.json` | Yes (schema-gated) |
| **Fill** | Grok POST primer + lessons | `primer.md`, `lessons/{id}.md` | Yes |
| **Gate** | Node (`scoreLearnDepth`) | nothing | No |
| **Learner** | Tutor only | `learner.json` **merge** | Yes, later |

Rebuild **never** POSTs a learner wipe. Silence is still not contradiction.

---

## 3. Why alternatives lost

| Alternative | Why not |
|-------------|---------|
| **Prompt-only `/cockpit-learn` (“write deep”)** | That **is** today’s engine. Live output is the proof it produces 50–70 line spines + optional 50-word lessons. No harvest, no required tree, 400-char test floor. |
| **New `thesis_report` / Reports job** | Wrong loop. Reports is house + register + judgment PDF. Background must not become a thesis note. User: `/cockpit-report` is different. |
| **Headless `deep_compile` worker** | Compile lane is pack SoR; glass Compile room is **retired**. Learn is ops, not `ontology/store`. No long-lived model key in glass (PROJECT-STATE). A headless LLM job is not this architecture. |
| **Compile-like pack extract only** | Pack claims are graded facts, not a teaching curriculum. 02 notes have the stack language. Pure extract has no “what this is not” voice and no lesson tree. Harvest uses pack **as input**, not as the textbook. |
| **RAG / second wiki** | Vault already has 01/02. Indexing a new corpus is a second wiki. User: do not bolt one on. |
| **Per-ticker deep primers by hand** | Not factory. Desk N would need another sitting. |
| **Mermaid in `primer.md`** | SoR would fork into prose. Glass must not execute mermaid.js. Preview helper only. |
| **Per-ticker SVG / PNG under learn/** | Nine forks. Not a factory. |
| **Reports `diagrams/*.png`** | Thesis / COMPILE-adjacent art. Different loop. Learn must not import them. |
| **Memory-desk wiki Background art** | That page is gone. Thin `#/{slug}/background` is the only glass surface. |

Closest cousin in-tree is **`model_read`’s numbers-graph jail**: schema first, prose second. Learn-map is that idea for **product language**, stored under `cockpit/learn/`, not Model.

---

## 4. Depth bar (what “in depth” means on glass)

**Not a thesis PDF. Not House. Not Model.** A user should be able to **study** what the company builds/sells/runs (chips, systems, networking, process, software, power) across sittings.

### Primer = spine (still one page, no longer the whole textbook)

Must include:

1. **As-of sources** in English (FY2026 10-K, Q1 PR) — no `[[wikilinks]]` in published markdown  
2. **Filed mix table** (segments / platforms the company actually reports)  
3. **Named product families** in company language (not four bullets that skip the stack)  
4. **Not this** — the adjacent object people confuse it with  
5. **What a figure is not** — filed cut ≠ SKU $ ≠ utilization ≠ unnamed customer identity  
6. **Honest GAP / UNKNOWN** list  
7. **≥ ~1400 words** as the spine floor (today’s 500–750 word “one sitting” fails on purpose)

Numbers live on `LEARN_DEPTH_BAR` in `learnMap.js` (v2). Diagrams v2 plan: `LEARN-DIAGRAMS-V2-PLAN.md`.

### Lesson tree = the depth

- **≥ 9 ready nodes** on `product-map.json` covering the **family’s required kinds**  
- Each ready node has a lesson **≥ ~450 words**: mechanism, named products, source + as-of, “what a figure is not”, GAP  
- `fabless_platform` also requires kinds `mechanism` and `process`, and **≥ 2 ready** `mechanism`/`process` nodes  
- Tutor walks the tree (known / fuzzy / next). Lessons are **required for a built map**, not optional asides  
- Soft press → `[soft]`. Invented mix / SKU $ / customer names / utilization → **GAP** or node `status: unknown`

### Families (templates, not ticker forks)

Inferred from harvest **content**, not a slug table:

| Family | Required kinds | Typical desks (examples, not code switches) |
|--------|----------------|-----------------------------------------------|
| `fabless_platform` | silicon, systems, networking, software, segment, not_this, **mechanism**, **process** | NVDA, AMD |
| `custom_silicon` | silicon, networking, segment, not_this | MRVL |
| `dual_engine` | silicon, software, segment, not_this | AVGO |
| `foundry` | process, segment, not_this | TSM |
| `memory_idm` | silicon, process, segment, not_this | MU |
| `neocloud` | systems, software, segment, not_this | NBIS |
| `power_dc` | power, systems, segment, not_this | IREN |
| `ai_infra_operator` | systems, software, segment, not_this | SHAZ |

Desk #N tomorrow: registry + vault 01/02 + this engine. Zero new `pages/{ticker}`.

### What a figure is not (binding)

Every dollar on glass must say which of these it **is**:

- Filed segment / platform / company line  
- IR cut (say so)  
- Contract / TCV / RPO / commitment (not last year’s revenue)  
- **GAP** if none of the above  

Never: invented SKU splits, named identity of a “22% customer” the filing does not name, utilization made up from MW nameplate.

---

## 5. Diagrams (architecture on Background — same engine)

Diagrams are **not a second product**. They are a typed list on `product-map.json`:

```json
"diagrams": [
  {
    "id": "stack",
    "type": "stack",
    "title": "Product stack",
    "as_of": "2026-03-01",
    "sources": [{ "label": "01-overview" }],
    "blocks": [
      { "id": "b1", "label": "CUDA / libraries", "kind": "software", "status": "ready" },
      { "id": "b2", "label": "GPU / interconnect", "kind": "silicon", "status": "ready" }
    ],
    "edges": []
  }
]
```

### Types that belong

| Type | Teaches | Typical family |
|------|---------|----------------|
| `stack` | Layers of what they build (software / silicon / system / service) | fabless, custom silicon, neocloud |
| `flow` | How the product is made or delivered (process, not a valuation) | foundry, memory IDM, power/DC |
| `segments` | Product / customer **categories** named in 01/02 (not mix $) | dual-engine, AI infra |
| `interconnect` | How blocks attach (NVLink-class, Ethernet, foundry customer) | fabless, custom, neocloud |

Family required types live on `LEARN_FAMILIES[].required_diagrams` in `learnMap.js` (templates, not a ticker table).

### Types that do not belong

| Reject | Why |
|--------|-----|
| Price / volume / rating charts | Not product understanding; Model / Street |
| COMPILE BOOK / thesis / House art | Different loop; Reports `diagrams/*.png` stay there |
| Mix-$ pie, SKU split, utilization % | Invented finance unless `filed: true` + as_of + source |
| Decorative mermaid in `primer.md` | SoR would fork; glass must not execute mermaid |
| Per-ticker hand SVG / PNG in learn/ | Factory cannot maintain nine forks |
| Memory-desk wiki diagrams | That page is gone; thin Background is the only glass surface |

### How they are produced and stored

1. **Harvest** already lists 01/02 + pack claims. Grok proposes diagrams **only** from those pins.
2. **SoR** = `diagrams[]` on `product-map.json` (same POST as the map). One engine: learn-map.
3. **Validate** (`learnDiagrams.js`): allowlisted types; every block `ready` or `gap`; edges cannot be `ready` if an endpoint is missing; `$` / `%` / `sku split` labels require `filed: true`. Optional `group` (segments lanes) and `parent` (containment, max depth 2). A `$`/`%` in `group` without `filed: true` is rejected.
4. **Render** = factory SVG on `#/{slug}/background`. `learnDiagramLayout.js` (pure geometry) → `LearnDiagrams.jsx` (inline `<svg>`). Theme via CSS vars. Same drawing for all nine desks. **Tile size never encodes $.**
5. **Mermaid** = optional `diagramToMermaid()` for preview / tests. **Glass does not load mermaid.js.**
6. **Reports PNGs** (`research-wiki/cockpit/reports/{TICKER}/diagrams/`) are a **different** loop. Learn must not import them.

Quality floors (`scoreLearnDiagrams`): stack ≥4 layers and ≥3 kinds; flow ≥4 blocks; interconnect ≥3 blocks and ≥2 edges; segments ≥3 `filed: true` blocks. Depth bar also requires **`min_diagrams`: 3** plus the family’s required types (`fabless_platform` needs all four).

### Glass

`#/{slug}/background` order: PRIMER → **ARCHITECTURE** → STUDY TREE → YOUR LEVEL → LESSONS.

ARCHITECTURE is the SVG projection of `map.diagrams`. Empty → “No architecture diagrams yet.” It does **not** become a second wiki and does **not** mix with the retired Memory-desk Background. NEXT chips are a **read-path view** in `getLearnSnapshot` (relabel + derived from ready nodes). **Never write `learner.json` from that path.**

### Photos (two lanes)

Typed `photos[]` on the same `product-map.json`. Cards render in ARCHITECTURE next to the SVG drawings. Not a second wiki.

- **`primary`** — company IR / newsroom / official product / SEC. Host-allowlisted from graded `wiki/sources` frontmatter + `www.sec.gov`. Grade A or B.
- **`tape`** — Google Images result (engine builds the queries; Grok runs them). Grade `"tape"`. Caption and glass chip say **web, not a filing**. Required `node_id` + `query`. Never mints a pack/house/mix-$ claim.

Server downloads origin bytes (magic sniff, 3 MB, sha256) into `cockpit/learn/{TICKER}/photos/`. Hotlinked thumbs and generated fakes are rejected. Missing file → GAP box. Caps: 8 total / 4 tape. Photos never carry `$`. See `LEARN-PHOTOS-PLAN.md`.

### Fail-closed

- Unknown block → `status: "gap"` + dashed box + **GAP** chip. Do not invent a pretty topology.
- Unknown mix / SKU $ → omit the number; do not draw a pie.
- Missing required family diagram type → depth gate FAIL (`diagrams missing types`).
- Invalid schema → POST 400; file not written.

See v2 floors above. Companion plan: `LEARN-DIAGRAMS-V2-PLAN.md`.

---

## 6. Vault layout (still one folder)

```text
$COCKPIT_VAULT/cockpit/learn/{TICKER}/
  primer.md              # spine (overwrite on rebuild)
  product-map.json       # curriculum jail — nodes[] + diagrams[] + photos[]
  learner.json           # MERGE only — never wiped by rebuild
  lessons/{id}.md        # upsert by id
  photos/{id}.png|jpg|webp   # schema-pinned harvest only (see LEARN-PHOTOS-PLAN.md §3.5)
  seed.md                # OPEN GROK harvest dump (existing)
```

LLY may have files on disk. **Factory lists `thin-desks.json` only.** Do not add LLY as a tenth desk.

Learner schema **v1 unchanged** (`experience` / `depth` / known / fuzzy / next / last_session). Tutor `depth` is pacing. **BUILD BACKGROUND fill is always the product-map bar** (deep), not `style.depth = moderate`.

---

## 7. How it runs across nine desks

1. **Dogfood one desk** (NVDA — screenshot / product complexity). Prove harvest → map → nine lessons → gate green. **Do not** wipe other primers.  
2. **Merge proof:** MRVL already has `known: not-gpu`, `fuzzy: cpo`, `last_session`. Rebuild primer/map/lessons; learner must still have those ids.  
3. **Factory loop** (later, not this PR’s write): `node memory-cockpit-v2/scripts/learn-factory.mjs --desk {slug}` then OPEN GROK fill. Order: NVDA → MRVL → remaining registry.  
4. **Idempotency:** harvest is a pure read; map node ids stable; lessons upsert by id; extra old short lessons **kept** (do not delete on rebuild).  
5. **Failure:** missing 01/02 → harvest `missing[]`, family still guessed from pack; nodes may be `unknown`; primer may still publish with GAP section. Gate stays red until the bar is met. Do not half-wipe primer.  
6. **LLY:** never in the factory desk list.

This PR’s factory script is **`--dry-run` by default**: scores nine desks against the new bar, writes **nothing**.

---

## 8. Explicitly not in scope

- House / 08-risks / pack / `ontology/store/` / Model / Street / COMPILE BOOK  
- `/cockpit-report` thesis PDF  
- LLY-as-desk  
- Overwriting the nine live primers in this change  
- Friend-upgrade / export-kernel / product kernel ship  
- Phone CSS lock  
- Embedding a model API key in glass  
- Glass ACCEPT / propose_*  
- Mermaid.js on glass, vault SVG / diagram PNG under `cockpit/learn/` (raster **photos[]** pins are the one sanctioned binary — LEARN-PHOTOS-PLAN.md §3.5), Reports diagram PNGs as Background art  
- A second wiki or revival of Memory-desk Background  

---

## 9. Spike in this change (proves the engine can exist)

- `server/learnMap.js` — family templates, `validateProductMap`, `scoreLearnDepth`  
- `server/learnHarvest.js` — 01/02 + pack claims  
- `server/learnDiagrams.js` — typed diagram schema, fail-closed $ / topology, mermaid preview helper  
- `POST /api/{slug}/learn/map` — publish map **including `diagrams[]`**, **does not touch learner.json**  
- GET snapshot: `map` (with `diagrams`), `depth_gate` (advisory; page still `available` if primer exists)  
- Seed includes harvest (not 1800-char primer-only) + diagram job  
- Glass: PRIMER → **ARCHITECTURE** → STUDY TREE; honest empty copy when no map; disclaimer unchanged  
- Shared renderer `learnDiagramLayout.js` + `LearnDiagrams.jsx` — inline SVG, GAP chips, no mermaid.js  
- `scripts/learn-factory.mjs --dry-run` — registry desks only  
- Tests: schema, harvest glob (AVGO 02 name), rebuild preserves learner, LLY excluded, advice rejected, diagram `$` reject, GAP interconnect accept, mermaid export has no invented `$`  

**Fill of live desks:** operate follow-up (`/cockpit-learn {slug} primer` after this lands). Not a silent factory rewrite. Do **not** overwrite the nine live primers in this change.
