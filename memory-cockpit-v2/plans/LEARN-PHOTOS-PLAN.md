# Learn-map photos — build plan (plan only, two lanes)

**As-of:** 2026-08-28 (v2 — tape lane added same day) · **Branch:** `cursor/learn-map-engine-fc27` (PR #14) · **Tree:** cockpit-personal (private)
**Written by:** Fable 5 (plan pass). **Executed by:** a later Grok 4.6 agent, end-to-end from this file.
**Decision-support only.** Not House · not Model · not a rating · ≠ COMPILE BOOK. Not friend-upgrade / export-kernel / a new product.

Companions: `LEARN-ENGINE.md` (engine design) and `LEARN-DIAGRAMS-V2-PLAN.md` (SVG drawings — still binding, except §7's "no vault binary art" rule, which §3.5 here supersedes narrowly).

---

## 0. Locked brief (do not reopen)

1. **Same learn-map engine.** Photos are a typed list on `product-map.json`, sitting in the ARCHITECTURE section of `#/{slug}/background` next to the SVG drawings. Not a new product, not a second wiki, not a random `<img>` dump.
2. **Two harvest lanes, one schema:**
   - **`primary`** — company IR, newsroom, official product pages, SEC exhibits. Host-allowlisted. `source.grade: A` (B for graded vault-note-derived pins). May illustrate filed product language.
   - **`tape`** — Google Images results (and the result's host page). `source.grade: "tape"`. Must store the image bytes in the vault, the source **page** URL, the **Google query used**, and `retrieved_at`. Glass caption must say it is **web, not a filing**.
3. **Fail-closed, both lanes.** No source pin → no photo. If the photo's subject cannot be positively identified as the named product (wrong chip, stock office, meme, competitor mislabel) → GAP, do not publish. No mix-$ charts, ratings, House/thesis art, Reports PNGs. No generated fakes (no DALL-E / `GenerateImage` standing in for a real product). Hotlink-only Google thumbnails that expire are not enough — vault copy + URL pin, always. Missing file on disk → GAP box on glass, never a broken image.
4. **Tape photos never mint anything.** Not a pack claim, not a house claim, not a filed $ — a web photo is illustration of an already-pinned node, nothing more.
5. **Factory.** One renderer, zero ticker forks, phone-safe. NVDA dogfood only in the build that executes this plan; the other eight desks inherit the renderer with empty `photos[]`. LLY is never a desk.
6. **This plan commit contains no binaries and no engine code.** Live downloads happen only in the follow-up build (NVDA, curated, §3.2 caps).

---

## 1. Verified baseline (what the harvest can actually stand on)

Checked on this branch — the builder should not re-derive these:

| Fact | Evidence |
|---|---|
| Schema jail exists and photos slot in additively | `validateProductMap` (`server/learnMap.js`) already chains `validateLearnDiagrams`; `photos[]` chains the same way, `schema_version` stays 1 |
| Vault `01/02` contain **zero** URLs | `rg 'https?://' raw/nvda-research/01-*.md 02-*.md` → no matches; pack `sources[]` entries have `id/title/path/kind`, **no `url` field** |
| URL pins live in `wiki/sources/*.md` frontmatter | YAML `url:` + `publisher:` + `grade:`; NVDA's five source slugs resolve to hosts `nvidianews.nvidia.com` + `www.sec.gov` |
| Per-desk source-slug filter already exists | registry `profile.sourcePrimaryRe` in `config/thin-desks.json` (used by Ask) |
| Path-jailed vault binary serving already exists | `/api/report-file/:name` in `server/index.js` (canonicalize → prefix check → extension check → `sendFile`) |
| Server-side keyless outbound HTTPS is established idiom | `server/secEdgar.js`, `server/quotes.js` (browser UA, no keys); Node 22 global `fetch` |
| Learn routes mount from the factory | `server/thinDeskMount.js` `/api/:slug/learn/*` — new photo routes mount there, zero per-ticker code |
| Glass ARCHITECTURE section is the target surface | `LearnDiagrams.jsx` renders inside one `.sect`; photos render in the same section |
| Grok is already the web-capable actor in the loop | OPEN GROK / MCP is the writer; the app itself is keyless and scheduler-free (standing rules) |

Consequence for the primary allowlist (deviation from the original brief's letter, faithful to its spirit): "allowlist from pack/vault 01/02" cannot literally mean 01/02 because those files carry no URLs. The deterministic source of hosts is the **graded source registry** — `wiki/sources/{slug}.md` frontmatter — which is what the pack indexes and the claims cite. See §4.1.

Consequence for the tape lane: the engine must not scrape Google SERPs itself (keyless rule, no scraping dependency, ToS fragility, and a headless-SERP parser is exactly the kind of rot the factory law forbids). The engine **builds the queries deterministically and validates/downloads the results**; Grok — already the browsing actor — executes the queries. See §4.5.

---

## 2. Lane decision: harvest → validate → download → pin → render

```text
LANE primary (A):
  wiki/sources frontmatter urls ──deterministic──▶ host allowlist (per desk)
  pinned source pages ──deterministic fetch (allowlisted only)──▶ image-URL candidates (seed)

LANE tape (web):
  map node titles + diagram block labels ──deterministic──▶ Google Image query strings (seed)
  Grok runs the queries on Google Images ──picks full-size results, records query + result page──▶ candidates

BOTH LANES:
  Grok captions ──POST /api/{slug}/learn/photos──▶ server validates (schema + lane rules)
  server downloads image_url ──magic-byte sniff, size cap, thumb/blocklist reject──▶
      vault cockpit/learn/{TICKER}/photos/{id}.png|jpg|webp
  photos[] upserted on product-map.json (learner.json untouched)
  glass GET /api/{slug}/learn/photos/{file} ──path jail──▶ typed photo card in ARCHITECTURE
```

The split of duties mirrors the map fill: **deterministic engine** owns the allowlist, the query construction, the discovery fetch, the download, the byte sniff, the blocklist, and the file write; **Grok** only executes the engine-built searches, chooses among results, and writes captions; **validator** fail-closes everything; **Anthony's eyes** are the last gate. Crucially, the **server fetches the bytes itself from the pinned `image_url`** — so the pin is proven at harvest time and an expiring Google thumbnail can never be the stored artifact. Grok never uploads image bytes.

### Why the alternatives lose

| Alternative | Why it loses |
|---|---|
| Engine-side Google SERP scraping (headless browser / parser dep) | New dependency that rots with every SERP markup change; violates keyless/no-scraper posture; Grok already browses |
| Google **API** (Custom Search JSON) | Needs an API key in the app — hard rule: no keys in the app |
| Hotlinking Google thumbs (`encrypted-tbn*.gstatic.com`) | Expire without notice; user brief bans them; mechanically rejected by host blocklist (§4.5.3) |
| Unsplash / stock-agency results inside the tape lane | Generic staged imagery, not the product; stock-agency hosts are on the tape blocklist; an office-with-servers stock photo also fails the identification gate |
| `GenerateImage` / gen-AI "rack photos" | Invented facts as pixels — the visual version of an invented claim. Hard ban, both lanes |
| Grok POSTs base64 image bytes | Engine cannot prove the bytes came from the pinned URL; pin becomes decorative |
| Per-ticker hand-drop into `photos/` without harvest | No pin, no lane proof; the validator + serving route both refuse files not listed on the map (§3.4, §5.2) |
| Reports `diagrams/*.png` | Thesis lane, different loop; already a hard rule |
| Packing render-time SVGs as JPG/PNG | Drawings are schema projections, render-time only; rasterizing them forks the SoR |
| Mix-$ / rating screenshots (even from IR or the web) | Not product understanding; caption/URL regex layer (§3.3) + human veto |
| Tape photo used to source a claim / house line / mix $ | Photos are illustration; the claim path stays `wiki/sources` + compile. Seed law + caption regex + posture |

---

## 3. Schema: `photos[]` on `product-map.json` (additive, `schema_version` stays 1)

### 3.1 Shape

```json
"photos": [
  {
    "id": "gb300-nvl72-rack",
    "lane": "primary",
    "kind": "system",
    "src": "cockpit/learn/NVDA/photos/gb300-nvl72-rack.jpg",
    "sha256": "3fb1…",
    "as_of": "2026-03-18",
    "caption": "GB300 NVL72 rack-scale system, company newsroom photo",
    "source": {
      "label": "NVIDIA newsroom — GTC 2026 press release",
      "page_url": "https://nvidianews.nvidia.com/news/…",
      "image_url": "https://nvidianews.nvidia.com/…/gb300.jpg",
      "grade": "A",
      "retrieved_at": "2026-08-29T00:00:00.000Z"
    },
    "node_id": "rack-anatomy"
  },
  {
    "id": "cowos-package-web",
    "lane": "tape",
    "kind": "process",
    "src": "cockpit/learn/NVDA/photos/cowos-package-web.webp",
    "sha256": "9ac2…",
    "as_of": "2026-08-29",
    "caption": "CoWoS advanced package (GPU die + HBM stacks on interposer) — web photo, not a filing",
    "source": {
      "label": "Tom's Hardware article photo",
      "page_url": "https://www.tomshardware.com/…",
      "image_url": "https://cdn.mos.cms.futurecdn.net/….webp",
      "grade": "tape",
      "query": "NVIDIA CoWoS packaging HBM interposer photo",
      "retrieved_at": "2026-08-29T00:00:00.000Z"
    },
    "node_id": "cowos-hbm"
  }
]
```

### 3.2 Caps

`PHOTOS_MAX_TOTAL = 8` per desk, of which **at most 4 `tape`** (`PHOTOS_MAX_TAPE = 4`). Primary lane has priority — curate, don't scrape a pile. `MAX_PHOTO_BYTES = 3 MB` per file, both lanes (prefer ≤1 MB variants when offered); the vault is in git.

### 3.3 Validation (`server/learnPhotos.js` → `validateLearnPhotos`, chained from `validateProductMap` exactly like diagrams)

Common to both lanes:

| Field | Rule |
|---|---|
| `id` | `topicId`, unique in `photos[]`, required |
| `lane` | `primary` \| `tape`; **absent defaults to `primary`** (back-compat) |
| `kind` | one of **`product` \| `process` \| `system`** (`PHOTO_KINDS`); anything else → reject |
| `src` | must equal `cockpit/learn/{TICKER}/photos/{id}.png`, `….jpg`, or `….webp` **exactly** (regex, ticker from the map) — no `..`, no other dirs, no `.svg`/`.gif` |
| `sha256` | 64 hex chars, required (written by the download step; hand-dropped files without it fail) |
| `as_of` | required, ≤32 chars (primary: the filing/PR date; tape: the retrieval date) |
| `caption` | required, ≤200 chars; `adviceHits` → reject; money regex (`MONEY_RE`/`SKU_SPLIT_RE` reused from `learnDiagrams.js`) → reject — **photos never carry $**, filed dollars live on `segments` diagrams |
| `source` | required object: `label` (English, required) + `page_url` + `image_url` (both required, both `https:`) + `retrieved_at`. **No source pin → no photo** |
| chart/rating heuristic | reject when `image_url` path or `caption` matches `/\b(chart|graph|rating|price.target|stock.performance)\b/i` — cheap layer; Anthony's eyes remain the real gate |

Lane-specific:

| Rule | `primary` | `tape` |
|---|---|---|
| Host check | host of `page_url` **and** `image_url` ∈ desk allowlist (§4.1), recomputed at validation time — unknown host → whole map rejected | hosts checked against the **tape blocklist** (§4.5.3); `page_url` host must not be `google.*` (a SERP is not a source page) |
| `source.grade` | `A` or `B` | literally `"tape"` |
| `source.query` | forbidden (field only exists on tape) | **required**, non-empty, ≤160 chars — the Google query actually used |
| `node_id` | optional; must be an existing `nodes[].id` | **required** and must resolve — the identification gate in schema form: a web photo that cannot be tied to a named study-tree node has no business on glass |

Existing maps without `photos[]` stay valid (`photos` defaults to `[]`). A missing **file** on disk is *not* a validation failure — that is a render-state GAP (§5.3); validation governs the pins, the filesystem governs presence. Invalid `photos[]` fails the whole map (consistent with diagrams: POST 400, hand-edited garbage does not render).

### 3.4 What binds the binary to the pin

Three locks, so a hand-dropped orphan can never render:

1. Validator: `src` must be schema-listed with a full lane-checked source pin (above).
2. Serving route: only files that are the `src` of a validated map entry are served (§5.2).
3. Harvest is the only writer that can produce a matching `sha256`; the glass photo card shows lane + as-of + source, so a pin-less image has nowhere to hide.

### 3.5 Rule amendment (explicit)

`LEARN-DIAGRAMS-V2-PLAN.md` §7 bans vault binaries under `cockpit/learn/**`. That ban is **narrowly superseded**: harvested, schema-pinned **raster photos** under `cockpit/learn/{TICKER}/photos/` are the one sanctioned binary. Still banned: SVG anywhere under `cockpit/learn/**` (drawings exist only at render time), PNG/JPG *diagram* exports, and any binary without a `photos[]` pin.

---

## 4. Harvest: how the engine finds photos

### 4.1 Lane `primary` host allowlist — `photoHostAllowlist(ticker)` in `server/learnPhotos.js`

Deterministic, per desk, derived from research the human already graded:

1. Glob `wiki/sources/*.md` in the vault; keep files whose slug matches the desk (registry `profile.sourcePrimaryRe`, same filter Ask uses).
2. Parse YAML frontmatter; keep entries with grade **A or B** and an `https:` `url:`.
3. Allowlist = the exact set of those hosts, plus the constant SEC hosts (`www.sec.gov`). No wildcards, no registrable-domain expansion, no env override.

For NVDA today that yields `nvidianews.nvidia.com` + `www.sec.gov`. **To admit a new primary host (e.g. `www.nvidia.com` product pages), file a graded source slug for that page first** — the ordinary research-filing path. The allowlist is a projection of the graded source registry, not a new config surface. No per-ticker host table anywhere in code.

### 4.2 Lane `primary` candidate discovery — `scripts/learn-photos.mjs --desk {slug} --candidates`

Read-only, writes nothing to the vault:

1. Take the desk's pinned source pages (the `url:` values behind §4.1, IR/newsroom/product/SEC only).
2. Fetch each page (browser UA per the `secEdgar.js` idiom, 15 s timeout). **Depth 0** — only the pinned pages themselves; never follow links. Not a crawler.
3. Extract `og:image` and `<img src>` URLs; keep only those whose host is also on the allowlist; drop data-URIs, SVGs, favicons/pixels (path heuristics: `logo|icon|favicon|sprite|1x1`).
4. Print a candidates table (`image_url · page_url · alt text`) and emit it into the OPEN GROK seed (§4.6).

### 4.3 Download + pin — `POST /api/{slug}/learn/photos` (mounted in `thinDeskMount.js`, both lanes)

Body: `{ id, lane, kind, image_url, page_url, caption, as_of, node_id?, source_label, query? }`. Server (`learnPhotos.js` `harvestPhoto`, `fetch` injectable for tests):

1. Validate every field per §3.3 **before** any network call (lane rules included).
2. Fetch `image_url`: 15 s timeout, 3 MB cap; redirects — primary: only within the allowlist; tape: any `https:` host not on the blocklist.
3. Sniff magic bytes — PNG `89 50 4E 47`, JPEG `FF D8 FF`, or WebP (`RIFF` + `WEBP` at offset 8). Content-type headers are not trusted. SVG/HTML/GIF bytes → reject (`packing SVGs as jpgs` dies here).
4. Write `cockpit/learn/{TICKER}/photos/{id}.{png|jpg|webp}` (extension from magic bytes, not from the URL); compute `sha256`; stamp `retrieved_at`.
5. Upsert the entry into `product-map.json` `photos[]` through the same validated write path as `publishProductMap` — **`learner.json` bytes unchanged** (same guard as the map publish).
6. Return the refreshed snapshot. Any failure at any step → 400 + no file, no map change.

`scripts/learn-photos.mjs --desk {slug} --fetch <image_url> --lane … --id … --kind … --caption … --page … [--query …]` calls the same module functions locally. One validation code path. Removal = delete the file **and** re-POST the map without the entry; the route refuses to serve orphans either way. No cron, no scheduler — harvest runs when a human or an operate agent runs it (standing no-automation rule).

### 4.4 Lane `primary` sourcing law

If a company's pinned pages surface no usable imagery, primary candidates are empty — **GAP is the answer for the primary lane**; the tape lane may then cover the node (with the web label), or nothing does.

### 4.5 Lane `tape` — Google Images without guessing

#### 4.5.1 Query construction (deterministic, engine-owned) — `learnPhotoQueries(map, displayName)`

The engine builds the query strings; Grok does not invent them:

- For each **ready** node of kind `silicon` / `systems` / `networking` / `process` / `mechanism`: `"{displayName}" {node.title}` (e.g. `"NVIDIA Corporation" CoWoS packaging + HBM supply` → normalized: strip punctuation, collapse whitespace, ≤160 chars).
- Plus one query per `stack`/`flow` diagram block label (company product language already jailed by the diagram validator): `"{displayName}" {block.label} photo`.
- Deduplicate, cap at **10 queries**, map order. Emitted into the seed (§4.6) and printable via `scripts/learn-photos.mjs --desk {slug} --queries`.

Grok runs these **verbatim** on Google Images. It may narrow a query (adding a model number seen in the results) but the string actually used goes in `source.query` — the pin records what was asked, so a harvest is reproducible.

#### 4.5.2 Search execution (Grok-owned)

Grok — the browsing actor — runs each query on Google Images and, for a chosen result, opens the **result's host page** and takes: the full-size `image_url` (not the SERP thumbnail), the `page_url`, and what the page says the photo shows. The engine never touches a Google SERP: no scraping dependency, no API key, nothing to rot.

**Identification gate (binding, curation side):** publish only when the result page itself identifies the subject as the named product (page title/caption/body names the product or family on the study-tree node). Wrong chip generation, competitor hardware mislabeled in a blog, generic stock "server room", memes, renders/concept art → **skip; the node keeps its GAP**. When in doubt, don't. The schema side of this gate is `node_id` required on tape (§3.3).

#### 4.5.3 Tape blocklist (deterministic, engine-owned) — `TAPE_HOST_BLOCKLIST`

Reject `image_url` **or** `page_url` whose host matches (suffix match on registrable domain):

- **Expiring/proxy thumbs:** `gstatic.com`, `googleusercontent.com`, `google.com` (and any `tbn` path pattern) — hotlink-only Google thumbs are not enough; the pin must be the origin image.
- **Stock agencies (staged/generic, license-trapped):** `unsplash.com`, `pexels.com`, `pixabay.com`, `shutterstock.com`, `gettyimages.com`, `istockphoto.com`, `alamy.com`, `dreamstime.com`.
- **Meme/repost farms:** `imgur.com`, `redd.it`, `imgflip.com`, `knowyourmeme.com`, `9gag.com`.
- Data-URIs and non-`https:` schemes (both lanes, already in §3.3).

Everything else on the open web is admissible **as bytes** — the identification gate (§4.5.2), the caption regex, the size cap, and Anthony's eyes are the quality jail. The blocklist is a constant in `learnPhotos.js`, not per-ticker config.

#### 4.5.4 Tape law (rendered + seeded)

- Tape photos are **illustration**. They never mint a pack claim, a house line, a risk, or a mix $. The claim path stays `wiki/sources` + compile, untouched.
- Glass must label them **web, not a filing** (§5.3) — the caption text should also say it (see the §3.1 example).
- `as_of` on a tape photo is the retrieval date, not a filing date; the card must not imply filing provenance.

### 4.6 Seed

`learnAgentSeed.js` primer mode gains a **photos job block**: the primary allowlist + candidates table (§4.2), the tape query list (§4.5.1), the blocklist summary, publish shapes for both lanes, and the law — primary from company/SEC hosts only; tape must pass the identification gate or stay GAP; ≤8 total / ≤4 tape; captions carry no $; tape captions say web-not-a-filing; unknown host (primary) or blocklisted host (tape) is impossible (server rejects); no generated images, ever.

---

## 5. Glass: factory renderer, phone-safe, GAP not broken

### 5.1 Snapshot payload

`slimMap` in `thinLearn.js` passes `photos[]` through (primary lane first, then tape, each in map order), each entry decorated read-time with:

- `present`: `fs.existsSync` on the vault path (server-side, so glass never needs a broken-image probe),
- `href`: `/api/{slug}/learn/photos/{id}.{ext}` (glass renders **only** this vault-served URL — never `image_url`; hotlink rot is impossible by construction).

### 5.2 Serving route — `GET /api/:slug/learn/photos/:file`

Modeled on `/api/report-file/:name`: canonicalize → must sit inside `cockpit/learn/{TICKER}/photos/` → extension `png|jpg|webp` → **must equal the `src` of a validated map entry** (read the map; orphan files 404) → `sendFile` with `Cache-Control: no-cache`. Anything else → 404 JSON.

### 5.3 Renderer — `src/pages/thin/LearnPhotos.jsx` (new, factory)

Rendered inside the existing ARCHITECTURE `.sect` in `Background.jsx`, after the SVG drawings (page order otherwise unchanged: PRIMER → ARCHITECTURE → STUDY TREE → YOUR LEVEL → LESSONS).

- One card per photo (`.learn-photo`, sharing `.learn-diagram` card chrome): header = kind chip in small caps (**PRODUCT / PROCESS / SYSTEM**) + lane chip — primary: `IR / FILED SOURCE`; tape: **amber `WEB · not a filing`** — + title from caption.
- `<img>` `width:100%`, `max-height` ~380 px, `object-fit: contain`, `loading="lazy"` — plain responsive raster, phone scales for free.
- Caption line (always rendered, same style as diagram `Source:` lines): `{caption} · as-of {as_of} · Source: {source.label} ({host of page_url})`; primary adds `· company-published`; tape adds `· via Google Images — query: "{source.query}"`. `node_id` → a dim chip with the node's title (`from the study tree`).
- `present: false` **or** runtime `onError` → replace the `<img>` with the dashed amber GAP box (reuse `.lsvg-block-gap` styling as a div): `GAP — photo file missing (re-run photo harvest)`. Never a broken-image glyph.
- Empty `photos[]` → render nothing extra (the section keeps its diagrams; no nag copy).
- **Zero ticker literals** — the §6.7 factory-safety regex test extends to `LearnPhotos.jsx`.
- Theme: existing CSS vars only (`--hairline`, `--pchip-*`, amber GAP rgba); new classes `.learn-photo`, `.learn-photo-img`, `.learn-photo-gap`, `.learn-photo-kind`, `.learn-photo-lane`, `.learn-photo-lane-tape` in `theme.css`.

### 5.4 Depth gate

Photos are **not** added to `LEARN_DEPTH_BAR` and not required by any family — either lane. They are enrichment; the other eight desks must not fail harder because a newsroom publishes nothing or a Google query finds nothing identifiable. `learn-factory.mjs --dry-run` gains a `photos` column (`{primary}p+{tape}t`, `!` appended when a pinned file is missing on disk) so factory readiness is visible without gating on it.

---

## 6. What the Grok 4.6 builder changes (file by file, this branch)

Commit per logical change. No merge. No push Anthony didn't ask for.

1. **`server/learnPhotos.js`** (new): `PHOTO_KINDS`, `PHOTO_LANES`, `PHOTOS_MAX_TOTAL`, `PHOTOS_MAX_TAPE`, `MAX_PHOTO_BYTES`, `TAPE_HOST_BLOCKLIST`, `validateLearnPhotos` (lane rules §3.3), `photoHostAllowlist` (frontmatter parse + per-process cache), `learnPhotoQueries` (§4.5.1), `sniffImageBytes` (PNG/JPEG/WebP), `harvestPhoto({ fetchImpl })`, `photoAbsPath` (jail helper shared with the route).
2. **`server/learnMap.js`**: chain `validateLearnPhotos` in `validateProductMap`; include `photos` in the validated map object. Fixtures: `fixtureProductMap` gains one fixture photo per lane (pins only — no files), so validate/gate tests cover both shapes.
3. **`server/thinLearn.js`**: `slimMap` passes `photos` with lane ordering + `present`/`href` decoration; `publishProductMap` unchanged semantics (photos ride the same map write; learner guard already covers it).
4. **`server/thinModel.js` + `server/thinDeskMount.js`**: `learnPhotoPublish` / `learnPhotoFile` methods; `POST /api/:slug/learn/photos`; `GET /api/:slug/learn/photos/:file` per §5.2.
5. **`src/pages/thin/LearnPhotos.jsx`** (new) + mount in `Background.jsx` inside the ARCHITECTURE section + `theme.css` classes (§5.3).
6. **`scripts/learn-photos.mjs`** (new): `--desk {slug} --allowlist | --queries | --candidates | --fetch …` per §4. Default prints allowlist + queries and exits — no accidental network.
7. **`scripts/thin-learn-test.mjs`** additions (all offline — `fetchImpl` stub; the only "images" are base64 1×1 PNG/JPEG/WebP decoded at test runtime, **no binary committed**):
   - accept: primary full pin on allowlisted host; tape full pin (query + node_id + grade `tape`) on a non-blocklisted host; webp magic accepted;
   - reject matrix, common: missing source / `$`, `%`, SKU or rating words in caption / chart-path heuristic / `.svg` or traversal `src` / bad kind / bad lane / unknown `node_id` / missing sha256 / 9th photo total / 5th tape photo;
   - reject matrix, lane: primary with web host (lane label cannot bypass the allowlist); tape without `query`; tape without `node_id`; tape with `gstatic.com` image_url (expiring thumb); tape with stock-agency host; tape with `google.com` page_url; `query` present on a primary entry;
   - queries: `learnPhotoQueries` on the fixture map → deterministic list, each contains the display name, ≤10, ≤160 chars;
   - harvest: stubbed fetch returning JPEG magic bytes → file written + map upserted + **`learner.json` bytes unchanged**; stub returning `<svg…`/HTML bytes → reject, no file; stub returning 4 MB → reject, no file;
   - serving jail: orphan file in `photos/` (not on map) → 404; traversal → 404;
   - snapshot: pinned entry with file deleted → `present: false`; tape entries sort after primary;
   - factory-safety: ticker/slug-literal regex over `LearnPhotos.jsx` (same list as the diagram renderer test); allowlist/queries mechanisms proven on a non-NVDA fixture desk (fake `wiki/sources` files in the tmp vault).
8. **`scripts/learn-factory.mjs`**: `photos` column per §5.4.
9. **Docs / skill surface**: `LEARN-ENGINE.md` §5 gains a short "Photos (two lanes)" subsection pointing here; `.grok/skills/company-learn/SKILL.md` + `.grok/commands/cockpit-learn.md` gain the photos job, both lanes, the identification gate, and the tape law; then `./scripts/sync-agent-surface.sh`.
10. **NVDA dogfood (this build only, after 1–9 green)**: run `--candidates` + `--queries` for nvda. Primary: pick ≤4 company-published photos actually surfaced by the pinned newsroom/SEC pages (expect a Blackwell/GB300 rack or system photo). Tape: pick ≤3 web photos that pass the identification gate — the natural targets are nodes the newsroom cannot illustrate (e.g. `cowos-hbm`: a CoWoS package/interposer photo from a credible tech-press page; `rack-anatomy`: an NVL72 tray/rack teardown photo) — each with query + page pin and a web-not-a-filing caption. Do **not** force per-kind or per-node coverage; unidentifiable → GAP. POST each; commit the binaries + updated `product-map.json`. Other eight desks: zero writes.

---

## 7. What the builder must NOT touch

| Do not touch | Why |
|---|---|
| House / 08-risks / pack / `ontology/store/**` / Model / Street / Ask / COMPILE BOOK | Different loops; learn is ops. **Tape photos mint none of these** |
| `research-wiki/cockpit/learn/{other eight}/**` | Dogfood is NVDA only |
| `research-wiki/cockpit/learn/NVDA/learner.json` | Merge-only, tutor-owned — photo publish must leave bytes identical |
| `config/thin-desks.json` | No registry edits needed — allowlist derives from `wiki/sources`, queries derive from the map |
| Reports lane (`reports/{TICKER}/diagrams/*.png`) | Thesis art; never imported |
| `package.json` dependencies | No image libs, no SERP scrapers, no Google API client — magic-byte sniff + frontmatter parse + query strings are hand-rolled; Node 22 `fetch` |
| SVG under `cockpit/learn/**`, mermaid on glass | Unchanged bans; §3.5 sanctions raster photos only |
| Any scheduler / cron for harvest | Standing rule — harvest is manual/agent-run |
| `GenerateImage` or any image-generation tool | Photos are real, published pixels or nothing |
| `main` / merge / push beyond this branch's cloud-agent workflow | Anthony's eyes are the last gate |

---

## 8. Factory-safety proof (before any other desk ever gets photos)

1. Renderer + route contain no ticker/slug literals (§6.7 regex test green).
2. Allowlist + query derivation proven on a non-NVDA fixture desk in tests — no NVDA data in the mechanism tests.
3. Serving jail proven (orphan + traversal 404s); tape blocklist proven (gstatic / stock / SERP-page rejects).
4. `learn-factory.mjs --dry-run` scores all nine with the `photos` column; `git status` clean outside intentional NVDA files.
5. Anthony has seen NVDA glass — both lane chips — and not vetoed the visual language.

Until then: renderer + harvest ship factory-wide, **photo fills do not**.

---

## 9. Definition of done

1. `node scripts/thin-learn-test.mjs` PASS (all §6.7 additions); `npm run test:thin` PASS; `npm run test:platform` PASS.
2. `node scripts/learn-photos.mjs --desk nvda --allowlist` prints exactly the hosts pinned by NVDA's graded sources (+ SEC); `--queries` prints the deterministic tape queries from the NVDA map — nothing else.
3. NVDA `product-map.json` has ≤8 photo entries (≤4 tape), every one with `lane`/`src`/`sha256`/`as_of`/`caption`/`source.page_url`/`source.image_url` (+ `source.query` on tape) passing lane rules; binaries exist under `cockpit/learn/NVDA/photos/`, each ≤3 MB.
4. `git diff -- research-wiki/cockpit/learn/NVDA/learner.json` empty; zero writes to the other eight desks.
5. Auth-inert glass screenshot of `#/nvda/background` (per the established `PORT=4699 COCKPIT_ACCESS_FILE=/tmp/x.json` flow): primary cards show the `IR / FILED SOURCE` chip, tape cards show the amber `WEB · not a filing` chip with the query in the caption line; deleting one binary and reloading shows the amber GAP box, not a broken image; phone-width screenshot shows the cards scaling.
6. No new `package.json` dependency; no SVG under `cockpit/learn/**`; no hotlinked `image_url` in rendered HTML; no `gstatic`/`googleusercontent` host anywhere in the map.
7. Anthony looks at glass. His eyes are the last gate.

---

*Plan only. This commit adds no engine code, no binaries, no photo downloads. Decision-support only; repo stays private.*
