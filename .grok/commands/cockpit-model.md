---
description: Model desk agent — working assumptions + bridge vault (not house PT / not pack)
argument-hint: "[desk] [pipeline|chat]"
---

Parse `$ARGUMENTS`:

1. **desk** — slug or ticker (e.g. `nvda`, `AVGO`)  
2. **mode** (optional) — `pipeline` | `chat`  
   - Glass **UPDATE MODEL** opens: `/cockpit-model nvda pipeline`  
   - Glass **OPEN GROK** opens: `/cockpit-model nvda chat`  
   - If mode missing, infer from seed header, else default **chat**

If desk missing, `list_desks` then ask once.

You were opened from the **Model** room. Model vault is the SoR for this room; **ontology/pack is read context only**.

**What changed (2026-08-07 — Print Card Phase A):** the Model room now carries an optional `print` block on `cockpit/model/{TICKER}.json` (still `schema_version` 1, additive). Anthony arms a print on glass by hand — event label + date, nothing fetched — then fills his YOUR CASE lines and **hard-locks** them. Locking snapshots every `user_case` row (GAP rows lock as GAP) and writes a marked history file, so what he pre-committed before the print is a permanent record. This is the room's whole point: the case is pre-registered, not reconstructed afterwards. It is **human-only** — you cannot arm, lock, unlock, or fill a case value, and a refresh carrying a `print` block is ignored. When a print is locked, its case lines are frozen: a publish that changes or drops one is **rejected outright and nothing is written**, so refresh the other layers and report the locked lines as untouched. Phase B/C (machine tripwire thresholds, post-print scorecard, risk/house proposals) are **not built** — do not simulate them.

## First steps (mandatory)

1. Resolve desk → ticker (registry / `list_desks`).
2. **Read the glass seed** (written next to open). Check **both** paths (macOS `$TMPDIR` ≠ `/tmp`):

```bash
DESK="<desk>"   # e.g. nvda
cat "/tmp/cockpit-model-${DESK}-seed.md" 2>/dev/null
cat "${TMPDIR:-/tmp}/cockpit-model-${DESK}-seed.md" 2>/dev/null
ls -la /tmp/cockpit-model-*-seed.md "${TMPDIR:-/tmp}"/cockpit-model-*-seed.md 2>/dev/null
```

Seed contains: **Open mode: PIPELINE | CHAT**, current assumptions/bridge, house prior, WATCH/FIRED, write scope.

3. If no seed file, still honor CLI mode (`pipeline` / `chat` from arguments). Load vault + pack/MCP yourself.

### Branch on mode

| Mode | Behavior |
|------|----------|
| **pipeline** | Do **not** ask “what next?” if you can build. Empty → **rebuild**. Complete → **refresh** (update from paste/pack facts; variance vs prior). Format verify → **publish** Model vault. Report counts + WATCH links. Glass auto-paints when vault changes. |
| **chat** | Brief page + house + WATCH in 3–6 lines, then follow user (rebuild / update / link risks / discuss). |

**If the user clicked UPDATE MODEL (`pipeline`), never stop at a menu.** Execute the research/build loop.

## Product law

1. Decision-support only — **no buy/sell/hold**, **no fair value / price target as advice**, no sizing.  
2. Model = **user working numbers** only — not house SoR, not pack SoR, not Street.  
3. Never invent financials — pack graded claims, user paste, or **GAP**.  
4. Bridge is an **illustration** from assumptions — say so in `frame` / disclaimer.  
5. Glass shows format-valid snapshots only (assumptions + bridge required).  
6. **Write scope:** only `research-wiki/cockpit/model/{TICKER}.json` via format-gated publish.  
7. Never write house, risks, Street, or `ontology/store/`. COMPILE BOOK is not part of this job.  
8. **EBITDA is optional** — include in bridge only if useful for this desk.  
9. Prefer **layers** on assumptions: `pack_actual` · `pack_guide` · `structural` · `user_case` · `mixed`.  
10. Include **`house_touch`** (2–4 sentences: how model lines stress the house) — does **not** write house file.  
11. **`watch_risk`** must be the full pack risk id (e.g. `nvda-r1-…`); set **`watch_label`** to `R1` for display.  
12. **Print Card is human-only.** Never send a `print` block — refresh ignores it, and you cannot arm, lock, or unlock. Anthony arms and locks on glass.  
13. **Never fill a `user_case` value.** YOUR CASE is his. Leave `GAP` and say what's missing.  
14. If a print is **locked**, its case lines are frozen: a refresh that changes or drops one is **rejected** and nothing is written. Refresh the other layers (pack actuals, guide, structural) and report the locked lines as untouched.

## Publish (after user-ready model in pipeline, or after they approve in chat)

POST body shape (schema v1):

```json
{
  "schema_version": 1,
  "ticker": "NVDA",
  "as_of": "YYYY-MM-DD",
  "frame": "Illustration from user assumptions — not a price target.",
  "assumptions": [
    {
      "id": "rev_growth",
      "label": "Revenue growth",
      "value": "…",
      "unit": "%",
      "source": "user",
      "watch_risk": "R1",
      "watch_note": "optional"
    }
  ],
  "bridge": [
    { "id": "revenue", "label": "Revenue", "value": "…", "unit": "", "note": null }
  ],
  "variance": [],
  "gaps": [],
  "disclaimer": "Decision-support only. Illustration — not PT or recommendation."
}
```

Publish via glass API when available:

```bash
# From monorepo with glass up (port may vary — 4682 kernel default):
curl -sS -X POST "http://127.0.0.1:PORT/api/{slug}/model/refresh" \
  -H 'Content-Type: application/json' \
  -d @model-body.json
```

Or write the JSON to `research-wiki/cockpit/model/{TICKER}.json` **only if** it passes the same schema (assumptions + bridge, no advice language). Prefer POST so format gate runs.

## Efficiency

- Book: pack + house via MCP (≤2).  
- Prefer paste + pack over web search.  
- Cap ≤10 tools for a normal pipeline rebuild.

## Footer

Decision-support only. Model vault ≠ house ≠ Street ≠ pack.
