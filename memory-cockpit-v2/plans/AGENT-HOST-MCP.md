# Controlled agent host — cockpit MCP

**Primary host: Grok Build** · Optional later: Claude Code / Desktop · Any MCP client  
**Decision-support only** · No API key in glass · House writes only via glass SAVE / ACCEPT  

**New user cold start (clone only):** [`SETUP-GROK-COCKPIT.md`](../../SETUP-GROK-COCKPIT.md) at repo root.

---

## Architecture

```text
Grok Build (logged in with SuperGrok / X Premium+)
        │  MCP stdio
        ▼
cockpit-research tools
  READ:  list_desks | get_house_view | get_pack_snapshot | get_house_assist_context
  WRITE: propose_house_from_current (preferred) | propose_house_view
         → cockpit/proposals/house-<slug>.json  (draft only)
         list_house_proposals
        │
        ▼
glass House: REVIEW pending → ACCEPT or REJECT
        │  ACCEPT only
        ▼
allowlisted house file write → COMPILE BOOK → REFRESH
```

**Invariant:** MCP never writes `house-view-*.md`. Only glass **ACCEPT** (or manual EDIT→SAVE) does.

Claude Code uses the **same** MCP script; only the install target differs.

---

## Install

```bash
cd memory-cockpit-v2
export COCKPIT_VAULT=…/research-wiki   # if not default next to repo
export ONTOLOGY_STORE=…/ontology/store/by_ticker

# Primary
npm run grok:mcp-install

# Optional (future / dual host)
npm run claude:mcp-install
# or both:
npm run agent:mcp-install -- --all
```

Then:

- **Grok:** new session; `grok mcp list` → `cockpit-research`  
- **Claude Desktop:** Cmd+Q quit fully, reopen  

---

## Daily ritual (Grok Build menu — preferred)

Open Grok Build from the **cockpit-research-os** repo (or any cwd that sees repo `.grok/`).

| Slash command | Action |
|---------------|--------|
| `/cockpit` | Menu |
| `/cockpit-desks` | List desks |
| `/cockpit-daily nbis` | Daily brief: **what moved** + house + pack (chat only) |
| `/cockpit-daily nbis --save` | Same + write `cockpit/briefs/daily/nbis/YYYY-MM-DD.md` (not ontology) |
| `/cockpit-risk-check nbis` | Risk DD vs tripwires (no SoR write) |
| `/cockpit-steelman nbis` | Steelman house vs WATCH |
| `/cockpit-match nbis` | House ↔ pack check |
| `/cockpit-propose nbis …` | Propose via **from_current** replacements (ACCEPT on glass) |
| `/cockpit-pending nbis` | Pending proposals |

Skill: `.grok/skills/cockpit/SKILL.md` (auto + `/cockpit`).

**Glass:** thin desk book strip / House → **AGENTS** dropdown (Daily brief default, Steelman, Match, Propose, …) → **OPEN GROK** (opens Terminal with that slash command for the current desk).

1. Optional morning read: glass **Daily brief** or `/cockpit-daily nbis` (or `msft`) — **what moved** + house/pack; add `--save` / **Daily brief + save** to archive under `cockpit/briefs/daily/{desk}/` (not house/ontology)  
2. Deeper check: `/cockpit-steelman nbis`  
3. To change house: `/cockpit-propose nbis <intent>`  
4. Glass `#/nbis/house` → **REVIEW** → **ACCEPT** or **REJECT**  
5. After ACCEPT: **COMPILE BOOK** → **REFRESH**  

Fallback: freeform chat still works if MCP is installed.

---

## Invariants

| Must | Must not |
|------|----------|
| Pack-grounded facts + grades | Invent numbers |
| Human SAVE for house | Silent house write / auto-CONFIRM |
| Fail closed off allowlist | Edit `ontology/store/` |
| Decision-support language | Buy/sell/PT/sizing |

---

## Multi-host policy

| Host | Status |
|------|--------|
| **Grok Build** | Primary — install + docs default here |
| **Claude Code / Desktop** | Supported same tools; opt-in install |
| **Codex / other MCP** | Point command at `scripts/mcp-cockpit-research.mjs` + env |

Glass never embeds a model. Hosts own subscription login.

---

## Smoke

```bash
npm run smoke          # house save + assist-context API
npm run mcp:cockpit    # should idle as stdio server (Ctrl+C)
grok mcp doctor        # after install
```
