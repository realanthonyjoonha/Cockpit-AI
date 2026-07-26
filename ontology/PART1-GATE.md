# Part 1 gate — deterministic format + verify loop

**Status:** BINDING for new-ticker initial build (research → pack-ready)  
**As-of:** 2026-07-21  
**Decision-support only.** No buy/sell/hold, PT, or sizing.

This is the **spec** the verify loop enforces.  
House stance and risk *accept* remain **human**. The loop checks **structure and honesty**, not whether the thesis is “right.”

---

## 1. Design law (agreed)

```text
Reliability = hard specs + deterministic formats
             + verify loop (compile → asserts → fix → repeat)
             that fails closed.
```

| May verify (machine) | Must stay human |
|----------------------|-----------------|
| Paths, claim grammar, pack shape | House **CONFIRMED** content |
| Claim/risk counts, grades | Risk **ACCEPT** list |
| Compile exit, ask non-empty | “Enough research” judgment |
| No advice language keys | Stance wording |

---

## 2. Required files (per ticker)

| Artifact | Path pattern |
|----------|----------------|
| Pack config | `ontology/packs/<TICKER>.json` |
| Entity | `research-wiki/wiki/entities/<slug>.md` |
| Research root | `research-wiki/raw/<slug>-research/` |
| Risks SoR | pack `risks_source` (e.g. `raw/<slug>-research/08-risks-catalysts.md`) |
| House | pack `house_view_path` (e.g. `house-view-<slug>.md`) |
| Compiled pack | `ontology/store/by_ticker/<TICKER>.json` (compile output only) |

---

## 3. Claim format (binding — must parse)

Under heading exactly (preferred):

```markdown
## Key facts (timestamped · graded · sourced)
```

Each speakable claim **one line**:

```markdown
- <fact text> (YYYY-MM-DD) [A|B|C] [[source-slug]]
```

- Date: ISO `YYYY-MM-DD` only in the date parens  
- Grade: single `A`, `B`, or `C`  
- Source: wikilink slug `[[slug]]`  
- No buy/sell/PT/sizing language  

Compiler regex lives in `compile/from_wiki.py` (`CLAIM_RE`).  
**Unparsed grade bullets = format failure** (gate reports them).

---

## 4. House format (binding)

Frontmatter **required** keys:

```yaml
type: house-view
ticker: <TICKER>
status: "FORMING — …" | "CONFIRMED — …"
```

Rules:

- Default after draft: **FORMING**  
- **CONFIRMED** only after Anthony explicit confirm/save  
- Agents **must not** write CONFIRMED without that instruction  
- Body may be paragraph or structured; status token in frontmatter is SoR for pack  

Gate:

- House file exists and is non-empty  
- Status parses to `FORMING` | `CONFIRMED` | `DRAFT`  
- Optional `--require-confirmed`: fail if not CONFIRMED  

---

## 5. Risks format (binding)

Edit **only** SoR file (`risks_source`). Generated `risks/*` are outputs.

Minimum structure in SoR:

- At least **6** risk sections with IDs `R1`… (or pack risks after compile ≥ 6)  
- Each risk has a **Status:** among `INTACT` | `WATCH` | `FIRED` | `RESOLVED` (or equivalent compiled)  
- Acceptance log must say either:  
  - **pending** / not accepted, or  
  - **ACCEPTED** (Anthony)  

Gate:

- `risks_source` exists  
- Compiled pack risks ≥ 6 with status + name  
- Optional `--require-risks-accepted`: SoR body matches `ACCEPTED` (case-insensitive) for Anthony accept  

---

## 6. Pack gate thresholds (structural)

After `./ont compile <TICKER>`:

| Check | Threshold |
|-------|-----------|
| compile | exit 0; store file exists |
| claims | ≥ **10** (target 12–20 for v1) |
| each claim | grade A\|B\|C, as_of date, source_id, text |
| risks | ≥ **6** |
| sources | ≥ **1** |
| house_prior | present with status + excerpt or play |
| advice keys | no `recommendation` / `price_target` / `position_size` |

---

## 7. Verify loop (for agents)

```text
1. File research under RESEARCH-PATHS (deterministic formats)
2. ./ont compile TICKER
3. ./ont verify TICKER
4. If FAIL → fix listed checks only → goto 2
5. If PASS structural → stop for human:
     HOUSE: CONFIRM | leave FORMING
     RISKS: ACCEPT | edit
6. After human: ./ont compile TICKER && ./ont verify TICKER --require-confirmed --require-risks-accepted
7. Only then: Part 1 complete → optional Part 2 thin desk
```

**Fail closed:** chat “looks good” is not done. `ont verify` exit 0 is done for structure.

---

## 8. CLI

```bash
cd ~/Trading/ontology
./ont compile MSFT
./ont verify MSFT                    # structural Part 1
./ont verify MSFT --json             # machine report
./ont verify MSFT --require-confirmed --require-risks-accepted
./ont test                           # unit tests including gate
```

Exit codes:

- `0` — all requested gates pass  
- `1` — structural failure  
- `2` — structural OK; human gates requested and incomplete  

---

## 9. Non-goals

- Auto-CONFIRMED house  
- Auto-ACCEPT risks  
- LLM judge of “thesis quality” as hard gate  
- Freezing live $ figures as permanent goldens (use structure + grades)  

---

## 10. Related

- Thin desk: `memory-cockpit-v2/plans/THIN-DESK-CONTRACT.md`  
- New desk: `memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md`  
- Plan: `memory-cockpit-v2/plans/2026-07-21-part1-reliability-verify-loop.md`  
- Claim parser: `compile/from_wiki.py`  
