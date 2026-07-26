---
description: Due-diligence check on a thin-desk risk (what moved vs tripwires; no status write)
argument-hint: "[desk] [risk id or R3 or name fragment]"
---

Parse `$ARGUMENTS`: desk (slug/ticker from registry — **not** a fixed nbis/msft list) + optional risk selector (pack id, `R3`, or full `Rn — Title` from glass OPEN GROK).  
If desk missing, call `list_desks` then ask once.  
If desk unknown / MCP monorepo has no row: show `list_desks` output (`monorepo_root`) and tell Anthony MCP is bound to that folder — re-run `./scripts/install-grok-mcp.sh` from the clone that has the desk (e.g. `cockpit-kernel` for NVDA).  
**If risk selector is present** (glass risk-detail seed): use it — **do not** re-ask which risk.  
**If risk missing:** list **WATCH** from `get_pack_snapshot` → `risk_summary.watch` (SoR-aware) and ask which to check (or check all WATCH briefly).

**Job:** Help Anthony decide if pressure on this risk is **easing / stable / elevated**. Do **not** write vault, house, risks SoR, or ontology.

## Efficiency

- Book: `get_pack_snapshot` + `get_house_view` (≤2 MCP). Snapshot **risk_summary.watch** is SoR-aware (includes ACCEPTed WATCH even if pack JSON lags).  
- Optional: `get_risk_sor` for live tripwire table if pack tripwire_count is 0.  
- Day: web search ≤4 for last ~24–72h scoped to this risk’s mechanism.  
- Total ≤8 tools. No chat mining. No free-roam of entire `raw/` unless needed for one tripwire.

## Steps

1. `get_pack_snapshot(desk)` — use `risks[]` / `risk_summary.watch` (display status). Match id, `Rn`, or name; prefer exact id.  
2. If checking “all WATCH”, use **only** `risk_summary.watch` from that snapshot — not `pack_watch`.  
3. `get_house_view(desk)` — map to Exposed / tripwires / monitors if present.  
4. Web search: company + risk mechanism keywords (from pack summary/tripwires).  
5. Compose output below.

## Output

1. **Header** — desk · risk name · **status** (from snapshot `risks[].status`) · grade · as_of today · pack `compiled_at` · note if `sor_ahead_of_pack`  
2. **Mechanism** — one short paragraph from pack (do not invent)  
3. **Tripwires** — table or bullets: signal · tripwire · state · as_of  
4. **What moved** — dated sources; map each → tripwire or `not in book`; soft → **[soft]**  
5. **Direction** — **easing | stable | elevated** (your read of evidence vs tripwires; say if GAP)  
6. **Suggested status** — keep / move to INTACT|WATCH|FIRED — **not applied**; say “propose via glass risk detail when ready”  
7. **Gaps** — if `sor_ahead_of_pack`, say COMPILE BOOK to fully sync pack JSON  
8. **Footer** — decision-support only · no vault/ontology write  

## Hard rules

When listing WATCH for a desk-wide check, every name in `risk_summary.watch` must appear — including recently ACCEPTed promotions (e.g. R4).

## Hard rules

- No buy/sell/hold, PT, sizing.  
- Never invent tripwires or pack status.  
- Do not call house propose or edit risk files.  
- Status change is a **separate** glass ACCEPT path (`status_change` proposals) — not this command.

Decision-support only.
