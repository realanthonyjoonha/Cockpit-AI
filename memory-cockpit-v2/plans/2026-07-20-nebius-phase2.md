# Phase 2 — Nebius desk (quote + sources + playbook)

**Status:** SHIPPED 2026-07-20  
**Builds on:** Phase 1 thin desk (Overview · Risks · House)

## Scope (this phase)

| Item | Status |
|------|--------|
| Live NBIS quote chip on Overview | Done — Nasdaq primary, Yahoo last; null if fail |
| Sources catalog page from pack | Done — primary nebius/neocloud first |
| New-desk playbook | Done — `plans/NEW-DESK-PLAYBOOK.md` |
| Catalysts page | **Parked** — pack catalysts still MU/HBM noise |

## Routes / APIs

- `#/nbis/sources` · `/api/nbis/sources`
- `/api/nbis/quote` (async, 60s cache)

## Non-goals (still parked)

Memory-class pages, multi-series, research-os, combined super-overview.
