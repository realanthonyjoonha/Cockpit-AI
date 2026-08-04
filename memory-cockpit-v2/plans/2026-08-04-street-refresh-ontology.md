# Plan: Street REFRESH pipeline + ontology boundary

**As-of:** 2026-08-04  
**Status:** Phase 1–2 implemented 2026-08-04 (chrome + seed modes + command; no ontology write)  
**Owner path:** Path 1 operate surface (glass + agent) · Path 2 factory unchanged  
**Repo note:** After accept, also file under `memory-cockpit-v2/plans/2026-08-04-street-refresh-ontology.md` for handoff permanence.

**Decision-support only.** Third-party published PTs only. Never house PT, buy/sell, or sizing. Street is **not** pack SoR.

---

## 0. Problem

| Today | Problem |
|-------|---------|
| Street **REFRESH** | Vault re-read only — does **not** research new firm PTs |
| **OPEN GROK** | Does the real work (seed + agent) but label is “chat,” not “refresh” |
| Ontology | Not in Street data path (correct), but seed already *reads* pack — doctrine not written as product law on glass |
| Language collision | Book strip **REFRESH** = re-read pack; Street **REFRESH** currently = re-read Street file — same word, easy to assume “update research” |

User expectation on a research desk: **REFRESH** = bring Street up to date with the world (research loop), not re-fetch a static file.

---

## 1. Locked product doctrine

### 1.1 Two systems, one desk

```text
┌─────────────────────────────────────────────────────────┐
│ Thin desk (e.g. NVDA)                                   │
│                                                         │
│  Street room          Book rooms (house / risks / ask)  │
│  ───────────          ────────────────────────────────  │
│  vault:               vault research + house + risks    │
│  cockpit/street/      → ./ont compile → pack JSON       │
│  {TICKER}.json                                          │
│                                                         │
│  REFRESH STREET       COMPILE BOOK / book REFRESH       │
│  = research loop      = pack pipeline                   │
│  writes Street only   never writes Street               │
└─────────────────────────────────────────────────────────┘
```

| Layer | SoR path | Refresh means | Ontology |
|-------|----------|---------------|----------|
| **Street** | `research-wiki/cockpit/street/{TICKER}.json` | Agent research → format+info verify → publish Street → glass reload | **Read pack** for house/WATCH context only |
| **Book** | wiki + house + risks → pack | COMPILE BOOK / pack re-read | **Write path** for underwriting |
| **Glass local** | — | **Reload** = re-GET Street (or pack) without agent | n/a |

### 1.2 Hard non-goals (do not implement)

1. Street fields inside pack JSON / `ont compile` / `ont verify` for Street.  
2. Auto-write house, risks, claims, or `ontology/store/` from Street refresh.  
3. Nasdaq (or any) scrape as firm-table SoR.  
4. Treating consensus avg as house PT.  
5. One mega-button that compiles ontology **and** refreshes Street.

### 1.3 Soft links (allowed)

| Link | Direction | When |
|------|-----------|------|
| **Context seed** | pack house + risks → agent seed | Every OPEN GROK / REFRESH STREET agent open |
| **Collision report** | agent text (optional later UI strip) | After refresh or on assess: firm frames vs WATCH |
| **Human book write** | operator/agent **other** command files a claim | Only if *your* research should enter the book → then COMPILE BOOK |

---

## 2. Target UX (Street room chrome)

### 2.1 Controls

| Control | Label | Behavior |
|---------|-------|----------|
| **Primary** | **REFRESH STREET** | Open Grok with `/cockpit-street {desk}` + seed; agent **defaults to refresh/rebuild pipeline** (not “ask what you want” first when opened from this button). After user/agent publish, glass **auto-reloads** Street GET (poll or “Reload when done” is phase detail). |
| **Secondary** | **OPEN GROK** | Same seed + `/cockpit-street`; free-form (assess / deepen / discuss vs house). No forced publish. |
| **Tertiary (quiet)** | **Reload** | Current vault re-GET only. Text link or small button, not competing with primary. |

Empty state copy: “**REFRESH STREET** builds complete firm models…” (not “OPEN GROK then Reload”).

### 2.2 Mode flag for agent (glass → open-grok body)

```http
POST /api/open-grok
{ "action": "street", "desk": "nvda", "mode": "pipeline" | "chat" }
```

| `mode` | Seed / command behavior |
|--------|-------------------------|
| `pipeline` (from REFRESH STREET) | Seed says: **default job = refresh if models exist, full rebuild if empty/incomplete**. Dual verify → publish. Report Δ + WATCH collisions. Minimize chat. |
| `chat` (from OPEN GROK) | Seed says: assess first; user steers; publish only if asked. |

Implementation: extend `writeStreetAgentSeed` + `buildInitialPrompt` / seed header; slash command reads mode from seed (not CLI args if possible — seed is already written).

### 2.3 Book strip unchanged

Keep Book **REFRESH** = pack re-read only (title already: “does not compile”). Do **not** rename book controls in this plan unless copy confuses QA — optional footnote in Street law line: “Street refresh ≠ COMPILE BOOK.”

---

## 3. Agent pipeline (REFRESH STREET)

Single command remains **`/cockpit-street`** (already exists). Tighten for `mode=pipeline`:

```text
1. Read seed (/tmp/cockpit-street-{desk}-seed.md)
2. If empty/incomplete → rebuild path (complete rows only)
3. If complete → research PT moves since as_of/built_at
4. Draft firms (no invent; omit without source)
5. Loop A format verify (validateStreetSnapshot, max 3)
6. Loop B info verify (source supports PT/why; model-depth why; max 3)
7. Publish via refreshStreet / POST /api/{slug}/street/refresh
8. Report: n firms, PT range, Δ vs prior, WATCH collisions (informational)
9. User glass: reload Street (auto if we poll; else flash “publish done → Reload”)
```

**Write scope (unchanged law):** only `cockpit/street/{TICKER}.json`.

**Ontology:** loadPack for seed only; never compile.

---

## 4. Ontology relationship (explicit product)

### 4.1 Already true (document, don’t “connect” further)

- Street **not** in pack keys.  
- Glass Street **not** behind `ont verify`.  
- Seed **reads** `house_prior` + `risks` from pack.

### 4.2 Phase A (this plan) — doctrine + seed quality

- Seed + `/cockpit-street` + glass blurb: “Ontology = context only; Street vault = SoR for this room.”  
- Pipeline report section: **WATCH collisions** (bullet list: firm frame ↔ risk name) — text only.  
- No pack schema changes.

### 4.3 Phase B (optional follow-on — separate PR)

- Glass strip: “vs house / WATCH” 2–5 bullets if agent wrote `collisions[]` into Street JSON optional field **or** ephemeral in seed report only.  
- Prefer **not** storing collisions in Street SoR long-term unless useful for history; start ephemeral in agent report.

### 4.4 Explicitly out of scope

- Importing PT rows into ontology claims.  
- Street as input to Ask pack Q&A.  
- `ont compile` after Street publish.

---

## 5. Implementation phases

### Phase 1 — UX rename + mode wiring (small, ship first)

**Goal:** Labels match meaning; REFRESH STREET launches pipeline agent.

| Step | Work |
|------|------|
| 1.1 | `Street.jsx`: primary **REFRESH STREET** → `open-grok` `{ action: 'street', desk, mode: 'pipeline' }`; **OPEN GROK** → `mode: 'chat'`; add quiet **Reload** (current `load()`). |
| 1.2 | Empty-state + product blurb copy update. |
| 1.3 | `openGrok.js` / `streetAgentSeed.js`: accept `mode`; seed header **PIPELINE DEFAULT** vs **CHAT**. |
| 1.4 | `cockpit-street.md`: if seed mode=pipeline → skip long “ask what you want”; run refresh/rebuild. |
| 1.5 | Flash strings: “Opening Street agent · research → verify → publish” vs “Opened Grok · chat”. |
| 1.6 | Tests: prompt still `/cockpit-street {desk}`; seed mode in file; catalog unchanged. |

**No** ontology/compile changes.

### Phase 2 — Pipeline discipline + post-publish reload

| Step | Work |
|------|------|
| 2.1 | Seed lists prior `as_of` / firm PT summary for Δ targeting. |
| 2.2 | Command footer: always print WATCH collision notes (informational). |
| 2.3 | Glass: after OPEN returns ok, optional short poll `GET street` every N s for M s **or** flash “when agent finishes publish, click Reload” (prefer explicit Reload first to avoid false “done”). **Decision default:** no magic poll in v1 of this plan — flash + Reload is enough; poll is Phase 2b if dogfood hurts. |
| 2.4 | Thin-street tests still pass; add seed unit test for `mode=pipeline` string present. |

### Phase 3 — Ontology “collision” as product (optional)

| Step | Work |
|------|------|
| 3.1 | Spec only unless dogfood demands: agent report template for collisions. |
| 3.2 | Optional UI section under firm table — **read-only**, sourced from last agent report file under `/tmp` or `street.history` note — **not** pack. |
| 3.3 | Gate: never `ont compile` from this path. |

### Phase 4 — Repo hygiene / handoff

| Step | Work |
|------|------|
| 4.1 | Write `memory-cockpit-v2/plans/2026-08-04-street-refresh-ontology.md` (this plan). |
| 4.2 | One-line update in `PROJECT-STATE.md` or Street plan status pointer. |
| 4.3 | Legacy `/cockpit-street-build|refresh` stay aliases. |
| 4.4 | No git unless human asks. |

---

## 6. Files to touch (Phase 1–2)

| File | Change |
|------|--------|
| `memory-cockpit-v2/src/pages/thin/Street.jsx` | Three controls: REFRESH STREET / OPEN GROK / Reload |
| `memory-cockpit-v2/server/streetAgentSeed.js` | `mode` in seed body |
| `memory-cockpit-v2/server/openGrok.js` | Pass `mode` from POST body into seed |
| `memory-cockpit-v2/server/index.js` | Pass `body.mode` into `openGrokBuild` if not already generic |
| `.grok/commands/cockpit-street.md` | Pipeline vs chat branches |
| `scripts/open-grok-prompt-test.mjs` | Mode regression if prompt changes |
| New or extend seed smoke in thin-street or small seed-test | `mode=pipeline` content |
| `plans/2026-08-04-street-refresh-ontology.md` | Permanent plan copy |

**Do not touch:** `ontology/**` compile graph, pack schema, `ont verify` gates, BookStrip (unless copy only).

---

## 7. API / contract sketch

```js
// POST /api/open-grok
{
  action: 'street',
  desk: 'nvda',
  mode: 'pipeline' | 'chat'  // default 'chat' if omitted (agents menu)
}
// Response adds:
// street_seed: { path, mode, firm_count, ... }
```

Seed file first lines:

```markdown
## Open mode: PIPELINE | CHAT
```

---

## 8. Testing / gates

| Gate | Pass criteria |
|------|----------------|
| `npm run test:open-grok-prompt` (or script) | `street` → `/cockpit-street {desk}`; legacy aliases OK |
| `node scripts/thin-street-test.mjs` | GET/publish still complete-row only |
| `node scripts/street-schema-test.mjs` | Schema unchanged unless optional field later |
| Manual | REFRESH STREET opens Terminal + seed contains `PIPELINE` + house + WATCH |
| Manual | Reload does not open Terminal; only GET |
| Manual | After agent publish, Reload shows new firms |
| Negative | Street publish does not change pack mtime / house file |

---

## 9. Rollout order

1. Land plan in repo plans/  
2. Phase 1 chrome + mode seed (user-visible fix for wrong REFRESH)  
3. Phase 2 command tightness + collision bullets in agent report  
4. Dogfood on NVDA + SHAZ  
5. Phase 3 only if collisions need glass permanence  

---

## 10. Risks / pushback

| Risk | Mitigation |
|------|------------|
| User thinks REFRESH STREET is instant | Flash: agent opened · research loop; not instant scrape |
| Agent still asks “what do you want?” | Seed mode=pipeline forbids ask-first; start work |
| Confuse with Book REFRESH | Different room; optional subtitle “Street vault only · not COMPILE BOOK” |
| Ontology creep | Explicit non-goals; no pack writes in code review checklist |
| Pipeline fails offline | Keep Reload; empty CTA explains agent needs network/research |

---

## 11. Done means (Phase 1–2)

- [ ] Street primary button = research pipeline agent (not vault re-read)  
- [ ] Quiet Reload = vault re-read  
- [ ] OPEN GROK = chat mode + same seed context  
- [ ] Seed still includes house + risks; writes only Street JSON  
- [ ] No ontology compile/pack schema change  
- [ ] Prompt + thin-street tests green  
- [ ] Plan filed under `memory-cockpit-v2/plans/`  

---

## 12. One-line doctrine (for AGENTS / glass)

**REFRESH STREET updates the external catalog via the agent; ontology stays the house book and is read for context only; Reload re-reads storage; never fold firm PTs into the pack.**
