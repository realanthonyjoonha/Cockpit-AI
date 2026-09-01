# Cockpit feature map — factory rooms + verify lever

**Class:** PLATFORM · works with product `desks: []` · desk N free-rides the registry  
**Decision-support only.** No buy/sell/PT/sizing.

This is the **one factory map** of thin rooms that exist on this clone.  
New operate features must land in these shared rooms (or Start) — **never** `pages/{ticker}/` forks.

**Named verify lever (same checklist Glass posts as proof and Lab FAILs on):**

```bash
# from monorepo root
./scripts/verify-feature.sh              # layout/UI — VM-glass shots required (fail closed)
./scripts/verify-feature.sh --docs-only  # docs/scripts only — must say so
```

Slash: `/cockpit-verify`. Lightweight wiring (not this checklist): `./scripts/feature-ready.sh`.

---

## How to get there

| Control | Where | What it does |
|---------|--------|----------------|
| Hash | `http://127.0.0.1:PORT/#/…` | Canonical. Kernel dogfood often **:4682** (this VM may serve kernel on **:4681**). Lab glass **:4690**. |
| Desk switcher | Top bar **START** + ticker buttons | START → `#/start`. A ticker → `#/{slug}/overview`. Product `desks=[]` shows **START only**. |
| Phone desks | **Desks ▾** (`desk-phone`, ≤640px) | Same hashes; desktop switcher is hidden. |
| Left rail | 52px glyphs (desktop) | `thinRail(desk)` in `src/thinDesks.js`. |
| Room bar | Bottom (`room-bar`, ≤640px) | Same hrefs as the rail. |
| Unknown desk | `#/{not-a-slug}` | `DeskUnknown` — **no** silent bounce to START. |
| Unknown room | `#/{slug}/not-a-room` | `ThinEmpty` — **Empty / parked**. |

`{slug}` is the live registry slug (`GET /api/thin-desks` / `config/thin-desks.json`). Aliases rewrite to the canonical slug.

Factory SoR for the room list: `thin-desks.json` `rooms[]` + `thinRail()` + `pages/thin/DeskRouter.jsx`.

---

## Rooms that exist here

| Room | Hash | Who it’s for | What proof looks like |
|------|------|----------------|------------------------|
| **Start** | `#/start` (also `#/begin`, `#/`, empty hash) | Anyone on the shell — underwrite next company; operate glance when desks exist | Shot: crumb **START · PRODUCT READY**; CTA **Build next company**; switcher **START**. Empty product: **no** dogfood tickers. Tests: `test:platform` (operate-glance + phone-chrome) · lab hook `40-operate-glance.sh` · empty-shell (below). |
| **Overview** | `#/{slug}/overview` (also `#/{slug}`) | Book reader — stance, WATCH, claim spine, book strip | Shot: `{LABEL} overview` + book strip (**COMPILE BOOK** / **REFRESH**). Live: `GET /api/{slug}/overview` and `desk-health --base-url` S3. Registry room `overview`. |
| **Risks** | `#/{slug}/risks` | Risk-register owner — status / add-risk **ACCEPT** (human gate) | Shot: register table + AGENTS. Detail is a **sub-route** (not a rail item): `#/{slug}/risk/{id}`. Live: `GET /api/{slug}/risks`. |
| **House** | `#/{slug}/house` | House owner — **ACCEPT** / **CONFIRM** of proposals; never silent write | Shot: house markdown + pending proposals + ACCEPT. Live: `GET /api/{slug}/house`. |
| **Sources** | `#/{slug}/sources` | Pack catalog reader | Shot: sources table (or honest **EMPTY**). Live: `GET /api/{slug}/sources`. |
| **Street** | `#/{slug}/street` | Operate Street — published firm models (**not** house PT / not pack SoR) | Shot: **REFRESH STREET** + **OPEN GROK**; EMPTY until first publish. Tests: `test:street` / `thin-street-test` · lab hook `30-street-surface.sh`. |
| **Model** | `#/{slug}/model` | Working numbers + bridge (**not** PT / not house / not Street) | Shot: **UPDATE MODEL** + **OPEN GROK**; EMPTY until first publish. Tests: `test:working-model`. |
| **Research** | `#/{slug}/research` | Deep-compile archive (**not** live pack until promote) | Shot: **NEW COMPILE** + run list or empty state. Tests: `test:research-runs` · lab hook `50-research-runs.sh`. |
| **Ask** | `#/{slug}/ask` | Pack Q&A — deterministic, not an LLM | Shot: chips (House view / What’s on watch / …) + answer. “Should I buy?” must stay decision-support. Live: `POST /api/{slug}/ask`. |
| **Update** | `#/{slug}/update` | Write-path ritual (`meta_only`) + **COMPILE BOOK** | Shot: **WRITE PATH** · **META_ONLY** + book strip. Live: `GET /api/{slug}/write-meta`. |

Shared implementations: `memory-cockpit-v2/src/pages/thin/*.jsx` + `server/thinDeskMount.js`. Desk N gets every row with zero new UI.

---

## Not a room on this clone

| Hash | What happens | Proof |
|------|----------------|-------|
| `#/{slug}/background` | **Empty / parked** (`ThinEmpty`) — not in `rooms[]`, not in `thinRail`. This origin clone does **not** ship a Background room. | Shot: eyebrow **NOT BUILT**, heading **Empty / parked**, pill **EMPTY**, copy lists valid rooms. Do not treat as a factory room. |
| Any other `#/{slug}/{unknown}` | Same Empty / parked | Same. |
| `#/{unknown-slug}/…` | **Desk not in registry** (`DeskUnknown`) | Shot: **DESK · NOT FOUND** · chip **UNKNOWN**. Empty product: every ticker hash looks like this except `#/start`. |

**OPEN GROK** is chrome (button / `openGrok.js`), not a hash room. Lab hook `20-open-grok-agents.sh` proves the agent catalog still exists on `desks=[]`.

---

## Verify lever — one named command

**Path:** `scripts/verify-feature.sh`  
**Slash:** `/cockpit-verify`

Glass (the agent) **posts this checklist as proof**. Lab **FAILs on the same items**. Do not substitute `feature-ready.sh` (wiring only) or a subset of `test:thin`.

| # | Gate | What it is |
|---|------|------------|
| 1 | **`npm run test:platform`** | Kernel factory suite (slug-resolve, desk-health, live-registry, pack-cache, open-grok, street, model, research-runs, operate-glance, compile-pipeline, phone-chrome). |
| 2 | **`./scripts/lab-e2e.sh`** | Blank-product E2E. Host fallback if Docker is missing (`--host`). |
| 3 | **empty-shell** | Lab hook **`10-empty-shell.sh` on PRODUCT** with **`desks=[]`**. Fail if PRODUCT missing or `desks!=[]`. Kernel dogfood desks may stay non-zero. **Never wipe** kernel `thin-desks.json`. |
| 4 | **VM-glass shots** | Layout/UI tickets: PNG/JPG/WEBP under `docs/proof/vm-glass/` (or `VERIFY_SHOTS_DIR`). **Fail closed** if missing. Docs-only tickets: `--docs-only` (the log **must** say docs-only). |

The lever does **not** require `/home/box/Trading/research-wiki` or any vault path.  
It does **not** ship, push, ACCEPT house, or write the vault.

```text
PROOF CHECKLIST (paste this)
  test:platform     exit=…
  lab-e2e           exit=…   (host fallback OK)
  empty-shell       exit=…   PRODUCT desks=[]
  VM-glass shots    exit=…   (N files | docs-only skip)
```

Empty-product visual (lab / friend shell): `http://127.0.0.1:4690/#/start` — START only, **Build next company**, no NVDA/NBIS/….

---

## Empty product vs kernel dogfood

| Tree | `thin-desks.json` | Map still true? |
|------|-------------------|-----------------|
| **PRODUCT** (friend / lab) | **`desks: []`** required for empty-shell + lab | Start + shared pages exist; ticker rooms 404 as DeskUnknown until a desk is underwritten |
| **KERNEL** (dogfood) | May have desks (this clone: 9) | Same hashes with real slugs; do not copy those desks into product |

Litmus: scaffold desk #N tomorrow → every row in the room table works with **no new code**.

---

## Related

| Doc / script | Role |
|--------------|------|
| [`EASY.md`](./EASY.md) | Modes (build / ship / operate) |
| [`LAB.md`](./LAB.md) | Blank-product E2E; this lever wraps hook 10 + existing gates (no extra lab hook) |
| [`DEVELOP.md`](./DEVELOP.md) | Platform procedure |
| [`PRODUCT-KERNEL-SOR.md`](./PRODUCT-KERNEL-SOR.md) | Sync allowlist |
| `memory-cockpit-v2/plans/THIN-DESK-CONTRACT.md` | Binding room/API contract |
| `scripts/lab-feature-hooks/10-empty-shell.sh` | PRODUCT `desks=[]` |
| `scripts/feature-ready.sh` | Easy-mode + factory **wiring** only |
| `.grok/commands/cockpit-verify.md` | Slash wrapper for the lever |
