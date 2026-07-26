# Empty-kernel dogfood — 2026-07-26

**Goal:** Prove export → bootstrap → START → live desk add works for end users.  
**Source:** `/Users/anthonyha/Desktop/cockpit-kernel` (contentful dogfood)  
**Dest:** `/Users/anthonyha/Desktop/cockpit-kernel-fresh` (empty export)  
**Glass:** `http://127.0.0.1:4683` (dogfood tree left on :4682)

Decision-support only. No invented company book for DEMO (scaffold only).

---

## Ritual

1. `export-kernel.sh ~/Desktop/cockpit-kernel-fresh`
2. `cd … && ./scripts/bootstrap.sh` → doctor **15 ok · 0 fail** (1 warn: no pack OK)
3. `PORT=4683 node memory-cockpit-v2/server/index.js`
4. Smoke empty APIs + open-grok new-desk
5. `./scripts/scaffold-new-desk.sh DEMO demo "Demo Co"`
6. **Without restart:** `GET /api/thin-desks` includes `demo`; `/api/demo/meta` + `/house` **200**

---

## Preflight (export contents)

| Assert | Result |
|--------|--------|
| `App.jsx` has `useThinDesks` | ✓ |
| `App.jsx` has `DeskUnknown` | ✓ |
| `DeskUnknown.jsx` present | ✓ |
| `Start.jsx` has Build next company | ✓ |
| `thinDeskMount.js` live mtime registry | ✓ |
| `thin-desks.json` desks `[]` | ✓ |
| packs / store JSON count 0 | ✓ |
| `.grok/commands/cockpit-new-desk.md` | ✓ |

---

## Runtime smoke (empty)

| Assert | Result |
|--------|--------|
| `GET /` 200 | ✓ |
| `GET /api/thin-desks` desks `[]` | ✓ |
| `POST /api/open-grok` `{action:new-desk,ticker:DEMO}` → `/cockpit-new-desk DEMO` | ✓ |
| `agents?variant=start` default `new-desk` | ✓ |
| `agents?variant=desk` excludes `new-desk` | ✓ |
| unknown slug `/api/nosuch/meta` 404 | ✓ |
| dist CSS has `.start-cta` | ✓ |
| `npm run test:open-grok-prompt` | ✓ PASS |

---

## Hot-add after scaffold (no restart)

| Assert | Result |
|--------|--------|
| Scaffold DEMO empty structure | ✓ |
| House remains **FORMING** (no invent) | ✓ |
| `GET /api/thin-desks` → `['demo']` without restart | ✓ |
| `GET /api/demo/meta` 200 | ✓ |
| `GET /api/demo/house` 200 | ✓ |

---

## Intentionally not claimed

- Full deep research / CONFIRMED house / ACCEPTED risks for DEMO (would pollute empty kernel)
- Ontology verify green for DEMO with empty claims (Part 1 min claims — need real research)
- OPEN GROK Terminal UX on this machine (API ok; spawn is macOS best-effort)

---

## Confidence

**Product shell cold start + live desk registry: PROVEN on a fresh export.**

Template drift risk (stale `App.kernel.jsx`) was fixed before this run; export carried live shell.

---

## Cleanup

Optional: delete `~/Desktop/cockpit-kernel-fresh` when done dogfooding.  
Dogfood monorepo with TSM/NVDA/AVGO remains at `~/Desktop/cockpit-kernel` (:4682).
