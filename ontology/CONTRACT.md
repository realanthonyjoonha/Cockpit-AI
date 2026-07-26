# Ontology CONTRACT v0.1

**Status:** PROPOSED FREEZE — Anthony to confirm  
**Effective:** 2026-07-19  
**Supersedes:** none  

This file is the agent and human law for iteration 1.  
**Do not edit casually.** Changes → bump to v0.2 + entry in `DECISIONS.md`.

---

## 1. Purpose

Provide a **compiled, typed, graded** representation of investment research so that:

1. `retrieve(focus, intent)` returns a bounded **ContextPack** without an LLM  
2. Future **Jarvis** may only speak from tools over this store  
3. Future **Cockpits** may read via adapter — they do not own truth  

Decision-support only. Never buy/sell/hold, price targets, or position sizing.

---

## 2. System boundaries

| Layer | Role |
|---|---|
| **research-wiki / house-view / series / risks** | Authoring & durable inputs |
| **Ontology (this repo)** | Compile + store + retrieve |
| **Jarvis** | Later client (tools only) |
| **Cockpits** | Later/parallel UI clients (volatile) |

**Compile inputs (allowed):** wiki entities/sources/catalysts, house-view.md, cockpit risks + series CSVs.  
**Compile inputs (forbidden):** cockpit React, chat logs, arbitrary Trading/* project folders, LLM imagination.

**Store (`store/`) is build output**, not a second authoring surface.

---

## 3. Focus model

- Iteration 1 focus: **MU / micron** only (depth).  
- Code must be **focus-generic** (config/pack id); no sector logic hardcoded for “memory” beyond data content.  
- Multi-focus = more packs, not more products.

---

## 4. Object types (v1 allowed)

Company · Claim · Source · Risk · Series · Catalyst · HouseViewPlay · Theme  

No other types without CONTRACT v0.2.

### Claim discipline (binding)

A speakable **Claim** MUST have:

- `text`  
- `as_of` (date)  
- `grade` ∈ {`A`, `B`, `C`}  
- `source_id` (slug or path pointer)  
- `about_id` (usually company id)

If a wiki bullet cannot satisfy this, it is **not** a claim (omit or list under gaps/raw).

**Grades:**  
- **A** — primary/filed (8-K, 10-K, official release)  
- **B** — reputable secondary / careful research synthesis  
- **C** — vendor, estimate, weak secondary  

### House view discipline (binding)

- House-view content is **user-owned**.  
- Ontology may **read** and include excerpts in packs.  
- Ontology / agents must **never** write `house-view.md` under this contract.  
- Status weight: CONFIRMED > FORMING > DRAFT.

---

## 5. Link types (v1 allowed)

HOUSE_STANCE_ON · CLAIM_ABOUT · SUPPORTED_BY · RISK_ON · MONITORS · CATALYST_FOR · IN_THEME  

---

## 6. Actions (v1)

| Action | Allowed |
|---|---|
| Read / retrieve | YES |
| Compile from inputs | YES (deterministic jobs) |
| append_research_log / add_gap | OPTIONAL only if tested |
| Any edit to house-view | **NO** |
| Free-form file write by agent | **NO** |
| Emit buy/sell/target/size | **NO** |

---

## 7. Retrieve contract

```text
retrieve(focus, intent) -> ContextPack
```

| intent | Contents (min) |
|---|---|
| `overview` | house_prior, object summary/stance, claims (capped), risks summary, series_snapshot, catalysts (few), gaps, provenance |
| `risks` | full risk detail + tripwires for focus-related risks, gaps |
| `catalysts` | catalyst list for focus, gaps |

**Always include:** `gaps[]`, `compiled_at` / provenance, focus identity.

**Budget:** overview pack ≤ **10_000** characters serialized JSON (enforce in code).  
If over budget: drop lowest-priority fields (related, excess claims) — never drop gaps or house_prior if present.

**Determinism:** same store snapshot → same pack (no LLM in retrieve).

---

## 8. Agent rules (when Jarvis exists)

Agents using this ontology MUST:

1. Call retrieve (or equivalent tools) before asserting pack-covered facts  
2. Attach as_of/grade when stating load-bearing numbers  
3. Say “not in pack / gap” rather than invent  
4. Steelman house_prior first; report delta; then counters  
5. Refuse buy/sell/hold/target/sizing  

Agents MUST NOT:

1. Treat chat memory as overriding the pack  
2. Write house-view  
3. Bypass ontology to scrape the vault as the long-term path (migration exception only if documented)

---

## 9. Testing law

- `make test` green is required for any claimed progress.  
- Gold fixtures are human-accepted oracles.  
- Agents may edit compile/api/tests; may **not** silently replace gold or CONTRACT.

---

## 10. Out of scope (v0.1)

Voice · multi-ticker depth · Nebius pack quality · X/firehose core · Neo4j · cockpit UI rebuild · automatic cockpit writeback · LLM compiler · advice language.

---

## 11. Versioning

| Version | Date | Note |
|---|---|---|
| v0.1 | 2026-07-19 | Initial freeze proposal |

**Anthony confirmation:** ☐ I freeze v0.1 · ☐ Request changes before freeze  
