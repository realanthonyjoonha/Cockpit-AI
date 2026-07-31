# Finance agent ports (Claude patterns → Cockpit)

**As-of:** 2026-07-31  
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
| **Coverage** | **Shipped** | `/cockpit-coverage` | Coverage |
| Comps | Planned | `/cockpit-comps` | — |
| Model bridge | Planned | `/cockpit-model-bridge` | — |
| Model audit | Planned | `/cockpit-model-audit` | — |

Shared ritual: load pack+house → require user input → report → ask save → yes → `raw/{slug}-research/<kind>-*.md` → `./ont compile` → Sources (non-primary).

## Binding product law

- No price targets as recommendations  
- No invented peers/metrics — GAP or user paste  
- House/risks only via propose → glass ACCEPT  
- Never hand-edit `ontology/store/`  

See `docs/AGENT-AUTHORING.md` to build more.
