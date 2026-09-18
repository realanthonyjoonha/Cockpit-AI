# Lab feature hooks

Runnable bash scripts invoked by product lab E2E after base empty-install health.

## Contract

```bash
#!/usr/bin/env bash
# $1 = lab work monorepo root (writable, desks=[])
set -euo pipefail
ROOT="${1:?monorepo root}"
# assert something about empty product / platform surface
```

- Must work with **desks=[]**
- No network to Anthony’s vault
- Fast; exit 0 PASS / non-zero FAIL
- Name with numeric prefix: `10-…sh`, `20-…sh`

When you ship a new platform feature, add a hook here (same change set).
