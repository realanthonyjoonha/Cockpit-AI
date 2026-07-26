# Research file paths (binding for all agents)

**Root:** `/Users/anthonyha/Trading/research-wiki/`  
**Ontology root:** `/Users/anthonyha/Trading/ontology/`  

Decision-support only: no buy/sell/hold, PT, or sizing.  
Every load-bearing number: `(YYYY-MM-DD) [A|B|C] [[source-slug]]`.

---

## Where to put what

| Content | Path | Notes |
|---|---|---|
| **Immutable clips / originals** | `raw/` | Prefer append new files; don’t rewrite primary clips |
| **Deep research factory (Nebius)** | `raw/nebius-research/` | Masters, claim bank, red-team, handoff, transcripts |
| **New company research factory** | `raw/<slug>-research/` | e.g. `raw/coreweave-research/` |
| **Long report masters** | `raw/*-master.md` or topic folder | Also OK under `memory-thesis/output/` if that’s where the factory lives |
| **Entity pages** | `wiki/entities/<slug>.md` | ONE page per company; kebab-case |
| **Source distillations** | `wiki/sources/<slug>.md` | One per major primary/secondary doc |
| **Concepts / mechanisms** | `wiki/concepts/<slug>.md` | Theses, frameworks |
| **Wiki activity** | `wiki/log.md` + `wiki/index.md` | Update on meaningful ingest |
| **Memory house view** | `house-view.md` | USER-OWNED — write only on explicit save |
| **Nebius house view** | `house-view-nebius.md` | USER-OWNED — write only on explicit save |
| **Future single-name house view** | `house-view-<slug>.md` | Same governance |
| **Microsoft house view** | `house-view-microsoft.md` | USER-OWNED — explicit save only |
| **Microsoft research factory** | `raw/microsoft-research/` | Part 1 MSFT corpus |
| **MU cockpit risks** | `cockpit/risks/<id>.md` | Memory desk tripwires |
| **Nebius risks (edit source)** | `raw/nebius-research/08-risks-catalysts.md` | Compile regenerates `raw/nebius-research/risks/` |
| **Nebius risk files (generated)** | `raw/nebius-research/risks/nbis-*.md` | Don’t hand-edit as SoR; re-sync from 08 |
| **Series CSVs** | `cockpit/series/*.csv` | Time series for MU desk |
| **Templates** | `templates/` | entity.md, source.md, concept.md |

---

## Never put research here

| Path | Why |
|---|---|
| `~/Trading/ontology/store/` | Compile **output** only — overwritten |
| Random Desktop/Downloads | Not on the ontology map |
| Chat-only (no file) | Doesn’t compound; won’t compile |
| Duplicate `entity-2.md` | One entity = one file |

---

## Claim bullet format (entities + claim banks)

```markdown
- <claim text> (YYYY-MM-DD) [A|B|C] [[source-slug]]
```

- **[A]** primary/filed/transcript  
- **[B]** reputable secondary  
- **[C]** vendor/estimate/weak  

---

## After writing research → refresh ontology

```bash
cd /Users/anthonyha/Trading/ontology
./ont compile MU      # if memory/MU/entity/risks/series changed
./ont compile NBIS    # if Nebius corpus changed
./ont compile MSFT    # if Microsoft corpus changed
./ont ask MU|NBIS|MSFT "house view"   # optional smoke
```

### Pack config (only if new folders)

If you add a path **outside** existing globs, edit:

- `ontology/packs/MU.json` or `ontology/packs/NBIS.json` or `ontology/packs/MSFT.json`  
  → `source_globs` / `source_roots` / `sources`  
- New ticker: create `ontology/packs/TICKER.json` (don’t invent code paths)

---

## Coverage map (current)

| Focus | Entity | House view | Research bulk | Ontology pack |
|---|---|---|---|---|
| Micron / memory | `wiki/entities/micron.md` | `house-view.md` | `raw/`, memory-thesis, cockpit | `packs/MU.json` |
| Nebius | `wiki/entities/nebius.md` | `house-view-nebius.md` | `raw/nebius-research/` | `packs/NBIS.json` |
| Microsoft | `wiki/entities/microsoft.md` | `house-view-microsoft.md` | `raw/microsoft-research/` | `packs/MSFT.json` |

---

## Agent checklist before finishing a research task

1. [ ] Files written under paths above (absolute path reported to Anthony)  
2. [ ] Entity claims use exact graded format  
3. [ ] House view **not** edited unless he said save/confirm  
4. [ ] `wiki/log.md` note if material ingest  
5. [ ] Tell Anthony to run `./ont compile <TICKER>` (or run it if shell allowed)  

**Claude skill (full ritual):** `research-to-ontology`  
→ `/Users/anthonyha/.claude/skills/research-to-ontology/SKILL.md`  
Triggers: research dump, “save to wiki”, “file this”, “compile ontology”, “update pack after research”.
