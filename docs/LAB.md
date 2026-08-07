# Product Lab — blank-product E2E (engineering)

**Purpose:** Prove platform features on a **research-free product shell** before ship.  
**Not:** dogfood of Anthony’s books · not required for casual friend install.

Decision-support only. Hard law: [`AGENTS.md`](../AGENTS.md). Procedure: [`DEVELOP.md`](./DEVELOP.md). Multi-instance: [`MULTI-INSTANCE.md`](./MULTI-INSTANCE.md).

---

## Who uses this

| Who | Use |
|-----|-----|
| Anthony / eng agents | Gate every platform feature: `./scripts/lab-e2e.sh` |
| Engineering teammate | Same scripts after product pull; optional long-run glass on **:4690** |
| Casual friend (use only) | **Skip** — use [`FRIEND-UPGRADE.md`](../FRIEND-UPGRADE.md) |
| **Grok as customer** (first-run / feature use) | [`CUSTOMER-SIM.md`](./CUSTOMER-SIM.md) · `/cockpit-customer-sim` · `customer-sim-preflight.sh` |

---

## One command (gate)

```bash
# From monorepo root that has docker/product-lab (kernel or product after sync)
./scripts/lab-e2e.sh
```

Requires: Docker (Colima on Mac is fine) + local **product** tree with `desks: []`.

Env:

| Variable | Default |
|----------|---------|
| `COCKPIT_PRODUCT` | `~/Desktop/cockpit-product` |
| `COCKPIT_KERNEL` | monorepo root if KERNEL.md / this repo |
| `LAB_PORT` | `4690` (glass profile) |

**Ship-ready** = `lab-e2e` PASS **and** `./scripts/release-check.sh --full` PASS.  
**Shipped** = human push only.

---

## What “blank product” looks like (frontend)

- URL e.g. `http://127.0.0.1:4690/#/start`
- Switcher: **START** only  
- CTA: **Build next company**  
- **No** dogfood tickers (NVDA/NBIS/…)

If you see filled desks from another monorepo → wrong tree/port.

---

## Multi-instance (lab is one slot)

| Slot | Typical path | Port |
|------|--------------|------|
| Dogfood | `cockpit-kernel` | **4682** |
| Product SoR | `cockpit-product` | **4681** |
| **Lab E2E** | product tree via compose **or** extra clone | **4690** (+4691…) |

See [`MULTI-INSTANCE.md`](./MULTI-INSTANCE.md). Lab defaults **never** bind 4681/4682.

```bash
# Optional long-run lab glass (after image build / compose)
./scripts/lab-e2e.sh --glass
# or: docker compose -f docker/product-lab/docker-compose.yml --profile glass up glass
```

---

## Guards (fail closed)

- Product `thin-desks.json` → `desks.length === 0` at clean lab start  
- No dependence on kernel `research-wiki` content  
- DEVELOP discipline suite (docs + privacy) included in `lab-e2e`  
- **Contamination / multi-instance:** never share one data dir across instances; never use kernel dogfood as lab SoR  

```bash
# Extensive isolation (N sealed trees, cross-marker, mutation, optional Docker + live glass)
./scripts/lab-isolation-e2e.sh --n 5 --docker --live
# or folded into lab-e2e:
./scripts/lab-e2e.sh --isolation --isolation-docker --isolation-live --isolation-n 5
```

See [`MULTI-INSTANCE.md`](./MULTI-INSTANCE.md) § Contamination.

---

## Feature hooks

When you add a platform feature, extend:

```text
scripts/lab-feature-hooks/
  README.md
  10-empty-shell.sh
  20-open-grok-agents.sh
  30-street-surface.sh
```

Hooks run from `lab-e2e` after base health. Keep them fast and empty-install safe.

---

## Reset (= new computer)

```bash
docker compose -f docker/product-lab/docker-compose.yml --profile test down -v 2>/dev/null || true
./scripts/lab-e2e.sh
```

Do not “fix” a red lab by mounting kernel vault.

---

## Related

| Doc | Role |
|-----|------|
| [`MULTI-INSTANCE.md`](./MULTI-INSTANCE.md) | N cockpits at once (eng) |
| [`DEVELOP.md`](./DEVELOP.md) | Platform build procedure |
| [`RELEASE.md`](../RELEASE.md) | Ship to product remote |
| [`FRIEND-UPGRADE.md`](../FRIEND-UPGRADE.md) | Casual upgrade (no Docker) |
