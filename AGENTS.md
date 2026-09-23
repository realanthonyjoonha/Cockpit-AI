# AGENTS.md — read this first

**You are working in Anthony’s cockpit research OS (private repo).**  
Cold session (trees, build, ship, which docs are stale): **[`docs/SESSION.md`](./docs/SESSION.md)**.  
If you only open one file after clone/fork, open **SESSION.md**, then **this** for hard law.

---

## Easy mode (Anthony’s cognitive load)

Anthony should **not** re-derive kernel / product / scenario every turn.  
**You** own trees, factory scale, and ship gates. He only picks a **mode**:

| Human says | You do |
|------------|--------|
| **Operate** / desk research | `OPERATE.md` + slash agents · **kernel** MCP pin · no ship |
| **Build** / new feature | **`/cockpit-feature`** · brief first · PLATFORM · factory only · no push |
| **Ship** | **`/cockpit-ship`** · privacy + lab-e2e + release-check · push **only** if he says **push** |

Cold map: **[`docs/SESSION.md`](./docs/SESSION.md)**. Modes: **[`docs/EASY.md`](./docs/EASY.md)**.  
Scalability law: desk **N** gets features via **registry + thin templates** — never per-ticker forks.  
Friends get shell via `friend-upgrade` — **never** his research books.

---

## 0. Mandatory posture (never violate)

1. **Decision-support only** — no buy/sell/hold, price targets, or position sizing.  
2. **Do not invent** facts, claims, risks, or house views. Prefer pack + vault.  
3. **House + risk register are human-owned** — write on user **GO** (`commit_on_go`) or glass **ACCEPT** of a **CONFIRMED** proposal. Never propose FORMING to glass. MCP must **not** claim the vault is written until `commit_on_go` or ACCEPT. Glass: `#/{desk}/risks`.  
4. **Never hand-edit** `ontology/store/` (compile output only). After GO / ACCEPT: **COMPILE BOOK** if pack lags.  
5. **Daily briefs are not pack input** — `cockpit/briefs/` is ops archive only.  
6. **Never commit secrets** — `.access.json`, `.session-secret`, `.env`.  
7. **Scale by factory** — no new per-ticker UI/server forks for operate features (see `PROJECT-STATE.md`).  
8. **Ship to friends = platform only** — never vault/house/packs/desks. After platform work: `./scripts/lab-e2e.sh` **and** `./scripts/release-check.sh --full` before claiming friends can upgrade. **No git push** unless human asks. See `RELEASE.md` · daily use `OPERATE.md` · easy modes `docs/EASY.md`.  
9. **Feature work** — run **`/cockpit-feature`** (mandatory brief). Before “implement done”: `./scripts/feature-ready.sh` when available.

---

## 1. What this repo is (30 seconds)

```text
research-wiki/     →  research files (vault)
ontology/          →  compile / verify / ask / packs
memory-cockpit-v2/ →  website (glass) + API
```

**This kernel tree** is the dogfood monorepo (thin desks in `memory-cockpit-v2/config/thin-desks.json`).  
**Product** (`~/Desktop/cockpit-product` / Cockpit-AI) is the friend empty shell (`desks: []`).  
**Ask on glass** = deterministic pack Q&A (**not** an LLM). Desk list SoR is the registry in the tree you are in — do not trust older “NEBIUS + MICROSOFT only” or “0 desks” lines elsewhere.

---

## 2. Read order (do this in order)

| # | File | Why |
|---|------|-----|
| **1** | **[`docs/SESSION.md`](./docs/SESSION.md)** | Trees, modes, build/ship scars (start here) |
| **2** | **This file** (`AGENTS.md`) | Hard rules |
| **3** | **[`docs/EASY.md`](./docs/EASY.md)** | Operate / Build / Ship |
| **4** | Task table below | Only what you need |
| **5** | [`PROJECT-STATE.md`](./PROJECT-STATE.md) | Longer handoff — may lag desk count; registry is SoR |

**New human / Fresh Mac (no prior context):**  
[`docs/SESSION.md`](./docs/SESSION.md) → [`COLD-START.md`](./COLD-START.md) (product shell scripts) → this file.

### Task → open next

| If the user asks you to… | Open |
|--------------------------|------|
| **Easy modes** / stop tracking trees | **`docs/EASY.md`** · `/cockpit-feature` · `/cockpit-ship` |
| Build platform / glass / agents / AFK feature loop | **`/cockpit-feature`** → **`docs/DEVELOP.md`** · blank E2E **`docs/LAB.md`** / `lab-e2e.sh` · ship → **`/cockpit-ship`** / **`RELEASE.md`** |
| Ship to friends / “can we push” | **`/cockpit-ship`** · **`RELEASE.md`** · never books |
| Multi-instance / many glasses (eng) | **`docs/MULTI-INSTANCE.md`** · `./scripts/run-glass-instance.sh PORT` |
| Parallel test scenarios + MCP pin safety | **`docs/SCENARIO-PIN.md`** · `./scripts/scenario-up.sh A --port 4691 --slugs …` |
| Grok as first-time customer / test feature from scratch | **`docs/CUSTOMER-SIM.md`** · `/cockpit-customer-sim` · `./scripts/customer-sim-preflight.sh` |
| **Cursor Project e2e** / isolated Filings dogfood | **`docs/CURSOR-E2E.md`** · `./scripts/dogfood-e2e.sh` · MCP `.cursor/mcp.json` |
| Daily operate / which agent for what | **`OPERATE.md`** |
| Ship platform to friends / dual-tree | **`RELEASE.md`** + `./scripts/release-check.sh --full` + `docs/PRODUCT-KERNEL-SOR.md` |
| Product vs kernel drift / mirror agents | **`docs/PRODUCT-KERNEL-SOR.md`** + `./scripts/sync-agent-surface.sh` |
| Glass desk dead but pack green | `memory-cockpit-v2/scripts/desk-health.mjs` + `test:thin-slug-resolve` |
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
~/Desktop/cockpit-kernel                 # build / dogfood (this file’s tree)
~/Desktop/cockpit-kernel/memory-cockpit-v2
~/Desktop/cockpit-kernel/ontology
~/Desktop/cockpit-kernel/research-wiki
~/Desktop/cockpit-product                # friend empty shell
~/cockpit-personal/repo                  # Grok Bot twin — not factory SoR
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
| **1** | Operate live glass | **Built** (factory thin desks + agents; human ACCEPT) | House/risks propose→ACCEPT, pack-grounded slash agents |
| **2** | Bootstrap + scale | **Built** (cold-start + registry + `pages/thin/*`) | New company via playbook, not per-ticker UI forks |

**Today:** operate is factory-shaped (`pages/thin/*` + `thin-desks.json` + shared server). Do not add `server/{ticker}*.js` or `pages/{ticker}/` operate forks.

**Operate ↔ factory:** daily/steelman/propose/… must scale from **registry + templates + pack/house**. Desk #N needs zero new UI code. See `docs/SESSION.md` · `GENERAL-CONTEXT.md` §7.2 · `memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md`.

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

If the human said operate / build / ship, follow [`docs/SESSION.md`](./docs/SESSION.md) — do not ask them to pick a tree.

---

*After this file → [`docs/SESSION.md`](./docs/SESSION.md) if you skipped it. `GENERAL-CONTEXT.md` is history, not the live desk list.*
