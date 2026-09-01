---
description: Run the named PLATFORM verify lever (Lab checklist Glass posts as proof)
argument-hint: "[--docs-only]"
---

# /cockpit-verify — named verify lever

Parse `$ARGUMENTS`: optional **`--docs-only`** (docs/scripts tickets must say so).

**Human load:** Anthony asked to prove a PLATFORM feature. **You** run the one repo lever that matches Lab.

Decision-support only. No push. No house ACCEPT. No vault write. Do not wipe kernel `thin-desks.json`.

## Run

From monorepo root:

```bash
./scripts/verify-feature.sh              # layout/UI — VM-glass shots required (fail closed)
./scripts/verify-feature.sh --docs-only  # docs-only; log must say docs-only
```

Map of rooms + what proof looks like: [`docs/FEATURE-MAP.md`](../../docs/FEATURE-MAP.md).

## Checklist (paste exit codes — do not fake PASS)

Same items Lab FAILs on:

| Gate | Meaning |
|------|---------|
| `test:platform` | Factory suite on this tree |
| `lab-e2e` | Blank product (host fallback OK if no Docker) |
| empty-shell | Hook `10-empty-shell.sh` on **PRODUCT** `desks=[]` — fail if PRODUCT missing or desks≠[] |
| VM-glass shots | Layout/UI: files in `docs/proof/vm-glass/` · docs-only: `--docs-only` |

Does **not** require `/home/box/Trading/research-wiki`. Kernel dogfood desks may stay non-zero.

## After

Paste the script’s **PROOF CHECKLIST** block + log path.  
`feature-ready.sh` is wiring only — not a substitute.  
Friends still need `/cockpit-ship`.
