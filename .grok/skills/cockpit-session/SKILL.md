---
name: cockpit-session
description: >
  Cold-start map for Anthony's Cockpit trees, build, test, and ship.
  Use whenever a new Grok Build session starts work on Cockpit, kernel, product,
  Cockpit-AI, glass, factory features, lab-e2e, or friend upgrade.
  Triggers: cockpit, cockpit-kernel, cockpit-product, Cockpit-AI, build feature,
  ship to friends, lab-e2e, factory, thin desk platform, sync-agent-surface.
---

# Cold session (load this first)

Decision-support only. If cwd is `$HOME` or `cockpit-personal`, still use these paths.

| Tree | Path | Use |
|------|------|-----|
| **kernel** | `~/Desktop/cockpit-kernel` | **Build / dogfood** · glass `:4682` |
| **product** | `~/Desktop/cockpit-product` | Friend SoR · GitHub `realanthonyjoonha/Cockpit-AI` · `:4681` |
| **personal** | `~/cockpit-personal/repo` | Grok Bot twin — **not** factory SoR |

Product `thin-desks.json` must stay `desks: []`. Never ship research books.

**Operate** → `/cockpit-*` research commands on kernel MCP.  
**Build** → `/cockpit-feature` on kernel (`docs/EASY.md`).  
**Ship** → `/cockpit-ship` (push only if human said push).

Full card: `~/Desktop/cockpit-kernel/docs/SESSION.md`

Scars: new `pages/thin` imports go on `scripts/sync-agent-surface.sh` + `docs/PRODUCT-KERNEL-SOR.md`. `npm run build` does not remount Express — restart `npm start` after server changes. Run `test:platform` on **product** empty shell, not only kernel. Default `lab-e2e` is not a UI click (`--glass` for HTTP). Cockpit-AI may be archived — unarchive before push.
