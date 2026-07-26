# Setup: Grok Build + cockpit research OS

**Audience:** New human (or AI helper) with **only this repo** and no prior chat context.  
**Goal:** Glass running locally + Grok Build wired to **cockpit-research** MCP + slash menu (`/cockpit-…`).  
**Decision-support only** — no buy/sell/hold, PT, or sizing.

**Fastest zero-tribal path (Path 2 product shell):**  
[`COLD-START.md`](./COLD-START.md) — `./scripts/bootstrap.sh` → `./scripts/run-glass.sh` → optional MCP.

For architecture and daily rituals after setup, see  
[`memory-cockpit-v2/plans/AGENT-HOST-MCP.md`](./memory-cockpit-v2/plans/AGENT-HOST-MCP.md).

---

## What you get

```text
Glass (browser)              Grok Build (Terminal TUI)
  House EDIT / SAVE            /cockpit slash menu
  ACCEPT agent proposals       MCP tools → pack + house
  COMPILE BOOK / REFRESH       propose_house_view (draft only)
  OPEN GROK button ──────────► opens here in this repo
```

| Layer | Job |
|--------|-----|
| **Glass** | Book UI; human SAVE / ACCEPT; COMPILE |
| **Grok Build** | Chat + MCP (your SuperGrok / X login) |
| **MCP `cockpit-research`** | Read book + file house **proposals** only |
| **Ontology pack** | Compiled claims/risks/house_prior |

**Invariant:** MCP never writes `house-view-*.md`. Only glass **ACCEPT** or **EDIT → SAVE** does.

---

## Prerequisites

| Need | Notes |
|------|--------|
| **macOS** | Current OPEN GROK button uses Terminal + `osascript`. Linux/Windows: run Grok by hand in the repo. |
| **Node 18+** | Glass + MCP server |
| **Python 3** | Ontology `./ont` |
| **Grok Build** | Install: https://x.ai/cli — `curl -fsSL https://x.ai/cli/install.sh \| bash` |
| **Grok login** | SuperGrok or X Premium+ (or whatever plan unlocks Grok Build) |
| **This monorepo** | `memory-cockpit-v2/` + `ontology/` + `research-wiki/` together |

---

## 1. Paths and environment

Assume the clone is:

```text
/ABS/PATH/cockpit-research-os/
  memory-cockpit-v2/
  ontology/
  research-wiki/
  scripts/               # bootstrap, doctor, run-glass, install-grok-mcp
  .grok/                 # slash commands + skill (in git)
  COLD-START.md          # Fresh Mac → green shell
  SETUP-GROK-COCKPIT.md  # this file
```

**Recommended:** scripts derive paths from monorepo root (no hand export):

```bash
cd /ABS/PATH/cockpit-research-os
source scripts/lib/monorepo-env.sh   # prints COCKPIT_* / ONTOLOGY_*
# or just run:
./scripts/bootstrap.sh
```

Manual **absolute** paths (adjust `/ABS/PATH`) if you prefer:

```bash
export COCKPIT_REPO="/ABS/PATH/cockpit-research-os"
export COCKPIT_VAULT="$COCKPIT_REPO/research-wiki"
export ONTOLOGY_WIKI="$COCKPIT_VAULT"
export ONTOLOGY_STORE="$COCKPIT_REPO/ontology/store/by_ticker"
export ONTOLOGY_ROOT="$COCKPIT_REPO/ontology"
export PORT=4681
```

Optional: put these in `~/.zshrc` or a private `memory-cockpit-v2/.env` you **never commit**.

**Anthony’s alternate layout** (`~/Trading/…`) also works if the three trees are separate — set the same env vars to those locations.  
**Monorepo default:** glass + smoke prefer sibling `research-wiki` / `ontology` when env is unset (no `~/Trading` required).

---

## 2. Sanity: packs + doctor

```bash
./scripts/doctor.sh

cd "$COCKPIT_REPO/ontology"
./ont verify NBIS
./ont verify MSFT
# optional: ./ont compile NBIS && ./ont compile MSFT
```

If verify fails, fix pack/wiki before trusting glass or Grok.  
If packs are **absent**, doctor still can pass with warnings — that is an empty/shell state, not permission to invent research.

---

## 3. Glass (website)

**Scripted:**

```bash
./scripts/bootstrap.sh     # npm install + build + doctor
./scripts/run-glass.sh     # http://127.0.0.1:4681
```

**Manual:**

```bash
cd "$COCKPIT_REPO/memory-cockpit-v2"
npm install
npm run build
npm start
```

Open: **http://127.0.0.1:4681**

Thin desks: **NEBIUS** (`#/nbis/…`), **MICROSOFT** (`#/msft/…`) when packs exist.  
Smoke (optional, after code changes; monorepo vault by default):

```bash
npm run smoke
```

**Secrets:** if you enable login, use local `.access.json` / `.session-secret` — never commit.

---

## 4. Wire Grok Build → MCP

**Easiest (recommended on a new Mac / Mini after clone):**

```bash
cd "$COCKPIT_REPO"   # monorepo root
./scripts/install-grok-mcp.sh
# or: ./scripts/bootstrap.sh --with-mcp
```

That script sets monorepo vault/store paths, `npm install` if needed, and runs `grok:mcp-install`.

**Manual** (same env vars as glass):

```bash
cd "$COCKPIT_REPO/memory-cockpit-v2"
npm run grok:mcp-install
```

Check:

```bash
grok mcp list
grok mcp doctor
```

Expect: server **`cockpit-research`** healthy (reads + house/risk propose tools).

MCP config is written to **`~/.grok/config.toml`** (**per machine**, not in git). Paths inside it point at *this clone’s* vault/store. Re-run the install if you move the repo.

**Optional later (Claude Desktop as second host):**

```bash
npm run claude:mcp-install
```

---

## 5. Slash menu (in-repo)

Commands and skill live under **this repo** (not only Anthony’s home):

```text
.grok/commands/cockpit.md
.grok/commands/cockpit-daily.md
.grok/commands/cockpit-risk-check.md
.grok/commands/cockpit-steelman.md
.grok/commands/cockpit-match.md
.grok/commands/cockpit-propose.md
.grok/commands/cockpit-pending.md
.grok/commands/cockpit-desks.md
.grok/skills/cockpit/SKILL.md
```

Grok discovers them when **cwd is the repo** (or a descendant). **OPEN GROK** from glass does that for you.

| Slash | Action |
|-------|--------|
| `/cockpit` | Menu |
| `/cockpit-desks` | List thin desks |
| `/cockpit-daily nbis` | Daily brief: what moved + house + pack risks |
| `/cockpit-daily nbis --save` | Same + save to `research-wiki/cockpit/briefs/daily/nbis/YYYY-MM-DD.md` |
| `/cockpit-risk-check nbis` | Risk due diligence vs tripwires (no status write) |
| `/cockpit-steelman nbis` | Steelman house vs pack WATCH |
| `/cockpit-match nbis` | House ↔ pack check |
| `/cockpit-propose nbis …` | Propose house draft (glass ACCEPT) |
| `/cockpit-pending nbis` | List pending proposals |

Same for `msft`.

---

## 6. First successful run (15 minutes)

1. Glass running on :4681.  
2. `grok mcp doctor` → healthy.  
3. Browser: open a thin desk (e.g. `#/nbis/overview`).  
4. On the book strip or House: **AGENTS** dropdown → pick agent (default **Daily brief**) → **OPEN GROK**.  
   - Terminal should open → `cd` repo → Grok with the matching slash command (e.g. `/cockpit-daily nbis`).  
5. Or open Grok and run slash commands manually (`/cockpit`, `/cockpit-daily nbis`, …).  
   - Expect MCP tool calls + pack-grounded bullets (not generic web essay).  
6. Optional write path:  
   - `/cockpit-propose nbis <minimal intent>` (uses **from_current** replacements — no chat-history mining)  
   - Glass `#/nbis/house` → **REVIEW** → **ACCEPT** or **REJECT**  
   - **COMPILE BOOK** → **REFRESH**  

Manual Grok (no button):

```bash
cd "$COCKPIT_REPO"
grok "/cockpit"
```

---

## 7. Permissions (what is allowed)

| Actor | May |
|-------|-----|
| **Grok / MCP** | Read house, pack snapshot, assist context; **propose** house markdown to `research-wiki/cockpit/proposals/house-<slug>.json` |
| **Glass user** | EDIT → SAVE house; ACCEPT/REJECT proposals; COMPILE/REFRESH |
| **Nobody via MCP** | Write `house-view-*.md` or `ontology/store/` silently |

House SAVE is allowlisted to vault-root `house-view-*.md` per desk only.

---

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `grok mcp doctor` fails / 0 tools | Re-run `npm run grok:mcp-install` with env set; new Grok session |
| Slash `/cockpit` missing | Start Grok with cwd = `cockpit-research-os` (use OPEN GROK) |
| OPEN GROK does nothing | macOS only; glass must be localhost; allow Terminal; check `COCKPIT_REPO` |
| Grok invents facts | Force tools: “use cockpit-research MCP only”; compile pack if stale |
| Propose but glass empty | Hard-refresh House; `GET /api/{slug}/house/proposals?status=pending` |
| Wrong vault paths | Defaults may point at `~/Trading/…` — always set `COCKPIT_VAULT` for this clone |
| Pack empty / verify fail | `./ont compile TICKER` then glass COMPILE BOOK |

---

## 9. Related files (map)

| File | Role |
|------|------|
| **This file** | Cold-start setup |
| [`memory-cockpit-v2/plans/AGENT-HOST-MCP.md`](./memory-cockpit-v2/plans/AGENT-HOST-MCP.md) | Architecture + daily ritual |
| [`AGENTS.md`](./AGENTS.md) | Hard rules for any agent |
| [`GENERAL-CONTEXT.md`](./GENERAL-CONTEXT.md) | Full project state |
| [`memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md`](./memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md) | Add another company |
| [`memory-cockpit-v2/plans/THIN-DESK-CONTRACT.md`](./memory-cockpit-v2/plans/THIN-DESK-CONTRACT.md) | Thin desk law |

---

## 10. Quick checklist (copy)

**Product shell (Path 2 — no invent):**

- [ ] `./scripts/bootstrap.sh`  
- [ ] `./scripts/doctor.sh` exit 0  
- [ ] `./scripts/run-glass.sh` → http://127.0.0.1:4681 loads  

**Grok agents (optional):**

- [ ] Grok Build installed + logged in  
- [ ] `./scripts/install-grok-mcp.sh` && `grok mcp doctor` healthy  
- [ ] OPEN GROK or `cd $COCKPIT_REPO && grok "/cockpit"`  
- [ ] `/cockpit-steelman nbis` uses tools and returns pack-grounded answer (if NBIS pack present)  

**Packs (if sample content in clone):**

- [ ] `cd ontology && ./ont verify NBIS` (and MSFT)  

Done for **shell** when doctor + glass load. Done for **operate** when MCP + pack-grounded slash work.  
New company after green: [`NEW-DESK-PLAYBOOK.md`](./memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md) — never fake Part 1.
