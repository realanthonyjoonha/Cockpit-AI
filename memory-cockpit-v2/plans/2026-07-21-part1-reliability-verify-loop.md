# Part 1 reliability — determinism + verify loop

**Status:** ACTIVE — plan + gate implemented 2026-07-21  
**Decision-support only**

---

## 0. Problem (from MSFT test)

| Layer | Result |
|-------|--------|
| Part 2 thin desk | Good — contract + smoke generalizes |
| Part 1 initial build | Works when shepherded; not factory-reliable |
| New agent, same task | Skeleton maybe; book/prior not reproducible |

Agreed design law:

> Reliability = hard specs + deterministic formats + a verify loop  
> (compile → asserts → fix → repeat) that fails closed.  
> Loop checks structure/honesty; house CONFIRM and risk ACCEPT stay human.

---

## 1. Deliverables (this plan)

| # | Deliverable | Path |
|---|-------------|------|
| 1 | Gate spec (binding formats) | `ontology/PART1-GATE.md` |
| 2 | Verify implementation | `ontology/verify/part1_gate.py` |
| 3 | CLI | `./ont verify <TICKER>` |
| 4 | Unit tests | `ontology/tests/test_part1_gate.py` |
| 5 | Entity template align | `research-wiki/templates/entity.md` |
| 6 | Playbook pointer | this file + NEW-DESK-PLAYBOOK link |

**Out of scope here:** thin desk UI, auto house, multi-agent research factory thrash, LLM-as-judge quality scores.

---

## 2. Two gate tiers

### A — Structural (machine, always)

Fail → exit **1**. Part 1 not pack-ready.

- Pack config + entity + risks SoR + house path exist  
- Compile produces store file  
- Claims ≥ 10, each graded/dated/sourced  
- Risks ≥ 6 with status  
- Sources ≥ 1  
- House prior present (any of FORMING/CONFIRMED/DRAFT)  
- No advice JSON keys  
- Entity Key facts section; unparsed grade bullets flagged  

### B — Human-complete (optional flags)

Fail → exit **2** if flags set and incomplete.

- `--require-confirmed` — house status CONFIRMED  
- `--require-risks-accepted` — risks SoR contains ACCEPTED (Anthony)  

Agents never set B by inventing confirm text.

---

## 3. Agent operating loop

```text
file → compile → verify → (fix) → compile → verify
         ↓ pass structural
    STOP: ask Anthony HOUSE + RISKS
         ↓ after human
    compile → verify --require-confirmed --require-risks-accepted
         ↓ pass
    Part 1 COMPLETE → Part 2 only if wanted
```

---

## 4. Success criteria

1. `./ont verify MSFT` exits 0 (structural) on current book  
2. `./ont verify MSFT --require-confirmed --require-risks-accepted` exits 0 after Anthony locks  
3. Unit tests green under `./ont test` / `make test`  
4. A broken claim line fails verify (test with fixture or intentional bad path)  
5. Documented: agents report verify report, not “looks good”  

---

## 5. Follow-ups (not this PR)

- Shared thin-desk factory (reduce nbis/msft clone)  
- Golden *shape* fixtures per ticker (optional)  
- research-to-ontology skill: mandatorily call `ont verify`  
- Rename generated risk ids (`nbis-r*` → `msft-r*`)  

---

## 6. Commands

```bash
cd ~/Trading/ontology
./ont compile MSFT
./ont verify MSFT
./ont verify MSFT --json
./ont verify MSFT --require-confirmed --require-risks-accepted
make test
```
