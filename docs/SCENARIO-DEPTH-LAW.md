# Scenario depth law — mirror kernel underwrite

**Status:** binding for all scenario test cockpits  
**Decision-support only**

---

## The contract

```text
scenario test cockpit  ≡  cockpit-kernel pipeline + isolation + optional agent ACCEPT
```

| Step | Same as kernel? |
|------|-----------------|
| Scaffold empty desk | yes |
| **DEEP research** (`/cockpit-new-desk` bar) | **yes — required** |
| Full house spine (not stance stub) | **yes — required** |
| Risk register R1–R8+ tripwires | **yes — required** |
| Street complete firms | **yes — required** |
| CONFIRM/ACCEPT | glass **or** scenario `agent_accept` |
| compile + verify exit 0 | yes |
| Isolation (folder, port, pin) | scenario-only |

**Not allowed as “the underwrite”:** thin Python seeders, megacap stubs, light fixtures on real tickers.

---

## How we enforce it (so this does not happen again)

### 1. Fail-closed depth gate (code)

`memory-cockpit-v2/scripts/scenario-pipeline-gates.mjs` **defaults to KERNEL DEEP**:

| Check | Floor (deep) |
|-------|----------------|
| Entity graded claims | ≥ **25** |
| Risk `### Rn` sections | ≥ **6** |
| Raw research slice `.md` files | ≥ **5** |
| House prose (body chars) | ≥ **2800** |
| House sections | Stance, load-bearing, advantaged, exposed, flip triggers, explicitly not, risk link |
| Banned markers | light fixture / parallel stub / megacap seeder strings → **FAIL** |
| Street | schema v2 complete (≥3 firms) |

Thin books **cannot** go green.

### 2. Double opt-in for light fixture only

Plumbing test of pin/ACCEPT only:

```bash
./scripts/scenario-pipeline-e2e.sh demox --ticker DEMO --port 4798 \
  --fixture-light --allow-light-fixture
```

`--fixture-light` alone **exits 2**.  
Never use on META/GOOGL/AAPL/CRWV/etc.

### 3. Megacap seeder banned

`scripts/seed-scenario-megacap-book.py` **refuses to run** (hard exit).

### 4. E2E does not invent deep research

`scenario-pipeline-e2e.sh` only:

1. scenario-up (pin, dist)  
2. optional scaffold  
3. depth + ACCEPT + compile/verify + glass  

**You / the agent** must perform DEEP underwrite into the scenario vault **before** (or in a prior step of) the test. Same bar as kernel.

### 5. Agent / human checklist

When running a scenario test:

1. `scenario-up NAME --port P --slugs SLUG`  
2. OPEN GROK **cwd = scenario folder**  
3. `/cockpit-new-desk TICKER` **DEEP** (not `--light`)  
4. Full house + risks + Street  
5. `./scripts/scenario-pipeline-e2e.sh NAME --ticker T --slug S --port P`  

If step 3 was skipped, step 5 **fails depth**.

---

## Remediation if gates fail “house too light”

```text
✗ house prose N chars ≥ 2800
✗ house missing sections: …
✗ banned thin-content markers: …
```

→ Rewrite house + deepen entity/raw research to kernel new-desk standard.  
→ Do **not** lower floors or re-enable the megacap seeder.

---

## Related

- [`SCENARIO-PIPELINE.md`](./SCENARIO-PIPELINE.md)  
- [`SCENARIO-PIN.md`](./SCENARIO-PIN.md)  
- Product `/cockpit-new-desk` (DEEP default)  
