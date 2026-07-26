# Ontology — Build Plan (v0.1)

**Status:** ITERATION 1 CORE SHIPPED (compile + retrieve) — use phase next  
**Owner:** Anthony  
**Last updated:** 2026-07-19  
**Product cut:** Ontology only (Cockpit and Jarvis are separate builds / later clients)

---

## 0. One-liner

Build a **compiled, typed research ontology** that turns existing Micron research into a **deterministic `retrieve(MU)` pack** any agent or future cockpit can trust — without voice, without multi-ticker sprawl, without coupling to a changing cockpit UI.

---

## 1. Why this exists

| Problem | Ontology fix |
|---|---|
| Research scattered across wiki / thesis / cockpit | One compiled system of record per focus (start: MU) |
| General LLMs improvise numbers and consensus | Graded, dated claims only; gaps explicit |
| Chat context dies every session | Packs compound; ingest updates objects |
| Cockpit UI still churning | Ontology stable; cockpit integrates later via adapter |
| Agent overfitting / thrash | Frozen CONTRACT + gold fixtures + `make test` |

**Not this iteration:** Jarvis voice, cockpit rebuild, Nebius depth, live X core, free agent writes to house-view.

---

## 2. Three-build architecture (do not collapse)

```
Jarvis (later)  ──tools/actions──►  Ontology (THIS BUILD)  ──export later──►  Cockpits (existing, volatile)
```

| Build | Owns | This plan |
|---|---|---|
| **Ontology** | Objects, compile, retrieve, tests | **YES — all focus here** |
| **Jarvis** | Tool-locked agent, prompts, later voice | Out of scope until Phase E optional |
| **Cockpits** | UI / pages / charts | Do not block; no schema coupling |

**Dependency rule:** Ontology must not import cockpit React, ports, or page JSON shapes. Prefer `research-wiki` + house-view + durable risk/series files.

---

## 3. Success for iteration 1 (definition of done)

**Product moment:**

```bash
cd ~/Trading/ontology && make retrieve-mu
# → budgeted pack: house prior · stance · graded claims · risks · series · gaps · as_of
```

**Hard gates (all required):**

| # | Criterion |
|---|---|
| 1 | `CONTRACT.md` v0.1 frozen |
| 2 | Hand-curated `fixtures/MU.overview.gold.json` trusted by Anthony |
| 3 | `make compile-mu` writes `store/by_ticker/MU.json` |
| 4 | `make retrieve-mu` returns budget-capped pack (no LLM) |
| 5 | `make test` green |
| 6 | Claims in pack have `as_of` + `grade` ∈ {A,B,C} (or are excluded) |
| 7 | Pack always includes `gaps[]` |
| 8 | Anthony used retrieve for ≥2 real MU questions |
| 9 | Out-of-scope list still true |

**Soft gate:** Prefer retrieve over a general LLM for thesis/risk underwrite on MU.

**Scorecard:** see §11.

---

## 4. Explicit non-goals (iteration 1)

- Voice / STT / TTS  
- Full multi-name book OS  
- Nebius (or any second ticker) depth — thin stub test only if time  
- Live X / web as ontology core  
- Neo4j / vector DB as system of record  
- Agent write to `house-view.md`  
- Cockpit UI rewrite or “Jarvis updates cockpit” automation  
- LLM inside the compiler  
- Buy/sell/hold/target/sizing language in packs or tools  

---

## 5. Sources of truth (compile inputs)

| Priority | Path | Maps to |
|---|---|---|
| 1 | `~/Trading/research-wiki/wiki/entities/micron.md` | Company + Claims |
| 2 | `~/Trading/research-wiki/house-view.md` | HouseViewPlay (MU-relevant) |
| 3 | `~/Trading/research-wiki/cockpit/risks/*.md` | Risk (filter MU/memory-relevant) |
| 4 | `~/Trading/research-wiki/cockpit/series/` + registry | Series snapshots |
| 5 | `~/Trading/research-wiki/wiki/catalysts.md` | Catalyst (filter MU) |
| 6 | `~/Trading/research-wiki/wiki/sources/*.md` | Source stubs (as linked) |

**Do not compile from:** cockpit `src/`, React, research-os Act packs (unless later explicit), chat logs.

**Authoring remains in the wiki.** Ontology is **compiled** — do not hand-edit `store/` as long-term truth.

---

## 6. v1 ontology language

### 6.1 Object types

| Type | id example | Required properties (min) |
|---|---|---|
| Company | `micron` | name, ticker, aliases, summary, stance[], updated |
| Claim | `micron:claim:…` | text, as_of, grade, source_id, about_id |
| Source | `calibration-event-micron-q3` | title/slug, optional path |
| Risk | `positioning-unwind` | name, status, summary, tripwires[], series[] |
| Series | `price-mu` | id, latest, as_of (if available) |
| Catalyst | slug/date | when, event, why |
| HouseViewPlay | `memory-dram-super-cycle` | play, status, date, view_excerpt |
| Theme | `memory-super-cycle` | name (light; links only) |

### 6.2 Link types (v1)

- `HOUSE_STANCE_ON` — play → theme/company  
- `CLAIM_ABOUT` — claim → company  
- `SUPPORTED_BY` — claim → source  
- `RISK_ON` — risk → company/theme  
- `MONITORS` — risk → series  
- `CATALYST_FOR` — catalyst → company  
- `IN_THEME` — company → theme  

### 6.3 Action types (v1)

| Action | v1? | Notes |
|---|---|---|
| (none) | default | Read-only ontology is success |
| `append_research_log` | optional | Append-only log; no thesis mutation |
| `add_gap` | optional | Record known unknown |
| `save_house_view` | **NO** | Never without explicit later phase + human gate |

### 6.4 Retrieve API

```text
retrieve(focus: "MU" | "micron", intent: "overview" | "risks" | "catalysts") -> ContextPack
```

**ContextPack (overview) must include:**

```json
{
  "focus": {"type": "company", "id": "micron", "ticker": "MU"},
  "compiled_at": "ISO-8601",
  "house_prior": {},
  "object": {},
  "claims": [],
  "risks": [],
  "series_snapshot": [],
  "catalysts": [],
  "related": [],
  "gaps": [],
  "provenance": {"sources": []}
}
```

**Budget:** overview ≤ **10_000** characters JSON (or equivalent); excess goes to gaps note or other intents.

---

## 7. Phased plan (verifiable steps)

### Phase 0 — Freeze contract *(do first; no clever code)*

**Deliverables**

- [x] Directory skeleton  
- [ ] `CONTRACT.md` v0.1 signed off by Anthony (read + “freeze”)  
- [ ] `schema/object_types.yaml`, `link_types.yaml`, `action_types.yaml`  
- [ ] `DECISIONS.md` D-ONTO-1…  

**Gate:** 60-second pitch works; out-of-scope list agreed.

**Estimate:** 30–60 min human.

---

### Phase 1 — Gold MU pack *(human curation; blocks compile)*

**Deliverables**

- [ ] `fixtures/MU.overview.gold.json` — hand-built from micron entity + house-view + key risks/series  
- [ ] `fixtures/MU.questions.json` — 10 questions; each with `must_include` / `must_refuse` hints  
- [ ] Gold includes ≥8 graded claims, house_prior, gaps  

**Gate:** Anthony trusts gold more than any chat summary.

**Rules**

- No compiler until gold exists  
- No LLM-generated gold as authority (LLM may draft; Anthony accepts)  

**Estimate:** 2–4 hours.

---

### Phase 2 — Test harness + empty spine

**Deliverables**

- [ ] `Makefile` with `test`, `compile-mu`, `retrieve-mu`  
- [ ] `tests/test_gold_schema.py` — gold has required keys  
- [ ] `tests/test_contract_budget.py` — budget constant documented  
- [ ] `api/retrieve.py` stub loads gold or store  
- [ ] `api/cli.py` — `python -m api.cli retrieve MU`  

**Gate:** `make test` green **before** real compile logic.

**Estimate:** 1–2 hours.

---

### Phase 3 — Deterministic compile (MU)

**Deliverables**

- [ ] `compile/from_wiki.py` — entity frontmatter + claim bullets matching:  
  `(date) [A|B|C] [[source]]` pattern (strict; non-matching → skip or gap count)  
- [ ] `compile/from_house_view.py` — memory/DRAM CONFIRMED play + MU-relevant excerpts  
- [ ] `compile/from_cockpit.py` — risks (heuristic filter) + series latest for allowlist  
- [ ] `compile/run.py` — writes `store/by_ticker/MU.json`  
- [ ] Tests: compile runs; required keys present; ≥N claims; all claims graded  

**Gate:** `make compile-mu && make test` green.

**Non-goals this phase:** perfect NLP, full wiki graph, multi-ticker.

**Estimate:** 1–2 days.

---

### Phase 4 — Retrieve + budget + gaps

**Deliverables**

- [ ] `retrieve(focus, intent)` reads store (not live wiki parse every time — store is input)  
- [ ] Intent filters (overview vs risks vs catalysts)  
- [ ] Hard character budget + `gaps` always present  
- [ ] CLI pretty-print markdown optional  

**Gate:** Anthony can answer 5/10 gold questions **from CLI output alone** (no LLM).

**Estimate:** half day.

---

### Phase 5 — Live use freeze *(mandatory before Jarvis)*

**Deliverables**

- [ ] Friction log: `ontology/FRICTION.md` (bullets only)  
- [ ] ≥2 real MU uses documented  

**Gate:** Either pack is useful, or stop and fix **data/gold**, not prompts.

**Estimate:** 2–7 days calendar (use, don’t build).

---

### Phase 6 — Optional thin Jarvis client *(separate build flag)*

Only if Phase 5 passed.

**Deliverables**

- [ ] Text agent **or** documented prompt: tools = ontology retrieve only  
- [ ] Refusal test: buy/sell prompt → decline  
- [ ] No Write/Bash/Web to vault  

**Gate:** tool-use + refusal tests green.

**Still not:** voice, cockpit writeback.

---

### Phase 7 — Later (not scheduled now)

- Thin second focus stub (NBIS empty pack) to kill MU-hardcode  
- Export adapter: Ontology → cockpit JSON (when cockpit read model stabilizes)  
- Actions: ingest_source, claim update proposals  
- research-os desks as alternate compilers  

---

## 8. Verification system (anti-regression)

### Commands

```bash
cd ~/Trading/ontology
make test          # must be green before any "done for the day"
make compile-mu
make retrieve-mu
```

### What tests protect

| Test | Protects against |
|---|---|
| Gold schema | Empty / broken underwrite shape |
| Compile produces claims with grades | Ungraded garbage in pack |
| Budget | Pack becomes folder-dump |
| Required keys | Silent API drift |
| (Later) refusal | Advice leakage |

### Change control

| Artifact | Who may edit | Rule |
|---|---|---|
| `CONTRACT.md` | Anthony only | Version bump + DECISIONS entry |
| `fixtures/*.gold.json` | Anthony accepts | Agent may draft, not auto-merge |
| `compile/`, `api/` | Agent OK | Must keep `make test` green |
| `store/` | Compile only | Treat as build output |

### Work cycle (every session)

1. One phase acceptance criterion only  
2. Smallest change  
3. `make test`  
4. If green: note in DECISIONS or FRICTION  
5. **STOP** — no “while we’re here”  

---

## 9. Cockpit integration policy (while cockpit is changing)

| Do | Don’t |
|---|---|
| Compile from durable vault files | Bind to React routes / Workshop layout |
| Keep parallel read (wiki→cockpit old path; wiki→ontology new path) | Dual-write the same fact in two places as SoR |
| Plan a **thin export adapter later** | Block Ontology until cockpit “is done” |
| Freeze **ContextPack / bridge** shape | Mirror every cockpit widget field |

**When cockpit stabilizes:** implement `export/cockpit_bridge.py` mapping pack → existing server model shapes. Expect adapter churn; not ontology type churn.

---

## 10. Risks and mitigations (plan-level)

| Risk | Mitigation |
|---|---|
| Scope creep | §4 non-goals + phase gates |
| Stale “official” pack | as_of on claims; recompile after earnings; FRICTION |
| Compile too weak / too clever | Strict claim regex; no LLM in compile |
| MU-only code paths | No `if ticker=="MU"` beyond pack id config |
| Trusted but wrong | Grades + gaps; gold human-owned |
| Regression loops | `make test` + no commit on red |
| Agent corrupts thesis | No house-view write in v1 |
| Unused green system | Phase 5 use gate |

---

## 11. Iteration 1 scorecard

| # | Criterion | Pass |
|---|---|---|
| 1 | CONTRACT v0.1 frozen | ☐ |
| 2 | MU gold trusted | ☐ |
| 3 | `make compile-mu` works | ☐ |
| 4 | `make retrieve-mu` budgeted pack | ☐ |
| 5 | `make test` green | ☐ |
| 6 | Graded claims only | ☐ |
| 7 | `gaps[]` always present | ☐ |
| 8 | ≥2 real MU uses | ☐ |
| 9 | Non-goals still hold | ☐ |

**Ship iteration 1 when 1–7 and 9 are ✅; 8 within a week of 5.**

---

## 12. Immediate next actions (ordered)

1. Read and freeze `CONTRACT.md` (edit only if Anthony disagrees)  
2. Curate `fixtures/MU.overview.gold.json` (Phase 1) — **highest leverage human work**  
3. Write `fixtures/MU.questions.json`  
4. Implement Phase 2 harness + Phase 3 compile  
5. Use CLI for a week before Jarvis  

---

## 13. File map (target)

```text
ontology/
  PLAN.md                 ← this file
  CONTRACT.md
  DECISIONS.md
  README.md
  FRICTION.md             ← created in Phase 5
  Makefile
  schema/
    object_types.yaml
    link_types.yaml
    action_types.yaml
  fixtures/
    MU.overview.gold.json
    MU.questions.json
  compile/
    from_wiki.py
    from_house_view.py
    from_cockpit.py
    run.py
  api/
    retrieve.py
    cli.py
  store/by_ticker/
    MU.json               ← build output
  tests/
    ...
```

---

## 14. Decision log pointer

See `DECISIONS.md` for dated choices (D-ONTO-*).  
Plan changes that alter success criteria require a DECISIONS entry and CONTRACT version bump if rules change.
