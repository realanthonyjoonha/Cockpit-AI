---
description: Thesis-lane IB report (deep-dive / earnings-update / initiation) — house+register first, two checkpoints, PDF, propose_* closeout
argument-hint: "[desk] [deep-dive|earnings-update|initiation] [all|pick|skim] [R1,R2…] [stop|through]"
---

Execute **`.grok/skills/ib-report/SKILL.md`** on kernel (`~/Desktop/cockpit-kernel`). That file is SoR for this job.

Parse `$ARGUMENTS`: desk (slug/ticker) · mode (`deep-dive` | `earnings-update` | `initiation`) · register scope (`all` | `pick` | `skim`, default **all**) · optional `R1,R9` when pick · pace (`stop` | `through`, default **stop**) · optional page budget · optional focus. If desk or mode missing, **ask once** — do not search yet. If glass already set register scope or pace, do not re-ask. House is always on.

**Job:** Checkpointed thesis report for **this desk**, not a daybook and not `/cockpit-coverage`. Glass: Research room → job **Thesis report** → **NEW REPORT** (`run_id` = `{stamp}_thesis_report_{TICKER}`). PDF is ops, never pack SoR.

## Non-negotiable

1. Decision-support only — no buy/sell/hold, PT, sizing. Initiation = structure, not a rating.  
2. START: `get_house_view` + `get_pack_snapshot` (+ risks SoR). Steelman → delta vs house → red-team.  
3. Register depth follows glass/args (`all` / `pick` / `skim`). In-scope Rn: mechanism · tripwires · evidence · INTACT/WATCH/FIRED *test* · GAP. Out of scope: one line. **skim:** omit the register chapter. Status is **not evidence**. House is never off.  
4. Report: **delta vs house** always. **register UPDATED** on all/pick only — not a new risks essay. Skim = no register section.  
5. One `baseline-anchors.md` per run; no number absent from it; grades `[A|B|C]`.  
6. **CHECKPOINT 1** — on `stop`, wait for Anthony (verdict, delta, contested facts, grade mix). On `through`, record and continue.  
7. Draft exec last; 0.6× merge guard; mode-discipline grep (`overweight|buy rating|price target|fair value` only in the disclaimer).  
8. Render with `scripts/report/build.py --config $RUN/config.py`.  
9. **CHECKPOINT 2** — run the QA list. On `stop`, wait. On `through`, continue.  
10. Closeout: vault claims → `./ont compile && ./ont verify` exit 0 → **`propose_*` only** → PDF in  
    `$COCKPIT_VAULT/cockpit/research/{TICKER}/runs/{id}_thesis_report_{TICKER}/`  
    Never house/`08-risks`/`ontology/store/` by hand. Never product desks.

If anything in the skill conflicts with a shorter habit, **the skill wins**.
