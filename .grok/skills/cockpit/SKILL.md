---
name: cockpit
description: >
  Anthony's cockpit research OS via MCP server cockpit-research (Grok Build primary).
  Use for house view, pack WATCH risks, daily brief, risk check, steelman, propose house,
  list proposals, multi-desk thin companies from registry (list_desks). Triggers: /cockpit,
  cockpit, house view, pack snapshot, daily report, daily brief, risk check, risk DD,
  propose house, WATCH risks, steelman vs pack, thin desk. Decision-support only — no buy/sell/PT/sizing.
argument-hint: "[desk] [daily|risk-check|steelman|match|propose|pending|desks]"
user-invocable: true
---

# Cockpit research menu (Grok Build)

You have MCP **cockpit-research**. Prefer tools over inventing. Never write `house-view-*.md` directly.

## Menu

| Command | Action |
|---------|--------|
| `/cockpit-desks` | List thin desks |
| `/cockpit-new-desk [TICKER]` | Underwrite **new** desk — **deep parallel research default** (START → Build next company; `--light` opt-out) |
| `/cockpit-daily` | Daily brief: **what moved** + house + pack; optional `--save` |
| `/cockpit-risk-check` | Risk DD: direction vs tripwires (no status write) |
| `/cockpit-risk-add` | Research + propose NEW risk (glass ACCEPT) |
| `/cockpit-risk-tripwires` | Tripwire research + user cull → propose |
| `/cockpit-steelman` | Steelman house vs pack WATCH |
| `/cockpit-match` | Verify house labels vs pack WATCH |
| `/cockpit-propose` | Propose house draft → glass ACCEPT |
| `/cockpit-pending` | List pending house proposals |
| `/cockpit` | Show menu + default steelman |

Default desk if omitted: `list_desks` → ask once from **that** registry, then remember in-session.  
**MCP monorepo:** use tools from **`cockpit-research`**. `list_desks` returns `monorepo_root` — it must match the glass/cwd monorepo (project pin). If desk missing, OPEN GROK again from the glass for that monorepo (rewrites project MCP) or re-run `./scripts/install-grok-mcp.sh` **inside that monorepo**.

## MCP tools

| Tool | Use |
|------|-----|
| `list_desks` | Registry + monorepo_root / vault (which book MCP is bound to) |
| `get_house_view` | Vault house markdown |
| `get_pack_snapshot` | house_prior, WATCH/FIRED, claims, gaps |
| `get_house_assist_context` | Full grounded pack |
| **`propose_house_from_current`** | **Preferred propose** — exact find→replace on current house |
| `propose_house_view` | Full markdown or `markdown_path` (large files) |
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
4. Status change: MCP `propose_risk_status` or glass → ACCEPT → COMPILE BOOK.

## Add risk (`/cockpit-risk-add`)

1. Research idea vs existing register (avoid duplicates).
2. Draft title, grade, status (default WATCH), summary, mechanism, tripwires (prefer 2–5 real monitors).
3. MCP **`propose_add_risk`** — pending only.
4. Human ACCEPT on glass `#/{desk}/risks` → SoR insert → COMPILE BOOK.
5. If tripwires empty/GAP after add → `/cockpit-risk-tripwires`.

## Tripwires (`/cockpit-risk-tripwires`)

1. `get_risk_sor` for current table.
2. Research candidates; **iterate with user** — keep only monitors they approve.
3. MCP **`propose_risk_tripwires`** with final list (replace).
4. Glass ACCEPT → SoR table replace → COMPILE BOOK.

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
4. Propose tools do **not** write the vault house. Glass **ACCEPT** does.
5. After propose: proposal **id** + `#/{desk}/house` → ACCEPT → COMPILE BOOK → REFRESH.
6. Do not change CONFIRMED stance unless the user explicitly asks.

## Glass (human only)

- EDIT / SAVE / ACCEPT: glass `#/{desk}/house` (live monorepo often :4681; kernel often :4682)
- COMPILE BOOK + REFRESH after accept

## Default `/cockpit` with a desk

Run **steelman** for that desk (`/cockpit-steelman`).
