# Nebius write path (Phase 5)

Pin research so the glass stays true. **Decision-support only.**

## Loop

```text
S1 draft fact/risk → S2 file (graded) → S3 ./ont compile NBIS
  → S4 REFRESH BOOK → S5 verify Overview/Risks/Ask → S6 house only if confirmed
```

## Paths (binding)

| What | Path |
|------|------|
| Claims / entity | `research-wiki/wiki/entities/nebius.md` |
| Risks (edit SoR) | `research-wiki/raw/nebius-research/08-risks-catalysts.md` |
| Long research | `research-wiki/raw/nebius-research/` |
| House (explicit save only) | `research-wiki/house-view-nebius.md` |
| Pack output (never hand-edit) | `ontology/store/by_ticker/NBIS.json` |

## Claim format

```markdown
- <claim text> (YYYY-MM-DD) [A|B|C] [[source-slug]]
```

## Commands

**Preferred (no terminal):** glass **COMPILE BOOK** (Overview/Update book strip)  
= `POST /api/nbis/compile` → runs `./ont compile NBIS` and clears pack cache.

```bash
# Optional CLI still works:
cd ~/Trading/ontology && ./ont compile NBIS
./ont ask NBIS "what's on watch"
./ont ask NBIS "key claims"
```

**REFRESH** = re-read pack only (use if you compiled elsewhere).

## Glass

- Ritual page: `#/nbis/update`
- **COMPILE BOOK** on book strip after accept / new research
- Agents: skill `research-to-ontology` — handback must say house touched or not

## Manual probe drill

1. Append unique claim with token `PHASE5-PROBE-<date>` to entity  
2. Compile + REFRESH BOOK  
3. Confirm token on Overview or Ask  
4. Revert claim; compile; refresh  
5. Confirm `house-view-nebius.md` never changed unless you said confirm  

## Opt-in automated drill

```bash
cd ~/Trading/memory-cockpit-v2
WRITE_PATH_DRILL=1 npm run write-path-drill
```

Mutates entity temporarily, then reverts. **Not** part of default smoke.

## Phase 5b — propose / accept

### Agent / local CLI (no browser login)

```bash
cd ~/Trading/memory-cockpit-v2
node scripts/propose-nbis.mjs --kind claim \
  --text "…" --as-of 2026-07-20 --grade C --source slug --rationale "optional"
node scripts/propose-nbis.mjs --kind risk_note --text "…"
# House is refused: --kind house_view → exit 1
```

Skill **research-to-ontology Mode E** uses this path.

### Glass / API

**NEBIUS → Update**: form + ACCEPT/REJECT. After ACCEPT a green banner forces compile + REFRESH BOOK (copy button).

```bash
# Propose (auth required on production)
curl -s -b cookies -X POST http://127.0.0.1:4680/api/nbis/proposals \
  -H 'Content-Type: application/json' \
  -d '{"kind":"claim","text":"…","as_of":"2026-07-20","grade":"C","source_id":"slug"}'
curl -s -b cookies -X POST http://127.0.0.1:4680/api/nbis/proposals/<id>/accept
curl -s -b cookies -X POST http://127.0.0.1:4680/api/nbis/proposals/<id>/reject
```

After **accept**: still run `./ont compile NBIS` + **REFRESH BOOK**.  
House view **cannot** be proposed. Store: `research-wiki/cockpit/proposals/nbis-pending.json`.
