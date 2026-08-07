# Product ↔ Kernel source of truth

**As-of:** 2026-08-04  
Decision-support only. Stops silent drift between dogfood (`cockpit-kernel`) and friend/product (`cockpit-product` / Cockpit-AI).

**Ship ritual (short):** see root **`RELEASE.md`** (sync → smoke → push product).  
**Daily operate map:** root **`OPERATE.md`**.

---

## Roles

| Tree | Role | What is SoR here |
|------|------|------------------|
| **cockpit-kernel** | Anthony dogfood monorepo | **Research vault**, packs, house/risks ACCEPT, thin desks you underwrite |
| **cockpit-product** | Friend / clean product surface | **Agent surface + glass platform** when shipping to others; may lag vault |

**Research (claims, house, risks, raw research) never auto-mirrors.** That is human/vault owned in the tree where it was underwritten.

**Platform code** (agents, openGrok, thin factory, MCP, format-check) should stay aligned via an explicit sync — not tribal “I think I copied it.”

---

## What to sync (platform only)

Use `./scripts/sync-agent-surface.sh` (see below). Paths:

```text
.grok/commands/cockpit-*.md          # daybook, street, operate agents
.grok/commands/cockpit.md
.grok/skills/cockpit/SKILL.md
FRIEND-UPGRADE.md
scripts/friend-upgrade.sh
scripts/ensure-thin-rooms.mjs
memory-cockpit-v2/server/openGrok.js
memory-cockpit-v2/server/pack.js
memory-cockpit-v2/server/thinDeskProfiles.js
memory-cockpit-v2/server/thinModel.js
memory-cockpit-v2/server/thinStreet.js
memory-cockpit-v2/server/streetSchema.js
memory-cockpit-v2/server/streetProvider.js
memory-cockpit-v2/server/streetAgentSeed.js
memory-cockpit-v2/server/thinDeskMount.js
memory-cockpit-v2/server/index.js
memory-cockpit-v2/src/pages/thin/GrokAgents.jsx
memory-cockpit-v2/src/pages/thin/Street.jsx
memory-cockpit-v2/src/pages/thin/DeskRouter.jsx
memory-cockpit-v2/src/thinDesks.js
memory-cockpit-v2/scripts/*street*
memory-cockpit-v2/scripts/desk-health.mjs
memory-cockpit-v2/scripts/thin-slug-resolve-test.mjs
memory-cockpit-v2/scripts/open-grok-prompt-test.mjs
memory-cockpit-v2/scripts/mcp-cockpit-research.mjs
memory-cockpit-v2/scripts/thin-desk-format-check.mjs
memory-cockpit-v2/scripts/thin-desk-rigor.mjs
memory-cockpit-v2/scripts/pack-cache-test.mjs
memory-cockpit-v2/scripts/live-registry-test.mjs
memory-cockpit-v2/plans/THIN-DESK-CONTRACT.md
memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md
memory-cockpit-v2/plans/2026-08-04-desk-health-gate.md
OPERATE.md
RELEASE.md
docs/DEVELOP.md
docs/LAB.md
docs/MULTI-INSTANCE.md
scripts/test-develop-discipline.sh
scripts/lab-e2e.sh
scripts/run-glass-instance.sh
scripts/lab-feature-hooks/
docker/product-lab/
docker/develop-discipline/
docs/FINANCE-AGENT-PORTS.md
docs/AGENT-AUTHORING.md
docs/PRODUCT-KERNEL-SOR.md
```

**Do not sync** without intent:

- `research-wiki/**` (vault)
- `ontology/store/**` (compile output)
- `config/thin-desks.json` (per-install desk list)
- house / proposals / secrets

---

## Default direction

| Situation | Direction |
|-----------|-----------|
| Dogfood new agent / glass fix first | **kernel → product** |
| Friend tree is the release SoR for platform | **product → kernel** after friend dogfood |
| Unsure | Diff both; pick the side that has the intentional change |

Script:

```bash
# From either monorepo root
./scripts/sync-agent-surface.sh --from kernel --to product   # Anthony → friend
./scripts/sync-agent-surface.sh --from product --to kernel   # friend → dogfood
./scripts/sync-agent-surface.sh --dry-run --from kernel --to product
```

Env overrides:

```text
COCKPIT_KERNEL=/path/to/cockpit-kernel
COCKPIT_PRODUCT=/path/to/cockpit-product
```

Defaults on Anthony’s Mac: `~/Desktop/cockpit-kernel` and `~/Desktop/cockpit-product`.

---

## Done means

After platform sync:

1. `cd <dest>/memory-cockpit-v2 && npm run test:thin-slug-resolve && npm run test:desk-health`  
   (prefer full `npm run test:platform` when time allows)  
2. Restart glass if server files changed  
3. **No automatic git** — commit/push product only when the human says so (see **`RELEASE.md`**)  

## Hard rule (NBIS scar)

Never add a **live thin desk slug** to `RESERVED_API_SLUGS`. Only Memory/global first segments.  
Exact legacy paths (e.g. `/api/nbis/proposals*`) do not require reserving the whole slug.

---

## Related debt already addressed (2026-07-31)

| Debt | Fix |
|------|-----|
| MCP desks frozen at boot | `getLiveThinDeskProfiles()` mtime cache |
| format-check required per-slug wrappers | Factory path: wrappers optional |
| Pack stale mid-TTL after compile | `loadPack` mtime-authoritative + `test:pack-cache` |
| Dual-tree drift | This doc + `sync-agent-surface.sh` |
