# Harness stress (do not merge)

Read-only probes of Cockpit context handling and the `cockpit-research` MCP tool list on the public product tree.

This directory does not change glass, ontology, or the empty desk registry. The tool probe copies the server into `/tmp`, serves a synthetic `DEMO` fixture, and deletes that copy.

## Rerun

```bash
npm install --ignore-scripts --no-audit --no-fund --prefix memory-cockpit-v2
npm install --ignore-scripts --no-audit --no-fund --prefix harness-stress
node harness-stress/run.mjs
```

Outputs:

- `REPORT.md` — flaws, severity, repro, evidence
- `results/context.json` — context-pack and retrieve cases
- `results/tools.json` — all 24 tools, schemas, malformed calls, sandbox bash append
- `results/flow.json` — new-desk token trajectory and host-budget tail-keep
- `prompts/` — exact model-arm prompts

The recorded model arm used Cursor subagents `gpt-5.6-sol-high` and `gemini-3.8-flash-low`. No `XAI_API_KEY`.

Model replies (optional, no `XAI_API_KEY`):

1. Put each reply in `results/model-raw/<prompt>__<model>__<rep>.txt`.
2. Prompt ids: `recall-s`, `recall-l`, `tool-full`, `tool-core`, `tool-bash`, `multiturn-t0`, `multiturn-t3`.
3. `node harness-stress/score-models.mjs`
4. `node harness-stress/run.mjs --report`

Do not point the probe at a private vault. Product `thin-desks.json` must stay `desks: []`.
