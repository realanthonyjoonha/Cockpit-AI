# Memory Cockpit v2 — implementation notes

> Living doc per §0. Kept current as I go; the resume anchor if context compacts.
> Build plan: `~/Desktop/Claude Prompts/trading-prompts/15a-memory-cockpit-build-plan.md`
> Design ground truth: `15a-design-ground-truth.html` tab D (dark re-tone = base .dD styles
> lines 221–360 + override block lines 363–448).

## Status

- **2026-07-21 — Thin-desk UI reliability Phases 1–3 SHIPPED.** UP-C `write_path_mode=meta_only`.
  Shared chrome under `src/pages/thin/*` + `DeskRouter`; registry `config/thin-desks.json` drives
  switcher/rails. Contract v1.1 + `THIN-DESK-UI-PARITY.md`. format-check 35 + smoke 61 + build green.
  Company #3 = Part 1 pack → registry row → server `/api/<slug>/*` (no page fork). Phase 4 hygiene optional.

- **2026-07-21 — Thin-desk rigor harness.** `scripts/thin-desk-rigor.mjs` + `npm run smoke:rigor` /
  `npm run test:thin`. Three layers: source structure (DeskRouter/registry/wrappers), API cross-desk
  shape + ask/refusal/refresh parity, headless Chrome DOM chrome-flag parity (nbis≡msft every room).
  RIGOR 43/43. Full suite: `npm run test:thin` (format + rigor + smoke --render).

- **2026-07-22 — MSFT Ask goldens (parity with NBIS).** `scripts/msft-ask-goldens.json` + smoke runs
  goldens for every thin desk (`scripts/<slug>-ask-goldens.json`). Fail-closed if a registry desk
  lacks a goldens file. Replaces ad-hoc MSFT house/watch/refusal check with route+substring contracts.

- **2026-07-22 — Skill closeout #1: ont verify mandatory.** `research-to-ontology` (Grok + Claude) +
  `research-authoring` + `ontology/AGENTS.md` + `research-wiki/CLAUDE.md`: done = files + compile +
  `./ont verify TICKER` exit 0 + handback with Verify line; BLOCKED if verify fails. MSFT on ticker
  map; Mode E still propose-only then compile+verify after accept. No glass code.

- **2026-07-22 — Path 2A S1: thin compile factory.** `server/thinCompile.js` (`createThinCompile(ticker, getBook)`);
  `nbisCompile.js` / `msftCompile.js` are thin wrappers. URLs unchanged. Per-ticker mutex preserved.
  Local only — no GitHub promote until factory confidence.

- **2026-07-22 — Path 2A S2: thin Ask factory.** `server/thinAsk.js` (`createThinAsk(profile)` + NBIS/MSFT
  profiles for topic/source filters). `nbisAsk.js` / `msftAsk.js` wrappers. Goldens must stay green.

- **2026-07-22 — Path 2A S3: thin model factory.** `server/thinModel.js` (`createThinModel(profile)` +
  NBIS/MSFT profiles). `nbisModel.js` / `msftModel.js` wrappers. Requires full test:thin + dogfood.

- **2026-07-22 — Path 2A S4: registry route mount.** `server/thinDeskMount.js` mounts `/api/{slug}/*`
  from `config/thin-desks.json` (profiles required per slug). NBIS proposals stay hand-wired.
  Wrappers still used by compile imports / optional; index no longer duplicates route tables.

- **2026-07-22 — Path 2A S5: smoke registry-driven.** `scripts/smoke.mjs` loops `THIN_DESKS` for core
  API, risk detail, refresh, ask goldens, compile; headless thin routes from registry. NBIS proposals
  remain a separate block.

- **2026-07-21 — On-demand COMPILE BOOK.** `POST /api/nbis/compile` runs fixed `ont compile NBIS`
  (absolute path, mutex, 120s timeout), clears pack cache, returns compiled_at + counts. BookStrip
  **COMPILE BOOK** + REFRESH. Accept banner points at glass compile. Smoke +2 → **46/46**. Agents/
  skill: prefer glass compile or same API; terminal optional.


- **2026-07-21 — Solo builds 2·4·5.** `scripts/propose-nbis.mjs` (agent CLI, no auth); research-to-ontology
  Mode E (Grok + Claude skills). Update page: post-accept banner (compile + REFRESH), copy command,
  pending/accepted/rejected chips. Smoke +3 CLI checks → **44/44**. Plan shipped.


- **2026-07-20 — NEBIUS Phase 5b: Propose/accept pins.** `server/nbisProposals.js` + APIs list/create/accept/reject.
  Pending store under vault `cockpit/proposals/nbis-pending.json`. Accept → insert graded claim under entity
  Key facts OR append risk note to 08-risks-catalysts.md (allowlisted). House proposals blocked. Update page
  form + ACCEPT/REJECT. After accept: still CLI compile + REFRESH BOOK. Smoke 41/41 (propose+reject,
  house blocked). Decision-support only.


- **2026-07-20 — NEBIUS Phase 5 v1: Write path ritual.** `#/nbis/update` + `GET /api/nbis/write-meta`
  (path map, claim format, S1–S6 checklist, never list, compile command). Rail **Update**.
  Docs: `plans/WRITE-PATH-NBIS.md`. Opt-in `WRITE_PATH_DRILL=1 npm run write-path-drill` pins a
  Key-facts probe claim, compile, verifies pack+CLI ask + house hash (S6), reverts. Default smoke
  38/38 non-mutating. Browser does not write wiki or run compile.


- **2026-07-20 — NEBIUS Phase 4: Harden loop.** Pack cache invalidates on file mtime;
  `POST /api/nbis/book/refresh` + BookStrip **REFRESH BOOK**; Ask re-runs last Q after refresh.
  Golden Ask contracts in `scripts/nbis-ask-goldens.json` (route + substrings + WATCH name
  cross-check). Smoke 37/37. Still does not run compile from the browser.


- **2026-07-20 — NEBIUS Phase 3: Book status + Grounded Ask.** `GET /api/nbis/book` + BookStrip
  (compiled_at, house, risk counts). `#/nbis/ask` pack-only deterministic Q&A via `server/nbisAsk.js`
  (mirrors core `./ont ask` routes: house, on watch, risks, claims, sources, refusal — no LLM).
  Smoke: on watch / house / refusal. 34/34 pass. Loop: research → compile → glass → ask the book.


- **2026-07-20 — NEBIUS Phase 2.** Live NBIS quote chip on Overview (`/api/nbis/quote`, Nasdaq→Yahoo,
  60s cache, never invent). Sources catalog page `#/nbis/sources` from pack (primary nebius/neocloud
  first). New-desk playbook: `plans/NEW-DESK-PLAYBOOK.md`. Catalysts still parked (pack rows are MU
  noise). Smoke + build.


- **2026-07-20 — NEBIUS Phase 1 thin desk (ontology-aligned).** Dual-desk shell: MEMORY | NEBIUS
  switcher in the top bar. Nebius rail = Overview · Risks · House only (`#/nbis/*`). Server reads
  compiled pack `~/Trading/ontology/store/by_ticker/NBIS.json` via `server/pack.js` + `nbisModel.js`
  (5s cache; never spawns `./ont`). APIs: `/api/nbis/meta|overview|risks|risk/:id|house`. House
  prefers vault `house-view-nebius.md` (read-only); pack excerpt fallback. No series charts, no
  catalysts page (pack catalysts noisy). Memory routes untouched. Smoke extended (28 pass). Plan:
  `plans/2026-07-20-nebius-phase1.md`. research-os not used. After research: `./ont compile NBIS`.
  Deploy: server restart (launchd kickstart) + `npm run build` (done this session).

- [x] Plan read in full; mock toured in browser (all 10 rail pages + 5 HV risk pages + §3.1 full-anatomy page)
- [x] v1 parts bin read: data.jsx, fetch-series.js, server/{series,vault,factors,index}.js, styles, configs
- [x] Vault surveyed: house-view.md, monitors.md, catalysts.md, log.md, memory-moc.md, monitor-marker inventory (≈59 items: 11 monitors.md rows + 3 memory master tells + 33 entity-page + 12 concept-page markers)
- [x] migrate.js written (staging/), dry-run clean: 59 monitors extracted → 46 merged into
      canonical rows + 12 nested + 1 unmapped (sk-hynix F-1/SOX — flow event, no clean home);
      17 planned files (12 risks + _registry + 4 desks); house-view.md mtime verified unchanged
- [ ] **CP1** — migration dry-run approval ← HERE (report: staging/cp1-dryrun-report.txt)
- [x] CP1 approved 2026-07-03; vault written (17 files + _unmapped.md), backup at
      `~/Trading/vault-backups/cp1-2026-07-04T05-05-22/`; `cockpit/lint.js` ships — 0 errors/0 warnings
- [x] §7 sync backbone + 11 updaters PROVEN live (2026-07-03): fresh run populated mu-pe
      (1,254 pts, 22.05×) + headlines.csv (500 rows, 304 ko) + spot appends; plain 2nd run
      all-skip zero writes; --force re-run diff-holds (only genuinely-new headlines changed);
      --dry-run writes nothing (find -newer proof); fault-injection kills one updater, rest
      continue; mutex: concurrent run exits code 2; ONE [sync] line landed in wiki/log.md.
      **§12 flow verification CLOSED**: individualPureBuyQuant = signed net SHARES — proven by
      (a) daily foreigner+organ+individual ≈ 0, (b) |indiv| ≤ volume, (c) shares×close vs
      published prints 2026-07-02: Hynix ₩4,386B vs 파이낸셜뉴스 ₩4,593B (−4.7%), Samsung
      ₩1,988B vs ₩2,023B (−1.7%). The flagged "impossible ₩4.4T" was REAL record dip-buying on
      the −14.57% crash (biggest since 2008). Transform unchanged; v1-accrued CSVs correct;
      two standing sanity assertions active (volume bound + netting residual ≤30%).
- [x] Phase ③ built (2026-07-03): app scaffold on 4681 (empty-env boot verified), theme.css =
      exact tab-D token port (base .dD lines 221–360 + dark re-tone 363–448), TVChart ported
      per §8 (retheme tokens + §4 preset chips + flow zero-line only), shell (top bar/rail/⌘K
      palette live), Overview fully live: stance strip parses house-view verbatim
      ("MID-STAGE · STRUCTURAL DE-CYCLE · SHORTAGE ≥2030 · HINGE = …"), triggers wired
      §3.8/§3.4/§3.5, REV 06-30 derived, §1.0–§5.0 all real vault data. Freshness endpoint
      spawns sync when >20h stale (mutex + 15-min damper), stamps lastVisit.
- [ ] **CP2** — theme + Overview vs mock ← HERE (live compare: http://127.0.0.1:4698/cp2-compare.html)

## CP2 items for Anthony's eye (intentional deltas vs the mock)

1. **Interactive tiles**: mock §2.0 tiles are static sparks; build tiles are real TVCharts —
   visible price/date axes (§4 themes axis text, so axes stay), last-value pill (v1 behavior,
   ported), and the 1M·3M·6M·1Y·5Y·All preset row under every chart (§4 [HARD]: every chart).
2. **Off-high flags on all four tiles** (mock: Samsung only) — live truth: the whole complex
   is −15…−25% off highs after the 07-02 crash. Rule: flag shows at ≥10% drawdown.
3. **All 12 register rows** (mock sketched 8) with compressed display names (mock's own
   convention on the narrow Overview column; full names go on the Risks index).
4. **VALUATION trigger reads INTACT** (mock sample said WATCH) — that's the live status in
   his valuation-rerating.md.
5. Register summary column yields space to names (a name never truncates; summaries ellipsize).
- [x] CP2 approved ("I like the right one more") — interactive-tile treatment locked as-is
- [x] Phase ④ (2026-07-03): ALL pages live — Risks index (two-group register, trigger-order HV
      block, FIRED→WATCH→stale-first ext sort), 12 risk detail pages (A–E anatomy, hvq banner
      on all incl. dimmed extended, ⭐ tells, flow baselines), Data (LIVE/BUILDING/PARKED,
      cumulative-net flow stats), 4 desks (korea full anatomy w/ ko headlines; scenarios ⭐5
      tells wired №1–3 live + №4–5 off-spine), Analysts (Baker STATED verbatim headline +
      index.md delta section), Reports shelf (9, kinds derived, HTML in-app iframe / PDF tab),
      Catalysts, Log (kind inference on legacy lines), House (hero entry + trigger chips +
      governance + DRAFT muted), Companies (real monitor counts/prices/roles), Reader
      (wikilinks + backlinks), ⌘K across everything.
- [x] §11 acceptance run (2026-07-03):
      a ✓ empty-env boot · graph greps clean  b ✓ 12 files, live-edit test (edit→register→
      revert byte-identical), _unmapped=1 (CP1-approved)  c ✓ CP2  d ✓ presets on every chart,
      zoom/pan = ported v1 code (hand-feel at CP3)  e ✓ three risk shapes verified  f ✓ all
      six sub-proofs incl. 21h-rewind → exactly-one spawn  g ✓ Samsung/mu-pe live · flows
      verified vs published prints · assertions active  h ✓ greps clean · house-view mtime
      Jun 30 unchanged end-to-end  i ✓ two hits reviewed = chart-color data labels (mock's own
      copy)  j ✓ this file + report/cp3-report.html + quiz  k ✓ 10 icons · tiles→entities ·
      ⌘K tested  l ✓ desk live-edit test (add series→page follows→revert byte-identical)
- [x] **CP3** — report + quiz delivered; Anthony said "cut over"
- [x] **CUTOVER (§9.4), 2026-07-03**: v1 stopped · dir renamed → `memory-cockpit-v1` ·
      v2 serving on **127.0.0.1:4680** (empty env + PORT only) · launch.json "cockpit" →
      memory-cockpit-v2 · helper servers (4698 compare, 4699 mock) shut down · post-cutover
      verification: overview/risk/report-file/freshness all 200, 12 risks · 2 WATCH · 10/11
      LIVE, house-view.md mtime Jun 30 17:06 unchanged end-to-end.
      Rollback if ever needed: stop v2, rename dirs back, revert launch.json one path;
      CP1 vault backup at ~/Trading/vault-backups/cp1-2026-07-04T05-05-22/.

## Post-cutover changes (Anthony-directed)

- **2026-07-04 — remote phone access via Tailscale; §10 LAN deviation ROLLED BACK.** Anthony
  wanted access away from home. Installed Tailscale (Homebrew cask, he entered his own sudo pw
  + logged in; tailnet `tail2d1a01.ts.net`, node `mac-mini`). Enabled Serve on the tailnet
  (his one-click console toggle), then `tailscale serve --bg 4680` publishes the cockpit at
  **`https://mac-mini.tail2d1a01.ts.net`** — tailnet-only, WireGuard-encrypted, proxies to
  `127.0.0.1:4680`. Because Serve originates from localhost, the app went **back to
  loopback-only** (`npm run start`, launch.json reverted from `start:lan`). Verified: ts.net
  path 200 before+after the flip; the `192.168.x:4680` LAN port is now **closed/refused**.
  Net result: the morning's `HOST=0.0.0.0` opening is undone — strictly more locked down than
  before, with remote reach added. `HOST` env + `start:lan` script still exist as a fallback
  but are unused. Serve persists across reboots (Tailscale daemon restores it); to undo:
  `tailscale serve --https=443 off`.
  - *Historical (superseded, 2026-07-03):* the earlier same-network-only fix bound
    `HOST=0.0.0.0`; that is the deviation this Tailscale change rolled back.

- **2026-07-04 — login gate added; DEVIATION from spec §2 "zero credentials / boots with an
  empty environment."** Anthony asked to share the cockpit with friends; the app has no auth
  and renders the whole vault, so a login was the safe precondition (he chose it over
  node-sharing / public Funnel / staying private). Design: `server/auth.js` — per-user
  scrypt-hashed passwords (Node stdlib, no deps) in `.access.json` (gitignored, 0600), signed
  HttpOnly session cookie (HMAC, secret in `.session-secret`, 0600). **Opt-in / conservative:**
  the gate is inert until ≥1 user exists, so the empty-env boot still works exactly as §11.a
  requires — §2 holds until Anthony runs `node server/set-access.js <name>`. No loopback bypass
  (Tailscale Serve makes all traffic look like 127.0.0.1). CSP script-src gained 'unsafe-inline'
  for the login page's one inline submit script; the built SPA has no inline scripts. Verified
  end-to-end with a throwaway user (API 401 / login-page on pages / cookie→200), user then
  removed → store empty. Passwords are Anthony's to set; I never chose or stored one. Reverting
  the whole feature = `--remove` all users (gate goes inert) or delete the two dotfiles.

- **2026-07-04 — Tailscale Funnel ON (public internet), gated by the login.** Anthony wanted
  friends without Tailscale to reach it with just a URL + password. `tailscale funnel --bg 4680`
  → `https://mac-mini.tail2d1a01.ts.net` is now publicly reachable (proxies to loopback:4680;
  the app stays loopback-bound). SAFE because the login gate is in front — verified from the
  public path: `/` = sign-in page, `/api/*` = 401 (overview, house, risk all sealed) without a
  session. Added a login brute-force throttle in auth.js (per-username, 6 fails → exponential
  lockout 10s→~10m) because the Funnel hostname is discoverable via Cert-Transparency logs.
  Off switch: `tailscale funnel --https=443 off` (drops back to tailnet-only Serve). This
  deepens the §2/§10 deviation already logged for the login — the app is now internet-exposed,
  authenticated-only. Everything server-side is still read-only + zero-credential-in-code.

- **2026-07-04 — manual sync button (Anthony-requested) + mobile pass + session-revocation fix.**
  (1) The top-bar sync chip is now a button: `POST /api/sync` (login-gated) spawns a normal —
  NOT --force — run, so per-source freshness windows still protect TrendForce/Naver/EDGAR no
  matter how often anyone taps; lockfile mutex + 15s cooldown stop pile-ups. Client polls
  freshness until done, then remounts the current page (keyed wrapper) so all data on screen
  refetches. Spinning ⟳ + SYNCING… while running. Verified: 401 unauthenticated, mutex
  "already running" on double-press, run completed + log line landed.
  (2) Mobile (Safari ~390px) fixes: min-width:0 on grid children so chart canvases can shrink
  (the phone overflow root cause), 1-col px4/cogrid/mini4 ≤640px, tables swipe inside cards,
  compact top bar (rev hidden, LOCAL ONLY hidden, ⌕ palette button ≤960px), last-value pill
  only on charts ≥120px tall, theme-color meta. Browser-automation verification was cut short
  (extension kept disconnecting); Anthony verifies on his real phone.
  (3) Security fix found en route: gate() now requires the session's user to STILL EXIST —
  `--remove dave` cuts off dave's live cookie on his next request (was: valid for up to 30d).

- **2026-07-04 — Background section (Anthony-requested): 11th rail page ◫ "Memory 101".**
  Content lives in the VAULT as 7 chapters at `wiki/background/bg-0N-*.md` (frontmatter:
  type/order/name/summary), distilled from his 114-page "The Memory Super-Cycle" report
  (2026-04-21): hierarchy · types (DRAM/NAND/HBM) · history/oligopoly/CXMT · manufacturing
  (fab rule, nodes, TSV/stacking processes, CHIPS) · pricing + four-phase cycle + 2025-26
  regime shift · AI demand mechanics (3 vectors, KV math, MoE, tiering/Engram) · glossary.
  All position/recommendation content from the report deliberately stripped (decision-support
  invariant); regime-shift facts presented with the classical-cycle counterpoint and pointers
  to the live risk pages. Chapters cross-link each other + existing vault pages (wikilinks
  verified resolving), appear in ⌘K as kind "primer", and render in the reader. The rail page
  itself is vault-driven (`/api/background` scans the dir): add a file → new chapter, zero code.
  Report pages 81–114 (§7 risks detail, §8 modeling, §9 positioning) intentionally not used.

- **2026-07-04 — Figure-brain expansion + Analysts-card upgrade (Anthony: "update the website
  with all the new information and research").** Vault side: new `figures/semianalysis/` full
  brain (index/method/sources + 3 stated-views) + Baker refresh (memory-dram All-In E278
  escalation, EDGAR MU quarter-table, timeline entry, index.md NEW-convergence delta bullet) —
  built by 6 parallel research agents, synthesized under `_schema.md` discipline. App side
  (`model.js analysts()` + `Analysts.jsx`): card now reads **every** `stated-views/*.md`, not
  just `memory-*` — extracts each file's `topic:` + `**Headline:**`, sorts memory-first, renders
  lead as "STATED — MEMORY:", then one "STATED — {TOPIC}:" section per additional headlined view
  (with `» full view` chip), then DELTA, then a full chip row: method/framework (labeled "the
  reasoning engine"), every stated view, related reports. Also surfaces `updated:` as an
  UPDATED chip. Sources chip deliberately omitted: `raw/` dirs are excluded from the vault page
  scan and both figures' `sources.md` share a slug → chip would 404. Verified live via API
  (throwaway login created + removed) + screenshot; lint 0/0; house-view.md mtime untouched
  (Jun 30 17:06:14).

- **2026-07-04 — Foreign-institution charts on the positioning page (Anthony: "build new
  graphs … track foreign institutions in the Korean market"; picked Forms A + C from a live
  mockup).** Updater 08 (`naver-retail-flow`) already fetched `foreignerPureBuyQuant` +
  `foreignerHoldRatio` purely to run the §12 netting sanity-check, then discarded them — now it
  also `appendPoint`s them. Four new series added to the registry AND the positioning-unwind risk
  frontmatter: `foreign-flow-{hynix,samsung}` (kind `flow` — signed ₩B daily net, renders
  red-below-zero like retail flow, app auto-labels the window-net: −₩18.34T / −₩11.65T · 10d) and
  `foreign-own-{hynix,samsung}` (kind `line` — 외국인 보유율 %, 50.18% / 46.74%). The foreign columns
  ride the SAME row + SAME verification gate as retail (flow guarded `Number.isFinite(frn)`,
  ownership guarded `0 < h ≤ 100`); no foreign chart for the leverage ETF (retail-only instrument).
  Deliberately skipped Form B (cumulative — foreign-ownership% is the cleaner, start-date-free
  version of the same signal) and Form D (3-way foreign/domestic-inst/retail decomposition — a
  bigger multi-line build) per Anthony's pick; both remain easy future adds (domestic-inst 기관 =
  `organPureBuyQuant`, already in the same payload). Verified live: lint 0/0 (18 series, was 14),
  all four CSVs 10 pts, `/api/risk/positioning-unwind` carries 8 series in order, charts render on
  the site with presets. History accumulates forward (~10 trailing days at first sync). ₩ values
  are close-price-valued (±5%, per §12); share/ownership numbers exact. `house-view.md` untouched.

- **2026-07-04 — MU short-interest + days-to-cover charts (Anthony: "find institutional activity
  around micron and build a graph"; picked short interest from a live preview).** Assessment came
  first: the US has no daily institutional-vs-retail flow (unlike KR's Naver), and our feed exposes
  13F only filer-centric (query by fund CIK — no per-ticker reverse index), so aggregate
  institutional *ownership* isn't cleanly buildable without scanning thousands of filings/quarter.
  Short interest / days-to-cover IS: real, per-ticker, bi-monthly FINRA. New updater
  `12-mu-short-interest.js` hits Nasdaq's keyless short-interest endpoint (same host + headers as
  01-nasdaq-prices, so §12 T-Mobile-safe) via new `net.js fetchNasdaqShortInterest()` → returns
  `{date, shares(M, 2dp), dtc}`. Two `line` series `mu-short-interest` (M sh) + `mu-days-to-cover`
  (days) on the positioning-unwind page. Nasdaq serves ~1yr; the deep 2022→ history was seeded once
  from a Massive pull (90 pts, `scratchpad/seed-mu-si.js`) — appendPoint dedupes by settlement date
  so each run just tops up the latest fortnightly print. Signal: SI rebuilt to a 2-yr high (41.6M
  sh) while days-to-cover pins at 1.0 → rising bearish positioning with no squeeze cushion;
  quantifies the page's existing days-to-cover tripwire and backs the Burry MU-short note. Offered
  but deferred: insider net (Form 4 — but insiders ≠ institutions), curated notable-holder 13F,
  daily short volume. Verified: lint 0/0 (20 series, was 18), both series 90 pts, charts render live
  with presets (+50% / −15% window labels). `house-view.md` untouched.

- **2026-07-04 — Insider-net + curated-13F-holder charts (Anthony: "build insider net and curated
  13F holders graphs").** Both use KEYLESS sources (Massive MCP is Claude-only; the standalone sync
  can't call it). **Insider** (updater 13, Nasdaq keyless insider endpoint ~2yr, self-contained
  full-recompute each run): `mu-insider-net` (flow — quarterly net OPEN-MARKET DISCRETIONARY $M,
  Buy − Sell; near-flat-negative, lone $7.8M buy Q1'26) + `mu-insider-auto-sell` (line — 10b5-1
  planned sells $M; surged to ~$122M Q2'26 as MU hit ~$1,150). Grants/tax-dispositions/option-
  exercise excluded. `net.js fetchNasdaqInsider`. **Curated 13F** (updater 14 + EDGAR): `mu-13f-
  atreides` (Baker's conviction — swings 0.07M→1.54M sh) + `mu-13f-primecap` (long-only trim — flat
  ~37.5M for 1.5yr then cut to 21.9M; feeds the Q2-13F "long-only trimming" tripwire). Curated set
  chosen by VERIFYING candidates via 13F, not guessing: Scion/Burry holds no MU 13F long (the short
  isn't 13F-visible); Coatue = new 1-qtr position, Whale Rock exited 2024 (too thin → noted in text,
  not charted); PRIMECAP + Atreides have real sustained positions. `net.js fetchEdgar13FHolding`
  parses the NAMESPACED 13F info-table XML keylessly (CUSIP 595112103, common only, puts/calls
  excluded) — new keyless EDGAR pattern; updater appendPoints the latest 13F quarter forward.
  History seeded from a one-time EDGAR backfill (`scratchpad/seed-mu-13f.js`) — PRIMARY source,
  which resolved Massive's gaps (e.g. Atreides 2025Q4 common 738,916 that Massive dropped); ~9-11
  qtrs each so both cross the site's ~7-pt "BUILDING-table" threshold and render as line charts.
  Verified: lint 0/0 (24 series), all four render live, EDGAR fetch ~4s (the earlier 90s was a
  stale-lock artifact from a timed-out run, not EDGAR). Cosmetic wart: the insider-net flow subtitle
  reuses the daily "Nd net" label for quarterly points ("7d") — harmless, the −$58M value is right.

- **2026-07-04 — Positioning READ synthesis panel (Anthony: "build the synthesis layer").** A
  server-computed verdict at the TOP of the positioning-unwind risk page (under the house-view
  GUARDS, above the tripwires) so it answers "is the crowd building or unwinding" without reading
  14 charts. `model.js buildPositioningRead()` groups the risk's series into 4 dimensions — Retail/
  leverage, Foreign (smart money), MU shorts, Insiders/13F — reads each one's recent DIRECTION
  (net flow / ownership slope / SI slope / insider+13F trend), tones each hot/cool/neutral, and
  composes a headline that surfaces the weak-hand/strong-hand DIVERGENCE the raw charts hide.
  Rendered by `Risk.jsx <PositioningRead>` (verdict + severity chip + per-dimension state rows +
  evidence + honest caveat). **Deliberately NOT a precision composite index** — won-flows +
  share-counts + percentages are incommensurable, so it's a transparent directional read that
  shows its components; decision-support only, no buy/sell. Live read today: "CROWDED —
  DISTRIBUTION TO RETAIL" (HIGH) — retail +₩22.1T building while foreign −₩20.2T + insiders/
  PRIMECAP distribute; MU shorts building into a 1-day cover. Pure derivation of existing series
  (zero new vault data); attached to riskDetail only for id==='positioning-unwind', extensible to
  other risks with per-risk dimension logic. App-code change → needed a server restart + rebuild;
  NO vault files touched (lint unchanged at 24 series, house-view untouched). Computed live each
  load (the verdict itself isn't stored, so there's no verdict-history series yet).

- **2026-07-04 — Cache-header fix (Anthony couldn't load the site on iOS Safari, away from home).**
  Diagnosed everything healthy first: local server 200, Tailscale up, Funnel ON — verified the
  PUBLIC ingress (208.111.34.11 / .35.209) returns the sign-in page from the open internet, his
  iPhone showed `active; direct` on the tailnet, and the redeploy was coherent (index.html →
  existing bundle). Root cause was a stale app shell: `express.static(dist)` served index.html with
  no explicit cache policy, so after a redeploy (new bundle hash) a cached Safari shell requested a
  bundle that no longer exists → the auth gate returns login-HTML for the missing `.js` → the browser
  parses HTML as JS → blank page. Fix in `server/index.js`: hashed `/assets/*` now
  `Cache-Control: public, max-age=31536000, immutable`; index.html (both the static route and the
  SPA catch-all) now `no-cache`, so the entry point always revalidates and a redeploy is picked up
  immediately. Verified authed: index.html=no-cache, bundle=immutable + `application/javascript`.
  One-time cache bust still needed for the already-stale shell (iOS Safari Private tab / clear site
  data); future redeploys self-heal. Lesson: SPA + content-hashed bundles REQUIRE no-cache on the
  entry doc, else every redeploy strands returning visitors.

- **2026-07-04 — Headlines auto-translated to English (Anthony: "always translated to English, do
  not want to see Korean").** Updater 09 (headlines-rss) now translates any Korean title/source to
  English AT INGESTION via a new keyless `net.js translateMap()` (Google's unofficial gtx endpoint,
  same keyless posture as the other sources; newline-batched ~12/call with a line-count check +
  per-item fallback; de-dupes so repeated sources cost once). Idempotent: English rows have no
  Hangul so they're skipped next run; a transient failure keeps the Korean and is retried on the
  next sync (self-heals toward all-English). The `url` still points to the original (Korean) source,
  so provenance is intact — no frontend change (display just renders the stored English title).
  Backfill: this run translated the existing 279 Korean rows in one pass (278 →en, ~43s internal);
  CSV now 0 Korean / 500 rows; verified via `/api/desk/korea` (0 Korean). Quirks: Korean colloquial
  portmanteaus (삼전/삼전닉스) romanize as "Samjeon"/"Samchunix", some outlet names translate literally
  (한국경제 → "Korean economy") — readable, acceptable. lint 0/0, house-view untouched.

- **2026-07-04 — Memory revenue/profit MODELING methodology + report (Anthony: "build a feature to
  model the revenue/profit SK/Samsung/Micron make for 2027-2028; how to model it is the question…
  max compute").** Ran 9 parallel research agents (company anatomy ×3, pricing/cycle, HBM,
  methodology + sub-agents on historical ASP vol, cost-down, operating leverage, forward ASP,
  supply/demand, structural-vs-cyclical) cross-checked vs primary filings (Micron 10-Q/10-K,
  Hynix/Samsung IR/DART) + TrendForce/SemiAnalysis/Objective-Analysis/sell-side. Synthesis →
  formal report `reports/2026-07-04-memory-revenue-profit-model-methodology.md` (+html+pdf built via
  the pandoc→Chrome pipeline in `reports/build/`; live on the Reports page, verified served 200).
  **Recommended model = driver-based 3-layer scenario model:** L1 = consume the existing
  `memory-scenario-tree` industry engine (don't rebuild); L2 = company revenue = Σ segment
  [bit-share × industry bits × ASP(scenario)] over conventional-DRAM/HBM/NAND (HBM bottom-up from
  accelerator units × GB/GPU); L3 = profit via the operating-leverage bridge (~40-50% fixed D&A →
  profit swings ~2-3× revenue mid-cycle, ∞ at trough). Core principle: don't forecast prices —
  forecast the balance→direction, scenario the magnitude on observed amplitude bands (typical bear
  DRAM −35-55% / NAND −45-65%), anchor the knowable (guidance ±2Q, ~40% MU under LTA floors, capex,
  bit-growth); profit range ≫ revenue range. Full per-company seed tables with confidence tags +
  quirks (MU fiscal-yr/53-wk; Hynix reports consolidated → build the DRAM/NAND split; Samsung
  discloses Memory revenue but NOT OP → DS-OP add-back that converges to DS by 2027-28).
  **PENDING (Anthony approved the write-up FIRST, to pressure-test on paper):** build the feature —
  vault `models/` assumption files + a computed "Fundamentals Read" readout (sibling to the
  Positioning Read). Decision-support only; house-view untouched; lint 0/0.
- **2026-07-04 — Published-firm-models COMPARISON report (Anthony: "instead of modeling ourselves,
  find the models created by well-known firms… a lot of different models so we can compare and
  contrast").** A PIVOT from building our own model → cataloging everyone else's. Ran 4 parallel
  research streams (Micron ≈25 desks, SK Hynix ≈22, Samsung ≈20, independent houses ×13) → report
  `reports/2026-07-04-street-models-comparison-mu-skhynix-samsung.md` (+html+pdf via the pandoc→Chrome
  pipeline; live on the Reports page, `reports()` returns it, title from H1, kind `report`). **Cross-
  company throughline: 2026 is settled (guidance-anchored), the disagreement is entirely 2028 (does
  the shortage break 2H27 or run into 2028), ratings near-unanimous Buy (no Sell on any name).** Three
  data-integrity traps captured so a future session doesn't re-derive them: (1) **Micron fiscal-vs-
  calendar EPS** — UBS/TD Cowen/Bernstein/Mizuho quote CY (~$150-167), aggregators quote FY (~$112-
  122); mixing fakes dispersion. (2) **SK Hynix** — sub-₩1m aggregator "targets" are feed scaling
  artifacts (real ₩1.8-4.3m); Samsung Sec ₩1.8m / Sangsangin low ends are stale April models, not
  bears; Nomura DENIED the ₩5m rumor. (3) **Samsung OP figures are CORRUPTED in Korean press** —
  prints implying >100% margins (₩240-580T); anchor on primary broker PDFs (Eugene ₩148.8T / Mirae
  ₩125.5T) + the ₩113-170T credible band; no clean per-year OP consensus exists in English. Key
  structural read the models agree on: **Hynix out-earns Samsung in memory despite lower DRAM share
  (28.8% vs 38.6%)** — HBM-mix + foundry-drag inversion (Hynix ~77% OP margin vs Samsung DS ~47%).
  Only Goldman prints a firm 2028 number for anyone (Hynix OP ₩454tn). Decision-support only — catalogs
  third-party forecasts + firms' own PTs; no house target/reco/sizing; house-view untouched.
- **2026-07-04 — STREET READ page (Anthony: "how can we implement this research into the website…
  very useful"; he picked "Dedicated Street Read page" from a 4-option AskUserQuestion).** New 12th rail
  page ◎ `#/street` that turns the firm-forecast research into a LIVING, computed readout (not a static
  report re-render). **Architecture (mirrors the Positioning Read pattern):** curated dataset
  `cockpit/street/street-models.json` (54 firm rows + 11 independent houses; hand-refreshed like the 13F
  set — paywalled consensus feeds aren't keyless-syncable) → `model.js street()` reads it + COMPUTES the
  synthesis (bull/bear/stale/cautious counts per name, "no Sell on any of the three", the per-company
  dims) → `/api/street` route → `src/pages/StreetRead.jsx` renders a STREET READ verdict panel
  (`SUPERCYCLE PRICED — THE WHOLE DEBATE IS 2028`) + WHERE THEY AGREE + THE 2028 FORK table + per-company
  sections (consensus strip, firm table with ▲bull/▼skeptic/⊘stale/◆primary-PDF flags, bull/skeptic/trap
  frames, Samsung DATA-INTEGRITY warning callout) + head-to-head + independent houses + reading traps.
  Wired into App.jsx (import + RAIL entry after Analysts + route) and the ⌘K search index (page + 3
  per-company entries). **Verified:** lint 0/0; `model.street()` returns correct computed counts
  (Micron 5 bull/2 bear, cautious=[Goldman] → amber dim; Hynix 3 bull/2 stale; Samsung 1 bull/1 stale);
  built the bundle (`index-CaVaQ-sO.js`), restarted the 4680 server, and screenshotted the rendered page
  via a throwaway auth-inert instance on :4699 (`COCKPIT_ACCESS_FILE=/tmp/…` → gate inert; killed + file
  removed after). Decision-support only; house-view untouched. **The consensus/dispersion TRACKING
  CHARTS remain the fast-follow** — gated on verifying which consensus feeds (Nasdaq/MarketBeat-style)
  are keyless-fetchable for a sync updater; today the page is a curated snapshot refreshed on request.
- **OPS GOTCHA (2026-07-04):** `server/index.js` PORT defaults to **4681**, but the canonical/tunnel
  port is **4680** (Tailscale Funnel → 127.0.0.1:4680). The live server MUST be launched with
  `PORT=4680`. The process is a detached `node server/index.js` (parent=launchd, NO launchd plist / pm2
  supervision), so a reboot loses it — relaunch with `PORT=4680 nohup node server/index.js &`. A restart
  that forgets the env silently comes up on 4681 and the tunnel breaks.

- **2026-07-04 — iOS Safari redeploy-strand HARDENING (Anthony: "website isn't working on my iPhone
  outside the home network" — right after the Street Read rebuild).** Diagnosed: infra 100% healthy
  (Tailscale up, both devices online, Funnel → 127.0.0.1:4680, public URL 200 in ~20ms) — the failure
  was a STALE CACHED SHELL on his phone: `npm run build` changed the bundle hash and Vite's default
  `emptyOutDir` deleted the old one, so his cached index.html requested a bundle that 404'd. Root cause
  of the *blank* (vs a clean error): the SPA catch-all returned index.html (200/text-html) for missing
  `/assets/*`, so the browser parsed HTML as JS. **Two server-side fixes (deployed via restart, no
  rebuild → bundle hash unchanged, no re-strand):** (1) `server/index.js` catch-all now returns a real
  **404** for `/assets/*` misses (verified: was 200/text-html → now 404/text-plain); (2) `vite.config.js`
  **`emptyOutDir:false`** so future builds KEEP prior hashed bundles — a client cached on an old shell
  keeps working across a redeploy until it revalidates the no-cache index.html (prune dist/assets
  occasionally). index.html `no-cache` + assets `immutable` headers confirmed correct end-to-end. The
  CURRENT strand still needed a client-side refresh (Private tab / clear website data) — server fixes
  prevent recurrence, they don't retroactively un-strand an already-cached client.

- **2026-07-05 — MARGINS page (Anthony: "build a graph that highlights the operating margin % for HBM
  and DRAM for SK Hynix, Samsung, Micron… official reports based on earnings calls").** Clarified the
  data constraint FIRST (AskUserQuestion): no company discloses HBM-vs-DRAM operating margin — Micron's
  segments are end-market, SK Hynix reports consolidated, Samsung reports DS (memory+foundry). Anthony
  picked "official company margins + a graded HBM/DRAM estimate overlay." Ran 4 parallel research agents
  (MU / SK Hynix / Samsung official quarterly margins from SEC/IR filings, all reconciled to reported
  annual OP; + an estimate-layer agent). **New 13th rail page `%` `#/margins`** (curated JSON → model →
  page pattern). Data `cockpit/margins/margins.json`: three OFFICIAL consolidated/DS operating-margin
  series (SK Hynix Q1'23−67%→Q1'26+72%, Micron non-GAAP CQ1'23−56%→CQ2'26+81%, Samsung DS −33%→+66%,
  all calendar-aligned — Micron fiscal quarters mapped to the calendar quarter covered) + Micron's
  Cloud-Memory (CMBU, HBM-heavy) & Core-DC (CDBU) SEGMENT operating margins (the closest OFFICIAL
  'HBM operating margin' proxy) + a graded [A]/[B]/[C] estimate table. **Key honest findings:** (1) pure
  HBM/DRAM *operating* margin is unpublished by everyone — only SK Hynix general-purpose DRAM op margin
  >70% [B] exists; the estimate layer is mostly GROSS margin / ASP ratios, shown as a graded table, never
  a fabricated line. (2) **The HBM premium INVERTED** — through mid-2025 HBM was ~2× DRAM gross margin;
  by early 2026 the shortage lifted commodity DDR5 to ~80% while HBM sat ~60%, and it's visible in
  Micron's OWN segments (Cloud-Memory went from +12pts above the company avg in Q4'24 to at/below it by
  2026; Core-DC DRAM 83% > Cloud-Memory 78% in FQ3'26). (3) Samsung DS understates memory margin (foundry
  drag); Samsung never breaks out Memory OP. **New shared component:** `charts.jsx MultiLineChart`
  (overlays N series on one time axis, official solid / estimate dashed, `[grade]` legend, crosshair-
  tracked values, dotted zero line, range chips) + `fmt` gained a `pct` unit. Verified: builder resolves
  all chart refs, screenshotted the rendered page via the auth-inert :4699 instance (both charts + table +
  quotes render), server restarted on 4680, funnel 200. Decision-support only; house-view untouched. NB:
  Micron re-segmented in FY25 (retired CNBU/MBU/EBU/SBU → CMBU/CDBU/MCBU/AEBU) so the HBM proxy is CMBU
  from CQ4'24; earlier CNBU is a different, pre-unallocated definition (left out of the chart).

- **2026-07-05 — RELIABILITY HARDENING (Anthony asked whether to refactor for long-term reliability;
  I advised AGAINST a rewrite — it's a clean ~3k-line app, 6 pinned deps, no rot — and recommended
  operational hardening + a test net instead; he picked "Hardening + smoke test").** Three parts:
  1. **Process supervision via launchd** — `~/Library/LaunchAgents/com.memory-cockpit.server.plist`
     (Label `com.memory-cockpit.server`) runs `/opt/homebrew/bin/node server/index.js` with **PORT=4680
     baked in**, `RunAtLoad` + `KeepAlive` (auto-start on login, respawn on crash), logs → `logs/`.
     REPLACES the hand-started detached process. **Manage it:** restart after a server-code change =
     `launchctl kickstart -k gui/$(id -u)/com.memory-cockpit.server`; stop/remove =
     `launchctl bootout gui/$(id -u)/com.memory-cockpit.server`; re-add =
     `launchctl bootstrap gui/$(id -u) <plist>`; status = `launchctl list | grep memory-cockpit`.
     Verified: boots on 4680, funnel 200, and a `kill -9` respawned it (PID 90310→90351, recovered 200).
     (Frontend-only changes still need just `npm run build` — the server serves dist/ fresh, no restart.)
  2. **Smoke test** — `npm run smoke` (`scripts/smoke.mjs`) spawns a throwaway auth-inert instance on
     :4788 against the real vault + current dist/, asserts every API route returns 200 + a sane shape,
     the static layer serves index.html no-cache / the bundle as immutable JS / a MISSING bundle as a
     real 404 (the strand guard), and `cockpit/lint.js` is clean. `npm run smoke -- --render` adds a
     headless-Chrome pass that loads every rail route and checks `<main>` actually mounted content
     (catches a page render-throw). Current: **32/32 pass**. Run it before every deploy.
  3. **Sync-spawn PATH fix** — `spawnSync()` used bare `spawn('node', …)`, which relies on PATH and would
     SILENTLY break under launchd's minimal env; changed to `spawn(process.execPath, …)`. (Found while
     hardening; this would have broken auto-sync + the manual sync button once supervised.)
  Deferred (offered, not taken): the light code-cleanup pass (extract route/rail config, /health
  endpoint, prune old dist bundles) and — explicitly advised against — a full refactor.

- **2026-07-05 — CLAUDE.md operator's guide (Anthony: "how will future Claude Code instances know how
  to add features, maintain, and fix the site if it's down?").** Created `memory-cockpit-v2/CLAUDE.md`
  (auto-loads for any Claude Code session started in the dir). Leads with the **IF THE SITE IS DOWN
  runbook** (launchctl status → curl 200 → kickstart → logs → re-bootstrap → port/tunnel/cache checks;
  restart command validated live), then: the vault-is-the-brain rule + guardrails (house-view never
  written, decision-support only, anti-fabrication), deploy=build+smoke, the feature pattern (curated
  dataset → model builder → route → page → wire, with Street Read/Margins as worked examples), hard
  guardrails (keyless-only sync, no cron, credentials, English headlines), the gotchas, and a file map.
  **Config finding surfaced:** sessions must launch from `~/Trading/memory-cockpit-v2` (or `~/Trading`)
  for it to auto-load — NOT `~/Desktop/Trading` (stale empty folder, yet it's this session's cwd + the
  memory key). The parent `~/Trading/CLAUDE.md` is the OLD "APES Investment Research System" doc (0
  cockpit mentions) — offered to add a pointer to it, not done unilaterally (it's the other project's doc).

- **2026-07-05 — CURATED-DATA REFRESH PATH (Anthony agreed the curated path is the inefficient half —
  the fast-moving data on the most manual path — and to make it cheap/repeatable, NOT to automate it).**
  Principle: each curated dataset is ~20% VOLATILE (numbers that move) wrapped in ~80% STABLE narrative
  (structural reads that change only on a regime shift); a refresh touches the volatile core only, so it
  drops from a multi-agent research project to a cheap diff-pass. Built: (1) `research-wiki/cockpit/
  CURATED-REFRESH.md` — the per-dataset runbook with a TUNED single-agent Street refresh prompt (re-pull
  current PTs/ratings/consensus from stockanalysis/MarketBeat/TipRanks/Benzinga → return a DIFF only,
  leave the forks/head-to-head/independents/quotes) and the Margins append-on-earnings procedure (no
  agent — read the release, append one calendar-mapped point per series, reconcile to reported OP).
  (2) A compact self-documenting `refresh` block inside `street-models.json` + `margins.json` (volatile
  vs stable fields, source, cadence, `lastRefreshed`) — inert to the model builders (they read specific
  keys). (3) A "Refreshing curated data" section in `CLAUDE.md` pointing at the runbook. Verified:
  builders unaffected (street 3 companies / margins 2 charts, 13 pts intact), smoke 19/19. Street cadence
  = monthly or post-revision-cluster; Margins = the Catalysts earnings dates. The runbook also makes a
  future scheduled-cloud-agent refresh (the deferred automation lever) a clean drop-in if wanted.

- **2026-07-06 — LIVE price overlay + 1-week day-to-day toggle on the §2.0 "complex" tiles (Anthony:
  "pull from Yahoo so DRAM / MU / SK Hynix / Samsung update more quickly; add a one-week toggle with all
  four tickers and daily percent changes day to day; don't change the endpoints for any other graph").**
  **Source decision (evidence-first).** The registry already tagged these four "Nasdaq / Naver (Yahoo
  fallback)" because §12 records that this Mac's egress HARD-429s Yahoo v8. Re-verified live 2026-07-06:
  Yahoo query1+query2 = **429** on every symbol (US + KR); Nasdaq `/info` = **200** with `isRealTime:true`
  (MU $993.98 +1.90%, DRAM ETF $64.79 +6.87%). Surfaced the conflict rather than silently overriding;
  Anthony picked **works-first** (Nasdaq real-time US / Naver latest-close KR, Yahoo kept as fallback) over
  literal Yahoo-first. **Architecture — the app's FIRST request-time outbound path** (every other route is
  a pure vault readout): new app-side `server/quotes.js` (self-contained, keyless, per-ticker
  timeout-bounded + swallowed-to-null) → `model.complexQuotes()` (async, 60s single-flight cache) lays the
  live quote over the synced CSV and derives the one-week table PURELY from the CSV (last 5 completed
  day-to-day % moves; today's live move shows as the tile session-% + the row's NOW cell, never folded into
  the completed-session column twice) → new `ja()` async route wrapper + `/api/complex-quotes` → Overview
  `PriceTile` shows the live price + "▲ x% TODAY" + a green "· LIVE" tag on the two realtime US names
  (KR = latest close, no tag), plus a **TILES ⇄ "1W %"** toggle in the §2.0 header that swaps the 2×2 for a
  day-to-day table of all four tickers × 5 sessions + a live NOW column. Client refetches on mount,
  window-focus, and a 60s **visible-only** tick (the server cache makes it cheap). **Graceful / invariant-
  safe:** any source failure → null → the tile falls back to the synced CSV value, so the empty-env boot
  still works; the WEEK never needs network (CSV-derived) so it renders offline. **Scope honored:** ZERO
  change to sync / updaters, the sparklines, the 1Y/3Y deltas, off-high, or any other graph — only the four
  tile numbers gained a live overlay. Decision-support only (price *states*, no action); `house-view.md`
  untouched. Files: **+`server/quotes.js`**, `server/model.js` (+`complexQuotes`/cache), `server/index.js`
  (+`ja` wrapper + one route), `src/pages/Overview.jsx` (live tile + `WeekTable` + toggle), `scripts/smoke.mjs`
  (+shape check). Verified: **smoke 37/37** incl. `--render`; live JSON = Nasdaq realtime + correct US/KR
  day-to-day weeks (Hynix −14.6% 07-02 crash, +10.9% 07-03 bounce); screenshotted BOTH views on the
  auth-inert :4699; live 4680 `/api/complex-quotes` = 401 unauthenticated (correctly behind the gate).
  **To flip to Yahoo-first later:** reorder the chains in `quotes.js` `TICKERS` — the merge / cache /
  fallback plumbing is source-agnostic.

## Known post-cutover follow-ups (not blockers)

- v1's UTC `today()` left one phantom `2026-07-04` row in each dram-spot CSV (values real,
  date a day ahead). Tomorrow's sync overwrites it by date-dedupe — self-healing, no action.
- Two `wiki/log.md` cosmetic pre-existing glitches (a duplicated tail line from before v2)
  render fine in the forgiving parser.

## Deviations (conservative option chosen, per §0.4)

1. **§8 manifest says the monitor-extraction logic is in `server/vault.js` — it is actually in
   `server/factors.js`** (`extractFromMonitors` / `extractFromPages`). Ported from there into
   `migrate.js`; same logic, per-manifest intent.
2. **§9 says "emit the 11 risk files"; §6 table and §11.b say 12.** Emitting 12 (the §6 table is
   the [HARD] contract; "11" reads as a typo).
3. **Mock sample-data compressions resolved in favor of the plan:** Overview register shows 8 rows
   in the mock → build renders all 12 (§4.1 says "all 12"). Risks-index mock merges
   "Air-pocket 2027–28 · AI-trade contagion" into one row → build keeps them as two §6 risks.
   Mock range-chip sets vary per chart (1Y/3Y/ALL etc.) → build ships `1M·3M·6M·1Y·5Y·All`
   everywhere per §4 [HARD, supersedes mock chips].
4. **Tripwire tables emit 4 columns** (Signal | Tripwire → | State | As-of). §5's example shows 3;
   §4.1 and the mock's §3.1 payoff page require per-row state. Parser accepts both widths.
5. **History seed dates corrected to vault truth** where the mock used sample dates (e.g.
   positioning-unwind opened 2026-07-03 — the date memory-fund-positioning actually landed per
   log.md — not the mock's 06-27; valuation trigger named in the 06-28 CONFIRMED entry, not 06-30).
6. **`house-view.md` governance vs §6 "every risk file carries houseview:"** — extended-register
   (hv: false) risks also get a `houseview:` anchor: the verbatim house-view line they guard plus
   an em-dash guard note. Mock's §3.1 page shows no banner for extended risks; plan §6 says
   "rendered at the top of the risk page" — plan wins; the app renders the banner dimmer for
   hv: false.

## Schema extensions (forgiving-parser-compatible, shown at CP1)

- `summary:` — one-line register-row text (Overview truncates with ellipsis, index shows full).
  Mock's register subtitles aren't derivable from row 1 of the tripwire table, and the app may
  hold zero state (§4.1 "zero app-side state"), so it lives in the file. Falls back to the first
  tripwire cell when absent.
- `category:` — optional crumb tag (mock: "FUND-MICRO" on §3.1). Seeded from the v1 component map.
- `grade:` accepts letter-prefixed free text (`C — VERIFY` on etf-tail-sleeve, per mock chip);
  parser extracts the letter for sorting, renders the full string.
- Master-tell flag: trailing `⭐` in a tripwire Signal cell → `tell: true` (a markdown table row
  can't carry YAML; §5's "tell: true flag on their tripwire rows" encoded this way, matching the
  mock's inline stars). Tells #4 (STMicro) and #5 (Trn3) are off-spine (non-memory) — the
  scenarios desk will render them dimmed "off-spine · monitors.md", the other three wired live.
- Desk frontmatter may carry `tells: true` → the app renders the ⭐ master-tells block on that
  desk (keeps the scenarios desk vault-defined rather than code-special-cased).

## Locked build decisions (mechanical, [YOUR CALL] items)

- Vault-side scripts (`cockpit/migrate.js`, `sync.js`, `lint.js`, `updaters/*`) are dependency-free
  (Node stdlib only — the vault has no node_modules). Shared forgiving frontmatter/table parser
  lives at `cockpit/lib/fm.js`; the app server imports the same file by absolute path so there is
  exactly ONE parser for the schema ("gray-matter or equivalent" — this is the equivalent, and it
  degrades per-line instead of throwing).
- `migrate.js` default mode is dry-run; `--write` makes the timestamped backup
  (`~/Trading/vault-backups/<stamp>/cockpit/`) then writes atomically (tmp+rename, per §12
  Obsidian). Writes are asserted to stay under `cockpit/`; `house-view.md` is name-blocked in the
  write path as belt-and-braces.
- Staged at `memory-cockpit-v2/staging/migrate.js` for CP1 (writing the script into the vault
  before approval would itself be a vault write); installed to `cockpit/migrate.js` on approval.
- REV in the top bar renders from house-view `updated:` as `REV <MM-DD>` (currently REV 06-30).
  "MC-2026-B" stays as the static mock brand string.
- Monitor extraction scope: monitors.md sections "Memory / DRAM", "AI-trade / macro", "NVIDIA"
  (NVIDIA rows feed ai-trade-contagion per §6's anchor "monitors §NVIDIA/§macro") + inline
  markers on `#memory/`-tagged pages, excluding `figures/` (analyst-owned voice — surfaces on the
  Analysts page, not as Anthony's tripwires), `log.md`, and the MOC. Trainium/LEO/SpaceX sections
  stay off-spine per §6.
- Registry `kind` column ∈ {line, flow, parked}: `parked` puts the row in the Data page's PARKED
  section (unparking korea-exports later = edit one word). mu-pe row ships with no CSV → renders
  the mock's PENDING tile until first sync.
- log.md legacy entries carry no `[kind]` tags; sync appends tagged entries going forward and the
  renderer infers kinds for old lines (Ingested→ingest, report→report, …, default note).

## Proposed extras (NOT built — §0.1)

*(park anything tempting here instead of building it)*

- none yet
