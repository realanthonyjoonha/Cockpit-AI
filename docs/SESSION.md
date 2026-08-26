# Cold session — read this before coding

**Audience:** a new Grok Build / coding agent (or Anthony after a break).  
**Not:** daily desk research → [`OPERATE.md`](../OPERATE.md) · friend install → [`FRIEND-START.md`](../FRIEND-START.md).

Decision-support only. No buy/sell/PT/sizing. House/risks: propose, then glass **ACCEPT**. Never hand-edit `ontology/store/`. Never ship vault books.

If cwd is `$HOME` or `cockpit-personal`, **still use the kernel paths below.** Do not treat personal as factory source of truth.

---

## Trees (absolute)

| Tree | Path | Role | Typical glass |
|------|------|------|----------------|
| **kernel** | `~/Desktop/cockpit-kernel` | **Build / dogfood here** | `:4682` |
| **product** | `~/Desktop/cockpit-product` | Friend SoR · GitHub `Cockpit-AI` | `:4681` |
| **personal** | `~/cockpit-personal/repo` | Grok Bot + vault twin | not factory |

Desk list SoR is `memory-cockpit-v2/config/thin-desks.json` **in the tree you are in**. Product must stay `desks: []`. Kernel has Anthony’s books. Do not copy desks to product.

Ignore stale lines that say live product is only NEBIUS+MICROSOFT, `~/Trading/…`, “0 desks,” or “Path 1 not built.” Factory operate **is** built (`pages/thin/*` + registry).

---

## Modes

| Human says | You run | Tree |
|------------|---------|------|
| Operate / research a desk | `/cockpit-daily` etc. · [`OPERATE.md`](../OPERATE.md) | kernel (MCP pin = glass) |
| Build / new feature | **`/cockpit-feature`** · [`EASY.md`](./EASY.md) · [`DEVELOP.md`](./DEVELOP.md) | **kernel only** |
| Ship to friends | **`/cockpit-ship`** · [`RELEASE.md`](../RELEASE.md) · [`LAB.md`](./LAB.md) | sync kernel → product; commit product |
| Push | only if they said **push** | `git push` product `origin/main` |

---

## Build (implement done)

1. Print the `/cockpit-feature` brief **before** code. Class **PLATFORM**. Factory only — no `pages/{ticker}/` forks.
2. Edit shared `memory-cockpit-v2/src/pages/thin/*`, `server/*`, `.grok/commands`, tests.
3. **New friend-facing file** (including any `DeskRouter.jsx` import) → add to `scripts/sync-agent-surface.sh` **and** [`PRODUCT-KERNEL-SOR.md`](./PRODUCT-KERNEL-SOR.md).
4. Tests: `cd memory-cockpit-v2 && npm run test:platform` (or the tests named in the brief).
5. If UI: `npm run build` **and hard-refresh**. **`npm run build` does not remount Express** — restart `npm start` after server route changes.
6. Stop. No ship, no push. Optional: `./scripts/feature-ready.sh`.

---

## Ship (friends)

On kernel: `./scripts/lab-e2e.sh` **and** `./scripts/release-check.sh --full` must PASS.

- Product `desks: []`. Never stage `research-wiki` books, packs, `store/by_ticker`, house, street JSON, secrets.
- Default `lab-e2e` is empty-install + hooks, **not** a browser click. Use `./scripts/lab-e2e.sh --glass` for HTTP smoke.
- Host `test:platform` on **product** (empty registry) must pass — kernel-only green is not enough. Dogfood-desk asserts must **skip** when `desks: []`.
- Cockpit-AI may be **archived** (read-only). Unarchive before `git push`, then push product `main`.

Friends: `./scripts/friend-upgrade.sh` — their desks stay; they do not get Anthony’s books.

---

## Depth (only after this card)

| Need | Open |
|------|------|
| Modes in one page | [`EASY.md`](./EASY.md) |
| Hard law | [`../AGENTS.md`](../AGENTS.md) |
| Platform procedure | [`DEVELOP.md`](./DEVELOP.md) |
| Blank-product gate | [`LAB.md`](./LAB.md) |
| Allowlist / sync | [`PRODUCT-KERNEL-SOR.md`](./PRODUCT-KERNEL-SOR.md) |
