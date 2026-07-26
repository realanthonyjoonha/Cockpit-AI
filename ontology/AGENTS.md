# AGENTS.md — Ontology operator contract (Grok wire)

Any agent (Grok, Claude, future Jarvis) working on **MU, NBIS, or MSFT underwrite** must treat this ontology as the **system of record**.

## Mandatory first action

For underwrite questions (thesis, house view, risks, claims, backlog/SCA/contracts, capacity, catalysts, “what’s on watch”):

```bash
cd /Users/anthonyha/Trading/ontology
./ont agent MU "<question>"     # Micron / memory
# or
./ont agent NBIS "<question>"   # Nebius
# or
./ont agent MSFT "<question>"   # Microsoft
```

Then answer **only** from that context (plus optional `./ont source …` follow-ups).

Do **not** free-roam `~/Trading/**` as the primary fact source when a pack covers the name.

## Tickers in pack

| Focus | Ticker | Aliases |
|---|---|---|
| Micron / memory | `MU` | micron, MU |
| Nebius | `NBIS` | nebius, NBIS |
| Microsoft | `MSFT` | microsoft, MSFT, Azure |

## Binding rules

1. **Ontology first** — `ont agent` / `ask` / `retrieve` / `source` before asserting facts  
2. **No fabrication** — numbers need pack claims (grade + as_of) or explicit source excerpt  
3. **Decision-support only** — no buy/sell/hold, targets, sizing  
4. **House view user-owned** — steelman → delta → red-team; write only on explicit save  
5. **Gaps are answers** — say what’s missing  
6. **Long files** — catalog via `source list`; open with outline/section/search  

## Commands

| Need | Command |
|---|---|
| Agent context (default) | `./ont agent MU\|NBIS\|MSFT "question"` |
| Quick pack answer | `./ont ask MU\|NBIS\|MSFT "question"` |
| Full pack dump | `./ont retrieve MU\|NBIS\|MSFT` |
| List long research | `./ont source MU\|NBIS\|MSFT list` |
| Open section | `./ont source … get <id> --section "…"` |
| Search master | `./ont source … get <id> --search "…"` |
| Refresh pack | `./ont compile MU\|NBIS\|MSFT` |
| **Part 1 structural gate** | `./ont verify MU\|NBIS\|MSFT` — **exit 0 required after research filing** |
| Tests | `make test` |

## After wiki/research edits (fail-closed closeout)

```bash
./ont compile MU|NBIS|MSFT    # ticker touched
./ont verify MU|NBIS|MSFT     # MUST exit 0 — not optional
# optional after human CONFIRM house + ACCEPT risks:
./ont verify MU|NBIS|MSFT --require-confirmed --require-risks-accepted
```

**Done = compile + verify exit 0 + handback.** Chat “looks good” is not done.  
Spec: `PART1-GATE.md`. Filing skill: `research-to-ontology`.

## Writing research files (where to put them)

**Canonical map:** `/Users/anthonyha/Trading/research-wiki/RESEARCH-PATHS.md`

Do **not** dump research into `ontology/store/`. Author under `research-wiki/`, then compile + **verify**.

| Content | Path |
|---|---|
| Nebius research | `research-wiki/raw/nebius-research/` |
| Microsoft research | `research-wiki/raw/microsoft-research/` |
| New name research | `research-wiki/raw/<slug>-research/` |
| Entity | `research-wiki/wiki/entities/<slug>.md` |
| Source page | `research-wiki/wiki/sources/<slug>.md` |
| House views | `house-view.md` / `house-view-nebius.md` / `house-view-microsoft.md` — save-on-command only |

Claim format: `- <fact> (YYYY-MM-DD) [A|B|C] [[source-slug]]`
