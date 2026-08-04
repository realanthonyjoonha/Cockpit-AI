# Thin-desk contract (permanent requirements)

**Status:** BINDING for every ontology-backed thin desk in this cockpit  
**Reference implementation:** Nebius (`/api/nbis/*`, `#/nbis/*`) · **Second instance:** Microsoft (`/api/msft/*`, `#/msft/*`)  
**Decision-support only**

This file is the law for future desks (item 3, NVDA, etc.).  
A desk that ships without these items is **not** a thin desk — it is incomplete.

---

## 1. Required rooms (hash routes)

| Room | Purpose |
|------|---------|
| Overview | Stance, claims spine, on-watch, book strip |
| Risks | Register + detail |
| House | Confirmed house view (vault-first when present) |
| Sources | Pack source catalog |
| Street | Published third-party firm models (vault `cockpit/street/{TICKER}.json`; not house PT). Shared UI: **REFRESH STREET** (agent pipeline + vault poll) · **OPEN GROK** (chat). EMPTY until first publish |
| Ask | Pack-only deterministic Q&A |
| Update | Write path per `write_path_mode` (v1.1 default **meta_only**; pins = future optional) |

Honest EMPTY only for rooms explicitly parked — never silent redirect to Overview.

**Factory invariant:** Street is a **shared** room (`pages/thin/Street.jsx` + `thinStreet` APIs). New desks do **not** get a per-ticker Street fork — registry + `rooms` including `street` is enough.

---

## 2. Required book controls (non-negotiable)

Every thin desk **must** expose on the book strip (Overview + Update + Ask at minimum):

| Control | API | Behavior |
|---------|-----|----------|
| **COMPILE BOOK** | `POST /api/<desk>/compile` (or shared compile with ticker) | Runs **only** `ont compile <TICKER>`; clears pack cache; returns `compiled_at` |
| **REFRESH** | `POST /api/<desk>/book/refresh` | Re-read pack from disk only — does **not** compile |

**Why permanent:** Without COMPILE BOOK, users fall back to terminal and skip updates → glass lies by staleness.

**Forbidden:**
- Free-form shell / arbitrary commands  
- Compile that writes house view  
- Desk that only documents CLI compile with no glass control  

---

## 3. Required API surface (minimum)

For desk slug `D` and ticker `T`:

- `GET /api/D/meta` — must include `thin_desk_contract` (see §5)  
- `GET /api/D/book`  
- `POST /api/D/book/refresh`  
- `POST /api/D/compile` (+ optional `GET …/compile` status)  
- `GET/POST /api/D/ask`  
- overview, risks, house, sources as implemented for NBIS  
- `GET /api/D/street` — complete firm models or honest EMPTY / needs_rebuild  
- `POST /api/D/street/refresh` — format-gated publish of Street vault (agent/body; not Nasdaq dump as SoR)  

---

## 4. Required smoke (per desk)

`npm run smoke` **must fail** if any thin desk is missing:

1. `GET …/compile` status shape (`command` or `ont_path` present)  
2. `POST …/compile` returns `ok: true` and `compiled_at` (or documented skip in CI-only envs without ontology — not the default on Anthony’s Mac)  
3. `POST …/book/refresh` works after compile  
4. Meta declares contract version and `capabilities.compile_book: true`  

Goldens for Ask (house / on watch / refusal) recommended per desk.

---

## 5. Meta self-declaration (machine-checkable)

Each thin desk `GET /api/<desk>/meta` **must** include:

```json
{
  "thin_desk_contract": {
    "version": "1.1",
    "desk": "nebius",
    "ticker": "NBIS",
    "parity_group": "thin_ontology_v1",
    "rooms": ["overview", "risks", "house", "sources", "street", "ask", "update"],
    "capabilities": {
      "compile_book": true,
      "refresh_book": true,
      "pack_ask": true,
      "street": true,
      "write_path": true,
      "write_path_mode": "meta_only"
    },
    "compile": {
      "method": "POST",
      "path": "/api/nbis/compile",
      "equivalent_cli": "./ont compile NBIS"
    }
  }
}
```

Smoke reads this object and asserts `capabilities.compile_book === true`, `write_path_mode` parity across desks, and compile path responds.  
**UI parity law:** `plans/THIN-DESK-UI-PARITY.md` (UP-C · current mode `meta_only`).

---

## 6. New-desk checklist (copy into every desk PR)

- [ ] Pack compiles for ticker  
- [ ] All required rooms (or explicit EMPTY)  
- [ ] **COMPILE BOOK** on book strip  
- [ ] **REFRESH** on book strip  
- [ ] `meta.thin_desk_contract` present  
- [ ] Smoke: compile + refresh + ask refusal  
- [ ] CLAUDE.md / playbook updated with desk slug  
- [ ] House still user-owned (no compile/propose write)  

---

## 7. Agent / human ops

After research or accept pin:

1. **COMPILE BOOK** (glass) — preferred  
2. Confirm pack as-of on strip  
3. Verify Overview / Ask / Risks  

CLI `./ont compile TICKER` remains a fallback, not the only path.

---

## 8. Versioning

- Bump `thin_desk_contract.version` only when required capabilities change.  
- Removing **COMPILE BOOK** is a **contract break** — requires Anthony approval + smoke rewrite, not a silent PR.

---

## Reference

- NBIS compile: `server/nbisCompile.js`  
- Book strip: `src/pages/nbis/BookStrip.jsx`  
- Playbook: `plans/NEW-DESK-PLAYBOOK.md`  
- Write path: `plans/WRITE-PATH-NBIS.md`  
- **UI parity loop (drift NBIS vs MSFT):** `plans/2026-07-21-thin-desk-ui-reliability-loop.md`  
