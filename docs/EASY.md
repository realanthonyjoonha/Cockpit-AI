# Easy mode — what Anthony tracks (and what agents own)

**You do not need to re-learn kernel / product / scenario every day.**  
Talk in **modes**. Agents execute the rest under hard law (`AGENTS.md`).

Decision-support only.

---

## What you track (only this)

| You say / decide | Meaning |
|------------------|---------|
| **Operate** | Research day on **my** desks — no ship |
| **Build** | New platform feature — scalable + friend-ready design |
| **Ship** | Friends should get code — run gates; push only if you say **push** |
| **ACCEPT / CONFIRM** | You own house & risks on glass — agents never silent-write the book |

That’s the whole personal checklist.

---

## What agents track (not you)

| Worry | Agent owns |
|-------|------------|
| Will desk #N get the feature? | Factory only — registry + `pages/thin/*` + shared server; **no per-ticker forks** |
| Will friend’s cockpit integrate? | Class **PLATFORM** · works with `desks: []` · sync allowlist · ship gates |
| Kernel vs product vs scenario? | Default **kernel** for build/operate · product only on **ship** · scenario only if you ask factory test |
| Blank install broken? | `lab-e2e` before ship-ready |
| Books leaked to GitHub? | Privacy strip · never commit `research-wiki` books |
| Push by accident? | **Never push** unless you explicitly say push |

---

## Modes → agent procedure

### Operate (research day)

```text
Tree: kernel (or whatever MCP is pinned to — must match glass)
Do: OPERATE.md jobs (daybook, street, risk-check, propose…)
Don’t: ship, invent claims, silent vault write
```

Slash: `/cockpit-daily` · `/cockpit-street` · `/cockpit-risk-check` · …

### Build (new feature)

```text
Slash: /cockpit-feature <one-line goal>
Agent MUST:
  1. Print feature brief (template below) before coding
  2. Class PLATFORM by default
  3. Factory path only — desk N free-rides registry
  4. Empty desks=[] still works
  5. Implement + tests + how to dogfood
  6. Verify with ./scripts/verify-feature.sh (Lab checklist; --docs-only if no UI)
  7. STOP (no ship, no push)
```

### Ship (friends)

```text
Slash: /cockpit-ship
Agent MUST:
  1. Privacy: product desks=[] · no books in git
  2. lab-e2e PASS
  3. release-check --full PASS
  4. Show commit file list
  5. Commit only if you asked; push only if you said "push"
```

### Scenario / factory stress (optional eng)

```text
Only when you ask for scenario/lab isolation.
docs/SCENARIO-PIN.md · scenario-up · never your dogfood books as SoR
```

---

## Feature brief (agents always print this when building)

```text
Feature: <name>
Class: PLATFORM | CONTENT | HYBRID
Works with product desks=[] ? yes/no
Scales via registry (desk N free)? yes/no
Files (shared thin/server/agents only): …
Sync allowlist update? yes/no (paths: …)
Lab hook needed? yes/no
Verify: <commands>
Dogfood: <URL / port / what to click>
Content left on kernel only: none | list
Push: not done — awaiting human
```

Missing brief → **not done**.

---

## Scalability law (one line)

**New operate features must work for every desk in `thin-desks.json` without copying UI/server per ticker.**

Litmus: *If I scaffold desk #12 tomorrow, does it get this feature with zero new code?*  
If no → redesign before merge.

---

## Friend law (one line)

**Friends get platform shell via `friend-upgrade`; they never get your research books.**

Ship path: [`RELEASE.md`](../RELEASE.md) · blank gate: [`LAB.md`](./LAB.md).

---

## Your default chat openers

```text
/cockpit-feature add X so all desks get it
/cockpit-ship
/cockpit-daily avgo
```

Or plain English:

```text
Build: …          → agent runs feature mode
Ship this          → agent runs ship mode (no push until you say push)
Research AVGO …    → operate mode
```

---

## Related (agents open these; you usually don’t)

| Doc | When agent needs depth |
|-----|------------------------|
| [`FEATURE-MAP.md`](./FEATURE-MAP.md) | Rooms, hashes, proof · `./scripts/verify-feature.sh` |
| [`DEVELOP.md`](./DEVELOP.md) | Full platform procedure |
| [`LAB.md`](./LAB.md) | Blank E2E |
| [`RELEASE.md`](../RELEASE.md) | Ship ritual |
| [`OPERATE.md`](../OPERATE.md) | Daily research jobs |
| [`PRODUCT-KERNEL-SOR.md`](./PRODUCT-KERNEL-SOR.md) | Sync allowlist |
| [`SCENARIO-PIN.md`](./SCENARIO-PIN.md) | Multi-cockpit pin tests |
