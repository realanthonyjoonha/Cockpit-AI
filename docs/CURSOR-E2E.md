# Cursor Projects — testing-cockpit e2e

Cursor’s VM is **one clone**. It does not have Anthony’s Desktop trees or Grok user MCP. Isolation is a **workspace seal**, not Docker.

Decision-support only.

## What to run

From the clone root (Cockpit-AI or private `cockpit`):

```bash
npm --prefix memory-cockpit-v2 install   # if node_modules missing
./scripts/dogfood-e2e.sh
```

| Piece | Where |
|-------|--------|
| Seal | `$PWD/.cockpit-dogfood` (gitignored) |
| Glass | `http://127.0.0.1:4695/#/dogf/filings` |
| MCP | `.cursor/mcp.json` → `scripts/cursor-dogfood-mcp.sh` → server **`cockpit-research-dogfood`** |
| Fixture desk | slug `dogf` / ticker `DOGF` only |

The MCP wrapper bootstraps the seal with `--no-glass` if missing. `dogfood-e2e.sh` starts glass.

## Do / don’t

| Do | Don’t |
|----|--------|
| `list_desks` → **dogf** only | Call operate MCP `cockpit-research` against kernel vault |
| HTTP `:4695` / `#/dogf/filings` | Underwrite NVDA on product |
| `./scripts/dogfood-down.sh` | `rm -rf` the clone root |
| Empty-shell: `customer-sim-e2e.sh` | Assume `~/Desktop/cockpit-dogfood` exists |

## Filings bar in the seal

PASS: pipeline catalog (compile-lane cache), `POST {job:filing_map}` queued, inbox has last print + flip-triggers.

Not claimed: live EDGAR CIK for DOGF, Grok publish of `delta.json` (that is a model session in the seal).

## Files

- `scripts/dogfood-up.sh` · `dogfood-e2e.sh` · `dogfood-down.sh`
- `scripts/cursor-dogfood-mcp.sh` · `.cursor/mcp.json` · `.cursor/rules/cockpit-e2e.mdc`
- `.grok/commands/cockpit-dogfood-e2e.md`
