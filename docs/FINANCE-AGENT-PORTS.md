# Finance agent ports (Claude patterns → Cockpit)

**As-of:** 2026-08-01  
Decision-support only. Port **patterns**, not proprietary Claude skill dumps. No buy/sell/PT/sizing as product SoR.

## Claude ecosystem (research notes)

| Source class | Examples | Steal |
|--------------|----------|--------|
| Anthropic FS + Skills | DCF skills, initiating coverage, Excel add-in, skills framework | Structure of coverage + model workflows |
| Claude Code playbooks | 3-statement, DCF, LBO generators | Assumptions-first, sensitivity tables |
| Prompt libraries | Comps, IC memos, unit economics | Section skeletons |
| Model audit usage | Excel formula review | Consistency checks vs pack |

## Cockpit Phase 1 agents

| Agent | Status | Slash | Overview menu |
|-------|--------|-------|----------------|
| Research | **Shipped** | `/cockpit-research` | Research |
| Coverage | **Shipped** | `/cockpit-coverage` | Coverage note |
| Comps | **Shipped** | `/cockpit-comps` | Comps |
| Model bridge | **Shipped** | `/cockpit-model-bridge` | Model bridge |
| Model audit | **Shipped** | `/cockpit-model-audit` | Model audit |

## EBITDA agents (Phase 1.5)

| Agent | Status | Slash | Overview menu |
|-------|--------|-------|----------------|
| EBITDA bridge | **Shipped** | `/cockpit-ebitda-bridge` | EBITDA bridge |
| EBITDA quality | **Shipped** | `/cockpit-ebitda-quality` | EBITDA quality |

Shared ritual: load pack+house → require user input → report → ask save → yes → `raw/{slug}-research/<kind>-*.md` → `./ont compile` → Sources (non-primary).  
EBITDA kinds: `ebitda-bridge-*.md`, `ebitda-quality-*.md` (non-primary denylist).

## When to open which (Overview AGENTS)

Desk dropdown order = **Operate → Notes → Models → Book ops → Meta**. Default stays **Daily brief**. All agents remain one select deep (no submenu / no finance page).

| Situation | Open |
|-----------|------|
| What moved / what’s on WATCH today? | **Daily brief** |
| One focused question | **Research** |
| Full init/update memo skeleton | **Coverage note** |
| Peer table (you have peers/metrics) | **Comps** |
| P&L path into EBITDA | **EBITDA bridge** |
| Simple FCF / assumptions framework | **Model bridge** |
| Is adj. EBITDA honest? (need paste) | **EBITDA quality** |
| Check a whole model paste | **Model audit** |
| Change house / risks | Book ops (propose, risk-add, …) — not finance notes |

Menu clarity plan: `memory-cockpit-v2/plans/2026-08-01-agents-menu-clarity.md`.

## Binding product law

- No price targets as recommendations  
- No invented peers/metrics — GAP or user paste  
- House/risks only via propose → glass ACCEPT  
- Never hand-edit `ontology/store/`  

See `docs/AGENT-AUTHORING.md` to build more.
