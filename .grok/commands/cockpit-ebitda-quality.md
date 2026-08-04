---
description: Audit reported vs adj. EBITDA quality; adjustments discipline; optional save+compile
argument-hint: "[desk] [optional paste or path cue]"
---

Parse `$ARGUMENTS`: **desk** + optional paste cue or path to a prior EBITDA note.  
If desk missing, ask once.

**Job:** **EBITDA quality** review — reported vs adjusted, recurring vs one-time, SBC/other add-backs, consistency with pack — for a **user-provided** adjustment set or model paste. Not a multiple recommendation.

## Hard rules

1. Decision-support only — no buy/sell, no PT, no “clean earnings” as advice.  
2. **Require** an adjustment list, EBITDA paste, or path (`raw/{slug}-research/ebitda-bridge-*.md` or similar). If missing, **ask** — do not invent mgmt adjustments.  
3. Prefer pack facts as ground truth for revenue/margins when checking consistency.  
4. Soft/secondary **[soft]**.  
5. **Never save** until clear yes after the audit.  
6. Never write house/risks/store except optional note + compile.

## Efficiency

- Book: pack + house (≤2).  
- Read user paste or vault file.  
- Search only for a primary figure if needed (≤2).  
- Cap ≤8 tools (+ write + compile if save).

## Steps

### A — Load book

Pack P&L-relevant claims + house/risks that touch earnings quality.

### B — Obtain subject

- User paste of reported/adj. EBITDA and adjustments, **or**  
- Path under `raw/{slug}-research/ebitda-*.md` / model note  

If neither: ask.

### C — Quality report (chat)

1. **Scope** — period, what was provided  
2. **Reported vs adjusted** — both stated or GAP  
3. **Adjustment table** — each line: description, amount, **recurring?** (user claim vs unknown), source  
4. **Red flags** — large “other,” undefined add-backs, changing definitions YoY without disclosure, double-count risk  
5. **Vs pack** — conflicts with graded revenue/GM/op income (cite pack)  
6. **Vs house/risks** — quality issues that touch WATCH risks (demand digest, margin path, etc.)  
7. **SBC / non-cash** — note treatment only if user provided; do not invent  
8. **GAPs**  
9. **Not advice** — no “true EBITDA,” no multiple call

### D — Offer save

> Save this EBITDA-quality note and compile for Sources? (yes / save without compile / no)

### E — On yes

```text
research-wiki/raw/{slug}-research/ebitda-quality-YYYY-MM-DD-HHMM.md
```

Frontmatter: `type: ebitda-quality-note`, desk, ticker, as_of, `decision_support_only: true`.  
Then `./ont compile TICKER` (same env pattern as Research). Path + compile + Sources.

## Vs other agents

| Agent | When |
|-------|------|
| `/cockpit-ebitda-bridge` | Build the bridge |
| `/cockpit-model-audit` | General model paste audit |
| `/cockpit-ebitda-quality` | Adjustment / quality focus |

Footer: decision-support only.
