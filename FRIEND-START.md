# Friend start — first Mac, never seen this project

**You are installing an empty product shell** — not someone else’s stock books.  
**Decision-support only** — no buy/sell/hold, price targets, or position sizing.

**Already have Cockpit and just need new features (Street, daybook)?**  
→ **[`FRIEND-UPGRADE.md`](./FRIEND-UPGRADE.md)** · one command: `./scripts/friend-upgrade.sh`

---

## Before you start (machine prerequisites)

Install these **on the Mac** first (Cockpit scripts do **not** install them):

| Need | Check |
|------|--------|
| **Git** | `git --version` |
| **Node 18+** (includes npm) | `node -v` · `npm -v` |
| **Python 3** | `python3 --version` (usually preinstalled on macOS) |
| **Grok Build / CLI** authenticated | `grok --version` |

Cockpit then installs **its own** npm deps + wires **`cockpit-research` MCP** via the steps below.

---

## Order (do not skip)

### 1. Install Grok

Install **Grok Build** / Grok CLI until Terminal can run:

```bash
grok --version
```

(or whatever command your Grok install documents)

### 2. Clone this repo

```bash
git clone https://github.com/realanthonyjoonha/Cockpit-AI.git
# or: git clone git@github.com:realanthonyjoonha/Cockpit-AI.git
cd Cockpit-AI
# folder name can be anything: git clone <url> my-folder && cd my-folder
```

### 3. Bootstrap the product shell

```bash
./scripts/bootstrap.sh
# optional one-shot MCP: ./scripts/bootstrap.sh --with-mcp
```

Expect **doctor PASS**.  
**0 packs / empty desks is correct** on first run.

### 4. Start glass

```bash
./scripts/run-glass.sh
```

Open the URL it prints (often `http://127.0.0.1:4681` on a clean Mac, or **:4682** if 4681 is taken).

You should land on **`#/start`**:

- **START** in the switcher  
- **Build next company** on the page  
- No company desks until you underwrite one  

### 5. Wire Grok to *this* folder

From the **repo root** (same folder as this file):

```bash
./scripts/install-grok-mcp.sh
```

MCP must point at **this clone only**. Do not install MCP from a different copy of the project.

### 6. First company (yours)

On glass **START**:

1. Optional: type a ticker  
2. Click **Build next company**  
3. Grok opens with `/cockpit-new-desk` (deep research default)  
4. You own house **CONFIRM** and risk **ACCEPT** — agents propose only  

Or scaffold structure only (no thesis):

```bash
./scripts/scaffold-new-desk.sh TICKER [slug] ["Display Name"]
```

Canonical URL uses **lowercased ticker** as slug (e.g. `TSM` → `#/tsm/house`).  
Wrong spelling shows **Desk not found** (not a silent blank START).

---

## Success checklist

| Check | Pass means |
|--------|------------|
| `#/start` loads | Shell works |
| Build next company visible | Underwrite door works |
| Empty desks at first | Product-only clone (no leaked books) |
| After scaffold, desk appears | Live registry (no rebuild required) |
| House stays FORMING until you gate | No invented CONFIRM |

---

## What this is not

- Not a portfolio of NVDA/AVGO/TSM/AMD research  
- Not auto buy/sell advice  
- Not “full desk” until **you** research + compile + ACCEPT  

Deeper docs: `COLD-START.md` · `SETUP-GROK-COCKPIT.md` · `AGENTS.md`  

**Add your own agents (like Research):** `docs/AGENT-AUTHORING.md` · paste prompt in `FRIEND-AGENT-PROMPT.md`

---

## If something fails

| Symptom | Fix |
|---------|-----|
| `grok` not found | Finish Grok install; reopen Terminal |
| Port in use | `PORT=4682 ./scripts/run-glass.sh` |
| OPEN GROK / Build next company fails | Run glass + `install-grok-mcp.sh` from this repo; macOS only for Terminal spawn |
| MCP lists wrong desks | Re-run `install-grok-mcp.sh` **inside this clone** |
| Desk 404 / unknown | Use slug from scaffold (`#/tsm` not a random brand path), or check START switcher |

---

*Product kernel only. Your books stay yours.*
