# VM-glass shots (layout proof)

Layout/UI tickets: put PNG / JPG / WEBP screenshots here (or set `VERIFY_SHOTS_DIR`).

`./scripts/verify-feature.sh` **fails closed** if this directory has no image files.

Docs-only tickets skip this gate with:

```bash
./scripts/verify-feature.sh --docs-only
```

The log must say docs-only. See [`docs/FEATURE-MAP.md`](../../FEATURE-MAP.md) for which hash to shoot per room.

Kernel dogfood glass is often `http://127.0.0.1:4682/#/start`. Lab: `:4690`.
