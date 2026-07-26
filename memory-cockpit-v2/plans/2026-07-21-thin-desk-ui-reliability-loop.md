# Thin-desk UI reliability loop

**Status:** PLAN — §3 UP-C / meta_only · **Phases 1–3 shipped** (shared thin UI + registry)  
**Date:** 2026-07-21  
**Decision-support only**

**Related:**
- Shared UI law (exists): `plans/THIN-DESK-CONTRACT.md`
- Architecture map: `plans/ARCHITECTURE-FLOW.txt`
- Research loop (separate): `ontology/PART1-GATE.md` · `plans/2026-07-21-part1-reliability-verify-loop.md`
- Add-company playbook scraps: `plans/NEW-DESK-PLAYBOOK.md`

---

## 0. Problem

Nebius and Microsoft thin desks **work**, but they are **forked copies**. Dogfood shows research/pack is fine; glass has **drift**:

| Area | Nebius | Microsoft | Severity |
|------|--------|-----------|----------|
| Update page | Full pin path (propose/accept) ~433 lines | Write-meta + COMPILE only ~96 lines | **High** (capability) |
| Proposals API | `/api/nbis/proposals*` | Missing | **High** |
| Risk file ids | `nbis-r*` | Still `nbis-r*` prefix | **Medium** (hygiene) |
| Room layout | Shared pattern, separate files | Same | **Medium** (future drift) |
| Crumb / copy | Desk-branded | Desk-branded | **Low** if pattern locked |
| Book strip / compile | Present | Present | OK |

**Root cause:** Copy-paste desks without a **parity contract + fail-closed smoke**.  
Third desk will make this worse.

**Not this plan:** Research `ont verify`, monorepo packaging, UI-A from zero cockpit, Memory specialist rooms, auto house.

---

## 1. Goal

Every ontology thin desk (NBIS, MSFT, next ticker) has:

1. **Same rooms** and **same placement** of chrome  
2. **Same behaviors** (COMPILE BOOK, REFRESH, ask refusal, empty states)  
3. **Same Update capability class** (once chosen — see §3 decision)  
4. **Same formatting rules** (crumbs, section headers, footers)  
5. **Automated fail-closed checks** so drift fails CI/smoke  

**Allowed to differ:** ticker, company name, pack data, quote symbol, vault paths — **content**, not chrome.

---

## 2. Two loops (do not mix)

| Loop | Tooling | Owns |
|------|---------|------|
| **Research (Part 1)** | `./ont compile` · `./ont verify` | Files, claims, house, risks pack |
| **UI (this plan)** | thin-desk contract · `npm run smoke` · later shared components | Glass rooms, APIs, copy/layout parity |

Research must be green before trusting glass data; UI loop does **not** replace Part 1.

---

## 3. Decision gate (before Phase 2 code)

**Update page standard — pick one:**

| Option | Meaning |
|--------|---------|
| **UP-A — Parity up** | MSFT gets propose/accept (same as Nebius) |
| **UP-B — Parity down** | Nebius Update slimmed to write-meta + COMPILE BOOK (same as MSFT today) |
| **UP-C — Flagged** | Contract declares `write_path: "pins" \| "meta_only"`; both desks must match the flag; smoke asserts equality |

**Default recommendation if Anthony does not use pins daily:** **UP-B** or **UP-C** with `meta_only` for all thin desks until pins are needed.  
**If pins are core workflow:** **UP-A**.

**No Phase 2 implementation until this is explicit in the plan log below.**

### Decision log

| Date | Choice | By |
|------|--------|-----|
| 2026-07-21 | **UP-C** — `write_path_mode` on all thin desks must match; current global mode = **`meta_only`**. Pins / richer Update = future optional capability (customization), not v1 core. | Anthony |

---

## 4. UI contract additions (Phase 1 deliverable)

Extend **`plans/THIN-DESK-CONTRACT.md`** (or add `plans/THIN-DESK-UI-PARITY.md` linked from it) with:

### 4.1 Required rooms (unchanged list, stricter)

| Route pattern | Page must show |
|---------------|----------------|
| `#/<desk>/overview` | BookStrip (compact), stance/house chip, on-watch table, claim spine, pagechips to other rooms |
| `#/<desk>/risks` | Register table; click → detail |
| `#/<desk>/risk/:id` | Tripwires table; back crumb to risks |
| `#/<desk>/house` | Vault-first HTML; READ-ONLY chip; no invent if missing |
| `#/<desk>/sources` | Catalog table + provenance if present |
| `#/<desk>/ask` | BookStrip, chips, input, route label, pack-only answer |
| `#/<desk>/update` | BookStrip + write-meta paths + **capability class per §3** |

### 4.2 Chrome / formatting rules (deterministic)

| Element | Rule |
|---------|------|
| Crumb | `{DESK_LABEL} · {ROOM} · …` (e.g. `MICROSOFT · RISKS · **6**`) |
| Loading | `LOADING…` crumb only |
| Pack unavailable | Same empty spine pattern + `./ont compile {TICKER}` mono hint |
| Book strip | On Overview (compact), Ask, Update at minimum; COMPILE BOOK + REFRESH labels exact |
| Decision-support | Footer or emptyD: no buy/sell/PT/sizing where Update/House state it |
| Forbidden | Silent redirect of unknown routes to Overview — use Empty/parked |

### 4.3 Required API surface (parity)

For every thin desk slug `D`:

```
GET  /api/D/meta          # thin_desk_contract required
GET  /api/D/overview
GET  /api/D/risks
GET  /api/D/risk/:id
GET  /api/D/house
GET  /api/D/sources
GET  /api/D/quote
GET  /api/D/book
POST /api/D/book/refresh
GET  /api/D/compile
POST /api/D/compile
GET|POST /api/D/ask
GET  /api/D/write-meta
```

**Pins (only if §3 = UP-A or flag pins):**

```
GET|POST /api/D/proposals
POST /api/D/proposals/:id/accept
POST /api/D/proposals/:id/reject
```

If pins **not** in standard: **no desk** may expose proposals (or smoke fails).

### 4.4 meta.thin_desk_contract extension

```json
{
  "thin_desk_contract": {
    "version": "1.1",
    "desk": "microsoft",
    "ticker": "MSFT",
    "capabilities": {
      "compile_book": true,
      "refresh_book": true,
      "pack_ask": true,
      "write_path": true,
      "write_path_mode": "meta_only"
    },
    "rooms": ["overview", "risks", "house", "sources", "ask", "update"],
    "parity_group": "thin_ontology_v1"
  }
}
```

`write_path_mode`: `meta_only` | `pins` — **all desks in `parity_group` must match.**

---

## 5. UI reliability loop (operating)

```text
1. Edit glass / desk code (or add desk)
2. npm run format-check   # chrome / formatting / shared wrappers
3. npm run smoke          # format-check + API parity (fail-closed)
4. Fail → fix listed assertion only → goto 2
5. Pass → optional human glance (pixel edge cases format-check cannot see)
6. Never ship desk that is not in THIN_DESKS lists (smoke + format-check)
```

**Two layers of fail-closed:**

| Layer | Catches |
|-------|---------|
| `format-check` | Forked pages, Update not shared, `<ol>` ritual, 12px margin drift, BookStrip not shared |
| API smoke | `write_path_mode` mismatch, missing rooms/APIs, compile/ask |

Agents implementing UI-B (add company):

```text
Part 1 verify green for ticker
→ implement desk to THIN-DESK-CONTRACT + UI parity
→ npm run smoke green for ALL thin desks
→ stop
```
---

## 6. Phases (execute only on “go phase N”)

### Phase 1 — Contract + smoke parity  ← **first build**

| Do | |
|----|--|
| Write UI parity section into contract (or `THIN-DESK-UI-PARITY.md`) | |
| Record §3 decision (UP-A / UP-B / UP-C) | |
| Smoke: list thin desks `['nbis','msft']` | |
| For each desk: meta, overview, risks, house, sources, book, write-meta, compile status, ask house/watch/refusal, refresh | |
| **Parity assert:** same capability set / same `write_path_mode` / same rooms list | |
| Fail smoke if MSFT missing routes NBIS has (or vice versa) under the chosen mode | |

**Done when:** `npm run smoke` fails if one thin desk drops a required room/API or diverges on `write_path_mode`.

**Phase 1 result (2026-07-21):**  
- `plans/THIN-DESK-UI-PARITY.md`  
- meta v1.1 on NBIS + MSFT (`write_path_mode: meta_only`, rooms, parity_group)  
- smoke: multi-desk mode/rooms parity + core GET surface  

**Out of phase 1:** Shared React components, risk id rename, visual pixel tests, Update page visual slim (Phase 2).

---

### Phase 2 — Align Update to §3 decision — **SHIPPED 2026-07-21**

| If | Do |
|----|-----|
| UP-C @ meta_only | Shared `thin/UpdateMetaOnly.jsx` + `thin/BookStrip.jsx`; both desks wrap it |
| Pins UI | Parked at `src/pages/nbis/Update.pins-legacy.jsx` (not routed) |
| Proposals API | Still on `/api/nbis/proposals*` for smoke / future optional pins |

**Done when:** Opening `#/nbis/update` and `#/msft/update` offers the **same class of actions**.

---

### Phase 3 — Shared thin components (stop copy-paste) — **SHIPPED 2026-07-21**

| Do | Result |
|----|--------|
| Introduce `src/pages/thin/` parameterized by `{ desk, ticker, label }` | `src/pages/thin/*` + `DeskRouter.jsx` |
| BookStrip, Overview, Risks, Risk, House, Sources, Ask, Empty, Update | Shared; Update = `UpdateMetaOnly` |
| Wire App.jsx once per desk config object | `config/thin-desks.json` → `src/thinDesks.js` → switcher/rails/`DeskRouter` |
| Delete or thin-wrapper old nbis/msft duplicates | Thin wrappers only (~9 lines each); chrome lives in `thin/` |

**Done when:** Adding desk #3 is **config + pack**, not `cp -r pages/msft`.  
**Verified:** `format-check` 35 · `smoke` 61 · `build` green.

**Add company #3 (after Part 1):** append `config/thin-desks.json` → mirror server `/api/<slug>/*` → `npm run smoke`. UI chrome needs no page fork.

---

### Phase 4 — Hygiene (optional / not started)

| Do | |
|----|--|
| Risk id prefix = desk/ticker (`msft-r*`), not leftover `nbis-r*` | |
| Shared empty-state copy templates | |
| Optional: crumb snapshot test (string patterns) | |

---

## 7. Explicit non-goals

| Parked |
|--------|
| UI-A bootstrap from zero cockpit (separate major step) |
| Memory desk parity with thin desks |
| Research `ont verify` changes |
| Pixel-perfect visual regression suite (v1) |
| One-shot Phases 1–4 in a single session |
| Auto-CONFIRMED house from glass |

---

## 8. Success criteria (plan complete when)

1. [x] §3 Update mode decided and logged — **UP-C / meta_only**  
2. [x] UI parity rules in contract (or dedicated parity doc) — `THIN-DESK-UI-PARITY.md` + contract v1.1  
3. [x] Smoke enforces multi-desk API + capability parity  
4. [x] NBIS and MSFT Update match chosen mode — shared `UpdateMetaOnly`  
5. [x] (Phase 3) Shared components — `src/pages/thin/*` + registry  
6. [x] Anthony can open both desks and not hit “feature exists only on Nebius” by surprise  

**Plan core (Phases 1–3) complete.** Phase 4 hygiene is optional cleanup.

---

## 9. Suggested execution order

```text
go phase 1  →  contract + smoke parity only
     ↓
decide §3 if not done
     ↓
go phase 2  →  align Update
     ↓
go phase 3  →  only if Phase 1–2 stable and third desk is near
     ↓
go phase 4  →  hygiene
```

---

## 10. Smoke sketch (Phase 1)

Pseudo-checks (implement in `scripts/smoke.mjs`):

```text
THIN_DESKS = [
  { slug: 'nbis', ticker: 'NBIS' },
  { slug: 'msft', ticker: 'MSFT' },
]

for D in THIN_DESKS:
  meta = GET /api/{D}/meta
  assert meta.thin_desk_contract.capabilities.compile_book
  assert meta.thin_desk_contract.rooms == REQUIRED_ROOMS
  modes.append(meta.thin_desk_contract.capabilities.write_path_mode)

assert unique(modes) == 1   # all desks same mode

for D in THIN_DESKS:
  assert GET overview, risks, house, sources, book, write-meta
  assert POST refresh, GET compile
  assert ask house / on watch / refusal
```

Pins endpoints: only if mode == `pins`.

---

## 11. Relation to Path A / Path B (architecture)

| Architecture path | This plan |
|-------------------|-----------|
| Path A UI-from-scratch | Uses **same contract**; bootstrap is **out of scope** here |
| Path B add-company | **Primary consumer** — new desk must pass parity smoke |

---

## 12. Approval

Say **go phase 1** to implement contract + smoke parity only.  
Say **§3 = UP-A | UP-B | UP-C** when ready for Update alignment.
