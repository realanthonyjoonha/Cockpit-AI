---
description: Thesis-lane IB report (deep-dive / earnings-update / initiation) — house+register first, two checkpoints, PDF, propose_* closeout
argument-hint: "[desk] [deep-dive|earnings-update|initiation]"
---

Execute **`.grok/skills/ib-report/SKILL.md`** on kernel (`~/Desktop/cockpit-kernel`). That file is SoR for this job.

Parse `$ARGUMENTS`: desk (slug/ticker) · mode (`deep-dive` | `earnings-update` | `initiation`) · optional page budget · optional focus. If desk or mode missing, **ask once** — do not search yet.

**Job:** Checkpointed thesis report for **this desk**, not a daybook and not `/cockpit-coverage`. Glass: Research room → job **Thesis report** → **NEW REPORT** (`run_id` = `{stamp}_thesis_report_{TICKER}`). PDF is ops, never pack SoR.

## Non-negotiable

1. Decision-support only — no buy/sell/hold, PT, sizing. Initiation = structure, not a rating.  
2. START: `get_house_view` + `get_pack_snapshot` (+ risks SoR). Steelman → delta vs house → red-team.  
3. Register is co-input: test INTACT↔WATCH↔FIRED; tier-2 on WATCH first; status is **not evidence**.  
4. Report: **delta vs house** + **register UPDATED** (not a new risks essay).  
5. One `baseline-anchors.md` per run; no number absent from it; grades `[A|B|C]`.  
6. **CHECKPOINT 1** — stop for Anthony (verdict, delta, contested facts, grade mix).  
7. Draft exec last; 0.6× merge guard; mode-discipline grep (`overweight|buy rating|price target|fair value` only in the disclaimer).  
8. Render with `scripts/report/build.py --config $RUN/config.py`.  
9. **CHECKPOINT 2** — stop for QA (endnotes 1:1, figures, pages, ≥10 anchor checks).  
10. Closeout: vault claims → `./ont compile && ./ont verify` exit 0 → **`propose_*` only** → PDF in  
    `$COCKPIT_VAULT/cockpit/research/{TICKER}/runs/{id}_thesis_report_{TICKER}/`  
    Never house/`08-risks`/`ontology/store/` by hand. Never product desks.

If anything in the skill conflicts with a shorter habit, **the skill wins**.
