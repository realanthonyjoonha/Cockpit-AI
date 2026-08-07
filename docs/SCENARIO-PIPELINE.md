# Scenario pipeline — fail-closed factory gate

**Goal:** Prove an isolated product-like Cockpit can host a desk end-to-end: pin, agent ACCEPT, pack verify, Street, glass APIs.

**HARD LAW:** Scenario content must **mirror cockpit-kernel DEEP underwrite** (`/cockpit-new-desk`).  
See **[`SCENARIO-DEPTH-LAW.md`](./SCENARIO-DEPTH-LAW.md)**. Thin seeders fail the depth gate.

Decision-support only. Does not push. Does not invent buy/sell/PT.

---

## Quick start

```bash
# From kernel or product (has scripts/scenario-pipeline-e2e.sh)
cd ~/Desktop/cockpit-kernel   # or cockpit-product

# Reuse existing deep book (e.g. AAOI scenario already underwritten):
./scripts/scenario-pipeline-e2e.sh aaoi --ticker AAOI --port 4797

# Fresh empty scenario + light fixture book (gates only — not deep research):
./scripts/scenario-pipeline-e2e.sh demox --ticker DEMO --port 4798 --fixture-light

# Check-only (no ACCEPT rewrite):
./scripts/scenario-pipeline-e2e.sh aaoi --ticker AAOI --port 4797 --skip-accept
```

**PASS** prints glass URLs. **FAIL** exits non-zero with the first broken gates.

---

## What must be green

| # | Gate | Fail if |
|---|------|---------|
| 1 | `scenario-up` pin | wrong root / missing project MCP env |
| 2 | Platform modules + **Street dist** | July-era shell without Street UI |
| 3 | Registry desk + `street` room | desk missing / rooms incomplete |
| 4 | Pin allowlist | foreign slug accepted |
| 5 | Agent ACCEPT grant | `COCKPIT_AGENT_ACCEPT` off on scenario |
| 6 | Vault book | no house/entity/risks (unless `--fixture-light`) |
| 7 | Agent ACCEPT house + risk | propose/accept write not verified |
| 8 | `./ont compile` + `./ont verify` | verify ≠ exit 0 |
| 9 | Street schema v2 | incomplete firms / advice-language false positives |
| 10 | Glass APIs | overview/house/risks/street not available |

---

## Commands

| Script | Role |
|--------|------|
| `scripts/scenario-up.sh` | Materialize folder, pin, **ensure Street dist**, sync pin/accept modules |
| `scripts/scenario-pipeline-e2e.sh` | Full factory gate (calls scenario-up + gates) |
| `memory-cockpit-v2/scripts/scenario-pipeline-gates.mjs` | Node checks + ACCEPT + compile/verify + HTTP |

### scenario-up flags

```text
--port N
--slugs a,b
--from ~/Desktop/cockpit-product
--repin-only
--refresh-code     # re-sync modules + Street dist (default path also ensures dist)
--no-glass
--no-mcp
AGENT_ACCEPT=0     # disable agent ACCEPT grant
```

---

## Agent ACCEPT (scenario only)

Scenarios default `agent_accept: true`.

MCP (when pin + grant on):

- `agent_accept_status`
- `accept_house_proposal`
- `accept_risk_proposal`

Audit: `research-wiki/cockpit/agent-accept-log.jsonl`

**Product/kernel dogfood:** grant off — glass ACCEPT only.

New-desk closeout in scenarios: see `/cockpit-new-desk` §6 scenario branch.

---

## OPEN GROK host rule

| Correct | Wrong |
|---------|--------|
| cwd = `~/Desktop/cockpit-scenario-<name>` | cwd = kernel while testing scenario |
| `list_desks` → monorepo_root = scenario | `list_desks` shows NVDA/NBIS kernel desks |
| OPEN GROK from **that** glass | One Grok session reused across folders |

---

## Light fixture vs deep research

| Mode | When | Meaning |
|------|------|---------|
| **DEEP (default)** | Always for real tickers | Full `/cockpit-new-desk` bar first; e2e only closeout |
| **Light fixture** | Plumbing only | Requires **both** `--fixture-light` **and** `--allow-light-fixture` |

Do not claim deep research when only fixture light ran. Megacap seed script is **banned**.

---

## Cleanup

```bash
rm -rf ~/Desktop/cockpit-scenario-aaoi   # example
# re-pin dogfood:
cd ~/Desktop/cockpit-kernel && ./scripts/install-grok-mcp.sh
```

---

## Related

- [`SCENARIO-PIN.md`](./SCENARIO-PIN.md)  
- [`MULTI-INSTANCE.md`](./MULTI-INSTANCE.md)  
- [`CUSTOMER-SIM.md`](./CUSTOMER-SIM.md)  
