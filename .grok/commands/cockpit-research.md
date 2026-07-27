---
description: Load house + risks; research only what user asks; optional vault save after they like it
argument-hint: "[desk] [optional research question]"
---

Parse `$ARGUMENTS`: **desk** (slug/ticker) + optional **research question** (free text after desk).  
If desk missing, `list_desks` then ask once for desk.

**Job:** Ground in **this desk’s book**, research **only what the user asks**, then **ask whether to save** the report into the vault (never auto-save).

## Hard rules

1. Decision-support only — no buy/sell/hold, PT, or sizing.  
2. Do **not** invent pack claims or WATCH titles — copy from pack.  
3. **No web research** until the user has stated what to research.  
4. Soft press → **[soft]**. Missing → **GAP**.  
5. **Never save** unless the user clearly says yes after reading the report.  
6. Save path only under the desk research factory (below). **Never** write house, risks SoR, or `ontology/store/`.  
7. Saved notes are **research notes** (secondary), not house SoR and not auto Key facts.

## Efficiency

- Book: `get_pack_snapshot` + `get_house_view` (≤2).  
- Search only after a clear user question; ≤4–6 search/browse.  
- Cap ≤8 tools for research (+ 1 write if save).

---

## Steps

### A — Load book context (always first)

1. Resolve desk; confirm via MCP `list_desks` if needed.  
2. `get_pack_snapshot(desk)` — house_prior, WATCH/FIRED, claims, gaps.  
3. `get_house_view(desk)` — stance, exposed, flip triggers.  
4. Short “context loaded” blurb. **Do not** search yet unless B is already satisfied.

### B — User research question required

- If args already include a real question after desk → go to C.  
- Else **stop** and ask:  
  `Context loaded for {DESK}. What do you want researched?`  
- **Do not** invent default research axes or run search while waiting.

### C — Research (only after B)

1. Investigate **their** question only (primary filings/IR first; press **[soft]**).  
2. Map findings → existing Rn / house lever / flip trigger / **not in book**.  
3. Deliver the full report in chat (header, findings, map, GAPs, optional next).

### D — Offer save (only after C, when they have read the report)

After the report, **always ask once**:

> Want to **save** this research into the vault for **{DESK}** so it can show under Sources after COMPILE BOOK? (yes/no)

- **No / skip** → stop. Chat-only.  
- **Yes** → go to E.  
- Do **not** save because they said “thanks” or “good” alone — need a clear **yes / save**.

### E — Save to vault (only on clear yes)

1. Resolve `slug` from desk (e.g. tsm).  
2. Ensure directory exists:  
   `research-wiki/raw/{slug}-research/`  
3. Write **one new file** (never overwrite house/08-risks):

**Path (binding):**

```text
research-wiki/raw/{slug}-research/agent-research-YYYY-MM-DD-HHMM.md
```

Use UTC date/time. If file exists, append `-2`, `-3`, …  

**Must be at the top level of `raw/{slug}-research/`** (not a nested subfolder) so pack `source_globs` like `raw/{slug}-research/*.md` pick it up.

**File template:**

```markdown
---
type: agent-research
desk: {slug}
ticker: {TICKER}
as_of: YYYY-MM-DD
question: "{user question, one line}"
status: note
decision_support_only: true
---

# Agent research — {TICKER} · {as_of}

> **Note** — agent research session. Not house SoR. Not auto-CONFIRMED. Decision-support only.

## Question

{user question}

## Book anchors (at time of research)

- House status: …
- Stance (short): …
- WATCH: …

## Findings

{report body — primary first; mark [soft] where needed}

## Map to book

| Finding | Rn / house / not in book |
|---------|---------------------------|
| … | … |

## Gaps

- …

## Footer

Saved from `/cockpit-research`. Promote to entity claims or risks only via explicit propose/ACCEPT.  
After save: **COMPILE BOOK** on glass (or `./ont compile TICKER`) so this file appears under **Sources / Provenance**.
```

4. Keep body substantial (**≥ 500 characters** of real content) so catalog tools that skip tiny files still see it.  
5. Reply with:
   - absolute or repo-relative **path**
   - reminder: **COMPILE BOOK** / `./ont compile {TICKER}` then open `#/{slug}/sources`  
   - ontology store is **not** updated until compile  

### F — Optional compile reminder only

Do **not** run `./ont compile` unless the user asks. Tell them to COMPILE BOOK on glass.

---

## Output shapes

**After A (no question):** context ready + ask what to research.  

**After C:** full research report.  

**After C always:** ask save yes/no.  

**After E:** path + COMPILE BOOK → Sources.

---

## Vs other agents

| Agent | When |
|-------|------|
| `/cockpit-daily` | Unprompted daybook |
| `/cockpit-steelman` | House vs WATCH only |
| `/cockpit-new-desk` | New company |
| `/cockpit-research` | User-directed research + optional vault save |

Footer: decision-support only; not book SoR until glass ACCEPT on any propose.
