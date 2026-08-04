# Authoring Cockpit Grok agents (friend / operator guide)

**Audience:** You have Cockpit-AI running. You want to add agents like **Research** — with full awareness of glass + ontology.  
**Decision-support only** — no buy/sell/hold, price targets, or position sizing.

Use this doc **and** paste the prompt in §10 into a fresh Grok Build session when building a new agent.

---

## 1. Mental model (read first)

```text
YOU  →  Glass AGENTS dropdown  →  OPEN GROK
              │
              ▼
     POST /api/open-grok { action, desk }
              │
              ▼
     buildInitialPrompt → "/cockpit-<name> {desk}"
              │
              ▼
     Grok loads .grok/commands/cockpit-<name>.md
              │
         ┌────┴────┐
         ▼         ▼
   MCP read     optional write
   pack/house   vault files
         │         │
         │         ▼
         │    ./ont compile TICKER
         │         │
         ▼         ▼
      chat    pack + Sources page
```

| Layer | Role |
|-------|------|
| **Slash command** `.grok/commands/cockpit-*.md` | Agent *behavior* (what Grok does) |
| **openGrok.js catalog** | Glass dropdown + maps action → slash string |
| **GrokAgents.jsx FALLBACK** | Offline mirror of catalog (keep in sync) |
| **MCP `cockpit-research`** | Read pack/house; propose tools (not silent SoR write) |
| **Ontology `./ont compile`** | Rebuild pack JSON from vault |
| **Glass Sources** | Shows pack `sources[]` after compile |
| **House / risks ACCEPT** | Human gate for SoR — agents propose only |

**Agents do not replace ontology.** They either read the pack or write vault inputs that compile into the pack.

---

## 2. Hard rules (never violate)

1. **Decision-support only** — no buy/sell/hold, PT, sizing.  
2. **Do not invent** graded claims, WATCH titles, or CONFIRMED house.  
3. **House / risks SoR** — propose tools + glass **ACCEPT** only (never silent write).  
4. **Never hand-edit** `ontology/store/by_ticker/*.json` — compile overwrites.  
5. **Daily/chat ≠ book** unless user opts into a defined save path.  
6. **One monorepo** — run scripts from clone root; MCP pin = this folder.  
7. After product code changes: `git pull` → `./scripts/bootstrap.sh` → **restart glass**.

---

## 3. Where files live

| Purpose | Path |
|---------|------|
| Agent ritual | `.grok/commands/cockpit-<action>.md` |
| Menu list | `.grok/commands/cockpit.md` + `.grok/skills/cockpit/SKILL.md` |
| Glass dropdown + prompt map | `memory-cockpit-v2/server/openGrok.js` → `GROK_AGENTS` + `buildInitialPrompt` |
| Offline dropdown fallback | `memory-cockpit-v2/src/pages/thin/GrokAgents.jsx` → `FALLBACK_ALL` |
| Desk Overview menu host | `BookStrip.jsx` → `GrokAgents` `variant="desk"` (no change if `variants: ['desk']`) |
| START menu only | `variants: ['start']` (e.g. new-desk) |
| Risk register menu | `variants: ['register']` |
| Risk detail menu | `variants: ['risk']` |
| House page menu | `variants: ['house']` |
| Prompt unit tests | `memory-cockpit-v2/scripts/open-grok-prompt-test.mjs` |
| Desk research factory | `research-wiki/raw/{slug}-research/` |
| Entity claims | `research-wiki/wiki/entities/{slug}.md` |
| House SoR | `research-wiki/house-view-{slug}.md` |
| Risks SoR | `research-wiki/raw/{slug}-research/08-risks-catalysts.md` |
| Pack config | `ontology/packs/TICKER.json` (`source_globs`, `risks_source`, …) |
| Compiled pack | `ontology/store/by_ticker/TICKER.json` (**generated**) |

**Reference agent (copy structure):** `.grok/commands/cockpit-research.md`  
**Reference catalog entry:** `action: 'research'` in `openGrok.js`.

---

## 4. Glass menu variants (where the agent appears)

| `variants` value | UI location |
|------------------|-------------|
| `start` | START page only (Build next company) |
| `desk` | **Ticker Overview** book strip AGENTS (first page of each company) |
| `house` | House page AGENTS |
| `register` | Risks list AGENTS |
| `risk` | Risk detail AGENTS |

To show on Overview only (like Research): `variants: ['desk']`.  
`default_for: ['desk']` changes which item is pre-selected (Daily is default today — don’t change unless intentional).

---

## 5. Recipe: add a new agent (checklist)

### Step 1 — Design the job in one sentence

Examples:
- Research: load book, wait for user question, optional save+compile  
- Daily: what moved + book snapshot  
- Steelman: house vs WATCH  

Write: inputs, outputs, **what must never be written**.

### Step 2 — Slash command file

Create:

```text
.grok/commands/cockpit-<action>.md
```

Required sections (mirror `cockpit-research.md` / `cockpit-daily.md`):

- YAML frontmatter: `description`, `argument-hint`  
- Parse `$ARGUMENTS`  
- Hard rules (decision-support, no invent, write policy table)  
- MCP / tool efficiency caps  
- Steps A/B/C…  
- Output format  
- Vs other agents  

If the agent **saves research** into the vault:

- Path must match pack `source_globs` (usually `raw/{slug}-research/*.md` **top-level**)  
- Filename pattern e.g. `agent-research-YYYY-MM-DD-HHMM.md` or your prefix  
- After explicit user yes: write file then **`./ont compile TICKER`** so Sources updates  
- Never write house/risks/store without propose→ACCEPT path  
- Mark agent notes as notes, not house SoR  

### Step 3 — Wire OPEN GROK catalog

In `memory-cockpit-v2/server/openGrok.js`:

1. Add to `GROK_AGENTS`:

```js
{
  action: 'my-agent',           // kebab used in URL body
  label: 'My agent',            // dropdown label
  hint: 'Short tooltip',
  needs_desk: true,             // or false
  needs_risk: false,            // true only for risk-detail seeds
  variants: ['desk'],           // where it appears
  // default_for: ['desk'],     // only if replacing Daily as default
},
```

2. In `buildInitialPrompt` `switch`:

```js
case 'my-agent':
  return withDesk('/cockpit-my-agent');
```

### Step 4 — Sync client fallback

In `memory-cockpit-v2/src/pages/thin/GrokAgents.jsx` → `FALLBACK_ALL`, add the **same** object (action, label, hint, variants, default_for).

**Catalog order is UX:** desk list bands are Operate → Notes → Models → Book ops → Meta (`plans/2026-08-01-agents-menu-clarity.md`). Insert new desk agents in the right band; keep FALLBACK order identical to `GROK_AGENTS`.

### Step 5 — Docs

- Row in `.grok/commands/cockpit.md`  
- Row in `.grok/skills/cockpit/SKILL.md`  

### Step 6 — Tests

Extend `memory-cockpit-v2/scripts/open-grok-prompt-test.mjs`:

```js
buildInitialPrompt({ action: 'my-agent', desk: 'tsm' })
// expect '/cockpit-my-agent tsm'

listGrokAgents({ variant: 'desk' })
// expect agents include my-agent
// expect start variant does NOT include it (if desk-only)
```

Run:

```bash
cd memory-cockpit-v2 && npm run test:open-grok-prompt
```

### Step 7 — Rebuild glass + restart

```bash
# from monorepo root
./scripts/bootstrap.sh
# stop glass, then:
./scripts/run-glass.sh
```

Hard-refresh browser. Overview → AGENTS → new label → OPEN GROK.  
Flash should show `Opened · /cockpit-my-agent {slug}`.

### Step 8 — Ontology / website health checks

After any vault write the agent does:

```bash
export COCKPIT_REPO="$(pwd)"
export COCKPIT_VAULT="$COCKPIT_REPO/research-wiki"
export ONTOLOGY_WIKI="$COCKPIT_VAULT"
export ONTOLOGY_STORE="$COCKPIT_REPO/ontology/store/by_ticker"
cd ontology && ./ont compile TICKER && ./ont verify TICKER
```

Then:

- Glass **REFRESH** or reload  
- `#/{slug}/sources` lists new files (if under source_globs)  
- `#/{slug}/overview` / ask still make sense  
- House/risks unchanged unless user ACCEPTed a propose  

**Never** claim “ontology updated” if compile was not run or failed.

---

## 6. Provenance / Sources (saved research)

Glass Sources page = **pack catalog after compile**, not raw disk browser.

1. File under `research-wiki/raw/{slug}-research/something.md`  
2. Pack config includes glob e.g. `raw/{slug}-research/*.md`  
3. `./ont compile TICKER`  
4. Open `#/{slug}/sources`  

Agent session notes should stay **non-primary** (product marks `agent-research-*` as secondary).

---

## 7. Patterns for different agent types

| Type | Read | Write | Compile? | Menu |
|------|------|-------|----------|------|
| **Read-only brief** (daily-like) | pack + house + search | none or briefs/ only | No | desk |
| **User-directed research** | pack + house then search | optional note on yes | Yes after save yes | desk |
| **New desk underwrite** | little pack | scaffold + research factory | After real content | start |
| **House edit** | house + pack | propose only | After ACCEPT + COMPILE BOOK | house |
| **Risk status / tripwires / add** | pack + SoR | propose only | After ACCEPT + COMPILE BOOK | register/risk |
| **Steelman / match** | pack + house | none (or propose if asked) | No | desk/house |

---

## 8. Backend map Grok must respect

| Concern | How to verify |
|---------|----------------|
| MCP bound to this clone | `list_desks` → `monorepo_root` equals repo path |
| Pack exists | `get_pack_snapshot` / glass overview |
| Live desks without restart | edit `thin-desks.json` → `GET /api/thin-desks` lists slug |
| Wrong URL | DeskUnknown page, not silent START |
| After code change | bootstrap + restart glass or OPEN GROK still old |
| After vault save | compile + sources API / Sources page |
| After ACCEPT | COMPILE BOOK + REFRESH; never hand-edit store |

Useful APIs (local glass):

```text
GET  /api/thin-desks
GET  /api/{slug}/overview
GET  /api/{slug}/house
GET  /api/{slug}/risks
GET  /api/{slug}/sources
POST /api/{slug}/compile
POST /api/open-grok  { "action": "research", "desk": "tsm" }
```

---

## 9. Do not break friend / multi-user installs

- Prefer feature work on product code paths only.  
- Do not force `thin-desks.json` to `desks: []` on pull if user has local desks (merge carefully).  
- Do not commit secrets (`.env`, `.access.json`, `.session-secret`, `.grok/config.toml`).  
- Do not commit personal company books to a shared product remote unless intentional.

---

## 10. Copy-paste prompt for Grok Build (new agent)

Paste the block in `FRIEND-AGENT-PROMPT.md` (same repo root) into a **fresh** Grok Build terminal when you want Grok to implement a new agent end-to-end.

---

## 11. Reference: Research + Coverage + Phase 1 finance as templates

Read in full:

- `.grok/commands/cockpit-research.md`  
- `.grok/commands/cockpit-coverage.md`  
- `.grok/commands/cockpit-comps.md`  
- `.grok/commands/cockpit-model-bridge.md`  
- `.grok/commands/cockpit-model-audit.md`  
- `.grok/commands/cockpit-ebitda-bridge.md`  
- `.grok/commands/cockpit-ebitda-quality.md`  
- Catalog entries `research` / `coverage` / `comps` / `model-bridge` / `model-audit` / `ebitda-bridge` / `ebitda-quality` in `openGrok.js`  
- Fallback lines in `GrokAgents.jsx`  
- Roadmap: `docs/FINANCE-AGENT-PORTS.md` (Claude pattern ports)

Flow to copy:

1. Load book context (MCP)  
2. Require user input before heavy work  
3. Deliver report  
4. Optional user-gated vault write  
5. Compile so website Sources works  
6. Never touch house/risks without propose→ACCEPT  
