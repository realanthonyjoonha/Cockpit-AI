# Phase 3 — Next feature: Book status + Grounded Ask (Nebius)

**Status:** SHIPPED 2026-07-20  
**Date:** 2026-07-20  
**Product homes:** `memory-cockpit-v2/` (glass) · `ontology/` (truth, no UI rewrite)  
**Builds on:** Nebius Phase 1–2 thin desk  
**Does not build:** multi-user agents, Memory-class pages, research-os, second ticker  

---

## 1. Why this feature (maps to goal product)

Goal product kernel:

```text
research → book (wiki + pack) → glass → ask / update → book again
```

Phases 1–2 shipped **book → glass**.  
Phase 3 ships **glass → grounded ask** + **visible book freshness**, so the maintenance loop is usable *on the website* without inventing the full “callable agents” product.

| Goal capability | Phase 3 delivers |
|-----------------|------------------|
| Talk to the system about the book | **Grounded Ask** (pack-only answers) |
| Trust the site is current | **Book status** (compiled_at, house as-of, risk counts) |
| Agents later | Same Q&A contract agents will wrap; no freestyle UI |
| Routine users later | Chat-shaped surface they already understand |
| Decision-support only | Reuse ontology refusal (no buy/sell/PT/sizing) |

**This is the highest-leverage single feature** that is still small, on-path, and not grand-vision thrash.

---

## 2. User-facing scope

### 2.1 Book status strip (every Nebius page or Overview + Ask page)

Show, always honest:

| Field | Source |
|-------|--------|
| Pack compiled_at | `NBIS.json` |
| House status + date | `house_prior` / vault meta |
| Risks: N total · W on WATCH · F FIRED | `risk_summary` |
| Optional: “After research: `./ont compile NBIS`” | static ops hint (not a fake one-click compile in v1 unless easy) |

If pack missing → same EMPTY language as today.

### 2.2 Grounded Ask (new rail item)

| | |
|--|--|
| **Route** | `#/nbis/ask` |
| **Rail** | 5th item: Ask (e.g. glyph `?`) |
| **UI** | Question input + answer panel + 4–6 example chips |
| **Behavior** | Answer **only** from compiled NBIS pack (and source open when routed) |
| **Not** | Free web LLM in v1 (that’s later “helpful agents”) |

**Example chips (deterministic starters):**

- House view / stance  
- What’s on watch?  
- List risks  
- Key claims / Q1 revenue  
- List research sources  
- (Refusal test) “Should I buy?” → stock refusal text  

### 2.3 Placement contract (deterministic IA — freeze for thin desks)

**Ask page section order (fixed):**

1. Book status strip  
2. Example chips  
3. Question input + submit  
4. Answer (markdown-ish plain text; mono crumb with pack as-of)  
5. Footer: “Answers from compiled pack only · not live web · decision-support only”  

**Overview:** keep Phase 1–2 order; add a chip/link **» ask the book**.

---

## 3. Technical approach

### 3.1 Recommended: Node pack-ask (no Python spawn)

**Why:** Production server already avoids spawning `./ont` (PATH/launchd). Pack is already loaded via `server/pack.js`.

**Build:** `server/nbisAsk.js` (or `server/packAsk.js` with ticker param) that:

1. `loadPack('NBIS')`  
2. Keyword route **mirroring** ontology `api/ask.py` for the routes we care about first:  
   - advice refusal  
   - house view / stance  
   - on watch / risks / FIRED  
   - claims / “key facts”  
   - sources list (titles/ids from pack)  
   - fallback: short pack summary + “try: house view | on watch | sources”  
3. Return `{ ok, ticker, compiled_at, question, answer, route_used }`  

**Parity:** Port only the **high-traffic** routes from `ontology/api/ask.py` — not every source-section path in v1.  
Document: “CLI `./ont ask NBIS` remains full-power; glass Ask is pack-core subset.”

### 3.2 Alternative (park unless you insist)

Spawn `python3 …/ontology/ont ask NBIS "…"` via `process.execPath` sibling or absolute python — more complete parity, worse ops. Prefer Node port of core routes.

### 3.3 API

| Method | Path | Body / notes |
|--------|------|----------------|
| GET | `/api/nbis/book` | Status strip payload (meta + risk_summary + house dates) |
| POST | `/api/nbis/ask` | `{ "q": "what's on watch?" }` → answer JSON |
| GET | `/api/nbis/ask?q=` | Optional same for easy smoke/curl |

Limits: `q` max ~500 chars; rate-limit soft (e.g. trivial in-process) not required for single-user.

### 3.4 Frontend

| File | Role |
|------|------|
| `src/pages/nbis/Ask.jsx` | UI |
| `src/pages/nbis/BookStrip.jsx` | Shared strip component |
| `src/App.jsx` | Rail + route `#/nbis/ask` |
| `src/pages/nbis/Overview.jsx` | Link to Ask; optional embed mini strip |
| `server/nbisAsk.js` + `nbisModel.book()` | Logic |
| `server/index.js` | Routes |
| `scripts/smoke.mjs` | Assertions |

Reuse existing CSS (`sect`, `chipC`, `emptyD`, crumb). No design system rewrite.

---

## 4. Explicit non-goals (Phase 3)

| Parked | Why |
|--------|-----|
| LLM / web research inside Ask | That’s “callable agents” later; would reintroduce invent/variance |
| Agent writes house view or risks from the glass | Confirm/save stays CLI/wiki; glass is read + ask |
| One-click compile from browser | Nice later; ops/security; v1 = show command + compiled_at |
| Memory desk Ask | Separate; don’t thrash Memory |
| Catalysts page | Pack still dirty |
| Second ticker (NVDA) | Playbook exists; after Ask loop feels good |
| Multi-user / auth changes | Out of scope |

---

## 5. Build sequence

| Step | Work | Done when |
|------|------|-----------|
| **P3.0** | This plan approved | Anthony says go |
| **P3.1** | `GET /api/nbis/book` + BookStrip on Overview | Curl + visual |
| **P3.2** | `nbisAsk.js` core routes + `POST /api/nbis/ask` | Curl examples match pack truth |
| **P3.3** | Ask page UI + rail + overview link | Manual hash load |
| **P3.4** | Smoke: book shape, ask house/on watch/refusal | `npm run smoke` green |
| **P3.5** | Build + launchd kickstart + Private tab if needed | Live URL |
| **P3.6** | Note in CLAUDE.md + implementation-notes + playbook (“Ask is pack-core”) | Agents know |

---

## 6. Definition of done

Anthony can:

1. Open **NEBIUS → Ask**  
2. Ask “what’s on watch?” and get pack-backed WATCH risks + pack as-of  
3. Ask “house view” and get stance/prior excerpt consistent with House page  
4. Ask “should I buy?” and get **refusal** (no advice)  
5. See **book status** (compiled_at) without guessing if the glass is stale  
6. Memory desk unchanged; smoke green including new routes  

**Not required:** LLM chat, compile button, source full-text search parity with CLI.

---

## 7. How this enables the next layers (later, not now)

```text
Phase 3:  glass Ask (deterministic pack router)
    ↓
Later:    callable research agents write wiki → user accepts → compile
    ↓
Later:    agent says "I updated risks; recompiled; here's diff" → glass shows it
```

Phase 3 is the **read side** of “talk to the product about my book.”  
Write side (agents updating the site) stays Phase 4+ and needs accept/pin UX.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Ask diverges from `./ont ask` | Document subset; smoke golden strings for 3 questions; optional periodic manual compare |
| Answer looks “AI smart” but is dumb keyword match | UI label: **Pack Q&A (deterministic)** — not “Claude” |
| Scope creep into LLM | Non-goal table; refuse in review |
| Security (POST ask) | Same auth gate as all `/api/*`; single-user |

---

## 9. Effort

**Small–medium** (on order of Phase 2): ~1 focused build session if routes stay core-only.

---

## 10. Approval checkpoint

Confirm before code:

1. **Feature = Book status + Grounded Ask (pack-only)** — not LLM agents yet  
2. **Node-side ask subset** (not spawn ont) — recommended  
3. **Nebius only** this phase  

---

## Related

- Phase 1: `plans/2026-07-20-nebius-phase1.md`  
- Phase 2: `plans/2026-07-20-nebius-phase2.md`  
- Playbook: `plans/NEW-DESK-PLAYBOOK.md`  
- Ontology ask reference: `ontology/api/ask.py`  
