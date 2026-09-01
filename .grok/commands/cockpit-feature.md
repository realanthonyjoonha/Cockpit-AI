---
description: Build a PLATFORM cockpit feature — factory-scalable, friend-shippable; agents own trees/gates
argument-hint: "[one-line feature goal]"
---

# /cockpit-feature — build mode (Anthony does not track trees)

Parse `$ARGUMENTS` as the **feature goal** (one line). If empty, ask once for the goal.

**Human load:** Anthony only stated a goal. **You** own factory scale, empty-shell safety, ship-readiness design, and which tree to edit.

Read **`docs/EASY.md`** first (modes). Hard law: **`AGENTS.md`**. Procedure depth: **`docs/DEVELOP.md`**.

Decision-support only. No buy/sell/PT/sizing.

---

## Default posture (do not ask which tree)

| Default | Value |
|---------|--------|
| Tree | **cockpit-kernel** (dogfood) |
| Class | **PLATFORM** |
| Scale | Every desk in `thin-desks.json` gets feature with **zero** per-ticker forks |
| Empty product | Must still work with `desks: []` |
| Ship | **Not now** — implement + dogfood only |
| Push | **Never** unless human later says push |

Only switch to product/scenario if human explicitly said **ship** / **scenario** / **customer-sim**.

---

## Mandatory steps (in order)

### 1. Feature brief (print BEFORE any code)

```text
Feature: <name from goal>
Class: PLATFORM
Works with product desks=[] ? yes
Scales via registry (desk N free)? yes
Approach: <2–4 sentences — shared thin/server/agents only>
Files planned: …
Sync allowlist update? yes/no (paths if yes)
Lab hook needed? yes/no
Verify: <commands>
Dogfood: <port + URL + what to click>
Content left on kernel only: none
Push: not done — awaiting human
```

If the goal is **CONTENT** (only their research, not product code), say so and **stop** or switch to operate/research commands.

### 2. Factory checks (fail closed — redesign if any fail)

- [ ] No new `pages/{ticker}/` or `server/{ticker}*.js` operate forks  
- [ ] Uses registry / `pages/thin/*` / shared `createThin*` / MCP desk param  
- [ ] No hardcoded Anthony tickers as product defaults  
- [ ] New friend-facing paths → plan update to `scripts/sync-agent-surface.sh` + `docs/PRODUCT-KERNEL-SOR.md`  
- [ ] Litmus: scaffold desk #N tomorrow → feature works with no new code  

### 3. Implement on kernel

- Edit shared factory paths only  
- Add/adjust tests (`npm run test:platform` or targeted)  
- If UI: rebuild dist when dogfood needs it (`npm run build`) and say **restart glass**  
- Optional: lab feature hook under `scripts/lab-feature-hooks/` for lasting blank-product assert  

### 4. Verify

```bash
# Named Lab checklist (Glass posts this as proof)
./scripts/verify-feature.sh              # layout/UI — shots required
./scripts/verify-feature.sh --docs-only  # docs/scripts tickets must say so
# optional wiring: ./scripts/feature-ready.sh
# narrower: cd memory-cockpit-v2 && npm run test:platform
```

### 5. Report (always)

```text
DONE (implement only — not shipped)
Feature: …
Class: PLATFORM
Scales: desk N free via …
Verify: PASS/FAIL (paste key lines)
Dogfood: open http://127.0.0.1:PORT/#/... · hard-refresh
Friend impact: none until /cockpit-ship
Next: say "ship" when you want gates + product; say "push" only to publish
```

---

## Forbidden

- Claiming “friends can upgrade” without `/cockpit-ship` gates  
- `git push`  
- Inventing pack claims / auto-ACCEPT house  
- Copying `research-wiki` books into product  
- Per-ticker UI forks “just for now”  

---

## Aliases

User says: “build feature …”, “add a feature …”, “make X scalable” → treat as **`/cockpit-feature`**.
