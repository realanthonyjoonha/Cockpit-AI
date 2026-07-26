# AGENTS.md — read this first

**You are working in Anthony’s cockpit research OS (private repo).**  
If you only open one file after clone/fork, open **this**, then the links below.

---

## 0. Mandatory posture (never violate)

1. **Decision-support only** — no buy/sell/hold, price targets, or position sizing.  
2. **Do not invent** facts, claims, risks, or house views. Prefer pack + vault.  
3. **House + risk register are human-owned** — write only on explicit save **or** glass **ACCEPT** of an agent proposal.  
   MCP may **propose** house/risks but must **not** claim vault is written until ACCEPT.  
4. **Never hand-edit** `ontology/store/` (compile output only). After risk/house ACCEPT: **COMPILE BOOK**.  
5. **Daily briefs are not pack input** — `cockpit/briefs/` is ops archive only.  
6. **Never commit secrets** — `.access.json`, `.session-secret`, `.env`.  
7. **Scale by factory** — no new per-ticker UI/server forks for operate features (see `PROJECT-STATE.md`).

---

## 1. What this repo is (30 seconds)

```text
research-wiki/     →  research files (vault)
ontology/          →  compile / verify / ask / packs
memory-cockpit-v2/ →  website (glass) + API
```

**Live product today:** Memory desk + thin desks **NEBIUS** + **MICROSOFT**.  
**Ask on glass** = deterministic pack Q&A (**not** an LLM).

---

## 2. Read order (do this in order)

| # | File | Why |
|---|------|-----|
| **1** | **This file** (`AGENTS.md`) | Hard rules |
| **2** | **[`PROJECT-STATE.md`](./PROJECT-STATE.md)** | **Current handoff:** what’s built, philosophy, operate surface, next work |
| **3** | [`GENERAL-CONTEXT.md`](./GENERAL-CONTEXT.md) | Longer history, Path 1/2 plan, runbook |
| **4** | [`research-wiki/RESEARCH-PATHS.md`](./research-wiki/RESEARCH-PATHS.md) | Where every research file goes |
| **5** | [`ontology/AGENTS.md`](./ontology/AGENTS.md) | Underwrite + pack-first commands |
| **6** | [`ontology/PART1-GATE.md`](./ontology/PART1-GATE.md) | `ont verify` gate |
| **7** | By task (below) | Only what you need |

**New human / Fresh Mac (no prior context):**  
[`COLD-START.md`](./COLD-START.md) (product shell scripts) → [`SETUP-GROK-COCKPIT.md`](./SETUP-GROK-COCKPIT.md) (Grok detail) → this file + `PROJECT-STATE.md`.

### Task → open next

| If the user asks you to… | Open |
|--------------------------|------|
| “Where are we?” / continue after git pull | **`PROJECT-STATE.md`** |
| Underwrite / “what’s on watch” / thesis | `ontology/AGENTS.md` then `./ont agent TICKER "…"` **or** Grok MCP `/cockpit-steelman` / `/cockpit-risk-check` |
| Grok MCP / OPEN GROK / house or risk propose→accept | [`SETUP-GROK-COCKPIT.md`](./SETUP-GROK-COCKPIT.md) + [`memory-cockpit-v2/plans/AGENT-HOST-MCP.md`](./memory-cockpit-v2/plans/AGENT-HOST-MCP.md) + [`WRITE-PATH-RISKS.md`](./memory-cockpit-v2/plans/WRITE-PATH-RISKS.md) |
| File or save research | `research-wiki/RESEARCH-PATHS.md` + closeout: compile + **`./ont verify` exit 0** |
| Change glass / thin desks | `memory-cockpit-v2/plans/THIN-DESK-CONTRACT.md` |
| Add a company | `memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md` |
| Understand Path 1 vs Path 2 | `GENERAL-CONTEXT.md` §7 + `memory-cockpit-v2/plans/NOW-VS-PATH1-2.txt` |
| Full architecture | `memory-cockpit-v2/plans/ARCHITECTURE-FLOW.txt` |

---

## 3. Layout (do not invent paths)

```text
.
├── AGENTS.md                 ← you are here
├── COLD-START.md             ← Fresh Mac → green shell (Path 2)
├── GENERAL-CONTEXT.md        ← full context
├── README.md                 ← human + agent quick start
├── scripts/                  # bootstrap, doctor, run-glass, install-grok-mcp
├── memory-cockpit-v2/        # glass
├── ontology/                 # engine
└── research-wiki/            # vault
```

Default runtime paths on Anthony’s Mac:

```text
~/Trading/memory-cockpit-v2
~/Trading/ontology
~/Trading/research-wiki
```

If the clone is elsewhere, set:

- `COCKPIT_VAULT` → absolute path to `research-wiki`
- `ONTOLOGY_WIKI` → same vault
- `ONTOLOGY_STORE` → `…/ontology/store/by_ticker`

---

## 4. Commands you may run

### Ontology (always from `ontology/`)

```bash
cd ontology
./ont verify MSFT          # must exit 0 after research filing
./ont verify NBIS
./ont compile MSFT         # after file changes
./ont ask MSFT "house view"
./ont agent MSFT "…"       # underwrite context — answer FROM this
```

Tickers in pack: **MU** · **NBIS** · **MSFT**.

### Glass (from `memory-cockpit-v2/`)

```bash
cd memory-cockpit-v2
npm install && npm run build && npm start
npm run test:thin          # before merging glass changes
```

### Research closeout (after writing wiki files)

```text
files written
  → ./ont compile TICKER
  → ./ont verify TICKER     # exit 0 required — "looks good" is NOT done
  → remind COMPILE BOOK / REFRESH on glass if thin desk exists
```

Claim format:

```markdown
- <fact> (YYYY-MM-DD) [A|B|C] [[source-slug]]
```

---

## 5. Two product paths (do not mix in one PR)

| Path | Name | Status | Work |
|------|------|--------|------|
| **1** | Operate live glass | **Not built** (plan) | Allowlisted edits (house/risks) + pack-grounded agents |
| **2** | Bootstrap + scale | **Partial** | Cold-start scripts, server factory, add company |

**Today:** read path is strong; writes are mostly files; server still per-ticker clones.

**Operate ↔ factory:** Path 1 agents (daily, steelman, propose, …) must scale from **registry + templates + pack/house** — not per-ticker forks. Factory incomplete if desk #N needs hand-copied seeds/server/UI. See `GENERAL-CONTEXT.md` §7.2 · checklist `memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md` §D.

Stack when building (priority order): allowlist → mutations+tests → factory → cold-start → agents → real company #3.

Details: [`GENERAL-CONTEXT.md`](./GENERAL-CONTEXT.md).

---

## 6. Hard “don’t”

| Don’t | Why |
|-------|-----|
| Invent pack claims or risks | Breaks trust |
| Auto-CONFIRM house | Human gate |
| Edit `ontology/store/**` by hand | Overwritten by compile |
| Fork `pages/nbis` layout copies | Use `pages/thin/*` + registry |
| Add LLM as book source of truth | Ask is deterministic by design |
| Buy/sell/PT/sizing language | Decision-support only |
| Fake third company to “test” | Vault pollution |
| Commit `.access.json` / secrets | Security |

---

## 7. Done means gates green

| Change type | Gate |
|-------------|------|
| Research files | `./ont compile TICKER` + `./ont verify TICKER` exit **0** |
| Glass / thin desks | `npm run test:thin` (or format-check + smoke + rigor) |
| New thin desk | Part 1 verify green **then** registry + server (see playbook) |

---

## 8. Owner map (human collab)

| Path | Default owner |
|------|----------------|
| Path 1 (edits, agents, dogfood) | Anthony |
| Path 2 (factory, bootstrap, Path B wiring) | Collaborator / friend |

If unsure which path a task is on, **ask the human** before coding.

---

*After this file → read `GENERAL-CONTEXT.md` for full state, runbook, strengths, limits, and Path 1/2 plan.*
