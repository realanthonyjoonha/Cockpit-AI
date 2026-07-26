# Part 1 only — Microsoft (MSFT) research → pack-ready ontology

**Status:** **PART 1 COMPLETE** (2026-07-21) — Step 6 pack gate passed  
**Date:** 2026-07-21  
**Pack (gate):** claims=20 (A:16 B:4) · risks=6 ACCEPTED · sources=35 · house=**CONFIRMED** · watch=[R3 OpenAI]  
**Ticker:** MSFT  
**Slug:** `microsoft`  
**Scope of this plan:** Part 1 only (research engine + human stops + ontology pack)  
**Part 2:** Thin desk shipped 2026-07-21 — MEMORY | NEBIUS | MICROSOFT · `#/msft/*` · `/api/msft/*`

**Decision-support only** — no buy/sell/hold, PT, or sizing.

---

## 0. Objective

Run **research from scratch** for Microsoft such that ontology can compile a **usable MSFT pack**, with mandatory stops for:

1. **House view** — Anthony confirms (or explicitly leaves FORMING/DRAFT)  
2. **Risk register** — Anthony identifies/accepts load-bearing risks  

This closes the gap: we have never done full from-scratch → pack-ready for a new name.  
Nebius remains the **Part 2** reference later — not this plan.

---

## 1. Two-part architecture (reminder)

| Part | This plan? |
|------|------------|
| **1 — Research → pack-ready book** | **YES** |
| **2 — Thin desk like Nebius** | NO — separate plan after Step 6 |

```text
Part 1:  MSFT research + stops → files → packs/MSFT.json → compile → ask works
Part 2:  (later) thin glass + COMPILE BOOK + contract
```

---

## 2. Paths (binding)

**Root:** `/Users/anthonyha/Trading/research-wiki/`

| Content | Path |
|---------|------|
| Research factory | `raw/microsoft-research/` |
| Entity | `wiki/entities/microsoft.md` |
| Sources | `wiki/sources/<slug>.md` as needed |
| Risks **edit SoR** | `raw/microsoft-research/08-risks-catalysts.md` |
| Risks generated (optional) | `raw/microsoft-research/risks/` (compile may generate; don’t hand-edit as SoR) |
| House view | `house-view-microsoft.md` (USER-OWNED — confirm only) |
| Log | `wiki/log.md` |
| Pack config | `ontology/packs/MSFT.json` |
| Pack output | `ontology/store/by_ticker/MSFT.json` (never hand-edit) |

**Claim format (entity Key facts only for speakable claims):**

```markdown
- <claim text> (YYYY-MM-DD) [A|B|C] [[source-slug]]
```

Must sit under:

```markdown
## Key facts (timestamped · graded · sourced)
```

---

## 3. Scope stop (Step 0) — Anthony decides before heavy spend

### Proposed default scope (edit at Step 0)

| In scope | Out of scope (v1) |
|----------|-------------------|
| MSFT as **AI / Azure / hyperscaler + platform** investment research | Full consumer Windows retail deep-dive |
| Cloud + AI infra demand, capex, OpenAI/relationship, competition (AMZN/GOOGL/neoclouds) | Gaming Xbox as primary thesis |
| Financial publics (10-K/10-Q, earnings), guidance, segment where material | Building a full IB model in Part 1 |
| Risks that can kill or re-rate the AI thesis | Memory-desk-style multi-series cockpit |

**One-line scope (draft for approval):**  
*Microsoft as AI platform / Azure hyperscaler: demand, capacity/capex, AI partnership economics, competition, and financing/execution risks — decision-support only.*

**Pass Step 0:** Anthony says “scope OK” or edits the table above.

---

## 4. Steps 0–6 with verification gates

### Step 0 — Scope

| | |
|--|--|
| **Do** | Approve/edit scope table + one-line thesis focus |
| **Pass** | Written scope frozen for v1 waves |
| **Fail** | Unbounded “everything Microsoft” |

---

### Step 1 — Research map (human approve)

| | |
|--|--|
| **Do** | Agent drafts map: key questions, peers, primary sources (SEC, earnings, IR), monitors, park list |
| **File** | `raw/microsoft-research/00-scope.md` + `00-research-map.md` |
| **Stop** | Anthony: add/drop/rename topics |
| **Pass** | Map approved; parks explicit (e.g. Xbox deep dive parked) |
| **Fail** | No map / Anthony hasn’t approved |

---

### Step 2 — Research wave → files on disk

| | |
|--|--|
| **Do** | Heavy research agents (filings, earnings, AI/Azure, competition, financials) |
| **File** | Under `raw/microsoft-research/` (mirrors Nebius numbering where useful): |
| | `01-master-dossier.md`, filings/earnings extracts, `09-claim-bank.md`, `SOURCE-INDEX.md`, etc. |
| **Rule** | Done = **absolute paths written**, not chat-only |
| **Skill** | `research-to-ontology` Modes A/B for filing |
| **Pass** | ≥ 4 substantial files in `raw/microsoft-research/`; log line if material |
| **Fail** | Research only in chat / Desktop |

**Optional mid-wave compile:** after first claim batch, scaffold pack (Step 6 early) to catch format errors.

---

### Step 3 — Graded claims on entity

| | |
|--|--|
| **Do** | Create/update `wiki/entities/microsoft.md` from template |
| **Do** | Load-bearing facts as Key facts bullets (graded) |
| **Pass** | **≥ 10** claims parsing into pack on compile (target **12–20** for a solid v1) |
| **Fail** | Claims only in masters; wrong section; missing date/grade/source |

**Verify:**

```bash
cd ~/Trading/ontology && ./ont compile MSFT
# claims count ≥ 10 in compile output / pack
```

---

### Step 4 — Risks stop (human)

| | |
|--|--|
| **Do** | Agent proposes risk register (IDs, names, status, tripwires, grades) |
| **File** | Draft in chat **or** `08-risks-catalysts.md` as DRAFT until accept |
| **Stop** | Anthony **identifies / accepts** load-bearing risks (edit list: keep/cut/merge) |
| **Pass** | **≥ 6** risks in SoR file Anthony owns; statuses explicit (INTACT/WATCH/etc.) |
| **Fail** | AI-only risk list never ratified; empty 08-file |

**Note:** Ontology risk compile for MSFT must follow pack config (`risks_source` / `risks_dir` like NBIS). Wire `packs/MSFT.json` in Step 6 scaffold **before** expecting risks in pack — can scaffold pack skeleton at end of Step 2.

---

### Step 5 — House view stop (human)

| | |
|--|--|
| **Do** | Agent drafts house view (stance, horizon, hinges, step-backs) — mark **DRAFT** |
| **Stop** | Anthony **CONFIRMS** → write `house-view-microsoft.md` **only on explicit save** |
| **Or** | Leave FORMING/DRAFT in file with clear status — pack may still read excerpt |
| **Pass** | House file exists with status CONFIRMED **or** explicit FORMING/DRAFT Anthony accepted as interim |
| **Fail** | Agent auto-CONFIRMED; no house file; chat-only stance |

**Governance:** Same as Nebius — decision-support only; no buy/sell/PT/sizing.

---

### Step 6 — Ontology pack gate (Part 1 exit)

| | |
|--|--|
| **Do** | Create `ontology/packs/MSFT.json` (globs, house path, risks source, aliases, themes) |
| **Do** | Update RESEARCH-PATHS coverage map (Microsoft row) |
| **Do** | `./ont compile MSFT` |
| **Do** | `./ont ask MSFT "house view"` and `"what's on watch"` / risks |
| **Pass** | All of: |
| | • compile exit 0 |
| | • claims ≥ 10 in pack |
| | • risks ≥ 6 in pack |
| | • sources catalog non-empty |
| | • house prior present (CONFIRMED or explicit draft status) |
| | • ask house + on-watch/risks non-empty and sane |
| **Fail** | Any above missing → stay in Part 1; fix files; recompile |

**Part 1 COMPLETE** when Step 6 passes.  
**Do not** start thin desk until then.

### Step 6 result — **PASS** (2026-07-21)

| Gate | Result |
|------|--------|
| `./ont compile MSFT` exit 0 | OK |
| claims ≥ 10 | **20** (16A / 4B) |
| risks ≥ 6 | **6** ACCEPTED as written |
| sources non-empty | **35** |
| house prior present | **CONFIRMED** (Anthony) |
| ask house + on-watch sane | OK — stance Azure/capacity bull; WATCH R3 only |
| RESEARCH-PATHS Microsoft row | present |
| packs/MSFT.json | present |

**Part 1 COMPLETE.** Part 2 thin desk = separate plan/decision only.

---

## 5. Suggested research map seeds (for Step 1 — not final)

Agent should expand/cut with Anthony:

1. **Azure / AI cloud** growth, capacity, backlog/guidance language  
2. **Capex / data center / power** (hyperscaler angle)  
3. **OpenAI / AI partnership economics** (what is disclosed vs contested)  
4. **Segment mix** (Intelligent Cloud vs other) as far as publics allow  
5. **Competition** — AMZN, GOOGL, neoclouds, custom silicon narrative  
6. **Regulatory / antitrust** as risk, not main thesis  
7. **Capital return / balance sheet** only as it binds AI investability  
8. **Near catalysts** — earnings, guidance, major product events  

Park: deep Xbox, LinkedIn HR product, non-AI peripheral businesses unless thesis-binding.

---

## 6. Ontology scaffold (when to create pack)

| Timing | Action |
|--------|--------|
| After Step 0 | Optional: create empty `raw/microsoft-research/00-scope.md` only |
| After Step 1 approve | Folder structure + map files |
| After first claims exist | **`packs/MSFT.json` + first compile** (catches format early) |
| After Step 4–5 | Full compile gate (Step 6) |

**MSFT.json** should mirror NBIS shape: `ticker`, `entity_slug`, `house_view_path`, `risks_source`, `source_globs`, `source_roots`, aliases (`Microsoft`, `MSFT`, `Azure` as needed).

May need small **compile wiring** if risk loader is Nebius-specific today — verify in Step 6; if so, thin adapter (same as NBIS risks path pattern), not a new ontology product.

---

## 7. Agent operating rules (Part 1)

1. Decision-support only.  
2. RESEARCH-PATHS only.  
3. Never hand-edit `ontology/store/`.  
4. Never CONFIRMED house without Anthony’s explicit save language.  
5. Risks: draft freely; **Anthony owns the accepted register**.  
6. End every research burst with **files + paths reported**.  
7. Prefer graded claims over long ungrounded narrative.  
8. Use `research-to-ontology` for file+compile when pack exists.  

---

## 8. Explicit non-goals (Part 1)

| Parked |
|--------|
| Thin cockpit / Part 2 glass |
| COMPILE BOOK for MSFT (needs Part 2 desk) — use `./ont compile MSFT` |
| Memory-class charts for MSFT |
| Full Street catalog / 60-row models |
| research-os config engine |
| Auto house-view |
| Multi-ticker factory |

---

## 9. Success criteria (Part 1 done)

Anthony can say:

1. Research was done **from scratch** (not pre-existing MSFT ontology pack).  
2. Files live under `raw/microsoft-research/` + entity + risks source + house.  
3. **I** set house status (confirm or interim draft).  
4. **I** accepted the risk register.  
5. `./ont compile MSFT` works; ask house / on watch is usable.  
6. **No MSFT thin desk yet** — Part 2 is a separate decision.

---

## 10. Execution order (when “go” on Part 1)

| Order | Action | Owner |
|-------|--------|--------|
| 1 | Approve Step 0 scope | Anthony |
| 2 | Scaffold dirs + 00-scope + research map | Agent |
| 3 | Anthony approves map | Anthony |
| 4 | Research waves + file | Agent |
| 5 | Entity claims ≥ 10 | Agent + format check |
| 6 | Pack scaffold + early compile | Agent |
| 7 | Risks draft → Anthony accept | Both |
| 8 | House draft → Anthony confirm/save | Both |
| 9 | Step 6 full gate | Agent + Anthony smoke ask |
| 10 | Handback: Part 1 complete checklist | Agent |

---

## 11. Relation to Nebius “test”

| | Nebius | Microsoft Part 1 |
|--|--------|------------------|
| Research from scratch | Mostly prior | **This plan’s point** |
| Ontology pack | Done | **Build MSFT pack** |
| Thin desk | Done (Part 2 ref) | **Not yet** |

After Part 1 passes, a **later** plan can say: “Part 2 = apply THIN-DESK-CONTRACT to MSFT like NBIS.”

---

## 12. Approval checkpoint

Before executing research waves:

1. [ ] Anthony approves **scope** (Step 0)  
2. [ ] Confirm house file name: `house-view-microsoft.md`  
3. [ ] Confirm Part 2 stays blocked until Step 6  

Say **go on Part 1** (and any scope edits) to start Step 0–1 scaffold + map — not the thin desk.
