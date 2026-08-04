# Friend upgrade — already using Cockpit, want new features

**You keep your personalized books.** This only updates the **product shell** (glass + agents + factory).

Decision-support only — no buy/sell/hold, PT, or sizing.

---

## What you get (without re-underwriting)

| Feature | Where |
|---------|--------|
| **Daybook daily** | AGENTS → **Daily brief** · `/cockpit-daily {your-slug}` |
| **Street** | Rail **Street** · **REFRESH STREET** + **OPEN GROK** |
| Future desks | Same factory — no per-ticker forks |

Your `house-view-*.md`, risks, packs, and desk list stay on disk.

---

## One command (recommended)

From **your** Cockpit clone root (the folder you already use):

```bash
cd /path/to/your/Cockpit-AI   # or cockpit-product, etc.
./scripts/friend-upgrade.sh
```

That will:

1. `git pull --ff-only` (if this is a git repo with upstream)  
2. `bootstrap` / build glass  
3. Ensure **Street** is in thin desk rooms (without wiping desks)  
4. Re-pin **cockpit-research** MCP to **this** folder  
5. Run doctor  

Then:

```bash
./scripts/run-glass.sh
# browser: Cmd+Shift+R
```

### Flags

| Flag | When |
|------|------|
| `--no-pull` | You already pulled / offline / custom merge |
| `--no-mcp` | Skip Grok MCP reinstall |
| `--skip-build` | Rare — you built yourself |

---

## Manual path (same steps)

```bash
git pull --ff-only          # or merge carefully
./scripts/bootstrap.sh
node ./scripts/ensure-thin-rooms.mjs
./scripts/install-grok-mcp.sh
./scripts/run-glass.sh
```

---

## Safe by design

| Touched | Not touched |
|---------|-------------|
| glass / server / agents | `research-wiki/**` research content |
| `.grok/commands` | your house / risk markdown (except rooms list only) |
| `ensure-thin-rooms` may **add** `street` to rooms | desk list, tickers, profiles |
| MCP pin | ontology pack **contents** |

Backup of `thin-desks.json` is written if rooms are patched:  
`thin-desks.json.bak-upgrade-<timestamp>`.

---

## After upgrade — 60 second check

| Check | Pass |
|-------|------|
| Glass loads | your desks still in switcher |
| Daily brief | opens daybook (what moved), not a full risk dump |
| Street room | on rail; may say **NEEDS BUILD** until you REFRESH STREET |
| REFRESH STREET | opens `/cockpit-street {slug} pipeline` |
| MCP | agents see **your** house (not someone else’s vault) |

---

## If git pull conflicts

Usually only on files you edited by hand (rare). Prefer:

```bash
git status
# keep YOUR thin-desks.json and vault if conflicted
# take THEIRS for memory-cockpit-v2/server, src/pages/thin, .grok/commands
./scripts/friend-upgrade.sh --no-pull
```

Never replace your monorepo with someone else’s full vault “to get Street.”

---

## First install instead?

→ **[`FRIEND-START.md`](./FRIEND-START.md)**

---

## Anthony (ship features to friends)

```bash
# On dogfood Mac — push platform to product tree first:
cd ~/Desktop/cockpit-kernel   # or product
./scripts/sync-agent-surface.sh --from kernel --to product
cd ~/Desktop/cockpit-product
# commit + push Cockpit-AI when ready
```

Friends only need `friend-upgrade.sh` after that push lands on GitHub.
