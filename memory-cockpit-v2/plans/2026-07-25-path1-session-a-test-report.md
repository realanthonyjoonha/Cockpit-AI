# Path 1 Session A — Test Report

**As-of:** 2026-07-25  
**Branch:** `test/path1-mini`  
**Docs followed:** root `AGENTS.md`, `PROJECT-STATE.md`, `SETUP-GROK-COCKPIT.md`, `memory-cockpit-v2/plans/WRITE-PATH-RISKS.md`, `AGENT-HOST-MCP.md`  
**Env used:** monorepo absolute paths (`COCKPIT_REPO` / `COCKPIT_VAULT` / `ONTOLOGY_*` → this clone)

Decision-support only. No buy/sell/PT/sizing.

---

## Summary

| Area | Result |
|------|--------|
| MCP install + doctor | **PASS** — `cockpit-research` healthy, 12 tools |
| `./ont verify` NBIS / MSFT | **PASS** exit 0 |
| Glass build + start :4681 | **PASS** |
| Thin APIs (house/risks/proposals/compile) | **PASS** |
| Surface-scoped AGENTS defaults | **PASS** |
| Propose → PENDING → REJECT (no vault write) | **PASS** |
| COMPILE BOOK (glass + CLI) monorepo | **PASS** |
| `npm run smoke` | **PASS** 78/0 |
| format-check | **PASS** 35/0 |
| MSFT risk id prefix `nbis-r*` | **FIXED** → `msft-r*` |

---

## Test matrix

### 1. MCP

```bash
./scripts/install-grok-mcp.sh
grok mcp list
grok mcp doctor
```

- **PASS** — vault/store point at monorepo; doctor: 12 tools, handshake OK.
- In-session MCP: `list_desks` → nbis + msft; `get_house_view` / `get_pack_snapshot` pack-grounded; proposals tools present.

### 2. Packs

```bash
cd ontology && ./ont verify NBIS && ./ont verify MSFT
```

- **PASS** — both structural gates green; monorepo `research-wiki` paths in verify output.

### 3. Glass

```bash
cd memory-cockpit-v2 && npm run build && PORT=4681 HOST=127.0.0.1 node server/index.js
# http://127.0.0.1:4681
```

| Check | Result |
|-------|--------|
| GET `/` | 200 |
| `/api/nbis/overview`, house, risks | 200, pack-backed |
| `/api/msft/house`, risks | 200 |
| POST `/api/nbis/compile` | ok, monorepo `ontology/ont` |
| AGENTS `variant=desk` default `daily` | PASS |
| AGENTS `variant=register` default `risk-add` | PASS |
| AGENTS `variant=risk` default `risk-check` | PASS |
| AGENTS `variant=house` default `propose` | PASS |
| OPEN GROK prompt seeds | `/cockpit-propose nbis`, `/cockpit-risk-check msft R5…`, etc. |

Note: POST `/api/open-grok` not fired in automation (opens macOS Terminal).

### 4. Dogfood propose path (MCP + glass API)

1. `propose_house_from_current` (nbis) → **pending**  
   - Response invariant: *“Vault house unchanged until human ACCEPT”*  
   - Vault `house-view-nebius.md` had **no** dogfood marker  
2. `propose_risk_status` (msft R4 INTACT→WATCH) → **pending**  
   - Response: *“SoR NOT written until glass ACCEPT”*  
3. `POST …/reject` both → house + SoR still unchanged  

**PASS** — no false “vault written”.

### 5. Smoke / monorepo vault

```bash
cd memory-cockpit-v2 && npm run smoke
```

- **PASS** (78) with monorepo env; smoke already prefers monorepo sibling `research-wiki` when `cockpit/lib/fm.js` exists (no bare `~/Trading` required for this clone).
- Dual vault reality on this Mac: `~/Trading/research-wiki` **and** monorepo `research-wiki` are **different trees**. Always set env for operate, or rely on monorepo-aware defaults.

### 6. Bug fixed this session

**MSFT risk ids hard-coded as `nbis-r*`** (known hygiene debt; broke identity clarity).

| File | Change |
|------|--------|
| `ontology/compile/from_nebius_risks.py` | `id_prefix` / ticker-aware ids; clear all generated `risks/*.md` on sync |
| `ontology/compile/run.py` | pass `ticker` as `id_prefix` into sync |
| Recompile | MSFT cards → `msft-rN-…`; NBIS stays `nbis-rN-…` |

Also:

| File | Change |
|------|--------|
| `memory-cockpit-v2/scripts/write-path-drill.mjs` | monorepo-aware wiki/ont/store (was hard-coded `~/Trading`) |
| `memory-cockpit-v2/scripts/propose-nbis.mjs` | next-step strings monorepo-friendly |
| `PROJECT-STATE.md` | risk-id debt marked fixed |

---

## Known non-blockers / not in scope

| Item | Notes |
|------|--------|
| Path 2 cold-start packaging | Out of scope; concurrent WIP may exist on `path2/cold-start` |
| Headless `--render` / full `test:thin` | Not re-run (Chrome optional); format-check + smoke green |
| OPEN GROK live Terminal spawn | API path verified; osascript not automated |
| ACCEPT write + SoR mutate dogfood | Smoke covers house propose+accept+restore; risk status ACCEPT not re-mutated (REJECT only) |
| Factory JSON-only thin profiles | Still code maps — Path 2 / later |

---

## Repro (fresh shell)

```bash
export COCKPIT_REPO="/Users/anthonyha/Trading/cockpit-research-os"
export COCKPIT_VAULT="$COCKPIT_REPO/research-wiki"
export ONTOLOGY_WIKI="$COCKPIT_VAULT"
export ONTOLOGY_STORE="$COCKPIT_REPO/ontology/store/by_ticker"
export ONTOLOGY_ROOT="$COCKPIT_REPO/ontology"
export PORT=4681 HOST=127.0.0.1

cd "$COCKPIT_REPO" && ./scripts/install-grok-mcp.sh
cd ontology && ./ont verify NBIS && ./ont verify MSFT
cd ../memory-cockpit-v2 && npm run build && npm run smoke
node server/index.js   # → http://127.0.0.1:4681
```

---

## Files changed (Session A intent)

**Code / docs**

- `ontology/compile/from_nebius_risks.py`
- `ontology/compile/run.py`
- `memory-cockpit-v2/scripts/write-path-drill.mjs`
- `memory-cockpit-v2/scripts/propose-nbis.mjs`
- `PROJECT-STATE.md`
- `memory-cockpit-v2/plans/2026-07-25-path1-session-a-test-report.md` (this file)

**Generated / vault from compile + dogfood**

- `research-wiki/raw/microsoft-research/risks/msft-r*.md` (new) + deleted mis-prefixed `nbis-r*.md` under MSFT risks
- `research-wiki/raw/nebius-research/risks/nbis-r*.md` (category/source note refresh)
- `ontology/store/by_ticker/MSFT.json`, `NBIS.json`
- `research-wiki/cockpit/proposals/house-nbis.json`, `risks-msft.json` (rejected dogfood rows)

**Do not commit:** `.sync-state.json`, secrets, `node_modules`.

---

## Verdict

**Path 1 operate product is healthy on this monorepo clone** after MCP install + env.  
One real harden shipped: **MSFT risk id prefix**. Propose/ACCEPT invariant holds. Smoke green.
