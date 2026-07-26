# New desk playbook (thin, ontology-backed)

**Goal:** Stand up a trustworthy thin cockpit + agent backend for a new name  
(e.g. NVDA) **without** cloning Memory-specific features.

**Production homes:**  
- Content → `research-wiki/`  
- Agent backend → `ontology/`  
- Glass → `memory-cockpit-v2/` (extend; do not start a third app)  
**Parked:** `research-os/` as product SoR  

Decision-support only. No buy/sell/PT/sizing.

---

## Pattern (what generalizes)

```text
1. Research (human-gated)  →  research-wiki/raw/<slug>-research/ + entity + claims
2. House view (explicit save) → research-wiki/house-view-<slug>.md
3. Pack config             → ontology/packs/TICKER.json
4. Compile                 → COMPILE BOOK on glass (or ./ont compile TICKER)
5. Thin glass              → rooms + book strip per THIN-DESK-CONTRACT.md
```

**Binding contract:** `plans/THIN-DESK-CONTRACT.md`  
Every thin desk **must** ship **COMPILE BOOK** + **REFRESH** + `meta.thin_desk_contract`. Smoke fails without them.

Memory’s Margins / Street / Leverage / Nowcast are **specialist instruments**, not the template.

---

## Checklist — new ticker (e.g. NVDA)

### 0. From glass START (preferred)

On kernel `#/start`: optional ticker → **Build next company** → OPEN GROK seeds `/cockpit-new-desk [TICKER]`.  
Same monorepo + MCP pin. Then continue A–D below. Do **not** invent house/WATCH.

**Research default:** `/cockpit-new-desk` is **DEEP + parallel subagents** (slice fan-out → synthesis → risks).  
Opt out only with `--light` / explicit “quick pass.” See `.grok/commands/cockpit-new-desk.md`.

### A. Research (content) — deep bar
- [ ] `research-wiki/raw/<slug>-research/` with masters / risks source + `00-research-status.md` depth table
- [ ] Parallel slices (business, growth engine, concentration, supply, competition, regulatory, financials) before risk synthesis
- [ ] `wiki/entities/<slug>.md` with graded claims (**≥ 25**, prefer ≥ 40 when filings rich):  
  `- fact (YYYY-MM-DD) [A|B|C] [[source-slug]]`
- [ ] Sources distillations for claim source-slugs under `wiki/sources/`
- [ ] Draft `08-risks-catalysts.md` (section A before `## B)`) with mechanisms + tripwires
- [ ] `wiki/log.md` one-liner if material
- [ ] House view **only** on Anthony’s explicit save: `house-view-<slug>.md` (stays FORMING until CONFIRM)

**Part 1 gate (binding):** `ontology/PART1-GATE.md` · plan `plans/2026-07-21-part1-reliability-verify-loop.md`

### B. Ontology (backend)
- [ ] Create `ontology/packs/TICKER.json` (globs, house_view_path, risks source, aliases)
- [ ] Wire risk compile path (like NBIS `risks_source` or MU `risks_dir`)
- [ ] `cd ~/Trading/ontology && ./ont compile TICKER`
- [ ] **`./ont verify TICKER`** — structural fail-closed (exit 0)
- [ ] After Anthony CONFIRM + RISKS ACCEPT:  
  `./ont verify TICKER --require-confirmed --require-risks-accepted`
- [ ] Smoke: `./ont ask TICKER "house view"` and `"what is on watch"`
- [ ] Never hand-edit `ontology/store/`

### C. Glass (memory-cockpit-v2) — only after pack is non-empty
Obey **THIN-DESK-CONTRACT.md** + **THIN-DESK-UI-PARITY.md**. UI chrome is **shared** (`src/pages/thin/*`).

- [ ] Append desk to **`config/thin-desks.json`** with **`profile`** (house_file, rawDir, risksSource, risksGenerated, ask needles) — server mounts routes automatically (no `PROFILES` code map)
- [ ] meta: `write_path_mode: meta_only`, `parity_group: thin_ontology_v1`, rooms list
- [ ] **No** copy of Overview/Risks pages — DeskRouter serves shared thin UI
- [ ] Optional thin wrappers under `src/pages/<slug>/` only if App routing still needs them; prefer registry-driven routes
- [ ] `npm run format-check` + `npm run smoke` green
- [ ] `npm run build` → reload / kickstart server if needed

### D. Operate agents (Path 1 — must come free with the desk)

**Invariant:** operate features are thin consumers of factory output. See `GENERAL-CONTEXT.md` §7.2.  
No new per-ticker slash command or MCP tool for each company.

- [ ] Desk resolves in MCP (`list_desks` / `get_house_view` / `get_pack_snapshot`)
- [ ] `/cockpit-daily {slug}` works without code changes (book from pack+house)
- [ ] Daily **search seeds** for the name come from registry (ticker + legal name + optional topics) — **not** a hand-edited nbis/msft-only table forever
- [ ] Optional save lands at `research-wiki/cockpit/briefs/daily/{slug}/YYYY-MM-DD.md` only
- [ ] `/cockpit-risk-check {slug}` + glass risk detail **PROPOSE status → ACCEPT** (shared `riskProposals.js`; SoR = profile `risksSource`)
- [ ] `/cockpit-risk-add` + `/cockpit-risk-tripwires` work for the slug
- [ ] After risk ACCEPT: COMPILE BOOK → REFRESH (pack only via compile) — see `WRITE-PATH-RISKS.md`
- [ ] **Risk SoR contract (binding):** dossier has `## A)` risks with `### Rn —` + Status/Grade + tripwire table, then `## B)` (or equivalent). `add_risk` inserts **before** `## B)` — never EOF after catalysts.
- [ ] Smoke after first `add_risk` ACCEPT: new Rn is before `## B)`; pack `tripwires.length` matches SoR table if non-empty; glass detail shows monitors
- [ ] `/cockpit-steelman` · `/cockpit-match` · `/cockpit-propose` work for the slug
- [ ] Briefs/daily are **not** ontology compile inputs

### E. Park until earned
- [ ] Multi-series margins / Street catalogs / leverage gauges  
- [ ] Catalysts page until pack catalysts are **name-clean** (NBIS pack still has MU noise)  
- [ ] research-os config engine  
- [ ] Per-name vault day feed (headlines/price series) — optional; daily uses search until then

---

## Nebius reference (shipped)

| Phase | What |
|-------|------|
| **1** | Desk switcher, Overview / Risks / House, pack + vault house |
| **2** | Live NBIS quote chip, Sources catalog page |

Routes: `#/nbis/overview|risks|house|sources`  
APIs: `/api/nbis/*`  
Plan: `plans/2026-07-20-nebius-phase1.md`, `plans/2026-07-20-nebius-phase2.md`

---

## Maintenance ritual

```text
# after research / accept pin (preferred):
glass → COMPILE BOOK  (no terminal)

# CLI fallback:
cd ~/Trading/ontology && ./ont compile TICKER

# after glass code
cd ~/Trading/memory-cockpit-v2 && npm run smoke && npm run build
# server code: launchctl kickstart -k gui/$(id -u)/com.memory-cockpit.server
```

---

## Definition of done (new thin desk)

1. Pack compiles with claims + risks + sources  
2. House view confirmed in vault (or honest empty)  
3. Thin rail works; Memory desk unchanged  
4. Smoke green  
5. Agent path works: `./ont agent TICKER "…"`  
6. Operate menu works for the slug (`/cockpit-daily` · steelman · match · propose) without new per-ticker code  

