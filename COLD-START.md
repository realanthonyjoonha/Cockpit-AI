# Cold start — product ready, no company chosen

**Path 2 (bootstrap + front door).**  
**Decision-support only** — no buy/sell/hold, price targets, or position sizing.

**Definition (binding):** cold start means all **necessary product files/tools** work, and:

- a company has **not** been picked yet  
- **no** research book has been built for a company  

Agents never invent house views or risk registers to “finish” cold start.  
**You** own house stance and risk ACCEPT after research begins.

Deep agent law: [`AGENTS.md`](./AGENTS.md).  
Grok MCP detail: [`SETUP-GROK-COCKPIT.md`](./SETUP-GROK-COCKPIT.md).

---

## Three folders (do not mix)

| Folder | Role |
|--------|------|
| **Live monorepo** (this repo as you use it) | Product **+** your real books (Memory, NBIS, MSFT, …) |
| **Kernel** (empty cold start) | Product only · empty `thin-desks.json` · no company research/packs |
| **Kernel + optional MSFT example** | Kernel **plus** explicit Microsoft reference for learning |

```bash
# From the LIVE monorepo — create empty cold-start folder:
./scripts/export-kernel.sh ~/Desktop/cockpit-kernel

cd ~/Desktop/cockpit-kernel
./scripts/bootstrap.sh
# Use :4682 if live monorepo already occupies :4681
PORT=4682 ./scripts/run-glass.sh
# → http://127.0.0.1:4682/#/start   (START only · no Memory · no company desks)

# Optional later — Microsoft reference only (from LIVE monorepo):
./scripts/install-example-msft.sh ~/Desktop/cockpit-kernel
# restart kernel glass on PORT=4682
```

**Port convention (when both run on one Mac):**

| Port | Product |
|------|---------|
| **4681** | Live monorepo (your full books; may still include Memory until retired) |
| **4682** | Empty **kernel** cold start (no Memory, no company) |

| Script | Job |
|--------|-----|
| `scripts/export-kernel.sh DEST` | Copy **product kernel** → new folder (no company content) |
| `scripts/install-example-msft.sh DEST` | Optional MSFT thin example into a kernel |
| `scripts/scaffold-new-desk.sh TICKER [slug] [Name]` | Empty desk structure only (no invented research) |
| `scripts/bootstrap.sh` | install + build + doctor |
| `scripts/doctor.sh` | shell health (packs optional) |
| `scripts/run-glass.sh` | glass with monorepo env (kernel → PORT 4682 if `KERNEL.md`) |
| `scripts/install-grok-mcp.sh` | wire `cockpit-research` for **this** monorepo (user + project pin) |

### MCP invariant (fresh user — no dual-folder pain)

Product path is **one folder**:

```text
export-kernel → cd that folder → bootstrap → install-grok-mcp → run-glass
```

| Rule | Why |
|------|-----|
| MCP is bound to **this monorepo** | `install-grok-mcp` + OPEN GROK write `.grok/config.toml` (project scope) |
| Skills call `cockpit-research` by name | Project pin overrides any other user MCP of that name when cwd is this folder |
| OPEN GROK always `cd` monorepo root | Glass sets `COCKPIT_REPO`; agents see the same desks as glass |
| Fresh users never need dual MCP | Dual MCP is only if **you** run two monorepos on one Mac (power-user) |

Do **not** install MCP from a different clone than the glass you open.  
Do **not** treat live monorepo + kernel as the default cold-start story.

Docs: [`examples/README.md`](./examples/README.md) · [`examples/microsoft/README.md`](./examples/microsoft/README.md)

---

## What “green cold start” means (kernel)

| In scope | Out of scope |
|----------|----------------|
| Kernel folder boots glass | Underwriting a ticker |
| Ontology **engine** · packs **empty** | Invented WATCH / house |
| `thin-desks.json` → `"desks": []` | Auto-CONFIRM / auto-ACCEPT |
| Glass **START**: no company yet | MSFT as default cold start |
| Optional MSFT via **explicit** install | Treating example as permanent book |

---

## Glass front door

| Route | Meaning |
|-------|---------|
| **`#/start`** | Shell ready · **Build next company** → OPEN GROK (`/cockpit-new-desk`) · works with **0 desks** |
| MEMORY | Specialist (live monorepo / if vault data exists) |
| Thin desks | Only after registry row (example or real underwriting) |

**Underwrite door (product shell):** on START, optional ticker + **Build next company** opens Grok in this monorepo with the new-desk ritual. Available **before** company #1 (empty registry). No invented house/WATCH — you CONFIRM/ACCEPT on glass.

**Desk reliability (end-user):** glass mounts thin desks **live** from `config/thin-desks.json` (mtime reload). New scaffold → desk appears without rebuild/restart. Slug = lowercased ticker (`TSM` → `#/tsm`); unknown hashes show **Desk not found** (with suggestions), never silent bounce to START.

---

## After cold start (not cold start)

```text
1. YOU pick company
2. Research (vault; Grok assists)
3. Pack + ./ont compile + ./ont verify
4. YOU gate house + risks (SAVE / ACCEPT)
5. thin-desks.json profile row → same thin cockpit + agents
```

Playbook: [`memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md`](./memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md)

---

## Definition of done (kernel)

- [ ] `export-kernel.sh` → empty desks / no company packs  
- [ ] `doctor` exit 0 in that folder  
- [ ] Glass **START** with no company switcher desks  
- [ ] Optional MSFT only after `install-example-msft.sh`  
