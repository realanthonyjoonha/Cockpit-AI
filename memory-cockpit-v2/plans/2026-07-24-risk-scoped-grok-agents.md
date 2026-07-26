# Plan: Context-scoped Grok AGENTS menus (risk Due Diligence first)

See also session plan; this file is the **in-repo** copy for collaborators and future sessions.

**As-of:** 2026-07-24  
**Status:** Implemented (variant desk|risk; Risk.jsx §B uses risk-scoped menu).

## Goal

On risk detail **Due Diligence**, show a **risk-scoped** agent menu (default **Risk check**) that seeds OPEN GROK with **desk + this risk** (and tripwire-aware commands). Desk-level surfaces keep the full menu.

## Scale

- Single `GrokAgents` component + `variant` (`desk` | `risk`).
- Catalog + presets in `openGrok.js` only.
- New company desk: pass `desk={slug}`, `riskId`, `riskName` from pack — no per-ticker UI.

## Risk variant agents

| Action | Default |
|--------|---------|
| `risk-check` | Yes |
| `risk-tripwires` | No |

Not in risk DD menu (v1): daily, add risk, steelman, house propose, desks, …

## Slices

1. **S0** — `GROK_AGENTS` + `variants` / `default_for`; `buildInitialPrompt` risk args; `GET ?variant=`  
2. **S1** — `GrokAgents` props  
3. **S2** — `Risk.jsx` §B only  
4. **S3** — slash commands accept pre-selected risk  
5. **S4** — docs / PROJECT-STATE / playbook  
6. **S5** — tests + dogfood  

## Non-goals

Per-tripwire menu items · per-company menus · glass LLM · changing PROPOSE STATUS UI  

## Success

Risk page defaults to Risk check; prompt includes risk identity; desk menus unchanged; works for any thin desk.
