# Ontology — Decisions

## D-ONTO-1 — Three builds (2026-07-19)

**Decision:** Separate **Ontology** (system of record), **Cockpits** (UI), **Jarvis** (agent client).  
**Why:** Prevents regression loops and agent overfitting; matches Palantir-shaped Language/Engine vs apps/agents.  
**Kill criterion:** If a change requires editing all three at once for a simple pack fix, boundaries leaked.

## D-ONTO-2 — Ontology first (2026-07-19)

**Decision:** Iteration 1 builds Ontology only (MU retrieve). Jarvis and cockpit integration later.  
**Why:** Without retrieve, Jarvis is a general LLM; cockpits already render something.  
**Kill criterion:** Shipping “Jarvis personality” before green retrieve.

## D-ONTO-3 — MU-only depth, generic code (2026-07-19)

**Decision:** First pack is Micron (MU). Implementation stays focus-id driven.  
**Why:** Highest research density; proves underwrite loop.  
**Kill criterion:** `if ticker == "MU"` branches in compile/retrieve logic.

## D-ONTO-4 — Markdown authoring, compiled store (2026-07-19)

**Decision:** Wiki/house-view/risks/series remain authored truth; `store/` is compile output.  
**Why:** Avoid dual hand-edited graphs; Obsidian stays ergonomic.  
**Kill criterion:** Humans regularly hand-edit `store/by_ticker/*.json` as source of truth.

## D-ONTO-5 — No LLM in compiler/retrieve (2026-07-19)

**Decision:** Compile and retrieve are deterministic code.  
**Why:** Reproducible tests; anti-fabrication; gold fixtures meaningful.  
**Kill criterion:** Non-deterministic packs for same inputs.

## D-ONTO-6 — Cockpit churn isolation (2026-07-19)

**Decision:** Do not couple ontology schema to cockpit React/page JSON. Integrate later via thin adapter; parallel read OK.  
**Why:** Cockpit actively changing; binding would thrash ontology.  
**Kill criterion:** Ontology release blocked on cockpit feature freeze.

## D-ONTO-7 — House-view read-only (2026-07-19)

**Decision:** No ontology/agent write path to house-view in v0.1.  
**Why:** User-owned conviction; corruption is high-cost.  
**Kill criterion:** Any silent house-view mutation.

## D-ONTO-8 — Overview budget 10k chars (2026-07-19)

**Decision:** Hard cap on overview ContextPack serialization size.  
**Why:** Prevent folder-dump failure mode.  
**Kill criterion:** >30% of real questions systematically need larger pack → consider v0.2 budget bump, not unlimited.

## D-ONTO-9 — Gold before compile (2026-07-19)

**Decision:** Hand-accepted MU gold fixture before investing in parser sophistication.  
**Why:** Stops compiler overfitting to bad structure; defines success.  
**Kill criterion:** Shipping compile without Anthony-trusted gold.
