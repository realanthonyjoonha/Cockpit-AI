# Phase 1 — Nebius production cockpit (thin, ontology-aligned)

**Status:** SHIPPED (Phase 1 code + smoke green 2026-07-20)  
**Date:** 2026-07-20  
**Product homes:**  
- Glass code → `~/Trading/memory-cockpit-v2/`  
- Agent backend → `~/Trading/ontology/` (read pack only; no cockpit UI there)  
- Content SoR → `~/Trading/research-wiki/`  
**Parked:** `~/Trading/research-os/` — do not build Phase 1 there  

**Decision-support only** — no buy/sell/hold, PT, or sizing language.

---

## 1. Goal

Ship a **thin, reliable Nebius desk** inside the existing production shell so a human can:

1. Switch Memory ↔ Nebius without a second app or second port  
2. See **house stance**, **risks / on-watch**, and **load-bearing claims** from the **compiled NBIS pack**  
3. Never see a confident empty chart or a Memory page pretending to be Nebius  

This is **not** a Nebius clone of Margins / Street / Leverage / Nowcast.  
Those are Phase 2+ commissions only after Phase 1 is boring and trusted.

---

## 2. Non-goals (explicit park)

| Parked | Why |
|--------|-----|
| New top-level `nebius-cockpit/` app | Multi-proto thrash; keep one shell |
| research-os config engine / generic renderer | Lossy + untrusted for production |
| Live series / sync for NBIS | Pack `series_snapshot` is empty; no keyless recipe yet |
| Street catalog, margins overlays, leverage gauge | Tier C fidelity — later |
| Combined Memory+Nebius super-overview | Separated desks first |
| Auto house-view write from agents | User-owned, explicit save only |
| Ontology schema redesign | Pack shape is enough for Phase 1 |
| Feature fan-out (Analysts, Desks, Reports for NBIS) | Honesty > breadth |

---

## 3. Product principles (binding)

1. **Ontology pack is the SoR for Nebius glass content** in Phase 1 (house, risks, claims, company summary, pack freshness).  
2. **Memory vault remains SoR for Memory desk** — do not break existing MU routes.  
3. **Declared ≠ built** — Nebius rail only exposes real rooms; other Memory rails either hide or show EMPTY when desk=Nebius.  
4. **No fabrication** — missing pack field → honest empty / “no data resolved.”  
5. **Freshness visible** — show pack `compiled_at` (and house `date`) on every Nebius page.  
6. **Thin first** — Overview · Risks · House (+ risk detail). Stop.  
7. **Smoke is the deploy gate** — Phase 1 ships only when smoke includes new routes and strand guards still pass.

---

## 4. Architecture

```text
research-wiki/          (author)
  raw/nebius-research/
  house-view-nebius.md
  wiki/entities/nebius.md
        │
        │  ./ont compile NBIS
        ▼
ontology/store/by_ticker/NBIS.json   ← cockpit READS this file (no Python at request time)
        │
        ▼
memory-cockpit-v2/
  server/pack.js          load + cache pack JSON
  server/nbisModel.js     map pack → page payloads
  server/index.js         /api/nbis/* routes
  src/desk.jsx            desk context Memory | Nebius
  src/pages/nbis/*        thin pages
  App.jsx                 rail + router by desk
```

**Request path:** Node reads a file path to the compiled pack.  
**Not:** spawn `./ont` per request (slow, PATH/launchd footguns).  
**Refresh:** recompile ontology when research changes; optional “pack mtime” chip on UI. Server may short-cache pack (e.g. 5s) like vault scan.

**Env (optional override):**
```text
ONTOLOGY_STORE=/Users/anthonyha/Trading/ontology/store/by_ticker
# default: <home>/Trading/ontology/store/by_ticker
```

---

## 5. Desk UX

### 5.1 Desk switcher (top bar)

- Control: **MEMORY | NEBIUS** (segmented chips)  
- Persist: `localStorage.cockpitDesk = 'memory' | 'nebius'`  
- Default: `memory` (preserve today’s users)  
- On switch: navigate to that desk’s home hash  

### 5.2 Rails

| Desk | Rail items (Phase 1) | Home hash |
|------|----------------------|-----------|
| **Memory** | Unchanged full rail | `#/cockpit` or `#/overview` (as today) |
| **Nebius** | Overview · Risks · House only | `#/nbis/overview` |

Nebius rail **does not list** Data, Desks, Street, Margins, etc.  
If user deep-links `#/margins` while desk=Nebius → either switch desk to Memory or show **EMPTY / wrong desk** banner — prefer: **stay on URL but show desk chip MEMORY auto** only if we detect a Memory-only route; simpler Phase 1: Memory routes always work; Nebius routes only under `#/nbis/*`.

### 5.3 Hash routes (Nebius)

| Route | Page |
|-------|------|
| `#/nbis` / `#/nbis/overview` | Overview |
| `#/nbis/risks` | Risk index |
| `#/nbis/risk/:id` | Risk detail |
| `#/nbis/house` | House view |

Unknown `#/nbis/*` → EMPTY stub (“not built”), not silent redirect to Memory Overview.

---

## 6. Pages (payload + UI)

### 6.1 Overview (`#/nbis/overview`)

**Purpose:** 3-second stance + what’s on watch + claim spine.

| Section | Source (pack field) | Render |
|---------|---------------------|--------|
| Header | `object.name`, `object.ticker`, `compiled_at` | “NEBIUS · NBIS · pack as of …” |
| Stance strip | `house_prior` (status, date, first ~2 sentences of excerpt or play title) | Chip CONFIRMED + one-line stance if parseable; else play title + date |
| Company one-liner | `object.summary` | Prose, truncated with “more on House” |
| On watch | `risk_summary.watch` + matching `risks[]` status WATCH | List → link risk detail |
| FIRED | `risk_summary.fired` | List or “none” |
| Claim spine | top N `claims` (e.g. 6–8, grade A first) | Bullets: text · as_of · [grade] · source_id |
| Gaps | `gaps` | If empty, omit section; if non-empty, list honestly |
| Series | `series_snapshot` | If empty: single honest line **“No live series wired — Phase 1 pack-only”** (not a chart) |

**No** multi-tile price charts in Phase 1 unless a single optional live quote is trivial (NBIS via existing Nasdaq path). Optional stretch: one quote chip; **not required for Phase 1 done.**

### 6.2 Risks (`#/nbis/risks`)

| Element | Source |
|---------|--------|
| Table/cards | `risks[]` sorted by `order` |
| Columns | name, status, grade, summary, updated, WATCH/FIRED emphasis |
| Click | `#/nbis/risk/:id` |

### 6.3 Risk detail (`#/nbis/risk/:id`)

| Element | Source |
|---------|--------|
| Header | name, status, grade, updated |
| Summary | `summary` |
| Tripwires | `tripwires[]` → signal / tripwire / state / as_of |
| Series | if `series` empty → “No series linked” |
| Missing id | 404 JSON + EMPTY page |

### 6.4 House (`#/nbis/house`)

| Element | Source |
|---------|--------|
| Status chip | `house_prior.status` · `house_prior.date` |
| Title | `house_prior.play` |
| Body | Prefer **live vault file** `house-view-nebius.md` rendered read-only (verbatim, like Memory House) if file exists; fallback `house_prior.view_excerpt` from pack with banner **“pack excerpt — recompile if stale”** |
| Governance | Same language as Memory: site never writes house view |

**Dual-read justification:** Memory House already reads vault markdown for fidelity. Nebius should match that trust model. Pack excerpt is backup only.

---

## 7. Server API (new)

All under `/api/nbis/…` so Memory `/api/*` stays untouched.

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/nbis/meta` | `{ ticker, name, compiled_at, pack_path, pack_exists, desk: 'nebius' }` |
| GET | `/api/nbis/overview` | Overview payload (sections above) |
| GET | `/api/nbis/risks` | `{ risks: [...], risk_summary }` |
| GET | `/api/nbis/risk/:id` | One risk or 404 |
| GET | `/api/nbis/house` | `{ hero, source: 'vault'|'pack_excerpt', compiled_at, … }` |

**Load rules:**
- If pack file missing → `meta.pack_exists=false`; pages return honest empty shape + error flag (HTTP 200 with `{ available: false, reason }`, **or** 503 with JSON — pick **200 + available:false** so UI can render EMPTY without breaking smoke auth flow).  
- Never invent risks/claims when pack missing.

**Implementation files (suggested):**

| File | Role |
|------|------|
| `server/pack.js` | `loadPack('NBIS')`, mtime cache |
| `server/nbisModel.js` | builders |
| `server/index.js` | wire routes |
| `src/pages/nbis/Overview.jsx` | UI |
| `src/pages/nbis/Risks.jsx` | UI |
| `src/pages/nbis/Risk.jsx` | UI |
| `src/pages/nbis/House.jsx` | UI |
| `src/pages/nbis/Empty.jsx` | wrong/unknown route |
| `src/App.jsx` | desk switcher + router |
| `src/theme.css` | minimal chips only if needed |

Reuse existing CSS classes (`sect`, `shd`, `chipC`, `stx`, `prose`, etc.) — **no design system rewrite**.

---

## 8. Reliability contract (Phase 1 must keep)

| Gate | Check |
|------|--------|
| Strand | Existing smoke: index no-cache, bundle immutable, missing asset 404 |
| Process | launchd, PORT=4680 unchanged |
| Memory smoke | All existing `/api/*` Memory assertions still pass |
| Nebius smoke | New `/api/nbis/*` shape assertions |
| Pack missing | UI shows EMPTY, not Memory data |
| Anti-fabrication | No synthetic claims/risks |
| Auth | Same gate; no new secrets |
| House write | Still never write house-view files from server |

**Smoke additions (`scripts/smoke.mjs`):**

```text
GET /api/nbis/meta        → pack_exists true (on Anthony’s machine), ticker NBIS
GET /api/nbis/overview    → available, claims array, risk_summary object
GET /api/nbis/risks       → risks.length >= 1
GET /api/nbis/risk/:id    → first risk id round-trips
GET /api/nbis/house       → hero or available false with reason
```

Optional `--render`: `#/nbis/overview`, `#/nbis/risks`, `#/nbis/house` mount non-empty `<main>`.

---

## 9. Known pack issues to handle in UI (not block Phase 1)

| Issue | Handling |
|-------|----------|
| `series_snapshot: []` | Honest “no series” copy — do not chart |
| `catalysts` may include non-Nebius noise | **Omit Catalysts page entirely in Phase 1** (avoid wrong glass) |
| `house_prior.view_excerpt` may be heavy markdown | Prefer vault file render; excerpt is fallback |
| Pack stale vs vault | Show `compiled_at`; note “run `./ont compile NBIS` after research” in EMPTY/meta |

Optional micro-fix (ontology, only if easy): filter catalysts by about/ticker — **not required for glass Phase 1**.

---

## 10. Implementation sequence (build order)

Do in order; stop if a step isn’t green.

| Step | Work | Done when |
|------|------|-----------|
| **P1.0** | Doc this plan + one-line AGENTS/CLAUDE note “Nebius glass in v2; research-os parked” | Docs committed |
| **P1.1** | `server/pack.js` + `nbisModel.js` + routes; curl APIs against live pack | JSON shapes match §6–7 |
| **P1.2** | Nebius Overview / Risks / Risk detail pages (no desk switcher yet; hash works) | Manual hash load OK |
| **P1.3** | Nebius House (vault-first) | Matches house-view-nebius.md |
| **P1.4** | Desk switcher + Nebius-only rail | Memory rail unchanged; localStorage persist |
| **P1.5** | Smoke extensions + `npm run smoke` green | Deploy gate |
| **P1.6** | `npm run build`; launchd restart only if server code changed; Private-tab check | Live URL works Memory + Nebius |
| **P1.7** | Short operator note in `implementation-notes.md` + `CLAUDE.md` desk section | Future agents know |

**Do not start P1.2 until P1.1 curls are honest.**  
**Do not add series/Street until Phase 1 accepted by Anthony.**

---

## 11. Definition of done (Phase 1)

Anthony can:

1. Open production cockpit (4680 / Tailscale)  
2. Switch to **NEBIUS**  
3. See Overview with stance + WATCH risks + graded claims + pack as-of  
4. Open Risks and a risk detail with tripwires  
5. Open House and read confirmed Nebius house view (vault)  
6. Switch back to **MEMORY** and see **unchanged** Memory experience  
7. `npm run smoke` green including `/api/nbis/*`  
8. No blank page after deploy (strand gates intact)  

**Not required:** charts, sync, catalysts page, multi-desk combined view, research-os bridge.

---

## 12. Ops / deploy notes

- Server-only changes (P1.1): `launchctl kickstart -k gui/$(id -u)/com.memory-cockpit.server`  
- Frontend changes: `npm run build` then hard-refresh / Private tab if needed  
- After research updates:  
  ```bash
  cd ~/Trading/ontology && ./ont compile NBIS
  ```  
  Glass picks up pack on next request (or after cache TTL) — **no rebuild**  
- Never hand-edit `ontology/store/by_ticker/NBIS.json`

---

## 13. Phase 2 backlog (write only; do not build in Phase 1)

- NBIS live quote chip on Overview  
- Catalysts page once pack catalysts are Nebius-clean  
- 1–3 curated series (if keyless sources exist) with BUILDING rule  
- Dual-read MU House/Risks from pack (optional)  
- Provenance page from pack `sources`  
- Signature pages only on explicit commission  

---

## 14. Effort & risk

| | Estimate |
|--|----------|
| Size | Small–medium (thin dual-desk, not a rewrite) |
| Main risk | Router/rail regression on Memory desk |
| Mitigation | Memory routes untouched; smoke must keep full Memory API list |
| Main risk | Pack path wrong under launchd |
| Mitigation | Absolute default path; env override; meta.pack_exists in UI |

---

## 15. Approval checkpoint

Before coding P1.1+, confirm with Anthony:

1. Desk switcher **inside v2** (not a second app) — **yes per prior direction**  
2. Phase 1 pages = Overview + Risks + House only — **yes**  
3. Pack file read (not live `./ont` spawn) — **recommended yes**  
4. House from `house-view-nebius.md` when present — **recommended yes**  

---

## Related paths

| Path | Role |
|------|------|
| `ontology/packs/NBIS.json` | Pack config |
| `ontology/store/by_ticker/NBIS.json` | Compiled SoR for glass |
| `research-wiki/house-view-nebius.md` | House vault |
| `research-wiki/raw/nebius-research/` | Research corpus |
| `research-wiki/RESEARCH-PATHS.md` | Authoring map |
| `memory-cockpit-v2/CLAUDE.md` | Operator runbook (update at P1.7) |
| `research-os/` | Parked — not used |
