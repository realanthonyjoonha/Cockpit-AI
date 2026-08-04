# Friend prompt — upgrade Cockpit platform (copy into Grok Build)

Copy everything between the lines into a **fresh Grok Build** session in **his** Cockpit-AI monorepo.

---

You are helping me **upgrade my existing local Cockpit-AI install** to the latest product platform features (Street room + daybook daily + friend-upgrade tooling). Decision-support only: no buy/sell/hold, price targets, or sizing.

## Hard rules

1. Work only in **this monorepo** (the folder that is my Cockpit-AI clone). Confirm root has `AGENTS.md`, `scripts/`, `memory-cockpit-v2/`, `research-wiki/`.
2. **Never delete or overwrite** my personal books:
   - Keep `research-wiki/**` research content, house views, risks, briefs
   - Keep my desks in `memory-cockpit-v2/config/thin-desks.json` (you may **add** `"street"` to rooms only)
   - Keep secrets: `.env`, `.access.json`, `.session-secret`
   - Never hand-edit `ontology/store/`
3. Do **not** invent house views, WATCH risks, or graded claims for my companies.
4. Do **not** `git push` unless I explicitly ask. `git pull` is OK for upgrade.
5. Prefer the official upgrade path; do not re-underwrite companies.

## Goal

After you finish I should have:

| Feature | How I use it |
|---------|----------------|
| **Daybook daily** | Glass AGENTS → Daily brief, or `/cockpit-daily {slug}` |
| **Street** | Desk rail → Street → **REFRESH STREET** (pipeline) / **OPEN GROK** (chat) |
| My old desks | Still in switcher; packs/house/risks unchanged |

## Steps (do in order)

### 1. Locate monorepo

```bash
pwd
ls AGENTS.md scripts/friend-upgrade.sh FRIEND-UPGRADE.md memory-cockpit-v2 2>&1 | head -20
git remote -v 2>&1 | head -5
git status -sb 2>&1 | head -15
```

If `friend-upgrade.sh` is missing, I am on an old commit — pull first (step 2).

### 2. Upgrade platform (preferred one-shot)

```bash
# From monorepo root:
chmod +x scripts/friend-upgrade.sh scripts/ensure-thin-rooms.mjs 2>/dev/null
./scripts/friend-upgrade.sh
```

If `git pull --ff-only` fails (diverged history):

- Show me `git status`
- Do **not** force-push
- After I resolve, run: `./scripts/friend-upgrade.sh --no-pull`

If I already pulled: `./scripts/friend-upgrade.sh --no-pull`

### 3. What friend-upgrade must do (verify)

Confirm each happened or run the piece yourself:

1. Latest `main` from `origin` (or --no-pull)  
2. `bootstrap` / `npm install` + `npm run build` in `memory-cockpit-v2`  
3. `node scripts/ensure-thin-rooms.mjs` — rooms include `street` without wiping `desks`  
4. `./scripts/install-grok-mcp.sh` — MCP bound to **this** monorepo  
5. `./scripts/doctor.sh` — prefer PASS (warns OK if no packs)

### 4. Restart glass

Stop any old glass on my port if needed, then:

```bash
./scripts/run-glass.sh
```

Tell me the URL (often `http://127.0.0.1:4681` or `:4682`). I will hard-refresh the browser (**Cmd+Shift+R**).

### 5. Smoke checks (run what you can)

```bash
# agents catalog includes daily + street
curl -sS "http://127.0.0.1:PORT/api/open-grok/agents?variant=desk" | head -c 2000

# prompt mapping (if script exists)
cd memory-cockpit-v2 && npm run test:open-grok-prompt 2>/dev/null || node scripts/open-grok-prompt-test.mjs

# street seed (if present)
node scripts/street-seed-mode-test.mjs 2>/dev/null || true
```

Replace `PORT` with the live glass port. List my desks via MCP `list_desks` if available — monorepo_root must match this clone.

### 6. Report back to me

1. Upgrade OK / GAPs  
2. Glass URL + port  
3. Desks still present (slugs)  
4. How to try: Daily brief + Street REFRESH STREET on one of my desks  
5. Note: Street may show **NEEDS BUILD** until I run REFRESH STREET once — that is expected  

## Docs if stuck

- `FRIEND-UPGRADE.md` — upgrade law  
- `FRIEND-START.md` — first install only  
- `AGENTS.md` — product hard rules  
- `docs/PRODUCT-KERNEL-SOR.md` — platform vs vault  

## Do not

- Clone a second “clean” tree and abandon my vault  
- Copy someone else’s `research-wiki` over mine  
- Wipe `thin-desks.json` desks  
- Run full `export-kernel` into my personalized install  

Start now at step 1.
