# Cockpit — product kernel (empty cold start)

**Personal research operating system** — glass + ontology + Grok agents.  
**No company books included.** You underwrite the first name yourself.

Decision-support only: no buy/sell/hold, price targets, or position sizing.

---

## New machine? Start here

→ **[`FRIEND-START.md`](./FRIEND-START.md)** (Grok → clone → bootstrap → glass → MCP → Build next company)

## Already using Cockpit? Get new features (Street, daybook)

→ **[`FRIEND-UPGRADE.md`](./FRIEND-UPGRADE.md)** · `./scripts/friend-upgrade.sh`  
Keeps **your** desks and vault; updates glass + agents only.

## Daily use / ship platform

| Doc | Who |
|-----|-----|
| **[`OPERATE.md`](./OPERATE.md)** | Which agent/job for a normal day |
| **[`RELEASE.md`](./RELEASE.md)** | Anthony: kernel → product → push |
| **[`docs/PRODUCT-KERNEL-SOR.md`](./docs/PRODUCT-KERNEL-SOR.md)** | What to sync (never vault) |

---

## Quick run (already cloned)

```bash
./scripts/bootstrap.sh
./scripts/run-glass.sh
# open URL printed → #/start

./scripts/install-grok-mcp.sh   # optional agents; run from this repo root
```

| Expect on first open | |
|----------------------|--|
| Switcher | **START** only |
| Desks | none (`thin-desks.json` → `desks: []`) |
| Packs | empty |
| CTA | **Build next company** |

---

## What ships / what does not

| In this repo | Not in this repo |
|--------------|------------------|
| Glass + thin desk factory | NVDA / AVGO / TSM / AMD research |
| Ontology compile / verify / ask engine | Filled house views / risk registers |
| Cold-start scripts + OPEN GROK | Personal proposals / briefs |
| `/cockpit-new-desk` deep underwrite ritual | Live market data credentials |

---

## After the shell is green

1. **Build next company** on START (or `scaffold-new-desk.sh TICKER`)  
2. Research into `research-wiki/` (graded claims; primary sources)  
3. `cd ontology && ./ont compile TICKER && ./ont verify TICKER`  
4. You **CONFIRM** house and **ACCEPT** risks on glass  
5. COMPILE BOOK + REFRESH  

Playbook: `memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md`  
Law: `AGENTS.md` · `COLD-START.md`

---

## Regenerating this kernel

From a monorepo that has the latest **product** code:

```bash
./scripts/export-kernel.sh ~/Desktop/cockpit-product
```

Export strips company books. Do not copy a contentful dogfood tree into git.

---

## Ports

- Clean Mac: often **:4681**  
- If something already uses 4681: `PORT=4682 ./scripts/run-glass.sh`
