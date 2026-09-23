---
description: On-demand research for one driver — print, news, an open question, or a note. Does not rewrite the house.
argument-hint: "[desk] [driver] [--print|--news|--open|--note]"
---

Parse `$ARGUMENTS`: desk, driver name, and one mode.

Load the CONFIRMED house and this driver’s cite (`get_driver_sor`). Research **only this engine**. Do not dump the house. Do not touch the risk register. Do not rewrite the house.

- `--print` — what the latest earnings / 10-Q / 8-K said about this driver. Numbers, date, source. via=`print`.
- `--news` — what moved in the news since the last log line. Date each item. via=`news`.
- `--open` — pick one still-open question and answer it, or say GAP. via=`open`. Add the question with **open** only if it is new.
- `--note` — the user has a finding. One log line. via=`note`.

When they agree, `propose_driver_log`:

- **driver** — D1 or the title
- **date** — `YYYY-MM-DD`
- **via** — print | news | open | note
- **fact** — one line
- **figures** — only if this print replaces the figures strip
- **open** — one new question, if any

They **GO** `commit_on_go` kind=drivers. That writes 09 only.

If the finding **contradicts** the house, ask whether to GO the house or drop the driver. Do not silent-write either file. No buy/sell/PT. No status.
