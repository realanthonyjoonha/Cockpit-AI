# Ontology

Compiled research ontology for investment decision-support.  
**Iteration 1:** Micron (MU) pack + deterministic `retrieve` — not Jarvis, not cockpit UI.

## Quick orientation

| Doc | Purpose |
|---|---|
| [PLAN.md](./PLAN.md) | Full build plan, phases, gates, scorecard |
| [CONTRACT.md](./CONTRACT.md) | Frozen rules (v0.1) |
| [DECISIONS.md](./DECISIONS.md) | Why we chose X |

## Status (2026-07-19)

**Iteration 1 core is runnable:** compile MU → store → retrieve (md/json). Stdlib only.

## How to ask questions (this is what you want)

### For Grok / Claude / any agent (recommended)

**Minimal Grok + Claude agent wire is installed:**

| Piece | Path |
|---|---|
| Underwrite (read) | `~/.grok/rules/ontology-underwrite.md` + skill `ontology-underwrite` |
| Authoring (write) | `~/.grok/rules/research-authoring.md` + `~/.claude/rules/research-authoring.md` |
| Canonical path map | `research-wiki/RESEARCH-PATHS.md` |
| Project | `Trading/AGENTS.md` + `ontology/AGENTS.md` + `research-wiki/CLAUDE.md` |

In a new Grok session, underwrite questions for MU/NBIS should trigger:

```bash
cd ~/Trading/ontology
./ont agent MU "is my thesis intact — what's the SCA evidence?"
# or
./ont agent NBIS "is the Microsoft backlog firm or contingent?"
```

That prints a **binding context block**. The model should answer only from that.

### Pack-only (no LLM context assembly)

`retrieve` dumps the whole pack. `ask` / `repl` answer from the pack with a code router:

```bash
cd ~/Trading/ontology

./ont ask MU "what is my house view"
./ont ask MU "what is on watch"
./ont ask MU "Q3 revenue"
./ont ask MU "should I buy more"    # refused on purpose

./ont repl MU
```

Same via make:

```bash
make ask-mu Q='what is on watch?'
make repl-mu
```

### Full pack dump (not Q&A)

```bash
make retrieve-mu
./ont retrieve MU
```

### Long research files (20–40 page masters)

The pack **catalogs** long MDs (path, title, line count) — it does **not** stuff full reports into every retrieve. Open on demand:

```bash
./ont source MU list
./ont source MU get memory-report-ib-master --outline
./ont source MU get memory-report-earnings-master --search "gross margin"
./ont source MU get memory-report-ib-master --section "Investment Thesis"
./ont ask MU "list research sources"
```

Register more paths in `packs/MU.json` → `source_globs` / `source_roots` / `sources`, then `./ont compile MU`.

### Refresh after wiki edits

```bash
./ont compile MU
# or:  ./ont ask MU --refresh "house view"
```


## Architecture (short)

```
research-wiki / house-view / risks / series
              │ compile (deterministic)
              ▼
         store/by_ticker/MU.json
              │ retrieve(focus, intent)
              ▼
         ContextPack  →  (later) Jarvis tools / cockpit adapter
```

## Non-goals (v0.1)

Voice, multi-ticker depth, advice language, house-view writes, LLM compiler, cockpit rebuild.
