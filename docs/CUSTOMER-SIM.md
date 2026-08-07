# Customer simulation — Grok agents as first-time product users

**Goal:** Let Grok agents **use Cockpit from scratch like a customer** (empty product), to test features and the first-run journey — **not** to operate Anthony’s dogfood books.

Decision-support only. Hard law: [`AGENTS.md`](../AGENTS.md).

---

## What “customer” means

| Customer (this mode) | Dogfood (not this mode) |
|----------------------|-------------------------|
| Tree: **cockpit-product** (or empty clone) | **cockpit-kernel** |
| `desks: []` at start (or disposable test desk only) | Real NVDA/NBIS/… books |
| Glass e.g. **:4690** or free eng port | **:4682** kernel |
| Follow **FRIEND-START** mental model | OPERATE / research day |
| MCP pin = **product/lab** monorepo | MCP pin = kernel |

If MCP `list_desks` returns dogfood tickers, **stop** — wrong pin. Re-run `./scripts/install-grok-mcp.sh` from the **product** root.

---

## How to start an agent (cold paste)

```text
You are simulating a FIRST-TIME Cockpit customer on the blank product.
Read docs/CUSTOMER-SIM.md + FRIEND-START.md. Obey isolation rules there.
Monorepo MUST be cockpit-product (or empty lab). Never use kernel research books.
Run ./scripts/customer-sim-preflight.sh and fix failures before testing features.
Decision-support only. No buy/sell/PT/sizing. No git push unless I ask.
House/risks: propose only; I ACCEPT on glass if real SoR — label disposable desks clearly.

Today’s feature / journey under test: <FEATURE or "full first-run">
```

Or slash: **`/cockpit-customer-sim [feature?]`** (from product-pinned session).

---

## Preflight (required)

```bash
# From product root (or set COCKPIT_PRODUCT)
cd ~/Desktop/cockpit-product
./scripts/customer-sim-preflight.sh
# optional: CUSTOMER_SIM_PORT=4690 ./scripts/customer-sim-preflight.sh --start-glass
```

**Automated stress suite (eng):**

```bash
# From kernel or product (uses COCKPIT_PRODUCT)
./scripts/customer-sim-e2e.sh
```

Preflight checks:

1. Tree looks like product monorepo (cwd preferred, then `COCKPIT_PRODUCT`, then script root)  
2. **Not** kernel dogfood (`desks` filled + KERNEL.md / cockpit-kernel path)  
3. `desks=[]` (or seal-* disposable only)  
4. Glass reachable; **live registry_path must match this monorepo** (blocks wrong instance)  
5. CUSTOMER-SIM docs + slash command present  
6. Prints URL: `http://127.0.0.1:PORT/#/start`

---

## Customer journey (from scratch)

Agents walk this order unless the human scopes a single feature:

| Step | Customer action | How agent proves it |
|------|-----------------|---------------------|
| 1 | Land on empty product | `GET /api/thin-desks` → `desks: []` · UI mental model START only |
| 2 | Bootstrap/doctor if needed | `./scripts/doctor.sh` or bootstrap; exit 0 / document warn |
| 3 | See first-run CTA | Document START + Build next company (HTTP agents catalog if no browser) |
| 4 | Optional: underwrite **disposable** ticker | `/cockpit-new-desk` **only** if human allows; mark disposable; never copy Anthony books |
| 5 | Exercise **feature under test** | Street, daily, agents, upgrade path, etc. with evidence |
| 6 | Report as customer | What worked, what confused, GAPs, URLs, commands |

**Evidence > vibes.** Every claim needs a command output, curl body, or explicit UI observation.

---

## Isolation (contamination)

| Do | Don’t |
|----|--------|
| `COCKPIT_PRODUCT` / product cwd | Mount or pin **kernel** |
| Own port (4690+) | Assume 4682 is “the product” |
| Disposable desks in a **lab copy** if writing | Write into Anthony’s real books |
| `lab-isolation-e2e` when multi-instance | Share one `thin-desks.json` across instances |

See [`MULTI-INSTANCE.md`](./MULTI-INSTANCE.md) · [`LAB.md`](./LAB.md).

---

## MCP + Grok

1. `cd ~/Desktop/cockpit-product` (or lab clone)  
2. `./scripts/install-grok-mcp.sh`  
3. Confirm `list_desks` → empty or only disposable  
4. Then run customer-sim  

One pin at a time. Kernel pin = failed customer sim.

---

## Done report template (agent must fill)

```text
CUSTOMER SIM REPORT
  monorepo: …
  monorepo_root (MCP): …
  desks at start: …
  glass URL: …
  feature under test: …
  journey steps run: …
  PASS / FAIL / GAP:
  evidence: (commands + short results)
  contamination check: kernel not used? (yes/no)
  push: not done
```

---

## Related

| Doc | Role |
|-----|------|
| [`FRIEND-START.md`](../FRIEND-START.md) | Real first install story |
| [`LAB.md`](./LAB.md) | Blank E2E gate |
| [`MULTI-INSTANCE.md`](./MULTI-INSTANCE.md) | Many instances |
| [`DEVELOP.md`](./DEVELOP.md) | Building features (not customer mode) |
