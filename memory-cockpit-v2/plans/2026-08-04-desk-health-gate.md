# Desk health gate (scar-tissue)

**As-of:** 2026-08-04  
**Status:** Implemented (process + new-desk §5c + friend-upgrade hook)

## Law

If the switcher lists a desk, process resolve + (when glass up) `/api/{slug}/meta|house|overview` must not be routing-dead.

## Commands

```bash
cd memory-cockpit-v2
npm run test:thin-slug-resolve
npm run test:desk-health
node scripts/desk-health.mjs --slug nbis --base-url http://127.0.0.1:4682
```

## Scars

- S1/S2: registry vs RESERVED_API_SLUGS / resolveThinDesk (NBIS)
- S3: live HTTP routing codes
- S4: do not trust list_desks alone
