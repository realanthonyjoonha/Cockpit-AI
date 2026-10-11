# Cockpit harness stress — context and tools

Measured on this tree. A flaw is listed below only when this run still reproduces it.

Run at: 2026-10-11T06:46:21.695Z
Tokenizer: gpt-tokenizer@2.9.0 default encode
Product desks unchanged during the run: yes

## How to rerun

From a clean checkout of this branch, with Node 22 and Python 3:

```bash
npm install --ignore-scripts --no-audit --no-fund --prefix memory-cockpit-v2
npm install --ignore-scripts --no-audit --no-fund --prefix harness-stress
node harness-stress/run.mjs
```

That rewrites `harness-stress/results/*.json`, `harness-stress/prompts/`, and this report's deterministic sections when you pass `--report` after replacing `results/models.json`. The tool probe copies `memory-cockpit-v2` to `/tmp`, points MCP at a DEMO fixture, and deletes the copy. It does not edit `memory-cockpit-v2/config/thin-desks.json`. Do not set `XAI_API_KEY`. The model arm is replayable from `harness-stress/prompts/` on any chat model; score replies with `node harness-stress/score-models.mjs` after placing responses in `harness-stress/results/model-raw/`.

## What was treated as a hypothesis

The 2026-10-10 code-read audit said context handling and the 24-tool surface were okay, with these specific claims: a hard 10k-character cap; rule-based elision that keeps the latest claim per metric; no in-Cockpit overflow summarizer; predefined tools that cost tokens and exist mainly to gate writes; no retry or backoff. The probes below confirm or refute those claims on this tree (`realanthonyjoonha/Cockpit-AI`), using a synthetic DEMO fixture. No private vault and no product desk was added.

## Flaws

| ID | Sev | Area | Verdict | Title |
| --- | --- | --- | --- | --- |
| F11 | P1 | context | confirmed | A new-desk trajectory overflows tight host budgets and a tail-keep drops the seeded facts |
| F12 | P2 | tools | confirmed | Full catalog versus an 8-tool core, including two tools that always refuse |
| F13 | P2 | tools | confirmed | Malformed args, unknown desks, and refused writes return errors with no retry hint |
| F14 | P2 | tools | confirmed | Description overlap plus a metrics tool that is a trap |
| F16 | P1 | tools+context | measured | Model arm: recall and tool choice on two models, three arms, repeated |

Severity: P0 means a later step can treat a wrong figure as the live metric. P1 means seeded facts disappear, or the documented budget is not the path the agent uses. P2 means token cost, overlap, or errors without a retry hint.

## F11 — A new-desk trajectory overflows tight host budgets and a tail-keep drops the seeded facts

**Severity:** P1 · **Verdict:** confirmed · **Area:** context

**Hypothesis:** Long DEEP runs depend on the host window. Cockpit does not summarize between slices.

cockpit-new-desk.md is 4184 tokens. AGENTS.md is 2933 tokens. With ~6000-token slice notes, the transcript ends at 62382 tokens. First overflowing step by budget: {"8000":1,"16000":2,"32000":4,"64000":null,"96000":null,"128000":null}. On that deep trajectory the 32k tail-keep at the last step retains 0 of 8 seeded facts. The 128k window still holds 8 of 8, so this particular 8-slice transcript fits a 128k host and does not fit a 32k host. Twelve repeated pack snapshots cost 19392 tokens and still fit in 32k; the waste is duplicate payload, and the canaries survive. Cockpit does not write a slice summary back into the running prompt. The simulator's compaction is a tail-keep, which is what a host does when it has no summary step.

**Repro**

- node harness-stress/run.mjs
- See flow.json trajectories and repeated_pack_calls.

**Evidence**

```json
{
  "command_tokens": 4184,
  "agents_tokens": 2933,
  "overflow_step": {
    "8000": 1,
    "16000": 2,
    "32000": 4,
    "64000": null,
    "96000": null,
    "128000": null
  },
  "final_tokens": 62382,
  "step0_32k": {
    "overflow": false,
    "tokens_after_tail_keep": 7335,
    "canaries_kept": 8,
    "canaries": {
      "F1": true,
      "F2": true,
      "F3": true,
      "F4": true,
      "F5": true,
      "F6": true,
      "F7": true,
      "F8": true,
      "kept": 8,
      "total": 8
    }
  },
  "last_32k": {
    "overflow": true,
    "tokens_after_tail_keep": 32000,
    "canaries_kept": 0,
    "canaries": {
      "F1": false,
      "F2": false,
      "F3": false,
      "F4": false,
      "F5": false,
      "F6": false,
      "F7": false,
      "F8": false,
      "kept": 0,
      "total": 8
    }
  },
  "repeated_pack_tail": [
    {
      "call": 1,
      "tokens": 1682,
      "canaries_in_full": 8,
      "canaries_in_32k_tail": 8
    },
    {
      "call": 6,
      "tokens": 9732,
      "canaries_in_full": 8,
      "canaries_in_32k_tail": 8
    },
    {
      "call": 12,
      "tokens": 19392,
      "canaries_in_full": 8,
      "canaries_in_32k_tail": 8
    }
  ],
  "schema_tokens_each_call": 3063
}
```

## F12 — Full catalog versus an 8-tool core, including two tools that always refuse

**Severity:** P2 · **Verdict:** confirmed · **Area:** tools

**Hypothesis:** The 24-tool catalog costs tokens on every call, including tools that are not wired.

tools/list returned 24 tools, 3063 tokens for name+description+inputSchema. The 8-tool core is 1155 tokens. Delta 1908. propose_add_metric ok_field=false error=not wired. Use propose_add_risk (register) or propose_keep_driver (drivers). Does not write 08.. get_metric_sor ok_field=false error=not wired. Use get_risk_sor (register) or get_driver_sor (drivers). Does not read 08 as metrics.. Both still occupy schema tokens (propose_add_metric:226, get_metric_sor:81).

**Repro**

- node harness-stress/run.mjs
- See tools.json schema.per_tool and calls add-metric, metric-sor.

**Evidence**

```json
{
  "tool_count": 24,
  "catalog_tokens": 3063,
  "core_schema_tokens": 1155,
  "per_tool_tokens": [
    {
      "name": "list_desks",
      "tokens": 54
    },
    {
      "name": "get_house_view",
      "tokens": 96
    },
    {
      "name": "get_pack_snapshot",
      "tokens": 85
    },
    {
      "name": "get_house_assist_context",
      "tokens": 80
    },
    {
      "name": "propose_house_view",
      "tokens": 180
    },
    {
      "name": "propose_house_from_current",
      "tokens": 215
    },
    {
      "name": "commit_on_go",
      "tokens": 191
    },
    {
      "name": "list_house_proposals",
      "tokens": 84
    },
    {
      "name": "propose_risk_status",
      "tokens": 167
    },
    {
      "name": "propose_add_risk",
      "tokens": 249
    },
    {
      "name": "propose_add_metric",
      "tokens": 226
    },
    {
      "name": "list_risk_proposals",
      "tokens": 87
    },
    {
      "name": "get_risk_sor",
      "tokens": 98
    },
    {
      "name": "get_metric_sor",
      "tokens": 81
    },
    {
      "name": "list_house_driver_candidates",
      "tokens": 77
    },
    {
      "name": "propose_keep_driver",
      "tokens": 229
    },
    {
      "name": "propose_driver_log",
      "tokens": 212
    },
    {
      "name": "propose_skip_driver",
      "tokens": 90
    },
    {
      "name": "get_driver_sor",
      "tokens": 65
    },
    {
      "name": "list_driver_proposals",
      "tokens": 67
    },
    {
      "name": "propose_risk_tripwires",
      "tokens": 174
    },
    {
      "name": "agent_accept_status",
      "tokens": 61
    },
    {
      "name": "accept_house_proposal",
      "tokens": 97
    },
    {
      "name": "accept_risk_proposal",
      "tokens": 96
    }
  ],
  "missing": [],
  "extra": []
}
```

## F13 — Malformed args, unknown desks, and refused writes return errors with no retry hint

**Severity:** P2 · **Verdict:** confirmed · **Area:** tools

**Hypothesis:** Tool and validation errors have no retry or backoff guidance.

Every captured call has retry_hint false. A missing or mistyped desk is MCP error -32602 with isError true and thrown false (the client gets a tool error result, not an exception). An unknown desk string is a different isError text blob that names the registry path. FORMING, SAVE DRAFT, and a bad risk status are ordinary tool results with ok:false. Wall time per call in this run was 0–19 ms, so the cost is schema tokens and the split error shape, not latency. None of the envelopes say to retry.

**Repro**

- node harness-stress/run.mjs
- See tools.json calls missing-desk, desk-type, unknown-desk, propose-forming, commit-save-draft.

**Evidence**

```json
{
  "any_retry_hint": false,
  "rows": [
    {
      "id": "missing-desk",
      "thrown": false,
      "isError": true,
      "ok_field": null,
      "retry_hint": false,
      "ms": 1,
      "error": null
    },
    {
      "id": "desk-type",
      "thrown": false,
      "isError": true,
      "ok_field": null,
      "retry_hint": false,
      "ms": 1,
      "error": null
    },
    {
      "id": "unknown-desk",
      "thrown": false,
      "isError": true,
      "ok_field": null,
      "retry_hint": false,
      "ms": 1,
      "error": null
    },
    {
      "id": "propose-forming",
      "thrown": false,
      "isError": false,
      "ok_field": false,
      "retry_hint": false,
      "ms": 1,
      "error": "propose_house refuses FORMING. Only CONFIRMED markdown after user GO."
    },
    {
      "id": "propose-save-draft",
      "thrown": false,
      "isError": false,
      "ok_field": false,
      "retry_hint": false,
      "ms": 1,
      "error": "SAVE DRAFT / FORMING does not propose — stay in Grok. Glass never gets a FORMING house proposal."
    },
    {
      "id": "commit-save-draft",
      "thrown": false,
      "isError": false,
      "ok_field": false,
      "retry_hint": false,
      "ms": 1,
      "error": "SAVE DRAFT does not write or propose — stay in Grok; no FORMING glass chip"
    },
    {
      "id": "risk-bad-status",
      "thrown": false,
      "isError": false,
      "ok_field": false,
      "retry_hint": false,
      "ms": 0,
      "error": "to_status required: INTACT | WATCH | FIRED"
    },
    {
      "id": "register-early",
      "thrown": false,
      "isError": false,
      "ok_field": false,
      "retry_hint": false,
      "ms": 1,
      "error": "08 is thin (### Rn 1, tripwire tables 1; need ≥4). File was not stamped."
    },
    {
      "id": "accept-house-denied",
      "thrown": false,
      "isError": false,
      "ok_field": false,
      "retry_hint": false,
      "ms": 0,
      "error": "Agent ACCEPT denied. House/risks SoR writes require glass ACCEPT unless this monorepo grants agent accept (COCKPIT_AGENT_ACCEPT=1 or .cockpit-scenario.json agent_accept:true). Use scenario-up (agent accept on by default) or explicit grant — never on kernel dogfood by accident."
    }
  ]
}
```

## F14 — Description overlap plus a metrics tool that is a trap

**Severity:** P2 · **Verdict:** confirmed · **Area:** tools

**Hypothesis:** Several tools overlap, so a model can pick the wrong one.

Highest description Jaccard pairs: accept_house_proposal/accept_risk_proposal=0.625; propose_add_metric/get_metric_sor=0.375; propose_risk_status/propose_add_risk=0.35; list_house_proposals/list_risk_proposals=0.333; list_risk_proposals/list_driver_proposals=0.333; commit_on_go/accept_house_proposal=0.313; propose_keep_driver/propose_skip_driver=0.313; commit_on_go/accept_risk_proposal=0.29. propose_add_metric's schema mirrors propose_add_risk and then returns "not wired". get_house_assist_context embeds the house markdown that get_house_view also returns (assist chars=2579, house chars=771).

**Repro**

- node harness-stress/run.mjs
- See tools.json overlap_pairs.

**Evidence**

```json
{
  "pairs": [
    {
      "a": "accept_house_proposal",
      "b": "accept_risk_proposal",
      "jaccard": 0.625
    },
    {
      "a": "propose_add_metric",
      "b": "get_metric_sor",
      "jaccard": 0.375
    },
    {
      "a": "propose_risk_status",
      "b": "propose_add_risk",
      "jaccard": 0.35
    },
    {
      "a": "list_house_proposals",
      "b": "list_risk_proposals",
      "jaccard": 0.333
    },
    {
      "a": "list_risk_proposals",
      "b": "list_driver_proposals",
      "jaccard": 0.333
    },
    {
      "a": "commit_on_go",
      "b": "accept_house_proposal",
      "jaccard": 0.313
    },
    {
      "a": "propose_keep_driver",
      "b": "propose_skip_driver",
      "jaccard": 0.313
    },
    {
      "a": "commit_on_go",
      "b": "accept_risk_proposal",
      "jaccard": 0.29
    }
  ]
}
```

## F16 — Model arm: recall and tool choice on two models, three arms, repeated

**Severity:** P1 · **Verdict:** measured · **Area:** tools+context

**Hypothesis:** A cheaper model mis-selects tools more often, and early facts decay on long prompts. A reduced tool list changes both the miss rate and the cost.

32 Cursor subagent replies. Strong model gpt-5.6-sol-high. Cheaper model gemini-3.8-flash-low. No XAI_API_KEY. Recall of 8 seeded facts was 8/8 on recall-s (513 tokens) and recall-l (15485 tokens), 3 and 2 repeats. A 4-turn resume kept all 8 facts at the end (n=1 chain per model). The host did not error, and the replies contain no compaction notice. Tool identity on the full 24-tool catalog was 11/11 for both models across 3 repeats. Argument values were placeholders when the prompt had no real proposal id. On the 8-tool core, gpt-5.6-sol-high stayed 11/11 (null where the tool is absent). gemini-3.8-flash-low missed once in 3: it called commit_on_go kind=drivers for KEEP, a tool that is in the core list but is the wrong write. Bash-only reads of thin-desks.json, the house file, DEMO.json, and 08-risks matched the layout. Both models sometimes emitted go-commit.mjs for a GO write, which skips propose. One strong-model read used house-view-DEMO.md (wrong case on Linux). The host did not return token-usage counters for these subagents. A few long awk expressions in the bash logs are shortened; the path and whether the command writes are unchanged.

**Repro**

- Prompts are harness-stress/prompts/*.md.
- Recorded replies are harness-stress/results/model-raw/.
- node harness-stress/score-models.mjs
- Models were Cursor subagents. No XAI_API_KEY was used.

**Evidence**

```json
{
  "summary": "32 Cursor subagent replies. Strong model gpt-5.6-sol-high. Cheaper model gemini-3.8-flash-low. No XAI_API_KEY. Recall of 8 seeded facts was 8/8 on recall-s (513 tokens) and recall-l (15485 tokens), 3 and 2 repeats. A 4-turn resume kept all 8 facts at the end (n=1 chain per model). The host did not error, and the replies contain no compaction notice. Tool identity on the full 24-tool catalog was 11/11 for both models across 3 repeats. Argument values were placeholders when the prompt had no real proposal id. On the 8-tool core, gpt-5.6-sol-high stayed 11/11 (null where the tool is absent). gemini-3.8-flash-low missed once in 3: it called commit_on_go kind=drivers for KEEP, a tool that is in the core list but is the wrong write. Bash-only reads of thin-desks.json, the house file, DEMO.json, and 08-risks matched the layout. Both models sometimes emitted go-commit.mjs for a GO write, which skips propose. One strong-model read used house-view-DEMO.md (wrong case on Linux). The host did not return token-usage counters for these subagents. A few long awk expressions in the bash logs are shortened; the path and whether the command writes are unchanged.",
  "by_arm": {
    "gemini-3.8-flash-low::multiturn-t0": {
      "n": 1,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gpt-5.6-sol-high::multiturn-t0": {
      "n": 1,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gemini-3.8-flash-low::multiturn-t3": {
      "n": 1,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gpt-5.6-sol-high::multiturn-t3": {
      "n": 1,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gemini-3.8-flash-low::recall-l": {
      "n": 2,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gpt-5.6-sol-high::recall-l": {
      "n": 2,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gemini-3.8-flash-low::recall-s": {
      "n": 3,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gpt-5.6-sol-high::recall-s": {
      "n": 3,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gemini-3.8-flash-low::tool-bash": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 0.879
    },
    "gpt-5.6-sol-high::tool-bash": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 0.939
    },
    "gemini-3.8-flash-low::tool-core": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 0.97
    },
    "gpt-5.6-sol-high::tool-core": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 1
    },
    "gemini-3.8-flash-low::tool-full": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 1
    },
    "gpt-5.6-sol-high::tool-full": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 1
    }
  },
  "recall": {
    "gemini-3.8-flash-low::multiturn-t0": {
      "n": 1,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gpt-5.6-sol-high::multiturn-t0": {
      "n": 1,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gemini-3.8-flash-low::multiturn-t3": {
      "n": 1,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gpt-5.6-sol-high::multiturn-t3": {
      "n": 1,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gemini-3.8-flash-low::recall-l": {
      "n": 2,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gpt-5.6-sol-high::recall-l": {
      "n": 2,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gemini-3.8-flash-low::recall-s": {
      "n": 3,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gpt-5.6-sol-high::recall-s": {
      "n": 3,
      "recall_mean": 1,
      "tool_correct_mean": null
    },
    "gemini-3.8-flash-low::tool-bash": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 0.879
    },
    "gpt-5.6-sol-high::tool-bash": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 0.939
    },
    "gemini-3.8-flash-low::tool-core": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 0.97
    },
    "gpt-5.6-sol-high::tool-core": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 1
    },
    "gemini-3.8-flash-low::tool-full": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 1
    },
    "gpt-5.6-sol-high::tool-full": {
      "n": 3,
      "recall_mean": null,
      "tool_correct_mean": 1
    }
  }
}
```

## Refuted or narrowed

- Phase-1 repros not reproduced on this run: F1 unpadded 2026-10-01 beats 2026-9-30; C-date-iso keeps October; F2 cash-plus-guidance stays cash and the outlook sentence stays revenue_guide; F3 “Cash was $222 million” is the live cash claim; F4 employees, “45 percent”, and spaced “$ 12” stay; the qualitative canary is elided; F9 missing grade and explicit C pick bare in both languages; F17 inventory impairment is impairment and a goodwill balance is goodwill.
- Phase-2 repros not reproduced on this run: F5 assemble, retrieve, and get_pack_snapshot stay within 10000 characters; unknown house notes do not survive; F6 END CONTEXT is inside max_chars; F7 risks intent keeps demo-price; F8 older cash, debt, and gross margin stay beside newer revenue; F10 the residual cap of 8 names the omitted claims.
- Phase-3 repros not reproduced on this run: F18 register ok=true and drivers is not rejected for a thin register (drivers ok=true); F15 a shell append still changes bytes (254 → 274) and is not a GO: audit mismatch, house-closeout fails.
- Unpadded and padded dates keep the newer claim (C-date-unpadded winner=oct, C-date-iso winner=new). A bare FY label still has no invented month.
- Same-day ties keep the earlier array element (C-same-day-tie winner=first). That matches a stable sort. It is an arbitrary pick when two filings share a date, and it is visible in the case.
- Unpadded dates and a cash sentence that also says "guidance" no longer pick the wrong live claim. The host trajectory of the new-desk command plus eight slice notes is still a tail-keep, which is F11.
- Model arm: 32 Cursor subagent replies. Strong model gpt-5.6-sol-high. Cheaper model gemini-3.8-flash-low. No XAI_API_KEY. Recall of 8 seeded facts was 8/8 on recall-s (513 tokens) and recall-l (15485 tokens), 3 and 2 repeats. A 4-turn resume kept all 8 facts at the end (n=1 chain per model). The host did not error, and the replies contain no compaction notice. Tool identity on the full 24-tool catalog was 11/11 for both models across 3 repeats. Argument values were placeholders when the prompt had no real proposal id. On the 8-tool core, gpt-5.6-sol-high stayed 11/11 (null where the tool is absent). gemini-3.8-flash-low missed once in 3: it called commit_on_go kind=drivers for KEEP, a tool that is in the core list but is the wrong write. Bash-only reads of thin-desks.json, the house file, DEMO.json, and 08-risks matched the layout. Both models sometimes emitted go-commit.mjs for a GO write, which skips propose. One strong-model read used house-view-DEMO.md (wrong case on Linux). The host did not return token-usage counters for these subagents. A few long awk expressions in the bash logs are shortened; the path and whether the command writes are unchanged.

## Raw logs

- `harness-stress/results/context.json`
- `harness-stress/results/tools.json`
- `harness-stress/results/flow.json`
- `harness-stress/results/run-meta.json`
- `harness-stress/results/models.json` when the model arm has been scored
- `harness-stress/results/model-raw/` replies
- `harness-stress/prompts/` exact prompts

Decision-support only. The DEMO desk is a fixture inside the harness and is not a house view.
