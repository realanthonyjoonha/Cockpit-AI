# Learn-map diagrams v2 — build plan (plan only, second pass)

**As-of:** 2026-08-28 · **Branch:** `cursor/learn-map-engine-fc27` (PR #14) · **Tree:** cockpit-personal (private)
**Written by:** Fable 5 (plan pass, approved by Anthony). **Executed by:** a later Grok 4.6 agent, end-to-end from this file.
**Decision-support only.** Not House · not Model · not a rating · ≠ COMPILE BOOK. Not friend-upgrade / export-kernel / product kernel.

Companion: `LEARN-ENGINE.md` (first-pass design — still binding except where §4/§5 numbers are superseded here).

---

## 0. Locked brief (do not reopen)

1. **One diagram visual language, factory-wide**, rendered from `product-map.json` `diagrams[]`. NVDA's look is what every desk inherits. Today's CSS labeled boxes in a row do not count as diagrams.
2. **Deeper tree, not a longer disclaimer.** Mechanism nodes (how a rack is built, Compute vs Networking as products, CoWoS/HBM, CUDA-X as a stack, Fusion as attach). Depth bar raised in concrete numbers.
3. **NVDA dogfood on this branch.** The other eight desks inherit the renderer but are **not filled** in the follow-up build unless §8 factory-safety proof is green. LLY is never a tenth desk.
4. **Fail-closed.** GAP when the filing does not support the topology. No invented SKU splits, no unnamed-22%-customer names, no utilization-from-nameplate, no mix-$ pies, no mermaid.js on glass, no per-ticker hand SVG, no Reports thesis PNGs, no House, no Model, no COMPILE BOOK.

Small cleanup in scope: duplicate `CUDA is not a chip` lesson; NEXT chips stuck on the old two topics. YOUR LEVEL redesign / OPEN TUTOR are **out of scope**.

---

## 1. Where this branch stands (verified baseline)

`node scripts/learn-factory.mjs --dry-run` on this branch:

| desk | family | primer words | lessons | map nodes | diagrams | gate |
|------|--------|-------------|---------|-----------|----------|------|
| nvda | fabless_platform | 1656 | 8 | 7 | 4 | **PASS** (old bar) |
| other 8 | (guessed) | 571–665 | 1–2 | 0 | 0 | FAIL |

What the screenshots show and why it fails Anthony's bar:

- **ARCHITECTURE** renders each block as a labeled CSS card. `stack` is four staggered cards in rows; nothing visually *sits on* anything. `flow` is cards with `→` glyphs. `interconnect` lists edges as text bullets under a row of cards. `segments` is six equal cards mixing FY26 and Q1 FY27 with no period grouping and no company ⊃ Data Center ⊃ compute/networking containment. Labeled cards in a row ≠ a drawing that teaches.
- **STUDY TREE** has 7 nodes, none of kind `mechanism` or `process`. The depth bar says "met" because the old bar (6 nodes / 6×400w lessons / ≥1 diagram) is too low.
- **LESSONS** lists `CUDA is not a chip` twice: `lessons/cuda.md` (547 words, current, node `lesson_id: cuda`) and `lessons/cuda-not-a-chip.md` (71 words, stale first-pass confusion-killer not referenced by any node).
- **YOUR LEVEL → NEXT** shows the two pre-engine chips from `learner.json` (`cuda` "CUDA vs the silicon", `dc-networking`) instead of reflecting the tree.

---

## 2. Renderer decision: deterministic inline SVG from the schema

**One factory renderer:** a pure geometry module + an SVG React component, computing the drawing **at render time** from the already-validated `diagrams[]`. Nothing rendered is stored; `product-map.json` stays the only SoR.

```text
product-map.json diagrams[]  ──validateLearnDiagrams (fail-closed, server)──▶  snapshot payload
snapshot payload             ──learnDiagramLayout.js (pure geometry, no DOM)──▶  {viewBox, bands, tiles, blocks, edges, captions}
geometry                     ──LearnDiagrams.jsx──▶  inline <svg> (rect/path/text), themed by CSS classes + vars
```

- **`src/pages/thin/learnDiagramLayout.js`** (new) — pure functions, no React, no DOM, no measurement. Input: one validated diagram. Output: absolute geometry in a fixed-width coordinate space (viewBox width **720**, height computed). Text wrapping by character-count heuristic (constants at top of file: ~7.2 units/char at 12px, wrap width per box). Deterministic: same JSON in → same geometry out. Node tests import this module directly.
- **`src/pages/thin/LearnDiagrams.jsx`** — maps geometry to `<svg viewBox="0 0 720 H" width="100%">` with `<rect>`, `<path>` (+ one `<marker>` arrowhead def), `<text>/<tspan>`. All colors/strokes come from CSS classes using existing theme vars (`--hairline`, `--pchip-bg`, `--pchip-border`, `--sec-2`, amber `rgba(230,162,60,…)` for GAP). No inline hex colors. `width:100%` + viewBox = phone scales for free.
- **Zero per-ticker code.** The renderer must contain no ticker string, no slug branch, no NVDA-specific layout. Desk N inherits the exact same drawing.

### Why the alternatives still lose

| Alternative | Why it loses |
|---|---|
| **mermaid.js on glass** | Executes a text DSL at runtime — SoR forks from the schema into mermaid strings; a second language the validator cannot fail-closed inspect; a runtime dependency; theming fights the app CSS. Already a hard rule: glass never executes mermaid. `diagramToMermaid()` stays a seed/test preview helper only. |
| **Per-ticker hand SVG / PNG in `cockpit/learn/`** | Nine forks; desk N needs an artist; the `$`/SKU/topology validator cannot see inside an SVG, so a pretty lie could ship; violates the factory law (registry + templates, never per-ticker forks). |
| **Reports `diagrams/*.png`** | Thesis lane (`/cockpit-report`), a different loop with different rules; raster art breaks dark theme + phone scaling; not schema-gated; importing it would let COMPILE-adjacent art leak into Background. |
| **Upgraded CSS boxes (today's approach, more of it)** | CSS can nest boxes but cannot draw attach edges between arbitrary blocks — `interconnect` stays a bullet list, `flow` stays cards with `→` glyphs. That is exactly the "labeled-card diagram" Anthony rejected. |

Schema stays SoR; SVG is a projection. This is the same jail philosophy as `model_read`'s numbers-graph.

---

## 3. Exact glass layout — what a drawing looks like on `#/{slug}/background`

Section order on the page is unchanged: PRIMER → **ARCHITECTURE** → STUDY TREE → YOUR LEVEL → LESSONS. ARCHITECTURE keeps its header (`⧉ ARCHITECTURE · stack · flow · segments · interconnect · not a rating`), the honest empty-state copy, and per-diagram captions (**Not this** / **GAP / UNKNOWN** / **Source**) exactly as today. What changes is the body of each diagram: a real drawing instead of card rows. The redundant text bullet list of edges under `flow`/`interconnect` is **removed** (edges are now drawn); the caption lines stay.

### 3.1 `stack` — containment layer-cake (what sits on what)

Full-width horizontal **bands**, flush-stacked (no vertical gap — layers physically rest on each other), layer 0 on top:

```text
┌─ SOFTWARE ─────────────────────────────────────────────┐
│        CUDA / CUDA-X / NIM / NeMo / domain stacks      │
├─ SYSTEMS ──────────────── programs ────────────────────┤
│           Rack-scale systems (Blackwell family)        │
├─ NETWORKING ───────────────────────────────────────────┤
│        NVLink / InfiniBand / Ethernet (Spectrum-X)     │
├─ SILICON ──────────────────────────────────────────────┤
│                  GPU / Grace CPU / DPU                 │
└────────────────────────────────────────────────────────┘
```

- Band = full-width rect (~56 units tall), kind in small caps pinned to the top-left corner of the band, block label centered. Multiple blocks sharing a `layer` sit side-by-side inside one band.
- An edge between adjacent layers renders its `label` as small text on the seam (e.g. `programs`). Edges between non-adjacent layers are not drawn (stack teaches adjacency; use `interconnect` for topology).
- GAP/unknown/stub band: dashed border + amber `GAP` chip in the top-right corner of the band.
- The visual sentence is: *software sits on systems sits on networking sits on silicon.*

### 3.2 `flow` — process chain with real arrows

Left-to-right pipeline with SVG arrowheads; serpentine wrap when more than 4 blocks (row 1 L→R, connector drops down, row 2 R→L) so the chain reads continuously on phone widths:

```text
[NVIDIA design (fabless)] ──▶ [Wafers at TSMC + Samsung] ──▶ [HBM from SK Hynix/Micron/Samsung] ──▶ [CoWoS packaging]
                                                                                                          │
                                                             [Rack / system to the customer] ◀───────────┘
```

- Explicit `edges[]` drawn as paths with arrow markers and `label` text above the arrow; when `edges` is empty, the implicit layer-order chain is drawn (validator already permits this).
- `gap` edge = dashed amber path, label rendered (e.g. `GAP`). `gap` block = dashed box.
- Kind renders as the small-caps chip inside each box (as today's cards do) — the box, not the row, is the unit.

### 3.3 `segments` — filed categories in period lanes with containment (never a pie)

```text
FY26 (FY2026 Q4 PR · 2026-01-25)          Q1 FY27 (FY2027 Q1 PR · 2026-04-26)
┌─ FY26 company · $215.9B ─────────┐      ┌─ Q1 FY27 Data Center · $75.2B ──────────┐  ┌ Edge Computing ┐
│  ┌─ Data Center · $193.7B ────┐  │      │ ┌ compute · $60.4B ┐ ┌ networking·$14.8B┐│  │    $6.4B       │
│  │  ~90% of company           │  │      │ └──────────────────┘ └──────────────────┘│  └────────────────┘
│  └────────────────────────────┘  │      └──────────────────────────────────────────┘
└──────────────────────────────────┘
```

- Blocks group into **lanes** by a new optional `group` field (e.g. `"FY26"`, `"Q1 FY27"`); lane header shows the group label + the lane's source/as-of.
- A new optional `parent` field draws a child tile **inside** its parent tile (company ⊃ Data Center; Q1 DC ⊃ compute + networking). This teaches which filed cut contains which.
- **Tile size never encodes dollars.** Same-depth tiles are equal-sized; the filed `share` string renders as a caption line inside the tile. A fixed rendered footnote on every segments drawing: `categories · tile size carries no $ meaning`. No pie, no treemap-by-value, ever.
- Non-filed block with `$`/`%` is already rejected by the validator; nothing new to invent here.

### 3.4 `interconnect` — attach topology with drawn edges

Three columns: attach sources (left) · fabric (center: `networking`-kind blocks) · attach targets (right). Edges drawn block-to-block:

```text
                    ┌──────────────┐
┌────────────┐ ────▶│ NVLink fabric│  scale-up
│ NVIDIA GPU │      └──────────────┘
└────────────┘ ────▶┌──────────────┐◀╌╌╌ GAP: who ╌╌╌ ┌╌ Customer CPU / XPU ╌┐
                    │ NVLink Fusion│                   ╎  (dashed · GAP)      ╎
                    └──────────────┘                   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

- Column assignment is deterministic from the schema: `networking`-kind blocks → center; a non-networking block that only appears as `from` in edges → left; only as `to` (or `gap`) → right; otherwise alternate left/right by order.
- `ready` edge = solid path with label; `gap` edge = dashed amber with its label (`GAP: who`). `gap` block = dashed border + GAP chip.
- The drawing must make "attach exists; counterpart unnamed" legible at a glance — the dashed box **is** the fail-closed statement.

### 3.5 Fallback

Any validated diagram whose geometry cannot be computed (defensive only — validation should prevent this) renders the generic block grid + a dim `layout fallback` note. The layout function must be total: never throw on validated input.

---

## 4. Schema extension (minimal, additive — `schema_version` stays 1)

Only what §3 requires. Both fields optional; existing maps stay valid.

| Field | On | Rules (enforced in `learnDiagrams.js` `normalizeBlock`) |
|---|---|---|
| `group` | diagram block | string ≤ 48 chars; lane label for `segments` (ignored by other types); money regex applies as it does to `label`/`note` (a `$`/`%` in `group` without `filed: true` → reject) |
| `parent` | diagram block | must be the id of another block **in the same diagram**; a block with a `parent` cannot itself be a parent (max depth 2); self-reference and unknown ids → reject with a "do not invent containment" error; meaningful in `segments`, validated everywhere |

No other schema change. No new diagram types. `LEARN_DIAGRAM_TYPES` unchanged.

---

## 5. New depth bar (numbers)

### 5.1 `LEARN_DEPTH_BAR` in `learnMap.js`

| Constant | Old | **New** | Note |
|---|---|---|---|
| `primer_min_words` | 1200 | **1400** | NVDA's 1656-word spine already passes — depth must come from the tree, not a longer disclaimer |
| `lesson_min_words` | 400 | **450** | all 7 current deep NVDA lessons (506–589 w) pass |
| `min_ready_nodes` | 6 | **9** | forces the mechanism deepening |
| `min_lessons_with_body` | 6 | **9** | one deep lesson per ready node stays the law |
| `min_source_pins` | 3 | **4** | NVDA map has 6 |
| `min_diagrams` | 1 | **3** | plus family required types below |

### 5.2 Family changes (`LEARN_FAMILIES`, templates not ticker forks)

`fabless_platform` (the dogfood family) only, this pass:

- `required_kinds`: add **`mechanism`** and **`process`** → `['silicon','systems','networking','software','segment','not_this','mechanism','process']`
- `required_diagrams`: **all four** → `['stack','flow','segments','interconnect']`
- new field **`min_mechanism_nodes: 2`** — at least 2 `ready` nodes whose kind is `mechanism` or `process`. `scoreLearnDepth` counts them and adds a reason like `mechanism/process nodes 0 < 2` when short. Families without the field default to 0 (no behavior change for the other seven families — deciding their mechanism floors is part of the later factory-fill decision, after §8 proof).

### 5.3 Per-type diagram quality floors (new, in `scoreLearnDiagrams`)

A diagram that exists but cannot teach fails the gate with a named reason:

| Type | Floor |
|---|---|
| `stack` | ≥ 4 distinct layers, covering ≥ 3 distinct `kind`s |
| `flow` | ≥ 4 blocks (chain via edges or layer order) |
| `interconnect` | ≥ 3 blocks and ≥ 2 edges (gap edges count — the GAP **is** content) |
| `segments` | ≥ 3 `filed: true` blocks |

### 5.4 Effect on NVDA (why the bar is honest)

Current NVDA **fails** the new bar exactly where Anthony said it is shallow: 7 ready nodes < 9, mechanism/process nodes 0 < 2, deep lessons 7 < 9. It already meets the four diagram types and the quality floors above. The builder closes the gap with the §6.4 fill; the other eight desks fail harder (as they already do) and stay unfilled.

---

## 6. What the Grok 4.6 builder changes (file by file)

Work on **this branch** (`cursor/learn-map-engine-fc27`). Commit per logical change. No merge; Anthony reviews glass at the end.

### 6.1 Renderer

- **`src/pages/thin/learnDiagramLayout.js`** (new): `layoutDiagram(diagram) → geometry` dispatching to `layoutStack` / `layoutFlow` / `layoutSegments` / `layoutInterconnect` per §3; shared text-wrap + box-size helpers; exported constants for viewBox width (720), band height, box padding. Pure, total, no DOM, no React.
- **`src/pages/thin/LearnDiagrams.jsx`**: replace the four CSS layout components with one SVG renderer over the geometry. Keep: section header, empty-state copy, per-diagram title/type/as-of header, Not-this / GAP / Source caption lines. Remove: the `learn-dedges` text bullet list (edges are drawn now). Keep the `title=` tooltips (note/source) on blocks via `<title>` inside SVG elements.
- **`src/theme.css`**: replace the `.learn-dstack/.learn-dflow/.learn-dsegs/.learn-drow/.learn-darrow/.learn-dedges` internals with SVG classes (e.g. `.lsvg-block`, `.lsvg-block-gap`, `.lsvg-band`, `.lsvg-kind`, `.lsvg-edge`, `.lsvg-edge-gap`, `.lsvg-lane`, `.lsvg-share`, `.lsvg-foot`) using the existing theme vars. Keep `.learn-diagram` card chrome and `.learn-dnot` captions.

### 6.2 Engine / gate

- **`server/learnDiagrams.js`**: `group` + `parent` validation (§4); per-type quality floors (§5.3) added to `scoreLearnDiagrams` with named reasons. `diagramToMermaid` unchanged (preview/tests only).
- **`server/learnMap.js`**: `LEARN_DEPTH_BAR` v2 (§5.1); `fabless_platform` family changes + `min_mechanism_nodes` handling in `scoreLearnDepth` (§5.2). Update `fixtureProductMap` / `fixtureLearnDiagrams` / `fixtureDeepLessonMarkdown` so fixtures pass the **new** bar (add 3 fixture nodes incl. 2 mechanism/process, flow + segments fixture diagrams meeting the floors) — tests keep proving the bar is reachable.
- **`server/thinLearn.js`** (NEXT-chip cleanup, read-path only): in `getLearnSnapshot`, build the learner `next` **view**: (a) relabel entries whose id matches a map node with that node's title; (b) append map `ready` nodes absent from known/fuzzy/next as `{ id, label: node.title, derived: true }`, map order, total NEXT cap 6. **Never write `learner.json` from this path.** `Background.jsx` renders derived chips with a dim style + tooltip `from the study tree`.

### 6.3 Factory / tests

- **`scripts/thin-learn-test.mjs`** — add:
  - `parent` unknown-id / self / depth-2 rejection; `group` with `$` and no filed pin rejection.
  - Geometry: stack fixture → bands full-width, flush (each band's y = previous y + height), sorted by layer; flow 5-block fixture → 4 arrow paths, serpentine second row when > 4 blocks; interconnect fixture → `xpu` block flagged gap + a dashed edge carrying `GAP: who`; segments fixture → same-depth tiles equal-sized (size ⊥ `share`), child geometry inside parent bounds.
  - New bar: a 7-node no-mechanism map (old NVDA shape) FAILS with the `mechanism/process` reason and the `ready nodes` reason; the updated fixture PASSES.
  - Quality floors: a 2-block stack fails `stack` floor; a 1-edge interconnect fails.
  - NEXT view: after snapshot with a map, derived chips present and `learner.json` bytes on disk unchanged.
  - Factory-safety: renderer + layout source contain no ticker/slug literals (regex check of the two files for `nvda|avgo|tsm|amd|shaz|nbis|\bmu\b|mrvl|iren|lly`, case-insensitive).
- **`scripts/learn-factory.mjs`** — bar line already interpolates `LEARN_DEPTH_BAR` (auto-updates). Add a `types` column (diagram types present) so the dry-run table shows factory readiness per desk. Keep `--fill` refusal.

### 6.4 NVDA dogfood fill (this branch, NVDA only)

- **`research-wiki/cockpit/learn/NVDA/product-map.json`**:
  - Add 2 nodes (ids stable once written):
    - `rack-anatomy` · kind **`mechanism`** · "How a rack is built" — compute trays (GPU/Grace) + NVLink scale-up + networking + software image; unit of sale is often the rack; sources FY2026 10-K / PRs; `not_this`: "Not a rack BOM $ or per-rack ASP — GAP." · `lesson_id: rack-anatomy` · depends_on `systems`.
    - `cowos-hbm` · kind **`process`** · "CoWoS packaging + HBM supply" — TSMC/Samsung wafers, SK Hynix/Micron/Samsung HBM, CoWoS named by the company; $119B supply/capacity commitments (Q1 FY27 10-Q, filed) as commitment ≠ utilization; `not_this`: "Not contract terms, not utilization." · `lesson_id: cowos-hbm` · depends_on `silicon`.
  - Both are already supported by the primer, vault `02`/`05`, and pack claims — **no new facts invented**. 9 ready nodes total.
  - `segments` diagram: add `group` (`FY26` / `Q1 FY27`) and `parent` (`dc-fy26` → `co-fy26`; `dc-compute`/`dc-net` → `dc-q1`) per §3.3. Other diagrams unchanged unless a floor requires it (they don't).
- **`research-wiki/cockpit/learn/NVDA/lessons/`**: write `rack-anatomy.md` and `cowos-hbm.md`, ≥ 450 words each, same shape as existing lessons (as-of + source header, What this is, mechanism in company language, What a figure is not, GAP / UNKNOWN, Study check). **Delete `cuda-not-a-chip.md`** (71-word first-pass duplicate; no node references it; the rebuild-keeps-old-lessons rule governs automatic rebuilds, not this explicit, Anthony-flagged cleanup). Result: 9 lessons, no duplicate title.
- **`research-wiki/cockpit/learn/NVDA/primer.md`**: no rewrite. Only touch it if a fact used by the two new lessons is missing from the spine (rack anatomy and CoWoS/HBM/commitments are already in §"How a system is made" — expected diff: none). Do not pad words.
- **`research-wiki/cockpit/learn/NVDA/learner.json`**: **zero bytes changed.**

### 6.5 Docs / skill surface

- **`memory-cockpit-v2/plans/LEARN-ENGINE.md`**: update §4 (bar numbers) and §5 (render description: SVG geometry, `group`/`parent`, quality floors) to match; point to this file.
- **`.grok/skills/company-learn/SKILL.md`** and **`.grok/commands/cockpit-learn.md`**: new bar numbers; diagram guidance additions (`group` lanes / `parent` containment for segments; "tile size never encodes $"; mechanism/process node requirement for `fabless_platform`). Then run `./scripts/sync-agent-surface.sh` so mirror agent surfaces stay in sync.
- **`memory-cockpit-v2/plans/THIN-DESK-CONTRACT.md` / `docs/PRODUCT-KERNEL-SOR.md`**: only if they cite the old bar numbers (grep `1200` / `400 w`); otherwise untouched.

---

## 7. What the builder must NOT touch

| Do not touch | Why |
|---|---|
| `research-wiki/house-view*.md`, `08-risks*`, pack claims, `ontology/store/**`, `./ont compile`, COMPILE BOOK surfaces | Human-owned / compile-owned; learn is ops |
| The other eight desks' `cockpit/learn/{TICKER}/` files (primers, lessons, learner.json, maps) | Lock 3 — dogfood is NVDA only; factory dry-run reads, never writes |
| `research-wiki/cockpit/learn/NVDA/learner.json` | Merge-only, tutor-owned; the NEXT fix is read-path (§6.2); rebuild never wipes learner |
| `config/thin-desks.json` | No new desks, no LLY, no registry edits |
| Reports lane (`/cockpit-report`, `reports/{TICKER}/diagrams/*.png`), model_read, Street, Ask | Different loops |
| friend-upgrade / export-kernel / product kernel `desks: []` | Personal tree only; repo stays private |
| `package.json` dependencies | No new deps — no mermaid.js, no chart/diagram library; the renderer is hand-rolled SVG |
| Vault binary art | No `.svg`/`.png` written under `cockpit/learn/**`; drawings exist only at render time |
| `main` | Commits go to this feature branch; no merge, no PR-to-main; push only within this branch's cloud-agent workflow, never a push Anthony didn't ask for |

---

## 8. Factory-safety proof (gate before any other desk is ever filled)

The other eight desks may be filled in a **later** operate pass only if all of these hold on this branch:

1. **No ticker in the renderer** — the §6.3 source-literal test passes on `learnDiagramLayout.js` + `LearnDiagrams.jsx`.
2. **Every family's required types render from fixtures** — node geometry tests cover a foundry-style `flow`, a memory-IDM-style `stack`, a `segments` with lanes+parents, and the GAP `interconnect`, none of them NVDA data.
3. **Layout is total** — any diagram that passes `validateLearnDiagrams` yields geometry without throwing (fallback grid at worst).
4. **Dry-run stays read-only** — `learn-factory.mjs --dry-run` scores all nine; `git status` shows no vault change outside the intentional NVDA files.
5. Anthony has looked at NVDA glass and not vetoed the visual language.

Until then: renderer ships factory-wide, **fills do not**.

---

## 9. Definition of done (how the builder and Anthony know)

1. `node scripts/thin-learn-test.mjs` PASS (including all new §6.3 tests); `npm run test:thin` PASS; `npm run test:platform` PASS (it chains the learn tests + factory dry-run).
2. `node scripts/learn-factory.mjs --dry-run --desk nvda` → **PASS under the new bar** (9 ready nodes incl. ≥2 mechanism/process, 9×≥450w lessons, 1656w primer ≥ 1400, 4 diagram types meeting quality floors, ≥4 source pins).
3. Full dry-run: other eight desks FAIL with new-bar reasons; zero writes to their folders.
4. `git diff -- research-wiki/cockpit/learn/NVDA/learner.json` is empty.
5. `npm run build`, then screenshot `#/nvda/background` via the auth-inert instance flow (`PORT=4699 COCKPIT_ACCESS_FILE=/tmp/x.json node server/index.js`, headless-Chrome screenshot, kill + rm): stack renders as a flush layer-cake, flow as an arrowed chain, interconnect as a drawn topology with the dashed GAP XPU box, segments as period lanes with containment and the "tile size carries no $ meaning" footnote; STUDY TREE shows 9 nodes; LESSONS has no duplicate CUDA entry; NEXT chips reflect the tree.
6. No new `package.json` dependency; no mermaid on glass; no `.svg`/`.png` under `cockpit/learn/**`.
7. Anthony looks at glass. His eyes are the last gate — the build is not "done" by tests alone.

---

*Plan only. This commit changes no engine code, no primers, no maps, no lessons. Decision-support only; repo stays private.*
