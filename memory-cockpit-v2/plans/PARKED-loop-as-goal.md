# PARKED — Loop-as-goal feature (maybe later)

**Status:** PARKED — do not build now  
**Parked:** 2026-07-21  
**Context:** After thin-desk kernel (NBIS Phases 1–5b + COMPILE BOOK + thin-desk contract).  
**Decision:** Hold off; run the existing loop by habit first (item 1). Revisit only if use shows a real gap.

---

## Idea (one line)

Make **the maintenance loop itself** a first-class product goal/UI — not just docs — so reliability is measured by “book ↔ glass stayed aligned,” not by shipping more rails.

---

## What already exists (so we don’t rebuild it)

The loop is already **executable**:

```text
research / propose → ACCEPT → COMPILE BOOK → glass (Overview / Risks / Ask) → next research
```

| Piece | Where |
|--------|--------|
| Pin / propose-accept | `#/nbis/update`, `/api/nbis/proposals`, `propose-nbis.mjs` |
| Compile on glass | **COMPILE BOOK** → `POST /api/nbis/compile` |
| Re-read pack | **REFRESH** → `POST /api/nbis/book/refresh` |
| Query book | Ask (pack-only), `./ont ask` |
| Permanence of compile | `plans/THIN-DESK-CONTRACT.md` + smoke on `meta.thin_desk_contract` |

**Parked feature is optional packaging of “loop as goal,” not inventing the loop.**

---

## Possible later feature shapes (if we unpark)

Pick **one** small shape — not all:

1. **Loop checklist on Update/Overview**  
   Checklist state: pending pins → last compile as-of → last verify (Ask/Risks opened).  
   Pure UX; no new backend.

2. **“Loop healthy” strip**  
   Green when: pack `compiled_at` recent vs last accept/file mtime; red when accept-without-compile or research newer than pack.  
   Needs clear rules for “stale” (time + mtime).

3. **Definition-of-done template for agents**  
   Skill-only: every NBIS research closeout must report S1–S6 / loop steps.  
   No glass work.

4. **Session goal mode**  
   “This session’s goal: complete one full loop” — overkill unless item 1 proves you need nags.

---

## When to unpark (triggers)

Unpark **only if** real use shows:

| Trigger | Why a feature might help |
|---------|---------------------------|
| You repeatedly **skip COMPILE BOOK** after accept/research | Stronger post-accept / stale warning |
| You **don’t trust** whether glass matches book | Explicit “loop healthy / stale” indicator |
| Agents close research **without** pin/compile | Stronger skill DoD (shape 3 first — cheapest) |
| Second desk multiplies “did I compile?” confusion | Shared loop strip in thin-desk template |

**Do not unpark** because the idea sounds good or we’re bored of shipping.

---

## Explicit non-goals (if ever built)

- Another full cockpit engine  
- LLM that “maintains the loop” by inventing pins  
- Auto-compile on every file save (noisy / surprising)  
- Multi-user goal dashboards  
- Replacing dogfooding (item 1)

---

## Relation to reliability

Loop-**as-goal** (process) is already recommended:

- Done = loop works, not “new page shipped.”

Loop-**as-feature** (this note) is optional UI/agent packaging of that process.  
**Process first; feature only if process fails without nags.**

---

## If unparking — suggested first slice

1. Skill-only DoD (shape 3) — zero glass risk.  
2. If still skipping compile: **stale banner** when proposal accepted after last `compiled_at` (shape 2, minimal).  
3. Smoke: stale rule + compile still contract-required.

---

## Pointers

- Thin desk law: `plans/THIN-DESK-CONTRACT.md`  
- Write path: `plans/WRITE-PATH-NBIS.md`  
- Together later: item **1** (use + fix), item **3** (second desk)  
- Solo done: propose CLI, accept polish, smoke (plans/2026-07-21-solo-2-4-5.md)
