# Phase 4 — Harden the loop (goldens + book refresh)

**Status:** SHIPPED 2026-07-20  

## Scope
- `POST /api/nbis/book/refresh` — clear pack cache, re-read `NBIS.json`
- Pack load invalidates when file mtime changes (even inside 5s TTL)
- BookStrip **REFRESH BOOK** button
- Ask re-runs last question after refresh
- Golden contracts: `scripts/nbis-ask-goldens.json` asserted in smoke

## Non-goals
Compile from browser, LLM Ask, second ticker, agent write path.
