# Plan: Section extract + Ask "SCA backlog"

**Status:** EXECUTED  
**Date:** 2026-07-20  
**Scope:** Hardening only (no Jarvis, no cockpit, no multi-ticker)

---

## Problem

1. **Section extract** stopped at the *next any heading*, so `# §2 — Executive Summary` returned an empty body when followed by `### The Claim`.
2. **Ask "SCA backlog"** used weak generic claim search and often missed the ~$100B SCA claim / long earnings master.

---

## Goals (verifiable)

| # | Goal | Gate |
|---|---|---|
| G1 | Section extract includes nested subheadings until same-or-higher level | `get_source(…, section="Executive Summary")` body >200 chars + nested content |
| G2 | Section works for Investment Thesis on IB master | body >300 chars |
| G3 | `ask MU "SCA backlog"` surfaces $100B / strategic customer claim | substring match in output |
| G4 | SCA path also deep-links into earnings master via search | optional but preferred |
| G5 | Full unit suite green | `python -m unittest discover -s tests` |

---

## Non-goals

- LLM / Grok tool wiring  
- Cockpit integration  
- New object types  
- Perfect NLP for all questions  

---

## Implementation

### A. `api/sources.py` — `extract_section`
- Match heading by query (best score among candidates)
- End section at next heading with **level ≤ current** (include nested `##` / `###`)
- Normalize `§N —` noise in queries

### B. `api/ask.py` — SCA / backlog route
- Dedicated matcher: sca, strategic customer, backlog, take-or-pay, 100b
- Force claims matching `100B|SCA|strategic customer` (tight pattern)
- Search long source `*earnings*` for "strategic customer" / SCA
- Rank true SCA claim above weak neighbors

### C. Tests
- `test_section_includes_nested_headings`
- `test_section_investment_thesis`
- `test_sca_backlog`
- Live CLI smoke

---

## Execution checklist

- [x] Diagnose section empty-body bug  
- [x] Fix extract_section nesting  
- [x] Dedicated SCA ask path  
- [x] Unit tests  
- [x] Live CLI verification  
- [x] Tighten SCA false positives (supply-wall leak)  
- [x] Word-boundary search so `SCA` ≠ `scorecard`  
- [x] Re-run full suite — **27/27 OK**  

---

## Commands to verify anytime

```bash
cd ~/Trading/ontology
./ont source MU get memory-report-ib-master --section "Executive Summary"
./ont source MU get memory-report-ib-master --section "Investment Thesis"
./ont ask MU "SCA backlog"
PYTHONPATH=. python3 -m unittest discover -s tests -v
```
