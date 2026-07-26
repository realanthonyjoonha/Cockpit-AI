# Cold start dogfood — this machine (Air / monorepo Desktop)

**As-of:** 2026-07-25  
**Branch:** `main`  
**Principles:** decision-support only · no invented research · no ACCEPT without human

## Ritual run

1. `./scripts/doctor.sh` → **18 ok / 0 fail**
2. `./scripts/bootstrap.sh` → build + doctor PASS
3. `./scripts/install-grok-mcp.sh` → `cockpit-research` healthy, **12 tools**
4. Glass already on `:4681` with monorepo paths
5. Thin desk **read-only** API dogfood NBIS + MSFT → **ALL PASS**
6. Agent variants defaults: desk=daily, risk=risk-check, register=risk-add, house=propose
7. Seeds: `/cockpit-daily msft`, `/cockpit-risk-check msft …`, `/cockpit-propose msft`, etc.

## Risk id hygiene

- NBIS: `nbis-r1-…`
- MSFT: `msft-r1-…` (not leftover nbis-r*)

## Not exercised (user gate)

- Glass ACCEPT of house/risk proposals
- Full research pipeline for a new ticker
- OPEN GROK Terminal spawn (macOS; manual if needed)

## Result

**Cold start product shell works on this monorepo clone.**  
Next optional: factory purity (profiles → config); user dogfood ACCEPT when ready.
