# Memory Cockpit v2 — operator's guide for Claude Code

You are working on **Memory Cockpit v2**, a private research-readout web app for the memory/DRAM
sector (Micron / SK Hynix / Samsung; AI power & HBM). This file is your onboarding + runbook. Read
it fully before editing. The companion `implementation-notes.md` is the full dated build ledger;
the vault's `research-wiki/CLAUDE.md` governs the data.

**Launch sessions from `~/Trading/memory-cockpit-v2`** (or `~/Trading`) so this file auto-loads.
NOT `~/Desktop/Trading` — that's a stale empty folder. The app lives at `~/Trading/memory-cockpit-v2`;
the vault (its brain) at `~/Trading/research-wiki`.

---

## ⚠️ IF THE SITE IS DOWN — runbook

The server is supervised by **launchd** (auto-starts on login, respawns on crash). Work top-down:

1. **Is it running?** `launchctl list | grep memory-cockpit` → expect a PID + `com.memory-cockpit.server`.
2. **Is it serving?** `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4680/` → expect `200`.
3. **Restart it:** `launchctl kickstart -k gui/$(id -u)/com.memory-cockpit.server` (kills + respawns).
4. **Read the logs:** `tail -50 logs/server.err.log` and `logs/server.log`.
5. **Agent missing from the list?** (unloaded) — re-add:
   `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.memory-cockpit.server.plist`
6. **Wrong port?** It MUST be **4680** (the Tailscale Funnel target). The code default is 4681 — the
   plist bakes `PORT=4680`. **Never hand-start `node server/index.js`** — it collides with launchd
   (and without the env binds 4681, breaking the tunnel).
7. **Remote/phone unreachable?** `tailscale funnel status` should show `→ 127.0.0.1:4680`. The Mac
   must be awake and logged into Anthony's account (the Funnel is per-session, same as the server).
8. **Phone loads a BLANK page after a deploy?** Stale iOS-Safari cache. Tell Anthony: open a Safari
   **Private tab** (or clear that site's website data). The server is already hardened against this
   (index.html `no-cache`, assets `immutable`, missing bundle → 404, `emptyOutDir:false` keeps old
   bundles) — but a client cached before a deploy still needs one fresh load.

**Never** run destructive recovery (reinstalling, wiping dist/, editing the vault to "fix" a display
bug). The app degrades gracefully; a restart + log read fixes almost everything.

---

## The one architectural rule

**The vault (`~/Trading/research-wiki`) is the brain for Memory.** The app is a pure readout that
derives Memory pages from the vault at request time — zero app-side state. `server/vault.js` is
read-only by design.

**Dual desk (2026-07-20 Phase 1):** top-bar **MEMORY | NEBIUS** switcher.

| Desk | SoR | Routes | Rail |
|------|-----|--------|------|
| **Memory** | research-wiki vault (+ series/sync) | `#/cockpit`, `#/overview`, … (unchanged) | Full rail |
| **Nebius** | compiled ontology pack `~/Trading/ontology/store/by_ticker/NBIS.json` + vault `house-view-nebius.md` | `#/nbis/overview|risks|house|sources|ask|update` (+ risk detail) | Thin (6 items) |

- Nebius API: `/api/nbis/meta|overview|risks|risk/:id|house|sources|quote|book|book/refresh|ask|write-meta` — `server/pack.js`, `nbisModel.js`, `nbisAsk.js`.
- **Ask** = pack-only deterministic Q&A (not an LLM). CLI `./ont ask NBIS` remains full-power.
- **Update** (`#/nbis/update`) = write-path ritual (S1–S6) + **Phase 5b propose/accept**.
- Proposals API: `GET/POST /api/nbis/proposals`, `POST .../:id/accept|reject`. Accept writes entity Key facts or appends risk note; **never house**. Then still `./ont compile NBIS` + **REFRESH BOOK**.
- Store: `research-wiki/cockpit/proposals/nbis-pending.json`.
- Agents queue pins: `node scripts/propose-nbis.mjs` (Mode E skill) — never auto-accept; house blocked. Runbook: `plans/WRITE-PATH-NBIS.md`.
- **COMPILE BOOK** on glass = `POST /api/nbis/compile` (fixed `./ont compile NBIS` + pack cache clear). Terminal optional.
- **Thin-desk contract (binding):** `plans/THIN-DESK-CONTRACT.md` — every future thin desk **must** ship COMPILE BOOK + REFRESH + `meta.thin_desk_contract`; smoke asserts `compile_book: true`. Do not remove without Anthony approval.
- Ask goldens: `scripts/nbis-ask-goldens.json`. Opt-in pin drill: `WRITE_PATH_DRILL=1 npm run write-path-drill`.
- **Never** hand-edit `ontology/store/`. **research-os** is parked — do not add production glass there.
- Plans: phase1/2/3 under `plans/`, **`plans/NEW-DESK-PLAYBOOK.md`**.

- `house-view.md` / `house-view-nebius.md` (vault root) are **NEVER written by anything, ever.** Suggest
  edits in chat; write only on Anthony's explicit instruction.
- **Decision-support only.** No buy/sell/hold, price targets, or position-sizing language anywhere —
  the app tracks and surfaces; Anthony decides. Describe states ("crowded", "margin inverted"), never
  actions.
- **Anti-fabrication.** Never invent a number or a quote. Grade sources `[A]` primary/filed ·
  `[B]` reputable/analyst · `[C]` single/vendor. Every figure carries a source + date. Verify a file/
  flag still exists before recommending it.

## Deploy = build + smoke (always)

- **Frontend change** (`src/**`): `npm run build`. No restart needed — the server serves `dist/`
  fresh each request. (`emptyOutDir:false` keeps old bundles so cached clients don't strand.)
- **Server-code change** (`server/**`): restart with `launchctl kickstart -k gui/$(id -u)/com.memory-cockpit.server`.
- **Vault-data change** (CSVs, risk files, curated JSON): live immediately, no build/restart.
- **ALWAYS run `npm run smoke`** before calling a change done (Memory APIs + Nebius `/api/nbis/*` +
  cache/strand guards + vault lint). `npm run smoke -- --render` adds a headless mount check of all
  pages (incl. `#/nbis/*`). It exits non-zero on failure — treat that as a blocked deploy.
- **Ontology pack refresh** (Nebius claims/risks): compile only — no `npm run build` unless UI code changed.
- **Visual check** without touching Anthony's login: spin an auth-inert instance and screenshot it —
  `PORT=4699 COCKPIT_ACCESS_FILE=/tmp/x.json node server/index.js` makes the gate inert (no users);
  headless-Chrome `--screenshot` the route; then kill it and `rm` the temp file.
- **Never commit or push** unless Anthony asks. If he does, branch first.

## How to add a feature (the established pattern)

Worked examples to copy: the **Street Read** page (`src/pages/StreetRead.jsx` +
`cockpit/street/street-models.json`) and the **Margins** page (`src/pages/Margins.jsx` +
`cockpit/margins/margins.json`). Both follow: **curated vault dataset → model builder → API route →
page → wire in.**

1. **Data** — put it in the vault. Time-series that sync from keyless sources → a `series/*.csv` + a
   row in `cockpit/series/_registry.md`. Curated/hand-maintained data (paywalled, quarterly, or
   qualitative) → a JSON file under `cockpit/<feature>/` (like street/margins).
2. **`server/model.js`** — add a builder that reads the vault file and returns a page payload. Keep it
   a pure function of the vault. For a computed "read" panel, mirror `buildPositioningRead()`.
3. **`server/index.js`** — add `app.get('/api/<x>', j(() => model.<x>()))` next to the others.
4. **`src/pages/<X>.jsx`** — the page. Reuse `charts.jsx`: `TVChart` (single series; `kind:'line'`
   or `'flow'`), `MultiLineChart` (overlay N series, solid/dashed, `[grade]` legend), `fmt(v,unit)`
   (units: `$M $k USD KRW KRW-B × pct`). Match the existing section/prose classes (`sect`, `shd`,
   `rdhead`, `chipC`, `prose`, `emptyD`, `dim`, `mono`).
5. **`src/App.jsx`** — import the page, add a `RAIL` entry `['<glyph>', '<title>', '#/<x>']`, add a
   route branch `if (route.startsWith('<x>')) return <X/>;`.
6. **`server/model.js` `searchIndex()`** — add a ⌘K entry so it's findable.
7. Build → smoke → screenshot-verify. Then log it in `implementation-notes.md`.

## Refreshing curated data (the cheap path)

The curated datasets (Street Read `street-models.json`, Margins `margins.json`) are hand-maintained —
paywalled/quarterly, not on the keyless sync path. **Do NOT redo the from-scratch research to refresh
them.** Each dataset is ~20% volatile numbers wrapped in ~80% stable narrative; refresh only the
volatile core. Each file has a `refresh` block naming its volatile vs stable fields, and the full
per-dataset procedure (including a tuned single-agent refresh prompt for Street) lives in the vault at
**`research-wiki/cockpit/CURATED-REFRESH.md`** — read it before refreshing. Street = one focused
diff-pass agent (monthly / after target revisions); Margins = append one point per series on earnings
(no agent), triggered by the Catalysts-calendar dates. Then `npm run smoke` + screenshot-verify.

## Hard guardrails (don't violate)

- **Keyless sync only.** The standalone sync (`node cockpit/sync.js`) may use ONLY Nasdaq / Naver /
  EDGAR / FRED / Google-gtx / KITA k-stat (browser UA + Origin/Referer where needed). The **Massive MCP is
  Claude-only** — never call it from sync. No API keys in the app.
- **No cron / scheduled automation** (Anthony's standing rule). Sync runs on site-open when >20h
  stale (lockfile mutex) + a manual button. Don't add a scheduler.
- **Credentials.** The only secret is the opt-in login gate (`.access.json`, gitignored, 0600, scrypt
  hashes). Passwords are Anthony's — never pick or store one for him; delete any throwaway test user
  after use. Manage users with `node server/set-access.js <name> | --remove <name> | --list`.
- **Headlines are English-only** — updater 09 translates Korean at ingestion; don't revert.

## Gotchas that have bitten before

- **Curated datasets are hand-refreshed**, not synced (paywalled/quarterly). The margins page refreshes
  on earnings — the dates are on the Catalysts calendar (`wiki/catalysts.md`). To add a quarter, edit
  the JSON's `points` array; the chart updates on next load.
- **Margins calendar alignment:** Micron's fiscal quarters are mapped to the calendar quarter they
  cover (FY ends late Aug). No company discloses HBM-vs-DRAM *operating* margin — Micron's Cloud-Memory
  (CMBU) segment is the closest OFFICIAL proxy; cross-company HBM/DRAM figures are graded estimates.
- **`sync` spawns with `process.execPath`**, not bare `'node'` (bare breaks under launchd's minimal
  PATH). Keep it that way.
- **Series with <7 points render as a "BUILDING" table**, not a line — seed enough history or expect a
  table until it accrues.

## File map

```
server/index.js     routes, static serving (cache headers!), auth gate, sync spawn, launchd entry
server/model.js     ALL page builders (vault → payload) — the biggest file; add features here
server/vault.js     read-only vault access (never writes) + house-view read + markdown render
server/auth.js      scrypt + signed-cookie sessions + throttle; set-access.js manages users
src/App.jsx         shell: top bar, icon RAIL, hash router, ⌘K palette
src/pages/*.jsx      one per rail item (Overview, Risks, Data, Desks, Analysts, StreetRead, Margins,
                    Reports, Catalysts, Log, House, Companies, Background) + Risk/Reader detail
src/charts.jsx      TVChart (single) · MultiLineChart (overlay) · fmt() · BuildingState
scripts/smoke.mjs   pre-deploy safety net (npm run smoke)
~/Library/LaunchAgents/com.memory-cockpit.server.plist   the supervisor (PORT=4680, KeepAlive)
```

Vault (the brain): `~/Trading/research-wiki` — `cockpit/` (series, risks, updaters, sync.js, lint.js,
street/, margins/), `wiki/` (entities, catalysts, log, background), `figures/` (analyst brains),
`reports/`, `house-view.md`. See `research-wiki/CLAUDE.md`.

## When in doubt

Read `implementation-notes.md` (the dated ledger of every feature + deviation + fix) and grep
`server/model.js` for the nearest existing builder. The codebase is small (~3k lines) and consistent —
match the surrounding idiom, run `npm run smoke`, and verify with a screenshot before you call it done.
