# Phase 5 — Write path: pin research so the glass stays true

**Status:** COMPLETE / SHIPPED 2026-07-20  
**Date:** 2026-07-20  
**Engineering done:** Update page, write-meta, rail, docs, smoke (38), write-path-drill PASS  
**Your optional product check:** one manual S1–S6 sitting on `#/nbis/update`  
**Builds on:** Nebius Phases 1–4 (thin desk, Ask, REFRESH BOOK, goldens)  
**Homes:**  
- Content write → `research-wiki/` (RESEARCH-PATHS)  
- Pin → `ontology/` (`./ont compile NBIS`)  
- Glass read → `memory-cockpit-v2/` (already shipped)  
- Agent ritual → `research-to-ontology` skill + this plan  

**Decision-support only.** No buy/sell/hold, PT, or sizing.

---

## 1. Goal

Make **updating the book** a first-class, safe, repeatable product workflow so that:

```text
new fact / risk change
  → correct files (graded)
  → ./ont compile NBIS
  → REFRESH BOOK
  → Overview / Risks / Ask / House show the change
```

…and **house view is never silently rewritten**.

Phases 1–4 = **read** the book.  
Phase 5 = **write/pin** the book without inventing glass truth or freestyle UI.

---

## 2. The six success criteria (definition of done)

From product design. Phase 5 is **successful only if all six** can be demonstrated in one sitting.

| # | Criterion |
|---|-----------|
| **S1** | Get a new fact or risk change from research |
| **S2** | Land it in the **correct file** with graded format |
| **S3** | Run compile (CLI; browser compile still optional/non-goal for v1) |
| **S4** | Hit **REFRESH BOOK** |
| **S5** | See the change on **Risks / Ask / Overview** without doubt |
| **S6** | Leave **house view untouched** unless you said confirm |

Below: **how Phase 5 accomplishes each** (mechanism + verification).

---

## 3. How we accomplish each criterion

### S1 — Get a new fact or risk change from research

| Mechanism | Detail |
|-----------|--------|
| **Source of change** | You, Claude/Grok research, or a short “maintenance” prompt — probabilistic **draft** only |
| **Product artifact** | A **Write card** on Nebius (or `#/nbis/update`) that states: *“Draft in chat → pin via ritual below. Glass never invents.”* |
| **Agent binding** | `research-to-ontology` Mode A/B: research or paste must end in **files**, not chat-only |
| **Not required** | Full multi-agent factory inside the cockpit |

**Verify S1:** After a session you can point to a *new or changed sentence* you intend to pin (claim text or risk line), not only “we talked about it.”

---

### S2 — Land it in the correct file with graded format

| Mechanism | Detail |
|-----------|--------|
| **Path law** | Only paths in `research-wiki/RESEARCH-PATHS.md` |
| **Nebius map (binding)** | |
| | Claims / entity facts → `wiki/entities/nebius.md` |
| | Long research → `raw/nebius-research/` |
| | Risks **edit source** → `raw/nebius-research/08-risks-catalysts.md` (not generated `risks/nbis-*.md` as SoR) |
| | Log → `wiki/log.md` one-liner if material |
| | House → `house-view-nebius.md` **only on explicit confirm** |
| **Claim format (fail closed)** | `- <text> (YYYY-MM-DD) [A\|B\|C] [[source-slug]]` |
| **Product artifact** | Update page shows this map + copy-paste claim template + “wrong: store/, Desktop, entity-2.md” |
| **Agent artifact** | Skill handback must list **absolute paths written** |

**Verify S2:**  
`rg` / open the file — new bullet has date + grade + source slug; path is under RESEARCH-PATHS; `ontology/store/` was **not** hand-edited.

---

### S3 — Run compile

| Mechanism | Detail |
|-----------|--------|
| **Pin command** | `cd ~/Trading/ontology && ./ont compile NBIS` |
| **Effect** | Rebuilds `ontology/store/by_ticker/NBIS.json` deterministically from files |
| **Product artifact** | Book strip / Update page shows exact command + “does not run from browser in Phase 5 v1” |
| **Agent artifact** | research-to-ontology Step 3 always runs compile after writes |
| **Optional later (not v1)** | `POST /api/nbis/compile` spawning absolute `./ont` — parked (PATH, security, UX) |

**Verify S3:**  
Compile exits OK; pack `compiled_at` is newer; claim/risk counts in compile output or book API move if content changed.  
`./ont ask NBIS "what's on watch"` / `"house view"` still coherent.

---

### S4 — Hit REFRESH BOOK

| Mechanism | Detail |
|-----------|--------|
| **Already shipped (Phase 4)** | `POST /api/nbis/book/refresh` + BookStrip **REFRESH BOOK** |
| **Phase 5 addition** | Update ritual UI sequences: *Compile (terminal) → REFRESH BOOK (glass)* as step 4 of 6 checklist |
| **Cache** | mtime invalidation + force re-read already prevent “stale 5s” confusion |

**Verify S4:**  
After compile, click **REFRESH BOOK**; strip shows updated `compiled_at` / counts; flash confirms re-read.  
(Without refresh, hard reload also works; button is the explicit product action.)

---

### S5 — See the change on Risks / Ask / Overview without doubt

| Mechanism | Detail |
|-----------|--------|
| **Read path (shipped)** | Overview claims, Risks register, Ask pack Q&A all read pack |
| **Phase 5 proof harness** | **Write-path smoke / golden drill** (see §6): scripted or documented sequence that |
| | 1) appends a unique **probe claim** (or probe note in risks source) with a unique token |
| | 2) compiles  
| | 3) refreshes book  
| | 4) asserts token appears in `/api/nbis/overview` claims **or** Ask `key claims` / risk Ask  
| | 5) **removes probe** + recompile (leave book clean) **or** leave probe only in a test fixture pack |
| **Human verify** | Open Risks or Ask; search for the token / new risk line |

**Verify S5:**  
Automated probe **or** manual: unique string from S2 is visible on glass after S3+S4, matching pack Ask.  
No reliance on “looks fine” alone.

**Design choice for probe:** Prefer a **smoke-only temp file** or **append+revert in CI**, not permanent pollution of production research. Document which.

---

### S6 — House view untouched unless you said confirm

| Mechanism | Detail |
|-----------|--------|
| **Existing law** | RESEARCH-PATHS + research-to-ontology: house only on explicit save |
| **Product artifact** | Update page banner: **HOUSE VIEW IS USER-OWNED — agents must not write without “confirm/save nebius”** |
| **Agent handback** | Required line: `House view: not touched | updated on explicit instruction` |
| **Optional hard check** | Phase 5 smoke: record `mtime` or hash of `house-view-nebius.md` before/after a **claims-only** write drill → must be **unchanged** |
| **Glass** | House page remains vault-first read-only; no edit UI in Phase 5 |

**Verify S6:**  
After a claims/risks update session, `house-view-nebius.md` mtime/hash unchanged unless you issued confirm language.  
Handback says `not touched` when appropriate.

---

## 4. Scope of the Phase 5 *build* (v1)

### In scope (ship)

| ID | Deliverable | Owner layer |
|----|-------------|-------------|
| **W1** | `#/nbis/update` (or Overview section) **Write / update ritual** — 6-step checklist mapped to S1–S6 | Glass |
| **W2** | Path map + claim template + risk-source pointer (NBIS-specific) on that page | Glass |
| **W3** | Deep links: » Ask · » Risks · » House · REFRESH BOOK (reuse BookStrip) | Glass |
| **W4** | Rail item **Update** (6th thin room) — EMPTY nowhere; this page is real | Glass |
| **W5** | Agent playbook slice: `plans/WRITE-PATH-NBIS.md` or section in NEW-DESK-PLAYBOOK — “pin a claim / pin a risk” | Docs |
| **W6** | Tighten `research-to-ontology` handback if needed (already strong) + point glass at skill | Skill/docs |
| **W7** | **Write-path verification** in smoke or `scripts/write-path-drill.sh`: hash house file; optional probe claim with cleanup | Smoke/ops |
| **W8** | CLAUDE.md / implementation-notes: write path runbook | Docs |

### Out of scope (park)

| Parked | Why |
|--------|-----|
| Browser-run `./ont compile` | Ops/security; S3 stays CLI in v1 |
| LLM Ask / agent chat panel that writes files from the browser | Write via files + skill, not freestyle UI agent |
| Propose/accept JSON workflow (full 5b) | Nice follow-on; v1 = ritual + verify |
| Multi-ticker generic writer | NBIS first |
| Memory desk write UI | Separate |
| Auto-edit house view | Violates S6 |
| research-os | Parked |

### Phase 5b (later, not this plan’s must-ship)

Propose/accept: agent emits a structured diff → you accept → files written. Builds on v1 ritual.

---

## 5. Deterministic vs probabilistic

| Step | Mode |
|------|------|
| Research / draft wording | Probabilistic (agent) |
| Paths, claim format, house gate | Deterministic |
| Compile | Deterministic |
| Glass after refresh | Deterministic read |
| Layout of Update page | Deterministic IA (fixed section order) |

**Update page section order (fixed):**

1. BookStrip (+ REFRESH BOOK)  
2. Six success criteria checklist (S1–S6) with status hints  
3. Where to file (path map)  
4. Claim template  
5. Risk edit pointer (`08-risks-catalysts.md`)  
6. Commands (compile)  
7. Verify links (Ask / Risks / Overview)  
8. House governance banner  

---

## 6. Write-path verification design (S5 + S6)

### Option A — Documented manual drill (minimum)

Checklist in Update page + `WRITE-PATH-NBIS.md`:

1. Append one graded claim with unique token `PHASE5-PROBE-<date>` to entity  
2. Compile NBIS  
3. REFRESH BOOK  
4. Ask “key claims” or Overview — token present  
5. Revert claim line; compile; refresh  
6. Confirm house-view-nebius.md untouched  

### Option B — Automated drill (preferred if low risk)

`scripts/write-path-drill.mjs` (or smoke section behind flag):

1. Snapshot hash of `house-view-nebius.md`  
2. Append probe claim to a **sandbox path only if pack includes it** — **OR** use dry-run that only checks skill paths exist and house hash stable under “claims-only” mock  

**Recommendation:** Ship **Option A** as product truth + light **smoke checks that don’t mutate vault** (paths exist, Update route 200, house file readable). Full mutating drill runs **manually** or via opt-in `npm run write-path-drill` with explicit env `WRITE_PATH_DRILL=1` so normal smoke never rewrites research.

---

## 7. API / routes (v1)

| Method | Path | Role |
|--------|------|------|
| (existing) | `/api/nbis/book`, `POST .../refresh`, Ask, overview, risks, house | S3–S5 support |
| GET | `/api/nbis/write-meta` (optional) | Static path map + commands for the Update page (no file writes) |

**No** POST that writes wiki files from the browser in v1 (keeps gate simple; agents write via filesystem + skill).

---

## 8. Build sequence

| Step | Work | Unlocks |
|------|------|---------|
| **P5.0** | This plan approved | — |
| **P5.1** | `write-meta` (optional) + `#/nbis/update` page with S1–S6 checklist, paths, templates | S2, S3, S6 education |
| **P5.2** | Rail + App router + BookStrip on Update page | S4 entry point |
| **P5.3** | `WRITE-PATH-NBIS.md` + CLAUDE.md runbook | Agent/human same ritual |
| **P5.4** | Smoke: Update route / write-meta shape; goldens still green; Memory untouched | Regression |
| **P5.5** | Manual drill once (S1–S6) documented as “Anthony verified” | Full success criteria |
| **P5.6** | Opt-in write-path-drill script (optional same PR or fast-follow) | Repeatable S5/S6 |

---

## 9. Success criteria → deliverable matrix

| Criterion | Primary deliverable | Automated check | Human check |
|-----------|--------------------|-----------------|-------------|
| **S1** | Ritual page + skill “file not chat” | — | You have a concrete fact/risk to pin |
| **S2** | Path map + claim template + RESEARCH-PATHS | Paths listed match real files on disk | File contains graded bullet |
| **S3** | Compile command on page + skill Step 3 | Compile OK in drill | Pack `compiled_at` newer |
| **S4** | Phase 4 REFRESH + checklist step | `POST /book/refresh` smoke | Button flash / new as-of |
| **S5** | Pack-backed pages + manual/opt-in drill | Goldens + optional probe | Token visible on glass |
| **S6** | Banner + skill house rule + hash check in drill | House hash stable in drill | Handback “not touched” |

**Phase 5 v1 “shipped” for engineering:** P5.1–P5.4 green.  
**Phase 5 “product success”:** P5.5 manual drill passes all six once.

---

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Users still only chat | Skill fail-closed + Update page insistence on absolute paths |
| Probe pollutes research | Manual revert or opt-in drill only |
| Scope creep to in-browser agent writer | Explicit non-goal |
| House accidentally edited | S6 banner + hash check + skill |

---

## 11. Effort

**Small–medium:** mostly glass ritual page + docs + smoke; no new ontology schema.  
Leverages Phase 4 refresh and existing compile/skill.

---

## 12. Approval checkpoint

Confirm before code:

1. **v1 = ritual UI + docs + verify drill**, not browser compile or LLM writer  
2. **NBIS-first** write map  
3. **S1–S6** as the only definition of done for product success  

---

## Related

- Phase 3 Ask: `plans/2026-07-20-nebius-phase3-ask-book.md`  
- Phase 4 harden: `plans/2026-07-20-nebius-phase4-harden.md`  
- Playbook: `plans/NEW-DESK-PLAYBOOK.md`  
- Paths: `research-wiki/RESEARCH-PATHS.md`  
- Skill: `~/.grok/skills/research-to-ontology/SKILL.md`  
