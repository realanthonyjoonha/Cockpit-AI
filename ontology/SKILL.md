---
name: ontology-mu
description: >
  Use Anthony's investment research ontology for Micron (MU) and memory underwrite.
  Load pack context via CLI before answering. Decision-support only.
---

# Ontology MU skill

When Anthony asks about Micron, memory super-cycle, SCA, HBM, risks, house view, or related underwrite:

1. Run from `~/Trading/ontology`:
   ```bash
   ./ont agent MU "<his question>"
   ```
2. Answer **only** from that output (plus optional `./ont source MU get …` follow-ups).
3. Never buy/sell/hold/target/size.
4. Cite grades and as_of dates from claims.
5. If the context shows a gap, say so.

If the pack may be stale after wiki edits:

```bash
./ont compile MU
./ont agent MU "<question>"
```

Full contract: see `AGENTS.md` in this directory.
