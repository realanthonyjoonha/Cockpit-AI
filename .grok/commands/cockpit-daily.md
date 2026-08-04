---
description: Daily desk brief (daybook) — what moved + calendar; short book-touch side note; optional --save
argument-hint: "[desk] [--save]"
---

Parse `$ARGUMENTS`:
- First desk-like token → desk (slug / ticker / ticker-like)
- If any token is `--save` or user says “save this brief” → **save = true**
- Else save = false  
If desk missing, ask once.

**Job:** A **daybook** for this name — *what’s new / what’s next*.  
Not a house restate, not a risk-register dump, not steelman. Quiet days are valid.

## Product shape

| Weight | Content |
|--------|---------|
| **Main** | What moved (24–72h) · today/near calendar · soft noise if useful |
| **Side** | Short book-touch: only if day items hit house/WATCH — else one line “no book touch” |
| **Out** | Full WATCH list, tripwire tables, flip-trigger essays, claim dumps every morning |

House + pack are **context for a small side section**, not the spine of the memo.

## Efficiency (mandatory)

- **Do not** mine chat history or free-roam vault `raw/` unless user asks to expand.
- **Day facts first:** web search (+ optional open of 1–2 primary pages). Cap **≤4** search/browse calls.
- **Book (side only):** `get_house_view` + `get_pack_snapshot` — target **2** MCP calls. Use them for the short book-touch section and exact WATCH titles when tagging. Do **not** rebuild the whole register in output.
- Total tool budget: **≤8** for research (+ 1 file write if save). If stuck, **GAP** and stop.
- Prefer **ASCII `$` and hyphens** in numbers (no unicode minus).

## Write policy

| Path | Allowed? |
|------|----------|
| Chat brief (always) | Yes |
| `research-wiki/cockpit/briefs/daily/{desk}/YYYY-MM-DD.md` when **save** | Yes — **only** this tree |
| `house-view-*.md` | **Never** |
| `ontology/store/` | **Never** |
| `cockpit/proposals/` | **Never** (use `/cockpit-propose`) |
| `./ont compile` / verify | **Never** after this command |

Default is **no save**. Same-day re-save **overwrites** `YYYY-MM-DD.md`.  
Save is **ops archive only** — not pack input, not house SoR.

## Steps

### A — What moved (day layer) — do this first

1. Run **desk-scoped** web searches for the **last ~24–72h** (widen to ~7d only if 72h is empty).  
   Prefer primary / wire / company IR / SEC over blog hype.

**Search focus (adapt to desk; expand as needed):**

| Desk | Seeds |
|------|--------|
| Thin semis / AI (nvda, avgo, tsm, amd, …) | ticker + company name — earnings, guidance, product, supply, customers, regulatory, major press |
| `nbis` / neocloud | Nebius/NBIS — capacity, power, contracts, filings, convert/insider, major press |
| `msft` | Microsoft/MSFT — Azure/OpenAI/capex/AI infra items that actually move the stock narrative |
| `shaz` / other thin | legal name + ticker — capacity, offtake, financing, filings, coverage notes |
| Unknown desk | company name + ticker + “earnings OR guidance OR 8-K OR contract” |

2. Optionally open **1–2** highest-value URLs if the snippet is load-bearing.

3. For each kept item: **date · source · one-line fact**.  
   Optional tag later: book-touch (see C) — do **not** force every bullet to map to WATCH.

**Day-layer discipline**

- No inventing events. Nothing material → **GAP** (quiet day is fine).  
- Soft items (secondary press, undated social, “sources say”) → **[soft]**.  
- Price: only with venue + as_of if found; **no PT advice, no buy/sell**.  
- Cap ~6 bullets in the main section.

### B — Near calendar

4. Note **today / next ~5 trading days** catalysts if known from search or obvious (earnings date, conference, lockup, macro print that hits the name).  
   If unknown: **GAP — no calendar items found** (do not invent dates).

### C — Book touch (side portion only)

5. Load `get_house_view` + `get_pack_snapshot` (if not already).

6. Write a **short** side block (see Output §5):
   - One-line house stance (from house only)  
   - For day items that **clearly** touch a pack WATCH or house lever: tag with **exact** WATCH title/id from pack (never invent titles)  
   - If nothing touches: **No material book touch today.**  
   - Do **not** list the full risk register, tripwire table, flip triggers, or ≤5 claims.

### D — Compose + optional save

7. Write the brief in chat per **Output** below.

8. If **save**: write the same body to:

```text
research-wiki/cockpit/briefs/daily/{desk}/YYYY-MM-DD.md
```

Vault root = repo `research-wiki/` or `$COCKPIT_VAULT`. Create parent dirs as needed.  
`as_of` = today’s date (state local or UTC in frontmatter).

**Required frontmatter:**

```yaml
---
type: daily-brief
style: daybook
desk: tsm
ticker: TSM
as_of: YYYY-MM-DD
pack_compiled_at: "<from pack or null>"
house_status: "<from house or null>"
sources: [web_search, house_view, pack_snapshot]
decision_support_only: true
ontology: false
---
```

After write: print **saved path** + **Ontology not updated (by design).**  
If not save: do not touch disk.

## Output (fixed order)

1. **Header**  
   ticker/desk · as_of · lookback (e.g. 72h) · optional pack `compiled_at` · optional house status  

2. **Headline** — one sentence: the day in a line (or “Quiet day for {TICKER}”).

3. **What moved** ← **main body; lead; do not bury**  
   - Bullets (max ~6): `YYYY-MM-DD · Source — fact`  
   - Optional trailing tag only when real: `(book: WATCH R# title | house lever | not in book)`  
   - If none:  
     `**GAP — no material day events** in lookback (search ran). Quiet day is valid.`  

4. **Near calendar**  
   - Today / next ~5d items, or **GAP**  

5. **Book touch** ← **side portion only; keep short (≈3–8 lines)**  
   - **House (1 line):** stance / status from house only  
   - **Touches:** bullets only for day items that map to exact pack WATCH or house lever; else **No material book touch today.**  
   - **Do not** restate full WATCH list, FIRED dump, tripwires, flip triggers, or graded claims.  
   - For deep book work: point user to steelman / risk-check / house room — not this brief.

6. **Soft / noise** (optional)  
   - Labeled **[soft]** items worth a glance; omit if none  

7. **Footer**  
   - Decision-support only · daybook not book SoR · house unchanged · no ontology compile  
   - Day items are **not** new pack claims unless later filed + compiled  
   - If saved: path + “Ontology not updated (by design).”

## Hard rules

- Decision-support only: **no** buy/sell/hold, PT as advice, or sizing.  
- Day numbers: source + date or omit.  
- Do **not** run `/cockpit-propose` unless user asks for a house edit.  
- Do **not** change CONFIRMED stance.  
- Do **not** run `./ont compile` after this command.  
- Do **not** expand daily into full risk DD — use `/cockpit-risk-check` for that.  
- Save is **ops archive only**.

Decision-support only.
