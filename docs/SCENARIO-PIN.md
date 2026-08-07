# Multi-scenario MCP pin (fail-closed)

**Problem:** One Mac, several Cockpit folders → Grok MCP aimed at the wrong vault → wrong tickers (house/risks/ontology).

**Fix:** Each test scenario is its own folder + pin; MCP **refuses** wrong root/slug.

Decision-support only.

---

## Quick start (3 parallel tests)

```bash
# From kernel or product monorepo that has scripts/scenario-up.sh
./scripts/scenario-up.sh A --port 4691 --slugs aaa,bbb
./scripts/scenario-up.sh B --port 4692 --slugs ccc,ddd
./scripts/scenario-up.sh C --port 4693 --slugs eee

# Three browser tabs:
#   http://127.0.0.1:4691/#/start
#   http://127.0.0.1:4692/#/start
#   http://127.0.0.1:4693/#/start

# OPEN GROK from EACH glass separately (3 sessions).
# list_desks must show monorepo_root = that scenario folder only.
```

Delete when done:

```bash
rm -rf ~/Desktop/cockpit-scenario-A ~/Desktop/cockpit-scenario-B ~/Desktop/cockpit-scenario-C
# re-pin main work:
cd ~/Desktop/cockpit-product   # or kernel
./scripts/install-grok-mcp.sh
```

---

## What gets written

| File | Purpose |
|------|---------|
| `~/Desktop/cockpit-scenario-<name>/` | Isolated product-like monorepo |
| `.cockpit-scenario.json` | `expect_root`, `allowed_slugs`, `port` |
| `.grok/config.toml` | MCP env: vault + **COCKPIT_EXPECT_ROOT** + **COCKPIT_ALLOWED_SLUGS** |

---

## Fail-closed behavior (MCP)

| Env | Effect |
|-----|--------|
| `COCKPIT_EXPECT_ROOT` | monorepo must match or tools error |
| `COCKPIT_ALLOWED_SLUGS` | desk must be in list or tools error |
| `COCKPIT_AGENT_ACCEPT` | `1` → agent may **ACCEPT** house/risk proposals (same write as glass) |

`list_desks` returns `pin_ok`, `monorepo_root`, `expect_root`, `allowed_slugs`.  
If `pin_ok` is false → **STOP**.

OPEN GROK on a scenario monorepo **prepends** a PIN CHECK to the initial prompt.

### Agent ACCEPT (test-user loop)

Scenarios default **`agent_accept: true`** in `.cockpit-scenario.json`.

MCP tools (require grant):

| Tool | Effect |
|------|--------|
| `agent_accept_status` | Is grant on? |
| `accept_house_proposal` | Write vault house from pending proposal |
| `accept_risk_proposal` | Write risks SoR from pending proposal |

Audit log: `research-wiki/cockpit/agent-accept-log.jsonl`

**Off by default** on normal product/kernel (no scenario file / no env).  
Disable on a scenario: `AGENT_ACCEPT=0 ./scripts/scenario-up.sh …`

```bash
# Thin ACCEPT-only toy (TSTK stub) — still useful for accept path unit proof
./scripts/test-agent-accept-e2e.sh

# Full factory gate (pin · dist Street · ACCEPT · compile/verify · glass APIs)
./scripts/scenario-pipeline-e2e.sh aaoi --ticker AAOI --port 4797
# Fresh light fixture (not deep research):
./scripts/scenario-pipeline-e2e.sh demox --ticker DEMO --port 4798 --fixture-light
```

See **[`SCENARIO-PIPELINE.md`](./SCENARIO-PIPELINE.md)** for gates and OPEN GROK host rules.  
**Depth law (mirror kernel DEEP underwrite):** [`SCENARIO-DEPTH-LAW.md`](./SCENARIO-DEPTH-LAW.md).

`scenario-up` now **ensures glass dist includes Street UI** (build or copy known-good dist) and syncs pin/accept/street modules from the script monorepo.

---

## Related

- [`SCENARIO-PIPELINE.md`](./SCENARIO-PIPELINE.md)  
- [`MULTI-INSTANCE.md`](./MULTI-INSTANCE.md)  
- [`CUSTOMER-SIM.md`](./CUSTOMER-SIM.md)  
- [`LAB.md`](./LAB.md)  
