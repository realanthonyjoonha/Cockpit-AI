---
description: Daily desk brief — what moved + house + pack risks; optional --save
argument-hint: "[desk] [--save]"
---

Parse `$ARGUMENTS`:
- First desk-like token → desk (slug / ticker / ticker-like)
- If any token is `--save` or user says “save this brief” → **save = true**
- Else save = false  
If desk missing, ask once.

**Job:** Answer *what moved for this name* (daybook), then ground it in *where the book stands* (house + pack). Not a static thesis dump.

## Efficiency (mandatory)

- **Do not** mine chat history or free-roam vault `raw/` unless user asks to expand.
- Book facts: **only** `get_pack_snapshot` + `get_house_view` (MCP). Target **2** MCP calls.
- Day facts: **web search** (and optional open of 1–2 primary pages if needed). Cap **≤4** search/browse calls.
- Total tool budget: **≤8** for research (+ 1 file write if save). If stuck, **GAP** and stop — do not thrash.
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

## Steps

### A — Book (MCP)

1. `get_pack_snapshot` for the desk  
2. `get_house_view` for the desk  

Pull: stance/horizon, WATCH/FIRED exact titles, Exposed/tripwires, flip triggers, ≤5 graded claims for the base-case tail.

### B — What moved (day layer)

3. Run **desk-scoped** web searches for the **last ~24–72h** (widen to 7d only if 72h is empty).  
   Prefer primary / wire over blog hype.

**Query seeds by desk** (adapt dates to today):

| Desk | Search focus |
|------|----------------|
| `nbis` | `Nebius` OR `NBIS` — filings, 6-K/20-F, earnings, capacity/power, Microsoft/Meta contract, NVIDIA, convert/insider, major press |
| `msft` | `Microsoft` OR `MSFT` Azure/OpenAI/capex/AI infra — only items that could touch **this** house, not generic product noise |

4. Optionally open **1–2** highest-value URLs (SEC/IR/company release) if the snippet is load-bearing. Do not open a pile of recap blogs.

5. For each kept item, record: **date · source · one-line fact · map to house lever or pack WATCH** (or `not in book`).

**Day-layer discipline**

- No inventing events. If search returns nothing material → section says **GAP** clearly.  
- Soft items (secondary press, undated tweets, “sources say”) → label **[soft]**; do not promote to pack-grade claims.  
- Price: report only if found with venue + as_of; **no PT, no buy/sell**.  
- Never invent pack WATCH titles — copy from pack when mapping.

### C — Compose

6. Write the brief in chat per **Output** below.

### D — Optional save

7. If **save**: write the full brief (markdown) to:

```text
research-wiki/cockpit/briefs/daily/{desk}/YYYY-MM-DD.md
```

Resolve vault root as the repo’s `research-wiki/` (or `$COCKPIT_VAULT` if set). Create parent dirs as needed.  
Use **today’s date** as `YYYY-MM-DD` (local or UTC — be consistent; state which in frontmatter `as_of`).

**Required frontmatter:**

```yaml
---
type: daily-brief
desk: nbis
ticker: NBIS
as_of: YYYY-MM-DD
pack_compiled_at: "<from pack or null>"
house_status: CONFIRMED
sources: [house_view, pack_snapshot, web_search]
decision_support_only: true
ontology: false
---
```

Then the same body as the chat brief (sections 1–9).  

After write: print **saved path** + one line: **Ontology not updated (by design).**  
If not save: do not touch disk.

## Output (fixed order)

1. **Header** — ticker/desk · as_of (today) · lookback window (e.g. 72h) · pack `compiled_at` · house status/date  

2. **What moved** ← **lead section; do not bury**  
   - Bullet list (max ~6): `YYYY-MM-DD · Source — fact. → maps to: <WATCH id/title | house Exposed/tripwire | flip trigger | not in book>`  
   - If none material:  
     `**GAP — no material day events found** in lookback for this desk (search ran; vault has no thin-desk day feed).`  
   - One short **Why it matters vs book** paragraph: only for items that map; do not restate the whole thesis.

3. **Base case (book)** — short  
   - **What it is** — one line from house  
   - **Stance & horizon** — quote house only  

4. **Risk register** — pack WATCH exact titles · FIRED if any · house mapping (incl. tripwire state if present)  

5. **Monitors / tripwires** — house table if present; else **GAP**  

6. **Flip triggers / load-bearing unknowns** — house; **GAP** if missing  

7. **Top graded claims** — ≤5 from pack, grade + as_of each  

8. **Gaps** — day-layer gaps + pack gaps + house↔pack note (e.g. pack lag until COMPILE BOOK)  

9. **Footer** — decision-support only · not book SoR · house unchanged · no ontology compile · day items are **not** new pack claims unless later filed + compiled  
   - If saved: path + “Ontology not updated (by design).”

## Hard rules

- Decision-support only: **no** buy/sell/hold, PT, or sizing.  
- Book numbers: prefer pack grades/`as_of`. Day numbers: source + date or omit.  
- Do **not** run `/cockpit-propose` unless user asks for a house edit.  
- Do **not** change CONFIRMED stance.  
- Do **not** run `./ont compile` after this command.  
- Save is **ops archive only** — not house, not pack input, not glass ACCEPT.

Decision-support only.
