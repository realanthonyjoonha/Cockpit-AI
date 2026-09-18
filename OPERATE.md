# Operate map — what to run when

**Decision-support only.** Not underwrite. Not a full book re-audit.

Use this when the desk **already exists**. For a **new** company → `NEW-DESK-PLAYBOOK.md` + `/cockpit-new-desk`.

---

## One table

| Job | When | What to run | Writes |
|-----|------|-------------|--------|
| **Daybook** | “What moved for this name?” | Glass AGENTS → **Daily brief** · `/cockpit-daily {slug}` | Optional brief archive only |
| **Street update** | “Firm PTs / coverage moved” | Desk → **Street** → **REFRESH STREET** | `cockpit/street/{TICKER}.json` only |
| **Street chat** | Discuss models vs house/WATCH | Street → **OPEN GROK** | Only if you publish Street |
| **Working model** | Assumptions / bridge / variance | Desk → **Model** → **UPDATE MODEL** / **READ MODEL** | `cockpit/model/{TICKER}.json` only (not pack/house). PDF is ops |
| **Thesis report** | Earnings-update / deep-dive / initiation note + PDF | Desk → **Reports** → **NEW REPORT** · `/cockpit-report {slug} {mode}` · checkpoints | Same runs folder, `job: thesis_report`. propose_* then GO / glass ACCEPT. PDF is ops, not pack |
| **Filing map** | What landed vs pack; does it hit house / Rn? | Desk → **Filings** · START Filings column · **MAP FILINGS** / **OPEN GROK** (chat on `run_id`) · `/cockpit-filing-map` | Ops `delta.json`. Catalog auto; map on demand. Propose → GO / ACCEPT. Not pack |
| **Background / tutor** | What they actually build + personalized teach | Desk → **Background** → **BUILD BACKGROUND** / **OPEN TUTOR** · `/cockpit-learn {slug}` | `cockpit/learn/{TICKER}/` primer + learner + optional lessons. Not pack/house |
| **Risk DD** | One WATCH needs diligence | `/cockpit-risk-check` or risk page agents | Propose only → GO / glass ACCEPT |
| **House edit** | Stance text change | `/cockpit-propose` → **GO** (`commit_on_go`) → **COMPILE BOOK** if pack lags | House + pack after compile |
| **Glass broken / empty rooms** | Desk listed but pages dead | `cd memory-cockpit-v2 && node scripts/desk-health.mjs --slug {slug} --base-url http://127.0.0.1:PORT` | None |
| **Ship platform to friends** | You changed glass/agents | `./scripts/release-check.sh --full` then **`RELEASE.md`** push | Product git only — **never your research books** |

**Do not** re-run `/cockpit-new-desk` or full deep research for a normal operate day.

**Building features or shipping to friends?** Don’t use this file — use **[`docs/EASY.md`](./docs/EASY.md)** · `/cockpit-feature` · `/cockpit-ship`.

---

## Defaults (happy path)

```text
Most days, one name:
  → Daybook   OR   Street REFRESH   OR   risk-check
  (pick one job)

After GO on house/risks:
  → COMPILE BOOK on glass if pack lags (book strip)

After new desk underwrite finishes:
  → desk-health PASS (already in /cockpit-new-desk §5c)
  → you GO in Grok (commit_on_go writes CONFIRMED)
```

---

## What each loop is *not*

| Loop | Not for |
|------|---------|
| Daily | Full WATCH dump / steelman / verify pack |
| Street | House PT / pack claims / COMPILE BOOK |
| Desk health | Research quality / claim grades |
| Steelman / match | Daily news |

---

## Glass ports (this Mac)

| Port | Typical |
|------|---------|
| **4682** | Kernel dogfood (if 4681 taken) |
| **4681** | Other monorepo / product |

Always match MCP + glass to the **same** monorepo root.

---

## Related

- Underwrite: `memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md`  
- Platform ship: **`RELEASE.md`**  
- Friend pull: **`FRIEND-UPGRADE.md`**  
- Kernel ↔ product: **`docs/PRODUCT-KERNEL-SOR.md`**  
