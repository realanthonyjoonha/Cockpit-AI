---
description: Street desk agent — page context + house + risks; pipeline refresh or free-form chat (not house PT)
argument-hint: "[desk] [pipeline|chat]"
---

Parse `$ARGUMENTS`:

1. **desk** — slug or ticker (e.g. `tsm`, `NVDA`)  
2. **mode** (optional) — `pipeline` | `chat`  
   - Glass **REFRESH STREET** opens: `/cockpit-street tsm pipeline`  
   - Glass **OPEN GROK** opens: `/cockpit-street tsm chat`  
   - If mode missing, infer from seed header, else default **chat**

If desk missing, `list_desks` then ask once.

You were opened from the **Street** room. Street vault is the SoR for this room; **ontology/pack is read context only**.

## First steps (mandatory)

1. Resolve desk → ticker (registry / `list_desks`).
2. **Read the glass seed** (written next to open). Check **both** paths (macOS `$TMPDIR` ≠ `/tmp`):

```bash
DESK="<desk>"   # e.g. tsm
# primary (glass writes here on unix)
cat "/tmp/cockpit-street-${DESK}-seed.md" 2>/dev/null
# macOS fallback
cat "${TMPDIR:-/tmp}/cockpit-street-${DESK}-seed.md" 2>/dev/null
ls -la /tmp/cockpit-street-*-seed.md "${TMPDIR:-/tmp}"/cockpit-street-*-seed.md 2>/dev/null
```

Seed contains: **Open mode: PIPELINE | CHAT**, current Street firms, house prior, WATCH/FIRED, write scope.

3. If no seed file, still honor CLI mode (`pipeline` / `chat` from arguments). Load vault + pack/MCP yourself.

### Branch on mode (CLI arg wins, then seed header)

| Mode | Behavior |
|------|----------|
| **pipeline** | Do **not** ask “what next?”. Empty/incomplete → **rebuild**. Complete → **refresh** (research PT moves since as_of). Dual verify → **publish**. Report Δ + WATCH collisions. Glass auto-paints when vault changes. |
| **chat** | Brief page + house + WATCH in 3–6 lines, then follow user (assess / refresh / rebuild / deepen / discuss). |

**If the user clicked REFRESH STREET (`pipeline`), never stop at a menu.** Execute the research loop.

## Product law

1. Decision-support only — **no house PT**, no personal buy/sell, no sizing.  
2. Street = **third-party published** firm models only — not house SoR, not pack SoR.  
3. Glass shows **complete rows only**: rating + numeric `pt` + date + **3–5 sentence why** (≥180 chars) + **https** `source_url`.  
4. Never invent PTs, ratings, links, or why. No source → **omit firm**.  
5. Prefer **5–15 complete firms** with model-depth why over many recaps.  
6. **Write only** `research-wiki/cockpit/street/{TICKER}.json` via format-gated publish.  
7. **Never write** house, risks, or `ontology/store/`. Never run `./ont compile` for Street.  
8. You may note alignment/collision with house or WATCH (informational only).

## Pipeline steps (`pipeline` / REFRESH STREET)

```text
1. Read seed (both /tmp and $TMPDIR)
2. Empty/incomplete → rebuild complete firm models
3. Complete → research PT moves since as_of/built_at
4. Draft (no invent; omit without source)
5. Loop A format verify (validateStreetSnapshot, max 3)
6. Loop B info verify (source supports PT/why; model-depth why; max 3)
7. Publish via refreshStreet / POST /api/{slug}/street/refresh
8. Report: n firms, PT range, Δ vs prior, WATCH collisions
9. Glass polls vault and paints (not COMPILE BOOK)
```

## Dual verify loops (before any publish)

### Loop A — Format (code), max 3

Draft → `/tmp/street-{TICKER}-draft.json` → `validateStreetSnapshot` in `memory-cockpit-v2`. Fix all errors.

### Loop B — Information (critic), max 3

Per firm: source supports PT/rating; why is 3–5 sentences **grounded**; no advice language; date plausible. Re-run Loop A after edits.

Only when both pass → publish.

## Report

- n firms, PT range, Δ vs prior if any  
- **WATCH collisions** (informational)  
- glass: auto-update after publish when user used **REFRESH STREET**

Footer always: **Street ≠ house PT. Street refresh ≠ COMPILE BOOK.**

## Aliases

`/cockpit-street-build` and `/cockpit-street-refresh` → treat as **pipeline**.
