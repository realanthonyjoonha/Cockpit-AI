# Release platform (kernel → product → friends)

**Worth addressing soon:** stop dual-tree drift so friends get the same glass/agents you dogfood.

**Privacy law (binding):** Your **research books are irrelevant to friends** and must **never** ship.

| Ship (platform) | Never ship (your books) |
|-----------------|-------------------------|
| glass, agents, factory, tests, OPERATE/RELEASE | `research-wiki` house/raw/entities/sources |
| empty product shell (`desks: []`) | pack JSON, street firm models, briefs |
| templates / RESEARCH-PATHS | risk dossiers, proposals, secrets |

Friends get a **blank product** that *can host* their own books — not a copy of yours.  
`sync-agent-surface` and this checklist only move **platform** code.

Decision-support only.

---

## Roles (unchanged)

| Tree | SoR for |
|------|---------|
| **cockpit-kernel** | Your books + dogfood platform changes first |
| **cockpit-product** / **Cockpit-AI** | What friends clone and `friend-upgrade` |

---

## How you actually follow this (habit)

| When | You do |
|------|--------|
| Finished a **platform** feature on kernel | `./scripts/lab-e2e.sh` then `./scripts/release-check.sh --full` |
| Lab + check say **PASS** | Review `git status` on product (no vault) → commit → push |
| Either says **FAIL** | Fix; do **not** push |
| Normal research day | **`OPERATE.md`** only — no release |
| Friend asks for updates | Confirm you pushed; they run `friend-upgrade` |

**Agents:** before claiming “friends can use this,” run `./scripts/lab-e2e.sh` **and** `release-check.sh --full` and show PASS. Never push unless human asks.  
Blank product E2E: [`docs/LAB.md`](./docs/LAB.md). Multi-instance eng: [`docs/MULTI-INSTANCE.md`](./docs/MULTI-INSTANCE.md).

### Ship checklist (do in order)

### 0. One command (preferred)

```bash
cd ~/Desktop/cockpit-kernel
./scripts/release-check.sh --full
```

### 1. Dogfood green on kernel (if not using --full)

```bash
cd ~/Desktop/cockpit-kernel/memory-cockpit-v2
npm run test:platform
# If glass up:
node scripts/desk-health.mjs --all --base-url http://127.0.0.1:4682
```

### 2. Sync platform only → product

```bash
cd ~/Desktop/cockpit-kernel
./scripts/sync-agent-surface.sh --from kernel --to product
```

Does **not** copy research-wiki or thin-desks desks.

### 3. Product smoke

```bash
cd ~/Desktop/cockpit-product/memory-cockpit-v2
npm run test:thin-slug-resolve
npm run test:desk-health
```

### 4. Privacy glance (before commit)

```bash
cd ~/Desktop/cockpit-product
git status
# desks must stay [] on product SoR
# no house-view-*, raw research, street JSON, pack JSON
```

### 5. Commit + push product (when you want friends to get it)

```bash
cd ~/Desktop/cockpit-product
git add …   # platform files only — no secrets, no books
git commit -m "…"
git push origin main
```

### 6. Tell friends

```text
cd your/Cockpit-AI
./scripts/friend-upgrade.sh
./scripts/run-glass.sh
# hard-refresh browser
```

---

## Never put in RESERVED_API_SLUGS

- Live thin **ticker slugs** (nbis, nvda, …)  
- Only Memory/global first segments (`house`, `risks`, `overview`, `street`, …)

After any change to `thinDeskMount.js` or registry: `npm run test:thin-slug-resolve`.

---

## Done means

| Check | |
|-------|--|
| Kernel `test:platform` green | |
| Sync ran kernel → product | |
| Product desk-health / slug-resolve green | |
| Product pushed if friends need it | |
| Your vault was not in the commit | |

---

## Related

- `docs/PRODUCT-KERNEL-SOR.md` — what to sync  
- `OPERATE.md` — daily use  
- `FRIEND-UPGRADE.md` — friend path  
