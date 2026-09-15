---
description: Dogfood a platform feature in an MCP-isolated testing cockpit (fixture desk DOGF)
argument-hint: "[feature?]  # default Filings+Learn wiring"
---

# /cockpit-dogfood-e2e — testing-cockpit dogfood

Parse `$ARGUMENTS` as optional feature focus (default: Filings + Learn + isolation).

**You are not `/cockpit-new-desk`.** **You are not `/cockpit-filings-e2e`** (that is empty product, no desk). **You are not operate-on-kernel.**

**Human load:** prove the feature on a desk-shaped book **without** colliding with kernel/product MCP or writing cockpit-vault.

Decision-support only. No buy/sell/PT/sizing. No `git push`. Never copy kernel `research-wiki` (symlink to vault). Never `scaffold-new-desk` on product.

Read: `docs/MULTI-INSTANCE.md` · `docs/SCENARIO-PIN.md` · `docs/LAB.md`.

---

## Isolation (stop if violated)

| Must | Fail closed |
|------|-------------|
| Tree = sealed **testing cockpit** (`$PWD/.cockpit-dogfood` or `COCKPIT_DOGFOOD`) | cwd is live kernel / product / personal |
| MCP server name = **`cockpit-research-dogfood`** | tools hitting `cockpit-research` kernel pin |
| `list_desks` = **dogf only** | NVDA/NBIS/… appear |
| Vault path inside the seal | `research-wiki` is a symlink to `cockpit-vault` |
| Glass port **4695** (not 4681/4682/4683) | testing glass on kernel/product ports |

If MCP `list_desks.monorepo_root` is `cockpit-kernel` or desks include nvda → **STOP**. Run:

```bash
./scripts/dogfood-e2e.sh
```

Cursor: `docs/CURSOR-E2E.md` · MCP `.cursor/mcp.json`. Call tools on server **`cockpit-research-dogfood`** (not `cockpit-research`).

---

## Do (in order)

### 0. Bring the seal up

```bash
./scripts/dogfood-e2e.sh
```

That script calls `dogfood-up` if needed (unique PORT + unique MCP name + fixture DOGF) and asserts isolation over HTTP.

### 1. Pin check

- Prefer HTTP `GET http://127.0.0.1:4695/api/thin-desks` → one desk `dogf`.
- If using MCP: `list_desks` must show `monorepo_root` = the seal, `pin_ok` true, slug `dogf` only.
- `GET /api/nvda/house` on **:4695** must 404.

### 2. Feature walk (HTTP first)

Default (Filings + Learn):

| Check | Evidence |
|-------|----------|
| Filings room exists | SPA / desk agents include `filing-map`; house has Flip-triggers |
| Learn room exists | desk agents include `background` / `tutor` |
| MAP FILINGS jail | POST start `filing_map` only against **dogf** on :4695 — never kernel |
| No kernel leak | no nvda/nbis slugs on :4695 |

If the human named another feature, walk that room the same way on **dogf** / :4695.

Live Grok MAP FILINGS inside the seal is optional. The script + HTTP walk is the bar. Do not ACCEPT into kernel.

### 3. MCP collision proof

Kernel operate MCP stays **`cockpit-research`**. This seal is **`cockpit-research-dogfood`**. Both may exist on one Mac. Never `grok mcp add cockpit-research` from the seal.

### 4. Report

```text
DOGFOOD E2E REPORT
  seal: $PWD/.cockpit-dogfood
  glass: http://127.0.0.1:4695/#/dogf/filings
  mcp_name: cockpit-research-dogfood
  desks: [dogf]
  kernel pin untouched: yes/no
  vault symlink: no
  dogfood-e2e.sh: PASS/FAIL
  feature: …
  contamination: kernel unused, product desks=[]
  push: not done
  FAIL/GAP: …
```

## Vs other agents

| Want | Use |
|------|-----|
| Empty friend shell | `/cockpit-filings-e2e` / `customer-sim-e2e.sh` |
| Desk-shaped dogfood (this) | `/cockpit-dogfood-e2e` / `dogfood-e2e.sh` |
| Live NVDA operate | `/cockpit-filing-map` on **kernel** (not a test) |
| Underwrite | `/cockpit-new-desk` on kernel |

## Efficiency

Run `./scripts/dogfood-e2e.sh` before prose. Do not mine chat. Tear down with `./scripts/dogfood-down.sh` (add `--wipe` to delete the seal).
