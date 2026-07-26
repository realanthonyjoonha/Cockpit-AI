---
description: Underwrite a NEW thin desk — deep research default (parallel subagents); human CONFIRM/ACCEPT
argument-hint: "[TICKER] [optional display name] [--light]"
---

Parse `$ARGUMENTS`: optional **TICKER** (e.g. AVGO), optional display name, optional **`--light`**.  
If ticker missing, **ask once**. Do not invent a ticker.

**Job:** Help the user **start a new company desk** in **this monorepo** (glass START → Build next company).  
This is **underwrite**, not operate-on-desk (not daily / steelman on an existing book).

## Default research mode: DEEP (parallel)

| Mode | When | Bar |
|------|------|-----|
| **DEEP (default)** | Always unless user says `--light` / “quick pass” | Multi-slice primary research, parallel agents, depth table, ≥ claims floor |
| **LIGHT** | Only if user explicitly opts in | Scaffold + thin overview only; mark residual GAPs loudly |

**Do not** ship a “done” underwrite after a single web summary or one 10-K skim. Light mode is the exception.

## Hard rules

1. **Decision-support only** — no buy/sell/hold, price targets, or position sizing.  
2. **Never invent** graded claims, CONFIRMED house stance, or WATCH risk register to “finish” a desk.  
3. **Human owns** house CONFIRM and risk ACCEPT on glass. Agents may **propose** only.  
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
- House stays **FORMING** unless user explicitly confirms stance text.  
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

### 6–7. Human gates

6. **House + risks** — user CONFIRM house + ACCEPT risks on glass (`#/{slug}/house`, `#/{slug}/risks`).  
   Agents use propose tools only; never claim vault written until ACCEPT.  
7. **After ACCEPT** — COMPILE BOOK + REFRESH on glass.

## Playbook paths (relative monorepo)

- `COLD-START.md`  
- `memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md`  
- `scripts/scaffold-new-desk.sh`  
- `AGENTS.md`  
- `research-wiki/RESEARCH-PATHS.md`

## Output

1. Mode: **DEEP** or **LIGHT**  
2. Monorepo + existing desks  
3. Ticker / slug · scaffold done or skipped  
4. Parallel slice map + which agents ran  
5. Files written · claims count · risks draft count  
6. Depth table summary + residual GAPs  
7. compile/verify status  
8. Remind glass CONFIRM/ACCEPT — not book SoR until then  

## Footer

Decision-support only. Not book SoR until human gates. No buy/sell/PT/sizing.  
**Default is deep parallel research** — opt out with `--light` only.
