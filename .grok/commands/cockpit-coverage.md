---
description: Initiating/update coverage note from pack+house; user-scoped; optional save+compile
argument-hint: "[desk] [optional scope/focus]"
---

Parse `$ARGUMENTS`: **desk** (slug/ticker) + optional **scope/focus** (e.g. “update only financials”, “full init”, industry angle).  
If desk missing, `list_desks` then ask once.

**Job:** Produce a **structured equity coverage-style note** for this desk, grounded in pack + house, then research gaps the user cares about. Inspired by “initiating coverage” skill patterns — **not** a buy/sell call.

## Hard rules

1. Decision-support only — **no** buy/sell/hold, **no** price target, **no** sizing.  
2. Do **not** invent graded pack claims or WATCH titles — copy from pack.  
3. Soft press → **[soft]**. Missing → **GAP**.  
4. If user has not stated scope/focus, ask once (full init vs update vs theme) before deep search.  
5. **Never save** until user clearly says yes after reading the note.  
6. Never write house, risks SoR, or `ontology/store/` except via save path below + compile.  
7. Valuation section = **framework + pack numbers only** or user-supplied assumptions — never “target price $X”.

## Efficiency

- Book: `get_pack_snapshot` + `get_house_view` (≤2).  
- Search ≤4–6 after scope is clear.  
- Cap ≤10 tools (+ write + compile if save).

## Steps

### A — Load book

1. Resolve desk.  
2. `get_pack_snapshot` — claims, risks WATCH/FIRED, gaps, house_prior.  
3. `get_house_view` — stance, exposed, flip triggers.  
4. Confirm context loaded.

### B — Scope

- If focus in args → use it.  
- Else ask: full initiating-style note vs update vs specific segment.  
- Do not freestyle full coverage without scope.

### C — Draft coverage note (chat)

Use this skeleton (skip empty sections with GAP):

1. **Header** — desk, as_of, house status, pack compiled_at  
2. **Business / investable spine** — from pack claims + house  
3. **Industry / competitive context** — primary first; **[soft]** secondary  
4. **Financial spine** — only graded pack numbers + dated figures; GAP if thin  
5. **Risk map** — each pack risk with status; what would elevate  
6. **What would change the view** — tie to house flip triggers  
7. **Open questions / GAPs**  
8. **Explicitly not in this note** — no PT, no sizing, no invented share/%  

### D — Offer save

> Want to **save** this coverage note for **{DESK}** and compile so it appears under Sources? (yes / save without compile / no)

### E — On clear yes

1. Write:

```text
research-wiki/raw/{slug}-research/coverage-YYYY-MM-DD-HHMM.md
```

Top-level under the research factory (matches `source_globs` `raw/{slug}-research/*.md`).

Frontmatter: `type: coverage-note`, desk, ticker, as_of, scope, `status: note`, `decision_support_only: true`.

2. Body = the coverage note (≥500 chars of real content).  

3. **Compile** (default on yes):

```bash
export COCKPIT_REPO="<monorepo root>"
export COCKPIT_VAULT="$COCKPIT_REPO/research-wiki"
export ONTOLOGY_WIKI="$COCKPIT_VAULT"
export ONTOLOGY_STORE="$COCKPIT_REPO/ontology/store/by_ticker"
cd "$COCKPIT_REPO/ontology" && ./ont compile TICKER
```

Optional verify. On fail: keep file, report error. On ok: `#/{slug}/sources` + REFRESH.

**save without compile** → write only + remind COMPILE BOOK.

## Vs other agents

| Agent | When |
|-------|------|
| `/cockpit-research` | Free-form user question, not full coverage skeleton |
| `/cockpit-daily` | Daybook only |
| `/cockpit-steelman` | House vs WATCH only |
| `/cockpit-new-desk` | No desk yet |
| `/cockpit-coverage` | Structured coverage / init-style note |

Footer: decision-support only; not house SoR until ACCEPT on any propose.
