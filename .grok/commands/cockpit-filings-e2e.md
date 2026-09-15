---
description: E2E-test Filings on the blank friend shell — no ticker, no underwrite, no books
argument-hint: "[--live-map TICKER]  # optional disposable scenario only"
---

# /cockpit-filings-e2e — Filings friend-path QA

Parse `$ARGUMENTS`. Default: **empty-product Filings e2e**. Optional **`--live-map TICKER`** only if the human named a disposable ticker **and** said scenario/clone (never product SoR).

**You are not `/cockpit-new-desk`.** Do not ask for a ticker. Do not scaffold. Do not invent AAPL/NVDA/TEST.

**Human load:** prove Filings works for a first-time friend. **You** run the gates and HTTP walk.

Decision-support only. No buy/sell/PT/sizing. No `git push`. No house/risk ACCEPT. Never write `ontology/store/`. Never copy kernel vault into product.

Read: `docs/CUSTOMER-SIM.md` · `docs/LAB.md` · `FRIEND-START.md`.

---

## Isolation (stop if violated)

| Must | Fail closed |
|------|-------------|
| Tree = **cockpit-product** (or empty lab clone) | cwd is kernel / personal / dogfood desks |
| `desks: []` | product registry has NVDA/NBIS/… |
| Glass registry_path contains `cockpit-product` | `GLASS/TREE MISMATCH` or kernel path |
| No underwrite on product | `./scripts/scaffold-new-desk.sh` on product |

If MCP `list_desks` returns Anthony’s dogfood set → **STOP**. Re-pin: `cd ~/Desktop/cockpit-product && ./scripts/install-grok-mcp.sh`. Tell the human the other session’s `/cockpit-new-desk` is underwrite, not this test.

---

## Do (in order)

Work from `~/Desktop/cockpit-product`. Product glass is typically **`:4681`**.

### 0. Preflight

```bash
cd ~/Desktop/cockpit-product
./scripts/customer-sim-preflight.sh
# glass down:
# CUSTOMER_SIM_PORT=4681 ./scripts/customer-sim-preflight.sh --start-glass
```

Note the glass URL. Fix failures before continuing.

### 1. Empty-shell Filings gates (no ticker)

```bash
bash scripts/lab-feature-hooks/96-filing-map.sh "$(pwd)"
bash scripts/lab-feature-hooks/60-phone-shell.sh "$(pwd)"
(cd memory-cockpit-v2 && node scripts/filing-map-test.mjs && node scripts/filing-map-closeout-test.mjs && node scripts/phone-chrome-test.mjs)
```

### 2. Friend HTTP walk (live product glass)

`BASE=http://127.0.0.1:4681` (or preflight port). Evidence required:

1. `GET /api/thin-desks` → `desks: []`, `registry_path` on product, no nvda/nbis/… slugs  
2. `GET /api/open-grok/agents?variant=start` → `new-desk` / Build next company; **no** dogfood tickers  
3. `GET /api/open-grok/agents?variant=desk` → includes **`filing-map`** (and learn `background`/`tutor`)  
4. Served SPA JS/CSS (current `dist` hashes) contain `desk-phone`, `room-bar`, `MAP FILINGS`, `IN BOOK`, `Open analysis`  
5. `GET /api/zzz-not-a-desk/pipeline` and `/learn` → **404**, not 500  

Do **not** POST `/api/open-grok` `{action:new-desk}` as part of this test (that opens underwrite).

### 3. Live MAP FILINGS (skip unless human passed `--live-map TICKER`)

Empty product has no desk, so catalog/map glass cannot be clicked. **Do not** underwrite on product to get one.

If the human explicitly passed `--live-map TICKER` for a **disposable** test:

```bash
./scripts/scenario-up.sh filings-e2e --port 4692 --slugs <ticker> --from ~/Desktop/cockpit-product
```

Then HTTP the clone (`:4692`), not `:4681`. Still no kernel books. Still propose-only. If they did not pass `--live-map`, write **GAP: live MAP FILINGS not run (needs disposable scenario, not product SoR)** and continue.

### 4. Contamination

- Kernel vault not read for “friend” proof  
- Product `thin-desks.json` still `desks: []`  
- No books staged in git  

### 5. Report (required)

```text
FILINGS E2E REPORT
  monorepo: ~/Desktop/cockpit-product
  glass: http://127.0.0.1:PORT/#/start
  desks: []
  hook 96: PASS/FAIL
  filing-map-test: N passed / 0 failed
  phone-chrome: PASS/FAIL
  HTTP empty shell: PASS/FAIL
  served bundle has MAP FILINGS + desk-phone: yes/no
  unknown-desk 404: yes/no
  live MAP FILINGS: skipped | PASS | FAIL
  contamination: kernel unused, product desks=[]
  vs /cockpit-new-desk: did not underwrite
  push: not done
  FAIL/GAP: …
```

Be blunt. Do not invent pack claims or house views.

---

## Vs other agents

| Want | Use |
|------|-----|
| Friend Filings QA (this) | `/cockpit-filings-e2e` |
| Generic first-run | `/cockpit-customer-sim` |
| Underwrite a real company | `/cockpit-new-desk TICKER` on **kernel**, not product |
| Map one accession on a dogfood desk | `/cockpit-filing-map` on kernel |

## Efficiency

Prefer the scripts above over prose. Automated twin (no Grok session required): `./scripts/customer-sim-e2e.sh` from product with `CUSTOMER_SIM_PORT=4681`. Do not mine unrelated chat. Do not switch into `/cockpit-feature` unless a gate FAIL needs a platform fix and the human asked to build.
