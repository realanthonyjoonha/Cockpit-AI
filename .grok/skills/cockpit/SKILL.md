---
name: cockpit
description: >
  Anthony's cockpit research OS via MCP server cockpit-research (Grok Build primary).
  Use for house view, pack WATCH risks, daily brief, risk check, steelman, propose house,
  list proposals, multi-desk thin companies from registry (list_desks). Triggers: /cockpit,
  cockpit, house view, pack snapshot, daily report, daily brief, risk check, risk DD,
  propose house, WATCH risks, steelman vs pack, thin desk. Decision-support only — no buy/sell/PT/sizing.
argument-hint: "[desk] [daily|report|steelman|feature|ship|desks]"
user-invocable: true
---

# Cockpit research menu (Grok Build)

You have MCP **cockpit-research**. Prefer tools over inventing. Never write `house-view-*.md` directly.

**Trees:** operate/build on `~/Desktop/cockpit-kernel` (glass often `:4682`). Friend shell is `~/Desktop/cockpit-product`. `~/cockpit-personal/repo` is the Grok Bot twin — not factory SoR. Coding/ship → `docs/SESSION.md` · `/cockpit-feature` · `/cockpit-ship`.

## Menu

| Command | Action |
|---------|--------|
| `/cockpit-feature [goal]` | **Build PLATFORM** — factory-scalable (`docs/EASY.md`) |
| `/cockpit-ship [push?]` | **Ship to friends** — lab-e2e + release-check; push only if you say push |
| `/cockpit-desks` | List thin desks |
| `/cockpit-customer-sim [feature?]` | First-time customer on blank product (not dogfood) |
| `/cockpit-filings-e2e` | Filings friend-path QA — empty product, no ticker, no underwrite |
| `/cockpit-dogfood-e2e` | Testing-cockpit dogfood — isolated MCP + fixture desk DOGF |
| `/cockpit-new-desk [TICKER]` | Underwrite **new** desk — **deep parallel research default** (START → Build next company; `--light` opt-out) |
| `/cockpit-daily` | Daily brief: **what moved** + house + pack; optional `--save` |
| `/cockpit-research [desk] [question?]` | Load house+risks; research after user question; **ask to save** → write note + **`./ont compile`** so Sources updates |
| `/cockpit-coverage [desk] [scope?]` | Coverage / initiating-style note from pack+house; optional save+compile → Sources |
| `/cockpit-learn [desk] [primer\|tutor]` | **Background + tutor** — what they build; learner memory on this desk |
| `/cockpit-report [desk] [mode]` | **Thesis lane** — checkpointed IB report (deep-dive / earnings-update / initiation) + PDF |
| `/cockpit-filing-map [desk]` | SEC accession → house / register (Overview **MAP FILINGS**; on demand) |
| `/cockpit-comps [desk]` | Peer comps (user peers/metrics); optional save+compile |
| `/cockpit-model-bridge [desk]` | FCF/assumptions bridge (no PT advice); optional save+compile |
| `/cockpit-model-audit [desk]` | Audit model paste vs pack; optional save+compile |
| `/cockpit-ebitda-bridge [desk]` | Revenue→EBITDA bridge; optional save+compile |
| `/cockpit-ebitda-quality [desk]` | Adj. EBITDA quality / adjustments audit; optional save+compile |
| `/cockpit-model [desk]` | Model desk (glass `#/{slug}/model`) — not PT |
| `/cockpit-research-compile [desk]` | Deep compile archive (glass Research) — not thesis-lane |
| `/cockpit-street [desk]` | Street agent |
| `/cockpit-risk-check` | Risk DD: direction vs tripwires (no status write) |
| `/cockpit-risk-add` | Research + propose NEW risk (GO / glass ACCEPT) |
| `/cockpit-risk-tripwires` | Tripwire research + user cull → propose |
| `/cockpit-steelman` | Steelman house vs pack WATCH |
| `/cockpit-match` | Verify house labels vs pack WATCH |
| `/cockpit-propose` | **House in this terminal** — dump full markdown; **GO** writes · **SAVE DRAFT** Grok-only · **EDIT** revises (no write, no FORMING chip) |
| `/cockpit-register` | **Register in this terminal** — dump full 08; **GO** writes · **SAVE DRAFT** Grok-only · **EDIT** revises |
| `/cockpit-pending` | List pending house proposals |
| `/cockpit` | **Menu only.** Print pin (`list_desks`) + this table. Wait. Do **not** steelman unless they named a desk **and** asked steelman/daily/report/… |

Bare `/cockpit` (no desk, no action): show menu + compact pin (`monorepo_root` / vault / `pin_ok` / `agent_accept`). **Do not** start steelman, daily, or a report.  
If they named a desk **and** an action in the same message, run that action.  
If they named a desk only, ask which command — do not default to steelman.

**MCP:** one server named `cockpit-research`. github / edgartools / tasks are unrelated. `list_desks.monorepo_root` is the human tree (`~/Desktop/cockpit-kernel`); `monorepo_real` is the inode if that path is a symlink — **same tree**, not a second product. If `pin_ok` is false, STOP. Re-run `./scripts/install-grok-mcp.sh` from kernel or OPEN GROK from kernel glass.

## MCP tools

| Tool | Use |
|------|-----|
| `list_desks` | Registry + monorepo_root / vault (which book MCP is bound to) |
| `get_house_view` | Vault house markdown |
| `get_pack_snapshot` | house_prior, WATCH/FIRED, claims, gaps |
| `get_house_assist_context` | Full grounded pack |
| **`propose_house_from_current`** | **Preferred propose** — exact find→replace on current house |
| `propose_house_view` | Full markdown or `markdown_path` (large files) |
| **`commit_on_go`** | After user **GO** — write pending CONFIRMED house or register (not SAVE DRAFT) |
| `list_house_proposals` | Pending / accepted / rejected |

## Efficiency rules (mandatory)

1. **Do NOT mine chat history, prior sessions, home greps, or unrelated files** for draft wording unless the user explicitly says “use prior draft” / “from our earlier patch.”
2. **Source of truth for edits:** `get_house_view` (current vault) + `get_pack_snapshot` (WATCH names, claims). That is enough.
3. **Propose path preference:**
   - Small label/text edits → **`propose_house_from_current`** with unique `find` / `replace` pairs (each `find` must match **exactly once**).
   - Large rewrite → write `/tmp/{desk}-house-propose.md` then `propose_house_view` + `markdown_path`.
   - Avoid stuffing full 10kb+ house into tool `markdown` args.
4. Cap exploration: **≤4 tool calls** for steelman/match; **≤8** for **daily** / **risk-check** (2 MCP + day search); **≤6** for propose. If stuck, report error and stop — do not thrash.
5. Never invent pack WATCH titles; copy from `get_pack_snapshot`.

## Risk check (`/cockpit-risk-check`)

1. `get_pack_snapshot` — use **SoR-aware** `risk_summary.watch` / `risks[].status` (not stale `pack_watch` alone).
2. Desk-wide WATCH list must include every name in `risk_summary.watch` (e.g. newly ACCEPTed R4).
3. Direction: easing | stable | elevated. Suggested status is **not applied**.
4. Status change: MCP `propose_risk_status` then GO / glass ACCEPT → COMPILE BOOK if pack lags.

## Add risk (`/cockpit-risk-add`)

1. Research idea vs existing register (avoid duplicates).
2. Draft title, grade, status (default WATCH), summary, mechanism, tripwires (prefer 2–5 real monitors).
3. MCP **`propose_add_risk`** — pending only.
4. User **GO** (`commit_on_go` kind=register) or glass ACCEPT on `#/{desk}/risks` → SoR insert → COMPILE BOOK if pack lags.
5. If tripwires empty/GAP after add → `/cockpit-risk-tripwires`.

## Tripwires (`/cockpit-risk-tripwires`)

1. `get_risk_sor` for current table.
2. Research candidates; **iterate with user** — keep only monitors they approve.
3. MCP **`propose_risk_tripwires`** with final list (replace).
4. GO / glass ACCEPT → SoR table replace → COMPILE BOOK if pack lags.

## Daily brief (`/cockpit-daily`)

1. **Lead with daybook, not thesis dump.** Section **What moved** first (after header).
2. **Book tools (MCP):** `get_pack_snapshot` + `get_house_view` (target 2). Stance, WATCH/FIRED, tripwires, flip triggers, ≤5 claims.
3. **Day tools:** web search (≤4) for last ~24–72h on that name (filings, IR, major press, tape if sourced). Map each item → WATCH / house lever / flip trigger / `not in book`. Soft secondary → **[soft]**. Empty → explicit **GAP**.
4. Then short **Base case** (what it is + stance) + risk register + tripwires + claims + gaps.
5. **Default: no vault write.** Optional `--save` or “save this brief” → write only  
   `research-wiki/cockpit/briefs/daily/{desk}/YYYY-MM-DD.md` (frontmatter + body). Same day overwrites.  
   **Never** house, proposals, or `ontology/store/`. **Never** `./ont compile` after save.  
   Print path + “Ontology not updated (by design).”
6. Day items are **not** pack claims until filed + compiled. Brief is **not** book SoR.

## Hard rules

1. Decision-support only: NO buy/sell/hold, NO price target, NO sizing.
2. Prefer pack grades/as_of; say **GAP** if missing.
3. Steelman **house first**, then delta vs pack, then red-team.
4. Propose tools do **not** write the vault house. **`commit_on_go` after user GO** does. **Never propose FORMING** — API refuses it. SAVE DRAFT stays in Grok only.
5. After GO: propose CONFIRMED → **`commit_on_go`** → live chip CONFIRMED. Glass is the viewer. COMPILE BOOK if pack lags.
6. House session: first reply is the **full house markdown fence**. User says **GO** (propose CONFIRMED + commit_on_go), **SAVE DRAFT** (Grok only — no glass chip), or **EDIT** (dump again, no propose). Never propose FORMING. Do not call commit_on_go after SAVE DRAFT or EDIT. Do not POST a house on first message.

## Glass

- Viewer after GO: `#/{desk}/house` and `#/{desk}/risks` (kernel often :4682)
- Alternate commit: glass ACCEPT of a **CONFIRMED** pending (friends / if commit_on_go did not run). Never FORMING.
- COMPILE BOOK + REFRESH if pack lags after GO write

## Default `/cockpit` with a desk

**Do not** auto-steelman. Ask once which command, or run the action they named (`daily`, `report`, `steelman`, …).
