# Multi-instance Cockpit (engineering team)

**You may run as many Cockpit instances as you want** — each is one monorepo folder + one glass port + its own data.

Casual users: one clone is enough → [`FRIEND-START.md`](../FRIEND-START.md) / [`FRIEND-UPGRADE.md`](../FRIEND-UPGRADE.md).  
This page is for **engineering** (Anthony, teammates, agents).

Decision-support only.

---

## Rule of three

```text
1 directory  =  1 glass process  =  1 PORT  =  1 thin-desks + vault
```

| Do | Don’t |
|----|--------|
| `PORT=4691 ./scripts/run-glass.sh` from **that** clone | Two processes same port |
| Separate clone/worktree per experiment | Point MCP at kernel while “testing product” |
| Upgrade **each** clone you care about | Assume one `friend-upgrade` updates every folder |

---

## Port convention

| Port | Typical use |
|------|-------------|
| **4681** | Primary product / friend default |
| **4682** | Kernel dogfood (when `KERNEL.md` present) |
| **4690+** | Lab / extra eng instances |

Helper:

```bash
# From any monorepo root:
./scripts/run-glass-instance.sh 4690
./scripts/run-glass-instance.sh 4691 my-feature-lab
```

Prints URL; fails if port looks busy (best-effort).

---

## How many instances?

**No product hard cap.** Limit = free ports + machine RAM/CPU.

Examples:

```bash
# Instance A — main eng product
cd ~/Desktop/cockpit-product && PORT=4681 ./scripts/run-glass.sh

# Instance B — blank feature branch clone
cd ~/Desktop/cockpit-lab2 && PORT=4690 ./scripts/run-glass.sh

# Instance C
cd ~/Desktop/cockpit-lab3 && PORT=4691 ./scripts/run-glass.sh
```

Browser: three tabs, three URLs.

---

## MCP / Grok (honest limit)

| Goal | Approach |
|------|----------|
| Three UIs in browser | Easy — three ports |
| Agent tools (`list_desks`, pack) on instance B | `cd` B’s root → `./scripts/install-grok-mcp.sh` (re-pin) |
| Gate tests without MCP | `curl` + `./scripts/lab-e2e.sh` (preferred for CI/lab) |

One Grok install usually has **one active cockpit-research pin**. Switching instances for agents = re-pin or use HTTP only.

---

## Blank lab vs personal books

| Instance type | `desks` | Use |
|---------------|---------|-----|
| Empty product | `[]` | Platform E2E, first-run, lab-e2e |
| Personal eng clone | *his* desks | Real underwriting on *his* machine |
| Anthony kernel | dogfood desks | Research — **not** friend SoR |

**Never** copy Anthony’s vault into a shared eng instance to “make tests pass.”

---

## Upgrade each clone

```bash
cd /path/to/that/clone
./scripts/friend-upgrade.sh    # or git pull + bootstrap
# restart glass on THAT clone’s PORT
```

---

## Contamination (long-run rule)

| Required | Forbidden |
|----------|-----------|
| Unique **folder** per instance | Two glasses → same `thin-desks.json` / vault |
| Unique **PORT** per instance | Shared Docker volume for data |
| Lab SoR = **product** (or empty clone) | Lab SoR = **kernel** dogfood books |
| Agents: HTTP to that port **or** re-pin MCP | One MCP pin while assuming five isolated books |

**Prove isolation:**

```bash
./scripts/lab-isolation-e2e.sh --n 5 --docker --live
```

That suite: refuses kernel as SoR, materializes N sealed trees, checks cross-marker leaks, mutation isolation, shared-mount hazard demo, optional Docker dual-mount, optional live multi-glass HTTP.

**Fail-closed MCP multi-scenario (recommended for parallel Grok tests):**

```bash
./scripts/scenario-up.sh A --port 4691 --slugs t1,t2
./scripts/scenario-up.sh B --port 4692 --slugs t3,t4
# OPEN GROK from each glass only — see docs/SCENARIO-PIN.md
```

MCP refuses wrong `COCKPIT_EXPECT_ROOT` / desk not in `COCKPIT_ALLOWED_SLUGS`.

---

## Related

- Blank E2E gate: [`LAB.md`](./LAB.md) · `./scripts/lab-e2e.sh`  
- Platform build: [`DEVELOP.md`](./DEVELOP.md)  
- Ship: [`RELEASE.md`](../RELEASE.md)  
