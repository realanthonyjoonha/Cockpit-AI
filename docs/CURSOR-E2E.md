# Cursor Projects — testing-cockpit e2e

Decision-support only. Isolation is a **workspace seal**, not Docker.

## Which repos

| Role | Repo | Local path | Cursor? |
|------|------|------------|---------|
| **Code (Project root)** | private **`realanthonyjoonha/cockpit`** | `~/Desktop/cockpit-kernel` | **Yes — open this** |
| **Books (read-only source)** | private **`realanthonyjoonha/cockpit-vault`** | Cursor cloud: **`/home/ubuntu/cockpit-vault`**. Mac: `~/Desktop/cockpit-vault`. Or `COCKPIT_VAULT`. | Must be on disk. Do not pin MCP at the vault. |
| Friend shell | public **Cockpit-AI** | `~/Desktop/cockpit-product` | **No** for NVDA/MU/LLY |
| Personal | `cockpit-personal` | `~/cockpit-personal/repo` | **No** (not factory; no LLY) |

`--slugs nvda,mu,lly` **copies** those three from **cockpit-vault** into gitignored `$PWD/.cockpit-dogfood`. It does not clone personal. It does not write Cockpit-AI or live kernel `thin-desks.json`.

If Cursor only has `cockpit` and not the vault, the three-ticker seed **fails closed**.

## Paste into the Cursor Project (`cockpit` / kernel)

```text
You are testing Anthony’s Cockpit in an isolated testing cockpit. Decision-support only: no buy/sell/PT/sizing. Do not git push. Do not edit ontology/store. Do not write cockpit-vault or kernel/product thin-desks.json. Product desks must stay [].

Repos:
- Project root = private GitHub realanthonyjoonha/cockpit (this clone; Mac ~/Desktop/cockpit-kernel or cloud /workspace). That is the only code SoR.
- Books source = private GitHub realanthonyjoonha/cockpit-vault. On Cursor cloud the clone is **/home/ubuntu/cockpit-vault** (not ~/Desktop/cockpit-vault). On a Mac: ~/Desktop/cockpit-vault. Or COCKPIT_VAULT. dogfood-e2e --slugs nvda,mu,lly COPIES nvda, mu, lly from the vault into gitignored $PWD/.cockpit-dogfood. Do not pin MCP at the vault. Do not modify the vault.
- Do NOT use Cockpit-AI / cockpit-product as SoR (empty friend shell).
- Do NOT use cockpit-personal (not factory; no LLY).

1. If ./scripts/dogfood-e2e.sh does not support --slugs, stop and say the clone is behind. Do not invent a workaround that copies books into git.

2. Run:
   ./scripts/dogfood-e2e.sh --slugs nvda,mu,lly

   Seal: $PWD/.cockpit-dogfood. MCP name: cockpit-research-dogfood. Glass: :4695. Desks: nvda, mu, lly only.

3. If vault is missing, fail closed. Do not scaffold those tickers. Do not underwrite. Do not copy books onto Cockpit-AI.

4. Prove:
   - GET http://127.0.0.1:4695/api/thin-desks → exactly nvda, mu, lly
   - GET /api/nvda/house, /api/mu/house, /api/lly/house → 200
   - GET /api/nbis/house → 404
   - Open http://127.0.0.1:4695/#/nvda/filings (pipeline + MAP FILINGS start is enough; do not ACCEPT into kernel)
   - MCP list_desks on server cockpit-research-dogfood matches those three slugs; pin is the seal, not cockpit-vault

5. Report: PASS/FAIL per check, glass URL, whether vault was found, that product desks=[] and kernel live registry was not rewritten.

Playbook: docs/CURSOR-E2E.md
```

## Commands

```bash
npm --prefix memory-cockpit-v2 install   # if node_modules missing
./scripts/dogfood-e2e.sh --slugs nvda,mu,lly
```

| Piece | Where |
|-------|--------|
| Seal | `$PWD/.cockpit-dogfood` (gitignored) |
| Glass | `http://127.0.0.1:4695/#/nvda/filings` |
| MCP | `.cursor/mcp.json` → `scripts/cursor-dogfood-mcp.sh` → **`cockpit-research-dogfood`** |
| Kernel MCP env | `COCKPIT_DOGFOOD_SLUGS=nvda,mu,lly` |
| Product/Cockpit-AI | DOGF only — no books |

## Do / don’t

| Do | Don’t |
|----|--------|
| Open **cockpit** + read **cockpit-vault** | Open Cockpit-AI for this 3-desk lab |
| Copy into the seal | Write vault / kernel desks / product desks |
| MCP `cockpit-research-dogfood` | Pin `cockpit-research` at live vault |
| `GET /api/nbis/house` → 404 | Underwrite extra tickers |

## Filings bar in the seal

PASS: house 200 on nvda/mu/lly, pipeline catalog, `POST {job:filing_map}` queued.

Not claimed: Grok publish of `delta.json` (model session in the seal).
