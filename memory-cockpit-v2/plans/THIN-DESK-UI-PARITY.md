# Thin-desk UI parity (binding)

**Status:** BINDING · contract v1.1  
**As-of:** 2026-07-21  
**Parent:** `plans/THIN-DESK-CONTRACT.md`  
**Loop plan:** `plans/2026-07-21-thin-desk-ui-reliability-loop.md`  
**Decision-support only**

---

## 1. Purpose

Every ontology thin desk (Nebius, Microsoft, next) must share the **same chrome, rooms, and capability class**.  
Pack **data** may differ; **UI surface** may not silently fork.

---

## 2. Global write path mode (UP-C)

| Field | Value (current) |
|-------|-----------------|
| Decision | **UP-C** |
| `capabilities.write_path_mode` | **`meta_only`** (all desks) |
| Pins / propose-accept | **Not** v1 core — future optional customization |
| Parity rule | All desks with `parity_group: "thin_ontology_v1"` must share the **same** `write_path_mode` |

Smoke **fails** if any thin desk reports a different `write_path_mode`.

---

## 3. Required rooms

```text
overview · risks · house · sources · ask · update
```

(plus risk detail `#/<desk>/risk/:id`)

---

## 4. Required API (core — every desk)

```
GET  /api/<desk>/meta
GET  /api/<desk>/overview
GET  /api/<desk>/risks
GET  /api/<desk>/risk/:id
GET  /api/<desk>/house
GET  /api/<desk>/sources
GET  /api/<desk>/quote
GET  /api/<desk>/book
POST /api/<desk>/book/refresh
GET  /api/<desk>/compile
POST /api/<desk>/compile
GET|POST /api/<desk>/ask
GET  /api/<desk>/write-meta
```

When `write_path_mode === "pins"` (future): also proposals accept/reject.  
When `meta_only`: Update UI is **shared** `thin/UpdateMetaOnly.jsx` (no pin forms).  
NBIS proposals **API** may still exist for smoke / future optional pins — not shown on Update page.

---

## 5. meta.thin_desk_contract shape (v1.1)

```json
{
  "version": "1.1",
  "desk": "microsoft",
  "ticker": "MSFT",
  "parity_group": "thin_ontology_v1",
  "rooms": ["overview", "risks", "house", "sources", "ask", "update"],
  "capabilities": {
    "compile_book": true,
    "refresh_book": true,
    "pack_ask": true,
    "write_path": true,
    "write_path_mode": "meta_only"
  },
  "compile": { "method": "POST", "path": "/api/<desk>/compile", "equivalent_cli": "./ont compile <TICKER>" },
  "refresh": { "method": "POST", "path": "/api/<desk>/book/refresh" },
  "contract_doc": "plans/THIN-DESK-CONTRACT.md",
  "parity_doc": "plans/THIN-DESK-UI-PARITY.md"
}
```

---

## 6. Chrome / copy rules (binding — enforced by format-check)

| Element | Rule |
|---------|------|
| Crumb | `{DESK_LABEL} · {ROOM} · …` |
| Book strip | Overview (compact) + Ask + Update; labels **COMPILE BOOK** + **REFRESH** |
| Horizontal pad | **16px** aligned with `.shd` / table cells — not ad-hoc 12px card margins |
| Ritual / Never lists | Use `.reg` flex rows; **no `<ol>`** when items already have S1/S2 ids |
| Update page | **Only** via `thin/UpdateMetaOnly.jsx` (wrappers re-export) |
| BookStrip | **Only** via `thin/BookStrip.jsx` (wrappers re-export) |
| Forked pages | After desk-token normalize, `Overview|Risks|Risk|House|Sources|Ask|Empty` must be **byte-identical** across desks |
| Sources primary head | `PRIMARY (PACK)` — no desk-specific subtitle in chrome |
| Empty pack | Same spine + `./ont compile {TICKER}` |
| Unknown route | Empty/parked — no silent Overview redirect |
| House | Read-only; never invent CONFIRMED |

### Format-check command

```bash
npm run format-check          # chrome / source parity only
npm run smoke                 # format-check + API smoke (fail-closed)
npm run smoke:api             # API smoke only
```

Script: `scripts/thin-desk-format-check.mjs`

---

## 7. Operating loop (API + formatting)

```text
edit desk / thin UI
  → npm run format-check     # layout wrappers + normalized page parity
  → npm run smoke            # includes format-check + API parity
  → fix failures only
  → pass
```

The loop must catch **both**:
1. Capability drift (`write_path_mode`, rooms, missing APIs)
2. **Formatting / chrome drift** (forked JSX, wrong padding patterns, `<ol>` ritual, non-shared Update)

New desk (Path B): must join `thin_ontology_v1` with same `write_path_mode` **and** pass format-check (pages match after normalize, or live under `thin/`).

---

## 8. Phase status

| Phase | Status |
|-------|--------|
| 1 Contract + smoke parity | **Shipped** |
| 2 Align Update UI to meta_only | **Shipped** — `thin/UpdateMetaOnly.jsx` + shared BookStrip |
| 3 Shared components + desk registry | **Shipped** — `config/thin-desks.json`, `pages/thin/*`, App from registry |
| 4 Hygiene (risk ids) | Pending |
