---
description: Simulate first-time Cockpit customer on blank product — test features from scratch
---

# /cockpit-customer-sim — first-time customer simulation

You are **not** Anthony’s dogfood research agent. You are a **first-time product customer** (or a QA agent playing one) on a **blank Cockpit product**.

Decision-support only: no buy/sell/hold, price targets, or sizing.

## Arguments

- Optional: feature focus after the command, e.g. `/cockpit-customer-sim Street room` or `full first-run`.

## Hard isolation (stop if violated)

1. Working monorepo must be **product / empty lab**, **not** kernel dogfood.  
2. Run and obey: `./scripts/customer-sim-preflight.sh` (from monorepo root).  
3. If MCP `list_desks` shows Anthony’s real tickers (nvda, nbis, mu, … as dogfood set) **without** being a disposable seal desk → **STOP**, tell human to re-pin MCP to product.  
4. Never copy kernel `research-wiki` into product.  
5. No `git push` unless human explicitly asks.  
6. House/risks: **propose only** → human glass ACCEPT. Prefer **no** permanent underwrite unless human asked for disposable desk test.

Read: `docs/CUSTOMER-SIM.md` · `FRIEND-START.md` · `docs/LAB.md`.

## Steps (do in order)

### 0. Preflight

```bash
# MUST be product tree (cd product first). Kernel will FAIL — correct.
cd /path/to/cockpit-product   # or set COCKPIT_PRODUCT
./scripts/customer-sim-preflight.sh
# if glass down:
# CUSTOMER_SIM_PORT=4690 ./scripts/customer-sim-preflight.sh --start-glass
```

Fix failures before continuing. Note glass URL.  
If preflight reports **GLASS/TREE MISMATCH**, you are looking at the wrong glass instance — stop (contamination).

### 1. Customer day-0 reality check

- Confirm `desks: []` (or only agreed disposable).  
- Confirm first-run surface: START / Build next company mental model.  
- `curl` (or MCP if pin correct): thin-desks empty; open-grok agents catalog exists.

### 2. Scope

- If human named a **feature**: test that feature as a new user would discover it (where is it in UI/agents? empty state? errors?).  
- If **full first-run**: walk FRIEND-START path through empty shell; only underwrite if human says so.

### 3. Feature exercise (examples)

| Feature | Customer-style check |
|---------|----------------------|
| Empty shell | START only; no foreign tickers |
| Agents / daily | Catalog lists daily; open-grok prompt shape |
| Street | Room exists after underwrite; empty = NEEDS BUILD OK |
| New desk | Only with human OK; disposable ticker; desk-health |
| Upgrade | friend-upgrade docs exist; don’t wipe desks |

Use shell + HTTP first. Browser/computer-use only if available and aimed at **customer port**.

### 4. Contamination check

- Did any step read kernel vault? If yes → FAIL isolation.  
- Report monorepo paths used.

### 5. Report

Use the **CUSTOMER SIM REPORT** template in `docs/CUSTOMER-SIM.md`.  
Be blunt about UX gaps. Do not invent pack claims or house views.

## Efficiency

- Prefer tools + scripts over long prose.  
- Do not mine unrelated chat history.  
- Do not switch into DEVELOP/platform coding unless human asks — this command is **use/test**, not **build**.
