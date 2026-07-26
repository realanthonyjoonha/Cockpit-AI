# General Context — Cockpit Research OS

**As-of:** 2026-07-22  
**Audience:** Anthony, collaborators, and agents picking up the project  
**Posture:** Decision-support only — no buy/sell/hold, price targets, or position sizing  

**Private GitHub:** [realanthonyjoonha/cockpit-research-os](https://github.com/realanthonyjoonha/cockpit-research-os)

### Agent / collaborator entry

| Order | Open |
|-------|------|
| **1st** | **`AGENTS.md` at repository root** — hard rules, read order, commands |
| **2nd** | **This file** (`GENERAL-CONTEXT.md`) — full state, runbook, limits, Path 1/2 |
| **3rd** | Task-specific docs (index in §8) |

If you forked/cloned and you are an agent: **stop and read root `AGENTS.md` before editing anything.**

**Live machine roots (default):**

```text
~/Trading/memory-cockpit-v2/   # glass + API
~/Trading/ontology/            # packs, compile, verify, ask
~/Trading/research-wiki/       # vault (research + Memory cockpit data)
```

Related maps: `ARCHITECTURE-FLOW.txt` · `NOW-VS-PATH1-2.txt` · `NEW-DESK-PLAYBOOK.md` · `THIN-DESK-CONTRACT.md` · `ontology/PART1-GATE.md` · `research-wiki/RESEARCH-PATHS.md`

---

## 1. What this project is

A personal **research operating system** for investment **decision-support**:

1. **Research files** live in a markdown wiki (graded claims, house views, risks).  
2. An **ontology engine** compiles those files into per-ticker **packs**.  
3. A **cockpit (glass)** reads packs + vault and presents thin company desks + a Memory specialist desk.  

Humans own priors (house CONFIRM, risk ACCEPT). Agents and glass must not invent advice or silently rewrite house.

---

## 2. Current state (honest)

| Layer | Status |
|-------|--------|
| Research wiki | Active — Memory corpus + Nebius + Microsoft factories |
| Ontology packs | **MU**, **NBIS**, **MSFT** compile + store |
| Part 1 gate | `./ont verify TICKER` structural fail-closed |
| Glass | Running product on Anthony’s Mac |
| Memory desk | Full specialist (series, margins, street, leverage, nowcast, …) |
| Thin desks | **NEBIUS** + **MICROSOFT** — shared chrome, registry-driven |
| Ask | Deterministic pack Q&A (not an LLM) |
| COMPILE BOOK / REFRESH | On glass for thin desks |
| Write path on glass | **`meta_only`** (paths + ritual + compile) — not full pins UI |
| Tests | format-check, smoke, rigor, Ask goldens (NBIS + MSFT), `ont verify` |
| Dogfood | Thin desks reported working on glass |
| Cold start for strangers | **Not productized** (works as tribal setup on this Mac) |
| Path 1 (edits + agents) | **Not built** as product (plan only) |
| Path 2 (bootstrap + factory) | **Partial** — playbooks exist; server still per-ticker clones |

**One line:** Read path is reliable for two thin books + Memory; write/agents and empty-machine bootstrap are the next product surface.

---

## 3. What we have accomplished

### Research & ontology

- Graded claim discipline and binding path map (`RESEARCH-PATHS.md`).  
- Nebius and Microsoft Part 1-style books (house CONFIRMED, risks accepted, packs green).  
- Memory/MU underwrite pack + large vault data plane (`cockpit/series`, risks, street, margins, …).  
- `./ont compile` / `ask` / `agent` / **`verify`** (Part 1 structural gate).  
- Agent closeout skill: file → compile → **verify exit 0** → handback (`research-to-ontology`).

### Cockpit (glass)

- Production Memory desk (read-heavy specialist instruments).  
- Thin ontology desks for **NBIS** and **MSFT** with shared rooms:  
  overview · risks · house · sources · ask · update.  
- **Thin-desk contract** v1.1: COMPILE BOOK, REFRESH, `meta.thin_desk_contract`, parity group.  
- **UP-C** decision: `write_path_mode = meta_only` for all thin desks.  
- Shared UI: `src/pages/thin/*` + `DeskRouter` + `config/thin-desks.json` (no layout fork per ticker).  
- Fail-closed automation:  
  - `npm run format-check`  
  - `npm run smoke` / `smoke -- --render`  
  - `npm run smoke:rigor`  
  - Ask goldens per desk (`scripts/<slug>-ask-goldens.json`)  
- Architecture docs: dual **Path A/B**, two loops (research vs UI), NOW vs Path 1/2 map.  
- Private GitHub export of cockpit + ontology + wiki for backup and collab.

### Explicitly *not* claimed as done

- Full curated write UX (house/risks from glass as product).  
- Productized multi-agent briefs on glass.  
- Zero→first-desk installer for a clean machine.  
- Generic thin **server** factory (UI shared; `nbisModel`/`msftModel` still twins).  
- LLM Ask in glass (intentionally avoided for trust).

---

## 4. How to run what is currently built

### Prerequisites

- macOS (current deployment), Node 18+ recommended, Python 3 for ontology.  
- Trees at default paths above (or set env vars — see below).  
- Optional: Chrome for `smoke -- --render` / rigor DOM checks.

### Environment overrides

| Variable | Default |
|----------|---------|
| `COCKPIT_VAULT` | `~/Trading/research-wiki` |
| `ONTOLOGY_STORE` | `~/Trading/ontology/store/by_ticker` |
| `ONTOLOGY_WIKI` | `~/Trading/research-wiki` |

Pack JSON may still contain **absolute** `source_roots` for this Mac; recompile on another machine may need path fixes. Compiled `store/by_ticker/*.json` is enough for **read** glass.

### Ontology (research engine CLI)

```bash
cd ~/Trading/ontology

./ont compile MU|NBIS|MSFT     # rebuild pack from wiki
./ont verify MU|NBIS|MSFT      # Part 1 structural gate — exit 0 required after research
./ont ask MSFT "house view"
./ont ask NBIS "what's on watch?"
./ont agent MSFT "<underwrite question>"   # context block for agents

# After human CONFIRM house + ACCEPT risks (stricter):
./ont verify MSFT --require-confirmed --require-risks-accepted
```

**Spec:** `ontology/PART1-GATE.md` · **Agent wire:** `ontology/AGENTS.md`

### Research filing (agents / humans)

1. Paths only from `research-wiki/RESEARCH-PATHS.md`.  
2. Claims: `- fact (YYYY-MM-DD) [A|B|C] [[source-slug]]`  
3. House files only on **explicit** save.  
4. Closeout: compile + **`./ont verify TICKER` exit 0** + handback (skill `research-to-ontology`).  
5. Thin glass: **COMPILE BOOK** and/or **REFRESH** so UI matches pack.

### Cockpit (glass)

```bash
cd ~/Trading/memory-cockpit-v2
npm install
npm run build
npm start                    # or existing launchd: com.memory-cockpit.server

# Gates before trusting a glass change
npm run format-check
npm run smoke                # API + contract + goldens
npm run smoke:rigor          # structure + API parity + headless chrome flags
npm run test:thin            # format + rigor + smoke --render
```

**Auth:** local `.access.json` / `.session-secret` — **never commit** (not in private repo).

**Typical use:** open glass → switch MEMORY | NEBIUS | MICROSOFT → walk rooms → Ask chips → Update ritual → COMPILE BOOK / REFRESH.

### Clone from private GitHub

```bash
gh repo clone realanthonyjoonha/cockpit-research-os
# Place or symlink as ~/Trading/{memory-cockpit-v2,ontology,research-wiki}
# or set COCKPIT_VAULT / ONTOLOGY_* 
cd memory-cockpit-v2 && npm install && npm run build && npm start
```

Secrets and launchd units are machine-local.

---

## 5. Strengths

| Strength | Why it matters |
|----------|----------------|
| **Two-loop architecture** | Research (`verify`) vs UI (`smoke`) failures stay separable |
| **Fail-closed gates** | Pack structure and multi-desk chrome drift get red builds |
| **Shared thin chrome** | Third desk shouldn’t mean forking Overview/Risks pages |
| **Deterministic Ask** | Testable; no inventing numbers in the “book Q&A” path |
| **Human-owned house** | Priors aren’t auto-confirmed by models |
| **Decision-support posture** | Refusal routes and contract language reduce advice leakage |
| **Real books, not demos** | NBIS + MSFT research + Memory vault are production content |
| **Documented Path B** | Add-company playbook exists even before factory |
| **Private collab surface** | `cockpit-research-os` holds the product trees without dumping all of `Trading/` |

---

## 6. Limitations (current)

| Limitation | Detail |
|------------|--------|
| **Write UX thin** | Glass Update is meta_only; most edits are still files/CLI |
| **No product agents on glass** | Risk/daily/catalyst briefs not shipped as first-class features |
| **Server still forked** | `nbis*` / `msft*` modules duplicated — Path B still costs copy-paste |
| **Cold start not packaged** | Friend/empty Mac needs path tribal knowledge + README |
| **MU recompile path** | Pack may reference `memory-thesis/output` outside this tree |
| **Absolute paths in packs** | `source_roots` may hardcode `/Users/anthonyha/Trading/...` |
| **Memory ≠ thin template** | Specialist desk is intentionally different; no “parity” goal |
| **Catalysts on thin desks** | Parked while pack rows can be noisy |
| **Pins asymmetric** | Propose API/CLI still NBIS-oriented; thin mode is meta_only |
| **Skills outside repo** | `~/.grok/skills/*` not fully vendored in GitHub tree |
| **Not multi-tenant SaaS** | Single-operator local product |
| **Content quality ≠ automated** | Verify checks structure; thesis quality stays human |

---

## 7. Plan — Path 1 and Path 2 integration

### 7.1 Two paths (product forks)

| Path | Name | Job |
|------|------|-----|
| **1** | **Operate** | Curated content edits + pack-grounded agents on the **live** cockpit |
| **2** | **Bootstrap & scale** | Cold start from empty + thin server factory + **Path B** add company |

```text
PATH 2                              PATH 1
cold start → first glass  ────────► live desks → edits + agents
                 │
                 └── Path B: add company N (factory + registry + Part 1)
```

**Today Anthony is at the live-glass node.** Path 1 is highest day-to-day value; Path 2 is reproducibility and cheap multi-desk scale (and friend setup).

**Collab default:** Anthony → Path 1; friend → Path 2 (can swap by strength).

### 7.2 Shared spine (never abandon)

```text
research files → ./ont compile → ./ont verify → pack → glass
thin contract + smoke/rigor
decision-support only · human house · no LLM as book SoR
```

Path 1 and Path 2 **both** sit on this spine. They must not invent a second source of truth.

### 7.3 Path 1 — Operate (MVP scope)

1. **Allowlist v0** — exact allowed content edits; forbid format/free HTML/advice.  
2. **House edit** — explicit save only.  
3. **Risk mutations** — add / edit / status / retire → SoR files → compile + verify + tests.  
4. **On-demand desk agent** — pack-first; refusal on buy/sell/PT/sizing.  
5. **Risk register brief** — from pack risks only; gaps explicit.  
6. **Daily brief** — house + WATCH + optional log; no invent.  
7. **Catalyst brief** — only if catalysts clean; else honest GAP.

**Done when:** house + risks mutable under tests; 2–3 agents usable without lying about the book.

### 7.4 Path 2 — Bootstrap & scale (MVP scope)

1. **Thin server factory** — parameterize model/ask/compile; stop desk clones.  
2. **Cold-start playbook + init scripts** — empty → vault layout → first pack → first desk → smoke.  
3. **Path B exercise** — real company when research-ready (no fake vault pollution).  
4. Path notes for clone (`COCKPIT_VAULT`, pack `source_roots`).

**Done when:** documented/scripted zero→green desk; desk #N does not require 500-line copy-paste.

### 7.5 Integration order (priority stack — not a calendar)

Work proceeds in **slices** when free time allows (full-time job reality). Order matters more than dates:

```text
1. Allowlist (Path 1 law)
2. Mutations + tests (Path 1)
3. Server factory (Path 2 / unlocks B)
4. Cold-start scripts + playbook (Path 2)
5. Agents on glass (Path 1)
6. Path B real company when research exists
7. Harden only what dogfood breaks
```

**Do not** one-shot both paths in a single mega PR.  
**Do not** mix research-loop refactors and UI-loop refactors without separate gates.

### 7.6 Integration rules

| Rule | |
|------|--|
| Research green before new desk trust | `ont verify` before relying on glass for a new name |
| UI green before merge | `npm run test:thin` (or smoke + rigor) for glass changes |
| Agents read pack / propose files | They do not invent store or auto-CONFIRM house |
| Allowlist is binding for Path 1 writes | No free-form “edit the website” |
| Factory is binding for Path 2 scale | New desks use shared server path + registry |
| Private repo stays the collab SoR for product trees | Not all of `~/Trading` |

### 7.7 Explicit non-goals (near term)

- LLM freestyle Ask as book truth  
- Memory ↔ thin desk feature parity  
- `research-os` as product SoR  
- Auto-compile on every keystroke  
- Public SaaS packaging  
- Fake third company only to “test Path B”

---

## 8. Instruction index (existing docs)

| Need | Document |
|------|----------|
| Where to put research files | `research-wiki/RESEARCH-PATHS.md` |
| Wiki agent rules | `research-wiki/CLAUDE.md` |
| Ontology agent contract | `ontology/AGENTS.md` |
| Part 1 verify gate | `ontology/PART1-GATE.md` |
| Ontology orientation | `ontology/README.md` · `CONTRACT.md` |
| Filing closeout | skill `research-to-ontology` |
| Underwrite read path | skill `ontology-underwrite` |
| Dual path A/B architecture | `plans/ARCHITECTURE-FLOW.txt` |
| Now vs Path 1/2 diagrams | `plans/NOW-VS-PATH1-2.txt` |
| Add company checklist | `plans/NEW-DESK-PLAYBOOK.md` |
| Thin desk law | `plans/THIN-DESK-CONTRACT.md` · `THIN-DESK-UI-PARITY.md` |
| **This file** | `plans/GENERAL-CONTEXT.md` |

---

## 9. One-frame summary

```text
NOW
  Reliable read glass: Memory + NEBIUS + MSFT
  Research engine: compile + verify + graded wiki
  Writes/agents/bootstrap: manual or planned

TARGET (Path 1 + Path 2 integrated)
  Same honest read spine
  + curated edits and pack-grounded agents (Path 1)
  + reproducible cold start and cheap multi-desk (Path 2)
  without turning the book into an untested chatbot
```

---

*Living doc — update when a path MVP ships or the dual-desk set changes. Decision-support only.*
