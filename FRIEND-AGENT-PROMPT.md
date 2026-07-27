# Friend prompt — build a new Cockpit agent (copy entire box into Grok Build)

Copy everything between the lines into a **fresh Grok Build** session. Work only in his Cockpit-AI clone.

---

You are an expert Cockpit product engineer helping me **add a new Grok agent** to my local Cockpit-AI monorepo the same way **Research** was built. Decision-support only: no buy/sell/hold, price targets, or sizing. Never invent graded pack claims, WATCH titles, or CONFIRMED house. Never hand-edit `ontology/store/`. Never silently write house or risks SoR — only MCP propose tools + human glass ACCEPT.

## Read first (in my repo)

1. `docs/AGENT-AUTHORING.md` — full authoring guide  
2. `.grok/commands/cockpit-research.md` — **canonical template** for user-directed research + optional save+compile  
3. `memory-cockpit-v2/server/openGrok.js` — `GROK_AGENTS` + `buildInitialPrompt`  
4. `memory-cockpit-v2/src/pages/thin/GrokAgents.jsx` — `FALLBACK_ALL` (must stay in sync)  
5. `AGENTS.md` — hard product law  

Confirm monorepo root with MCP `list_desks` if available (`monorepo_root` must match this clone).

## Architecture you must respect

```text
Glass AGENTS dropdown → POST /api/open-grok { action, desk }
  → buildInitialPrompt → "/cockpit-<action> {desk}"
  → Grok loads .grok/commands/cockpit-<action>.md
  → MCP reads pack/house; optional vault write; optional ./ont compile
  → Sources page lists vault files only AFTER successful compile (pack source_globs)
```

- **Overview** (first page of each ticker) uses BookStrip → `GrokAgents` variant **`desk`**.  
- To appear there: catalog entry `variants: ['desk']`.  
- START page uses variant **`start`** (e.g. new-desk only).  
- Daily remains `default_for: ['desk']` unless I explicitly ask to change default.

## Backend / ontology / website health (mandatory after any write)

| Write type | Allowed path | Then |
|------------|--------------|------|
| Agent research note | `research-wiki/raw/{slug}-research/agent-research-YYYY-MM-DD-HHMM.md` (top-level `*.md`) | `./ont compile TICKER` then `#/{slug}/sources` |
| Daily brief archive | `research-wiki/cockpit/briefs/daily/{slug}/YYYY-MM-DD.md` only | No ontology compile required |
| House / risks | Propose only → glass ACCEPT | COMPILE BOOK / compile after ACCEPT |
| `ontology/store/**` | **Forbidden** hand edit | compile only |

Env for compile (sequential exports):

```bash
export COCKPIT_REPO="<absolute monorepo root>"
export COCKPIT_VAULT="$COCKPIT_REPO/research-wiki"
export ONTOLOGY_WIKI="$COCKPIT_VAULT"
export ONTOLOGY_STORE="$COCKPIT_REPO/ontology/store/by_ticker"
cd "$COCKPIT_REPO/ontology" && ./ont compile TICKER
# optional: ./ont verify TICKER
```

After code changes: `./scripts/bootstrap.sh` and **restart glass**. Stale glass = old dropdown (e.g. missing new agent).

Verify wiring:

```bash
cd memory-cockpit-v2 && npm run test:open-grok-prompt
curl -sS "http://127.0.0.1:PORT/api/open-grok/agents?variant=desk"   # includes new action
curl -sS -X POST "http://127.0.0.1:PORT/api/open-grok" -H 'Content-Type: application/json' \
  -d '{"action":"YOUR_ACTION","desk":"YOUR_SLUG"}'   # initial_prompt correct
```

If agent saves a note: compile then `GET /api/{slug}/sources` must list the file; agent notes should not be treated as primary filings.

## Implementation checklist (do all)

I will name the agent purpose (or ask me once if unclear). Then:

1. **Design** one-sentence job, inputs, outputs, write policy.  
2. Create `.grok/commands/cockpit-<action>.md` with hard rules, steps, output shape, vs other agents. Prefer: load pack+house first; **require my prompt** before heavy research; **ask before save**; on save yes → write under pack globs + **compile that ticker**.  
3. Add `GROK_AGENTS` entry + `buildInitialPrompt` case in `openGrok.js`.  
4. Mirror entry in `GrokAgents.jsx` `FALLBACK_ALL`.  
5. Update `.grok/commands/cockpit.md` and `.grok/skills/cockpit/SKILL.md` menu rows.  
6. Extend `open-grok-prompt-test.mjs` and run it green.  
7. Bootstrap + restart glass; hard-refresh browser; confirm Overview AGENTS shows the label and OPEN GROK seeds the right slash.  
8. Report: files changed, how to use, compile/Sources behavior, any GAPs.

Do **not** invent company research content. Do **not** push git unless I ask. Keep my `thin-desks.json` and vault if they already exist.

---
