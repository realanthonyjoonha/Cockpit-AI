---
description: Cockpit research menu — list MCP recipes for house/pack (Grok + cockpit-research)
---

Show the **cockpit command menu** and wait for a choice (or desk + action).

## Menu

| Slash | What it does |
|-------|----------------|
| `/cockpit-desks` | List thin desks via MCP |
| `/cockpit-new-desk [TICKER] [--light] [--no-street]` | Underwrite **new** desk — deep research + Street bootstrap + desk-health gate |
| `/cockpit-daily [desk] [--save]` | Daybook daily: what moved + calendar + short book-touch; optional vault save |
| `/cockpit-research [desk] [question?]` | Load house+risks; research only what user asks; **ask to save** → write note + compile ticker → Sources |
| `/cockpit-coverage [desk] [scope?]` | Structured coverage / init-style note (Overview AGENTS → Coverage); optional save+compile |
| `/cockpit-comps [desk] [peers?]` | Peer comps table (user supplies peers/metrics); optional save+compile |
| `/cockpit-model-bridge [desk]` | Assumptions + simple FCF bridge (no PT advice); optional save+compile |
| `/cockpit-model-audit [desk]` | Audit pasted/saved model vs pack; optional save+compile |
| `/cockpit-ebitda-bridge [desk]` | Revenue→EBITDA bridge (pack + your lines); optional save+compile |
| `/cockpit-ebitda-quality [desk]` | Reported vs adj. EBITDA / adjustments quality; optional save+compile |
| `/cockpit-street [desk]` | Street agent — page + house/risk context; refresh/rebuild/deepen (not house PT) |
| `/cockpit-street-build` / `-refresh` | Legacy aliases → same as `/cockpit-street` |
| `/cockpit-risk-check [desk] [risk]` | Risk DD: direction vs tripwires (no status write) |
| `/cockpit-risk-add [desk] [idea]` | Research + propose NEW risk (glass ACCEPT) |
| `/cockpit-risk-tripwires [desk] [risk]` | Research tripwires; user cull; propose set_tripwires |
| `/cockpit-steelman [desk]` | Steelman house vs pack WATCH (tools only) |
| `/cockpit-match [desk]` | Confirm house Exposed/labels match pack WATCH |
| `/cockpit-propose [desk]` | Propose full house edit → pending for glass ACCEPT |
| `/cockpit-pending [desk]` | List pending house proposals |

**Desks:** whatever `list_desks` returns for **this** MCP monorepo install (not a hardcoded list). Pass desk as argument or ask once after listing.

**Rules:** MCP `cockpit-research` only for book facts. Decision-support only (no buy/sell/PT/sizing). Never write vault house file — only `propose_house_from_current` / `propose_house_view` (draft) then human ACCEPT on glass.

**Efficiency:** Prefer slash commands. Do not mine chat history. Prefer `propose_house_from_current` for small edits.

If user already named a desk and action in the same message, run that action immediately.

