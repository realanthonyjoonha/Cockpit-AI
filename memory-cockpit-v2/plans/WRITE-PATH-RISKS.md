# Write path — thin desk risk register

**Decision-support only.** No buy/sell/PT/sizing.  
**Operate ↔ factory:** same module for every thin desk (nbis, msft, …).

## Spine

```text
propose (API / agent) → pending cockpit/proposals/risks-{slug}.json
  → human ACCEPT on glass
  → allowlisted write to pack risks_source (08-risks-catalysts.md)
  → COMPILE BOOK → ontology/store/by_ticker/{TICKER}.json
  → REFRESH glass
```

Never hand-edit `ontology/store/`. Never write house from risk APIs.

## Allowed ops (v1)

| Kind | Effect |
|------|--------|
| `status_change` | Set primary status to `INTACT` \| `WATCH` \| `FIRED` on one `### Rn` section |
| `add_risk` | Insert new `### Rn — title` section (auto Rn) with grade, status, mechanism, tripwires |
| `set_tripwires` | Replace tripwire table on an existing `### Rn` section |

## MCP (Grok)

| Tool | Role |
|------|------|
| `propose_risk_status` | Status change pending |
| `propose_add_risk` | New risk pending |
| `propose_risk_tripwires` | Tripwire table pending (after user cull) |
| `get_risk_sor` | Read SoR section + current tripwires |
| `list_risk_proposals` | Pending list |

Slash: `/cockpit-risk-check`, `/cockpit-risk-add`, `/cockpit-risk-tripwires`.

## Section locus (reliability — learned 2026-07-24)

- New `### Rn` blocks **must** be inserted **before** `\n## B)` (catalysts), never at EOF after B/C.
- Risk body parse caps at next `## ` heading (SoR helper + ontology compile) so misplaced sections do not swallow claims and do not parse empty.
- Glass: **status** and **tripwires** can overlay from SoR when pack lags; COMPILE BOOK still required for pack/MCP identity.

## Deferred

- Retire / merge risks  
- Free-text `risk_note` pins (legacy NBIS-only path stays separate)

## Status enum

`INTACT` · `WATCH` · `FIRED` only (primary token after `**Status:**`).

## SoR path

From thin model profile `risksSource`, e.g.:

- `raw/nebius-research/08-risks-catalysts.md`
- `raw/microsoft-research/08-risks-catalysts.md`

## Human gate

Agents may **propose** only. Glass **ACCEPT** / **REJECT**.

After ACCEPT:
1. SoR (`risks_source`) is written immediately.
2. **Readback assert (fail-closed):** vault re-read must match intended body (sha256) **before** proposal is marked `accepted`. Mismatch → error, proposal stays `pending`. Same rule for house ACCEPT (`houseProposals.js` + `writeAssert.js`).
3. Glass risk detail **auto-runs COMPILE BOOK** (best-effort) so pack/UI match.
4. If compile fails, UI still shows **SoR status** (pack may lag until manual COMPILE BOOK).

Glass list/detail prefer SoR status when it diverges from pack (`status_source: sor`).

## Daily / risk-check

Read-only (or optional DD archive under `cockpit/briefs/risk-dd/` — not compile input). Promote to register only via `status_change` ACCEPT.
