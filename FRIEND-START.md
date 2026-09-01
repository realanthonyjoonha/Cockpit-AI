# Friend start — first Cockpit install

Blank **product** shell. Decision-support only — no buy/sell/hold, price targets, or sizing.

You get the platform (glass + agents + factory). You do **not** get anyone else’s research books.

---

## One-time boot

```bash
cd /path/to/Cockpit-AI   # or cockpit-product
./scripts/bootstrap.sh
./scripts/run-glass.sh
```

Open the URL the script prints (often `http://127.0.0.1:4681/#/start`).

What you should see:

- Switcher: **START** only
- CTA: **Build next company**
- `desks: []` — empty is correct

Already installed and want new platform features? **[`FRIEND-UPGRADE.md`](./FRIEND-UPGRADE.md)**.

---

## What stays empty until you underwrite

| Path | Friend first-run |
|------|------------------|
| `memory-cockpit-v2/config/thin-desks.json` | `desks: []` |
| `research-wiki/` | no house / raw / entities |
| `ontology/packs/` · `ontology/store/by_ticker/` | empty |

Do not copy another person’s vault or thin-desks into this tree.

---

## Developers (optional)

Platform procedure: [`docs/DEVELOP.md`](./docs/DEVELOP.md) · blank E2E: [`docs/LAB.md`](./docs/LAB.md).
