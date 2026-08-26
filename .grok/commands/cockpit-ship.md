---
description: Ship PLATFORM to product/friends — privacy + lab + release-check; push only if human says push
argument-hint: "[push?]"
---

# /cockpit-ship — ship mode (agents own the ritual)

Parse `$ARGUMENTS`: optional word **`push`** (only then may `git push` after PASS + commit).

**Human load:** Anthony said ship (and maybe push). **You** own privacy strip, gates, file list, commit; push only if they said push.

Read **`docs/SESSION.md`** · **`docs/EASY.md`** · **`RELEASE.md`** · **`docs/LAB.md`**. Hard law: **`AGENTS.md`**.

Decision-support only. **Never ship research books.**

**Trees:** kernel `~/Desktop/cockpit-kernel` → product `~/Desktop/cockpit-product` (GitHub `Cockpit-AI`). Product `desks: []`. Default `lab-e2e` is not a UI click (`--glass` for HTTP). Host `test:platform` on **product** must pass. If `git push` says archived/read-only, unarchive the GitHub repo first.

---

## Steps (in order — do not skip)

### 1. Confirm platform-only intent

State: shipping **code/docs/agents**, not vault books. Product SoR = friend empty shell.

### 2. Privacy strip product (if product has desks/content residue)

On **`cockpit-product`** (or `$COCKPIT_PRODUCT`):

- `thin-desks.json` → **`desks: []`** (keep rooms including street)  
- Restore cold-start `research-wiki/wiki/index.md` + `log.md` if they mention dogfood tickers  
- Leave gitignored house/raw on disk (OK)  
- Verify:

```bash
python3 -c "import json;d=json.load(open('memory-cockpit-v2/config/thin-desks.json'));assert d.get('desks')==[], d"
git status --porcelain | grep -E 'house-view|raw/|street/.*\.json|proposals|store/by_ticker' || echo privacy_clean
```

### 3. Sync platform kernel → product (if kernel has newer platform)

```bash
cd <kernel>
./scripts/sync-agent-surface.sh --from kernel --to product
# re-check desks=[] after sync
```

### 4. Gates (both required for ship-ready)

```bash
cd <product or kernel with lab scripts>
./scripts/lab-e2e.sh
./scripts/release-check.sh --full
```

**FAIL** → fix; do not commit/push.  
**PASS** → continue.

### 5. Stage PLATFORM only

Show full `git status` on product. Stage allowlisted platform files.  
**Do not** stage: house-view, raw research, street firm JSON, packs, secrets, non-empty desks.

### 6. Commit

Only after PASS. Message: complete sentences, platform-only note, no books.

### 7. Push

- If human argument or message included **push** → `git push origin main`  
- Else → stop after commit (or after showing ready-to-commit list if they only wanted gates)

### 8. Friend message

Print paste-ready:

```text
Platform update on Cockpit-AI.
cd your/Cockpit-AI && ./scripts/friend-upgrade.sh && ./scripts/run-glass.sh
Hard-refresh browser. Your desks stay. You do not get my books.
```

---

## Report footer

```text
Ship-ready: lab-e2e … · release-check …
Committed: yes/no · hash …
Pushed: yes/no
Privacy: desks=[] · no books staged
```

## Forbidden

- Push without human **push**  
- Shipping SPCX/NVDA/… desks in product registry  
- Weakening tests to get green  
