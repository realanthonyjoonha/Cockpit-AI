# Microsoft thin-desk example (optional reference)

**Not cold start.** Cold start = product ready, **no company chosen**.  
This example shows a **finished thin desk** so you can learn file layout and glass format.

## What it includes (from the live monorepo)

| Artifact | Path in monorepo |
|----------|------------------|
| House | `research-wiki/house-view-microsoft.md` |
| Research root | `research-wiki/raw/microsoft-research/` |
| Entity | `research-wiki/wiki/entities/microsoft.md` |
| Pack config | `ontology/packs/MSFT.json` |
| Compiled pack | `ontology/store/by_ticker/MSFT.json` (regenerate with compile if needed) |
| Thin desk row | profile in `examples/microsoft/thin-desk-fragment.json` |

## Install into a kernel folder

```bash
# from live monorepo root
./scripts/export-kernel.sh ~/Desktop/cockpit-kernel
./scripts/install-example-msft.sh ~/Desktop/cockpit-kernel
cd ~/Desktop/cockpit-kernel
./scripts/bootstrap.sh
./scripts/run-glass.sh
# → START still available; switcher gains MICROSOFT (example)
```

## After install

- Treat as **dogfood / reference**, not your permanent book unless you choose to own it.
- House/risk **ACCEPT** still human.
- To underwrite a **new** name, do not clone this blindly — run research → pack → new `thin-desks.json` row.

## Remove example

Delete MSFT vault/pack files and remove the `msft` row from `memory-cockpit-v2/config/thin-desks.json`, then restart glass.
