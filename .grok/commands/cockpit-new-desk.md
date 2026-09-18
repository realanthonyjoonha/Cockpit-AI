---
description: Underwrite a NEW thin desk — deep research default (parallel subagents); human GO writes CONFIRMED
argument-hint: "[TICKER] [optional display name] [--light]"
---

Parse `$ARGUMENTS`: optional **TICKER** (e.g. AVGO), optional display name, optional flags **`--light`**, **`--no-street`**.  
If ticker missing, **ask once**. Do not invent a ticker.

| Flag | Effect |
|------|--------|
| `--light` | Thin research pass; **skip** Street bootstrap (user can REFRESH STREET later) |
| `--no-street` | Deep research OK; **skip** Street bootstrap only |

**Job:** Help the user **start a new company desk** in **this monorepo** (glass START → Build next company).  
This is **underwrite** the book, then (default) **one Street operate bootstrap** so the Street room is not left empty. Not daily/steelman on an existing book.

## Default research mode: DEEP (parallel)

| Mode | When | Bar |
|------|------|-----|
| **DEEP (default)** | Always unless user says `--light` / “quick pass” | Multi-slice primary research, parallel agents, depth table, ≥ claims floor |
| **LIGHT** | Only if user explicitly opts in | Scaffold + thin overview only; mark residual GAPs loudly |

**Do not** ship a “done” underwrite after a single web summary or one 10-K skim. Light mode is the exception.

## Hard rules

1. **Decision-support only** — no buy/sell/hold, price targets, or position sizing.  
2. **Never invent** graded claims, CONFIRMED house stance, or WATCH risk register to “finish” a desk.  
3. **Human owns** the book. In Grok they say **GO**, **SAVE DRAFT**, or **EDIT**. **GO writes** via `commit_on_go` / `go-commit.mjs`. **EDIT** and **SAVE DRAFT** never propose. Glass never gets a FORMING house proposal.  
4. **Never hand-edit** `ontology/store/`. Compile rebuilds packs.  
5. Prefer empty scaffold + real research over fake fullness.  
6. **Primary over press** — 10-K / 10-Q / IR PR / 8-K / DEF 14A first; secondary press → **[soft]**.  
7. **GAP** when missing; do not pad with narrative.

## Efficiency (setup only)

- MCP: `list_desks` first (confirm monorepo / existing desks).  
- Scaffold only when user wants structure (or ticker is set and desk missing).  
- Research is **not** efficiency-capped like daily — deep mode expects breadth.

---

## Steps

### 1–3. Setup (same for deep / light)

1. **Monorepo check** — MCP `list_desks`. Note existing slugs. If MCP missing:  
   `./scripts/install-grok-mcp.sh` inside this monorepo, then OPEN GROK again from glass.  
2. **Ticker** — if not in args, ask once. Uppercase. If desk already registered, say so and offer operate (`/cockpit-steelman {slug}`) or **deepen research** on that desk — do not re-scaffold blindly.  
3. **Scaffold (empty structure only)** when appropriate:  
   ```bash
   ./scripts/scaffold-new-desk.sh TICKER [slug] ["Display Name"]
   ```  
   Creates vault folders, FORMING house stub, empty risks SoR, pack JSON, thin-desks row.  
   **No invented research.** Glass loads desks **live** from `thin-desks.json` (no rebuild/restart).  
   Canonical URL = lowercased ticker slug (TSM → `#/tsm/…`). Optional registry `aliases` (e.g. `tsmc`).

### 4. Research — DEEP default (parallel subagents)

Run this **after** scaffold (or on an existing FORMING desk). Orchestrator stays in charge; **fan out work**.

#### 4a. Slice plan (fixed set — adapt labels to the business)

Create / update `raw/{slug}-research/00-research-status.md` with a depth table. Default slices:

| # | Slice | Typical files | Primary targets |
|---|--------|---------------|-----------------|
| 1 | Business model / segments | `01-overview.md`, `02-business-model.md` | 10-K Item 1, segment notes |
| 2 | Growth engine / product spine | industry-specific (e.g. AI semi, cloud, drug) | IR PR, 10-K, 8-K |
| 3 | Customers / concentration | concentration master | 10-K major customers, 10-Q |
| 4 | Supply / manufacturing / cost | supply master | 10-K, 10-Q commits/inventory |
| 5 | Competition / substitution | competition master | 10-K competition + peer primaries |
| 6 | Regulatory / geo / export | reg master | 10-K Item 1A, trade notes |
| 7 | Financial bridge / FCF / leverage | financials master | IR, 10-Q cash flow, debt |
| 8 | Risks SoR draft | `08-risks-catalysts.md` | Synthesize from 1–7 **after** slices land |

Add or drop a slice only with a written reason (e.g. pure software → light supply).

#### 4b. Parallel fan-out (required in DEEP)

Use **parallel subagents** (or equivalent concurrent tool batches) — **one agent per slice 1–7**, then a **synthesis pass** for risks + entity claims.

Each slice agent must:

1. Prefer **primary** sources (SEC / IR). Web search ≤ ~6 per slice; filings open/read first.  
2. Write vault notes under `raw/{slug}-research/` (or return structured notes for orchestrator to file).  
3. Emit graded claim candidates:  
   `- <fact> (YYYY-MM-DD) [A|B|C] [[source-slug]]`  
4. List **GAPs** and residual questions.  
5. **No** house CONFIRM language; **no** buy/sell/PT/sizing.  
6. **No** invented % or WATCH titles without primary support.

Orchestrator:

- Launch slices **in parallel** (do not serial-skim 1→7 unless forced by tool limits).  
- After all return: reconcile contradictions, dedupe claims, file `wiki/sources/*` distillations, merge into `wiki/entities/{slug}.md`.  
- **Then** draft risk register (section A `### Rn —` + Status/Grade + tripwire tables, before `## B)`). Prefer **6+** risks when evidence supports; default new elevated to **WATCH** only with mechanism + monitors.  
- House stays **FORMING** until they say **GO** in Grok and **`commit_on_go`** writes CONFIRMED. **Do not `propose_house` FORMING.** API refuses it. After research, dump the full house in this terminal and wait. When they say GO, propose CONFIRMED then `commit_on_go`. No CONFIRMED write → TSLA-class miss.  
- **Dump the full proposed house markdown in this Grok Build terminal** in one `markdown` fence (same bar as `/cockpit-propose --session`). Do not stop after compile/Street/health without that dump + pending proposal.  
- Update `00-research-status.md` depth column: Light / Medium / Strong / Deep + primary citations.

#### 4c. Depth bar (DEEP exit criteria)

Do **not** call research “done” until:

| Gate | Minimum |
|------|---------|
| Entity claims | **≥ 25** graded, dated, sourced bullets under Key facts (prefer ≥ 40 when filings rich) |
| Sources | Distillations for **all** claim source-slugs used |
| Slices | **≥ 5** of 7 with Medium+ depth **or** explicit GAP why skipped |
| Primary | At least one **10-K or 20-F-class** filing (or foreign equivalent) when available for the name |
| Risks SoR | Draft R1… with mechanism + **≥ 2** tripwires each (or GAP table) |
| Status file | `00-research-status.md` depth table + residual gaps |
| House closeout | Live CONFIRMED **or** pending **CONFIRMED** proposal (never FORMING) + **full house markdown printed in this terminal**. `node scripts/house-closeout.mjs --slug SLUG` must **PASS**. FORMING on glass is a fail. |
| Register closeout | **After house is CONFIRMED** (GO in Grok + `commit_on_go`). `08` has ≥4 `### Rn` + tripwire tables, **and** pending `add_risk` chips **or** 08 header **ACCEPTED**. Dump **full 08** in this terminal. Then GO → `commit_on_go` kind=register. `node scripts/register-closeout.mjs --slug SLUG` must **PASS**. House not CONFIRMED → this bar **FAIL**s first. |

If the market is thin on primary, document **GAP** and still max out what exists — do not fake Deep.

#### 4d. LIGHT mode only (`--light`)

- Single-threaded overview + 5–10 claims max + stub risks.  
- Mark `00-research-status.md` as **LIGHT pass — deepen required**.  
- Tell user explicitly that book is **not** underwrite-complete.

### 5. Pack

Sequential env, then:

```bash
cd ontology && ./ont compile TICKER && ./ont verify TICKER
```

Verify exit **0** required before treating pack as real.

### 5b. Street bootstrap (default ON — operate handoff, not book SoR)

**When:** After pack verify is green (or best-effort if pack is still thin but desk is registered).  
**Skip if:** `--no-street`, or `--light`, or user explicitly says skip Street.

This step is **separate** from research slices 1–8. Do **not** invent PTs inside business/risk notes.

1. Confirm Street room exists (registry `rooms` includes `street` — factory default).  
2. Run the **Street pipeline** for this desk only — same rules as `/cockpit-street {slug} pipeline`:
   - Complete firm rows only (rating + numeric PT + date + 3–5 sentence why ≥180 chars + https `source_url`)
   - Prefer 5–15 firms; **omit** firms without sources — never invent  
   - Dual format + info verify → publish **only** `research-wiki/cockpit/street/{TICKER}.json`  
   - **Never** write house, risks, or `ontology/store/`; never COMPILE BOOK for Street  
3. If sell-side coverage is too thin for ≥3 complete firms: leave Street **EMPTY**, report **GAP — sparse Street coverage**, tell user to run **REFRESH STREET** later. Do **not** pad with fake desks.  
4. Glass: `#/{slug}/street` — user may need hard-refresh; REFRESH STREET remains the ongoing update path.

House may still be FORMING — that is OK; Street is third-party catalog, not house PT.

### 5c. Desk health gate (mandatory — glass operability)

**When:** After pack verify and Street bootstrap (or skip). **Always run** for deep and light once the desk is in `thin-desks.json`.

This proves **routing/factory**, not book quality. Scar-tissue from NBIS (catalog listed desk; `/api/nbis/*` 404 because slug was reserved).

```bash
cd memory-cockpit-v2
node scripts/desk-health.mjs --slug SLUG
# If glass is running (replace PORT):
node scripts/desk-health.mjs --slug SLUG --base-url http://127.0.0.1:PORT
# DEEP book closeout (mandatory — not the same as routing health):
node scripts/house-closeout.mjs --slug SLUG
node scripts/new-desk-closeout.mjs --slug SLUG
# Stamps 00-research-status.md. Do not claim DEEP done without PASS.
# After house is CONFIRMED (not before):
node scripts/register-closeout.mjs --slug SLUG
# All desks:
npm run test:thin-slug-resolve
npm run test:desk-health
```

| Result | Action |
|--------|--------|
| **PASS** | Desk is operable on glass (process layer; live if base-url given) |
| **FAIL** | **Do not** claim “glass ready.” Report failing check ids (S1 reserved / S2 resolve / S3 live). Fix reserved-slug or registry; restart glass if live fail. **Do not** re-run deep research as the first fix. |
| **house-closeout FAIL** | Live house is still the scaffold **and** there is no pending research-enough proposal (TSLA 2026-09-17). **`propose_house`**, dump the **full markdown in this terminal**, re-run the check. **Do not** claim DEEP done. |
| **register-closeout FAIL** | House not **CONFIRMED** yet, **or** `08` thin, **or** DRAFT with no `add_risk` chips. GO house first (`commit_on_go` / `go-commit.mjs`). Then dump full `08` in Grok, GO, `commit_on_go` kind=register, re-run. |

Routing health may PASS while house-closeout FAILs. Both are required for DEEP. LIGHT may skip house-closeout (book not underwrite-complete).

### 6–7. Human gates (book only) — or scenario agent ACCEPT

6. **House first, then register — same Grok terminal.** Dump full house → **GO** (CONFIRMED + **`commit_on_go` / `go-commit.mjs`**), **SAVE DRAFT** (Grok only), or **EDIT**. **Do not propose FORMING.** When house is **CONFIRMED**, **do not end the session.** Align `08` to that house (add/drop only if they say so) → dump **full `08`** → they say **GO** / **SAVE DRAFT** / **EDIT** → on GO: propose chips → **`commit_on_go` kind=register** → `register-closeout.mjs` **PASS**.  
   Never claim vault written until `commit_on_go`. Never leave DEEP with only the scaffold house. Never treat register as closed while house is FORMING. Never require a second OPEN GROK after house GO. Never propose FORMING. Never `commit_on_go` after SAVE DRAFT or **EDIT**. Do not wait for glass ACCEPT after GO.  

   **Scenario monorepo only** (`.cockpit-scenario.json` with `agent_accept: true`, MCP `COCKPIT_AGENT_ACCEPT=1`):  
   After **DEEP** research + propose house/risks (same bar as kernel — **not** thin seeders), the **test-user agent may ACCEPT**:
   - MCP `agent_accept_status` → must show grant on  
   - `accept_house_proposal` / `accept_risk_proposal` (same write path as glass ACCEPT)  
   - Audit: `research-wiki/cockpit/agent-accept-log.jsonl`  
   - Still **no** invent; decision-support only; no buy/sell/PT/sizing  
   - Factory closeout: `./scripts/scenario-pipeline-e2e.sh <name> --ticker TICKER --port N`  
     (depth gate **fails** if house/claims are thin — see `docs/SCENARIO-DEPTH-LAW.md`)  
   - OPEN GROK **only** from the scenario folder / that glass (wrong pin = wrong books)

7. **After GO writes** — `commit_on_go` tries `./ont compile`. If pack still lags: COMPILE BOOK + REFRESH on glass (book pack only; not Street). Glass is the viewer.

## Playbook paths (relative monorepo)

- `COLD-START.md`  
- `memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md`  
- `scripts/scaffold-new-desk.sh`  
- `scripts` via `memory-cockpit-v2/scripts/desk-health.mjs`  
- `AGENTS.md`  
- `research-wiki/RESEARCH-PATHS.md`

## Output

1. Mode: **DEEP** or **LIGHT** · Street bootstrap: **ran** / **skipped** (`--light` / `--no-street` / GAP)  
2. Monorepo + existing desks  
3. Ticker / slug · scaffold done or skipped  
4. Parallel slice map + which agents ran  
5. Files written · claims count · risks draft count  
6. Depth table summary + residual GAPs  
7. compile/verify status  
8. **Street:** n complete firms published · path `cockpit/street/{TICKER}.json` · or EMPTY/GAP reason  
9. **Desk health:** PASS / FAIL (+ command to re-run `desk-health.mjs`) — required before “glass ready”  
10. Remind: **GO** in this terminal writes CONFIRMED (`commit_on_go`). Do not propose FORMING. Scenario grant may ACCEPT. Street ≠ house PT  

## Footer

Decision-support only. Not book SoR until **GO** (`commit_on_go`) or scenario agent ACCEPT. No buy/sell/PT/sizing. Never propose FORMING to glass.  
**Default is deep parallel research** — opt out with `--light` only.  
**Default includes one Street bootstrap** after pack — opt out with `--no-street` (or `--light`).
