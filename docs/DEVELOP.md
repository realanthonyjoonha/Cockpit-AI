# Develop platform (cold-session developer guide)

**Audience:** Anthony (or a coding agent) building the **engine** — glass, agents, factory, ship path.  
**Not for:** daily desk research → [`OPERATE.md`](../OPERATE.md) · friends install/upgrade → [`FRIEND-START.md`](../FRIEND-START.md) / [`FRIEND-UPGRADE.md`](../FRIEND-UPGRADE.md).

**Hard law is not here.** Read **[`AGENTS.md`](../AGENTS.md)** first (decision-support, no invent, human ACCEPT, no secrets). This file is **procedure** for platform work so habits survive cold sessions.

**Anthony’s short path:** [`EASY.md`](./EASY.md) · slash **`/cockpit-feature`** (build) · **`/cockpit-ship`** (friends).  
This file is the deep procedure those commands implement.

Decision-support only.

---

## 1. When to use this file

| Job | Open |
|-----|------|
| New glass/agent/factory feature, AFK coding loop, fix ship path | **`/cockpit-feature`** first · then **this file** → blank E2E [`LAB.md`](./LAB.md) · ship [`/cockpit-ship`](../.grok/commands/cockpit-ship.md) / [`RELEASE.md`](../RELEASE.md) |
| Daybook / Street / risk-check on an existing desk | [`OPERATE.md`](../OPERATE.md) |
| “Friends can upgrade?” | [`RELEASE.md`](../RELEASE.md) + `./scripts/release-check.sh --full` |
| What copies kernel ↔ product | [`PRODUCT-KERNEL-SOR.md`](./PRODUCT-KERNEL-SOR.md) |
| Multi-instance eng / many glasses | [`MULTI-INSTANCE.md`](./MULTI-INSTANCE.md) |

---

## 2. Read order (developer)

1. **`AGENTS.md`** — hard rules  
2. **This file** — classify, brief, done stages  
3. **`RELEASE.md`** — only when shipping platform to product/friends  
4. Task-specific: `THIN-DESK-CONTRACT.md` · `NEW-DESK-PLAYBOOK.md` · `docs/AGENT-AUTHORING.md`

---

## 3. Classify before any edit

| Class | Meaning | Ship to friends? |
|-------|---------|------------------|
| **PLATFORM** | Works with product `desks: []` and empty vault (or only *their* later data) | Yes (via release path) |
| **CONTENT** | Your house, risks, raw research, packs, street firm rows for *your* names | **Never** |
| **HYBRID** | Engine + dogfood data (e.g. Street UI + your MSFT street JSON) | Ship **engine half only** |

**Litmus:** *Does this still make sense on a blank product install?* If no → CONTENT (or hybrid; don’t ship content).

---

## 4. Before you code (checklist)

- [ ] Class is explicit (PLATFORM / CONTENT / HYBRID)  
- [ ] Code goes in **shared** thin factory / server / agents — **no** new per-ticker UI/server forks  
- [ ] Data is **install-local** (registry, vault, packs) — not hardcoded Anthony tickers as product defaults  
- [ ] New file friends need → add to **`scripts/sync-agent-surface.sh`** allowlist + [`PRODUCT-KERNEL-SOR.md`](./PRODUCT-KERNEL-SOR.md)  
- [ ] No edits to `research-wiki` house/raw (or `thin-desks.json` **desks**) unless this is intentional CONTENT work  
- [ ] Never hand-edit `ontology/store/` · never commit secrets  

---

## 5. Feature brief (put in the agent report)

```text
Feature: <name>
Class: PLATFORM | CONTENT | HYBRID (engine: …)
Works with product desks=[] ? yes/no
Files touched: …
Sync allowlist update? yes/no (paths: …)
Verify: <commands>
Content left on kernel only: <none | list>
Push: not done — awaiting Anthony
```

Missing brief → not reviewable; do not claim done.

---

## 6. Done stages (do not collapse)

| Stage | Meaning | Who |
|-------|---------|-----|
| **Implement done** | Kernel change + relevant tests green | Agent OK |
| **Ship-ready** | `./scripts/lab-e2e.sh` **PASS** · `./scripts/release-check.sh --full` **PASS** · product privacy OK | Agent runs gates; does **not** push |
| **Shipped** | Human committed/pushed **product** · eng/friends pull or `friend-upgrade` | **Human only** |

Never say “friends can upgrade” without ship-ready. Never `git push` unless the human explicitly asks.

Blank-product gate (friend-shaped): **[`LAB.md`](./LAB.md)** · `./scripts/lab-e2e.sh`  
Add a **lab feature hook** when the feature needs a lasting E2E assert (`scripts/lab-feature-hooks/`).

---

## 7. AFK / loop defaults (full-time job)

```text
Default class: PLATFORM
May edit: glass, server, scripts, .grok/commands, platform docs, tests
Must not: push; ACCEPT house/risks; invent claims; copy vault → product;
          weaken tests to get green; edit research books unless asked
Stop at: implement evidence + release-check log + feature brief
```

You review on glass when free; you push when you trust it.

---

## 8. Verify (minimum)

```bash
# Named lever — same checklist Glass posts as proof and Lab FAILs on
# (test:platform, lab-e2e, empty-shell PRODUCT desks=[], VM-glass shots)
./scripts/verify-feature.sh              # layout/UI
./scripts/verify-feature.sh --docs-only  # docs/scripts only (must say so)

# Narrower (not a substitute for the lever)
cd memory-cockpit-v2 && npm run test:platform

# Before claiming ship-ready
cd <kernel-root> && ./scripts/release-check.sh --full
```

Room hashes + what proof looks like: [`FEATURE-MAP.md`](./FEATURE-MAP.md).  
Empty product install must still pass platform/health checks. Desk dead but pack green → `desk-health.mjs` (see AGENTS task table).

---

## 9. Where code goes / forbidden

| Do | Don’t |
|----|--------|
| `memory-cockpit-v2/server/*` shared thin paths | `server/nbis*.js` style forks for new operate features |
| `src/pages/thin/*` + registry rooms | Per-desk page trees |
| `.grok/commands/cockpit-*.md` | Agents that assume only Anthony’s vault paths |
| `scripts/*` upgrade/health/release | Sync that copies `research-wiki` or `thin-desks` desks |

---

## 10. Verify this discipline still holds

Host (no Docker required):

```bash
# from kernel root
./scripts/test-develop-discipline.sh
```

Container (isolated Node + git; mounts kernel + product read-only):

```bash
./docker/develop-discipline/run.sh
# falls back to host script if docker is not installed
```

---

## 11. Related (links only)

| Doc | Role |
|-----|------|
| [`AGENTS.md`](../AGENTS.md) | Hard law |
| [`FEATURE-MAP.md`](./FEATURE-MAP.md) | Factory rooms + verify lever |
| [`RELEASE.md`](../RELEASE.md) | Ship ritual |
| [`OPERATE.md`](../OPERATE.md) | Desk day jobs |
| [`PRODUCT-KERNEL-SOR.md`](./PRODUCT-KERNEL-SOR.md) | Dual-tree sync |
| [`FRIEND-UPGRADE.md`](../FRIEND-UPGRADE.md) | What friends run after you ship |
| `memory-cockpit-v2/plans/THIN-DESK-CONTRACT.md` | Thin desk contract |
| `memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md` | Add a company (contentful underwrite) |
| [`AGENT-AUTHORING.md`](./AGENT-AUTHORING.md) | New glass agent wiring |

---

*Procedure only. If this file conflicts with AGENTS.md, AGENTS wins.*
