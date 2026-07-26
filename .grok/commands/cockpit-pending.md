---
description: List pending house proposals for a desk
argument-hint: "[desk e.g. slug|ticker]"
---

Desk = `$ARGUMENTS` if non-empty, else ask once.

Call MCP `list_house_proposals` with `status: pending` (and without if useful for counts).

Output: id · summary · bytes · source · created_at · reminder to ACCEPT/REJECT on glass `#/{desk}/house`.

Decision-support only. Do not accept/reject for the user (glass only).
