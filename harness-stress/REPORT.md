# Cockpit harness stress — context and tools

Measured on this tree. A flaw is listed below only when this run still reproduces it.

Run at: 2026-10-11T05:58:52.768Z
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
| F5 | P1 | context | confirmed | The 10k cap is on retrieve(), and the MCP pack path does not apply it |
| F6 | P1 | context | confirmed | ont agent context hard-cuts at 28,000 characters and drops the closing instruction |
| F7 | P2 | context | confirmed | The risks intent keeps series whose ids start with "mu" |
| F8 | P1 | context | confirmed | retrieve() keeps the newest claims, so repeated revenue lines crowd out older metrics |
| F10 | P2 | context | confirmed | Unclassified dollar claims are capped at 8 |
| F11 | P1 | context | confirmed | A new-desk trajectory overflows tight host budgets and a tail-keep drops the seeded facts |
| F12 | P2 | tools | confirmed | Full catalog versus an 8-tool core, including two tools that always refuse |
| F13 | P2 | tools | confirmed | Malformed args, unknown desks, and refused writes return errors with no retry hint |
| F14 | P2 | tools | confirmed | Description overlap plus a metrics tool that is a trap |
| F18 | P1 | tools | confirmed | Register GO returns ok while the drivers gate still says the register is open |
| F15 | P1 | tools | confirmed | In the sandbox, a shell append changed the fixture house with no GO utterance |
| F16 | P1 | tools+context | measured | Model arm: recall and tool choice on two models, three arms, repeated |

Severity: P0 means a later step can treat a wrong figure as the live metric. P1 means seeded facts disappear, or the documented budget is not the path the agent uses. P2 means token cost, overlap, or errors without a retry hint.

## F5 — The 10k cap is on retrieve(), and the MCP pack path does not apply it

**Severity:** P1 · **Verdict:** confirmed · **Area:** context

**Hypothesis:** A hard 10k-character cap binds the agent context pack (D-ONTO-8, CONTRACT.md).

assembleAgentPack has no budget field (has_budget=false). A two-claim fixture serializes to 16588 characters. get_pack_snapshot on a fat DEMO pack returned 46089 characters (16013 tokens). retrieve() on fat claim text returned 16891 characters, over_budget=true, trimmed=true. An unknown house_prior.notes field of 20000 characters survives the cutter (over_budget=true) because the cutter only shrinks known keys.

**Repro**

- node harness-stress/run.mjs
- See context.json C-js-no-char-cap, C-retrieve-fat-claims, C-retrieve-unknown-house-field, and tools.json fat_pack.

**Evidence**

```json
{
  "assemble": {
    "chars": 778,
    "has_budget": false,
    "has_stale_tripwires": false
  },
  "js_fat_chars": 16588,
  "tool_fat": {
    "chars": 46089,
    "tokens": 16013,
    "over_10000_chars": true
  },
  "retrieve_fat": {
    "chars": 16891,
    "budget": {
      "limit_chars": 10000,
      "used_chars": 16891,
      "trimmed": true
    },
    "over_budget": true
  },
  "unknown_field": {
    "chars": 20792,
    "notes_len": 20000,
    "over_budget": true,
    "budget": {
      "limit_chars": 10000,
      "used_chars": 20792,
      "trimmed": true
    }
  }
}
```

## F6 — ont agent context hard-cuts at 28,000 characters and drops the closing instruction

**Severity:** P1 · **Verdict:** confirmed · **Area:** context

**Hypothesis:** Overview budgets never drop the closing contract. Long runs have no summarize step inside Cockpit.

build_agent_context returned 28042 characters. truncated=true. The string "END CONTEXT" is present=false. GAP-CANARY-TAIL is present=true because that canary is also copied into the overview pack earlier in the string; the cut removed the final instruction instead. The slice is not aligned to a claim boundary (the tail is a partial "WORD" run plus the truncation marker). Command files that mention summarize or a context window: (none). implementation-notes.md still describes itself as a resume anchor; that file is prose, not a compactor.

**Repro**

- node harness-stress/run.mjs
- See context.json python case C-agent-tail-cut and flow.json.

**Evidence**

```json
{
  "agent": {
    "id": "C-agent-tail-cut",
    "chars": 28042,
    "truncated": true,
    "has_gap_canary": true,
    "has_end_marker": false,
    "has_head_canary": true,
    "tail": "WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WORD WOR\n\n…[agent context truncated at max_chars]…"
  },
  "summarize_mentions": [],
  "resume_anchor_prose": true
}
```

## F7 — The risks intent keeps series whose ids start with "mu"

**Severity:** P2 · **Verdict:** confirmed · **Area:** context

**Hypothesis:** Retrieve is generic across desks.

retrieve(DEMO, "risks") returned series ids ["mu-price"]. The fixture series demo-price was removed. The mu-price row was kept. The filter is hard-coded in ontology/api/retrieve.py.

**Repro**

- node harness-stress/run.mjs
- See context.json case C-retrieve-risks-mu-filter.

**Evidence**

```json
{
  "series_ids": [
    "mu-price"
  ]
}
```

## F8 — retrieve() keeps the newest claims, so repeated revenue lines crowd out older metrics

**Severity:** P1 · **Verdict:** confirmed · **Area:** context

**Hypothesis:** The 10k overview trim drops lowest-priority extras and keeps a representative claim set.

The fixture had 10 newer revenue claims plus cash, debt, and gross-margin claims from 2020. Overview claim ids kept: rev9, rev8, rev7, rev6, rev5, rev4, rev3, rev2, rev1, rev0, cash-old, debt-old. Older unique metrics kept: cash-old, debt-old. This trim is count-based on as_of, which is a different algorithm from contextpack.js one-per-metric.

**Repro**

- node harness-stress/run.mjs
- See context.json case C-retrieve-crowd.

**Evidence**

```json
{
  "claim_ids": [
    "rev9",
    "rev8",
    "rev7",
    "rev6",
    "rev5",
    "rev4",
    "rev3",
    "rev2",
    "rev1",
    "rev0",
    "cash-old",
    "debt-old"
  ],
  "chars": 2100,
  "budget": {
    "limit_chars": 10000,
    "used_chars": 2100,
    "trimmed": false
  }
}
```

## F10 — Unclassified dollar claims are capped at 8

**Severity:** P2 · **Verdict:** confirmed · **Area:** context

**Hypothesis:** Residual numbered claims are capped.

12 unclassified dollar claims went in. 8 came out. Kept ids: r12, r11, r10, r9, r8, r7, r6, r5.

**Repro**

- node harness-stress/run.mjs
- See context.json case C-residual-cap.

**Evidence**

```json
{
  "id": "C-residual-cap",
  "input": 12,
  "kept": 8,
  "kept_ids": [
    "r12",
    "r11",
    "r10",
    "r9",
    "r8",
    "r7",
    "r6",
    "r5"
  ],
  "cap": 8
}
```

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
  "schema_tokens_each_call": 3011
}
```

## F12 — Full catalog versus an 8-tool core, including two tools that always refuse

**Severity:** P2 · **Verdict:** confirmed · **Area:** tools

**Hypothesis:** The 24-tool catalog costs tokens on every call, including tools that are not wired.

tools/list returned 24 tools, 3011 tokens for name+description+inputSchema. The 8-tool core is 1103 tokens. Delta 1908. propose_add_metric ok_field=false error=not wired. Use propose_add_risk (register) or propose_keep_driver (drivers). Does not write 08.. get_metric_sor ok_field=false error=not wired. Use get_risk_sor (register) or get_driver_sor (drivers). Does not read 08 as metrics.. Both still occupy schema tokens (propose_add_metric:226, get_metric_sor:81).

**Repro**

- node harness-stress/run.mjs
- See tools.json schema.per_tool and calls add-metric, metric-sor.

**Evidence**

```json
{
  "tool_count": 24,
  "catalog_tokens": 3011,
  "core_schema_tokens": 1103,
  "per_tool_tokens": [
    {
      "name": "list_desks",
      "tokens": 54
    },
    {
      "name": "get_house_view",
      "tokens": 70
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
      "tokens": 165
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
      "ms": 2,
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
      "ms": 0,
      "error": "SAVE DRAFT does not write or propose — stay in Grok; no FORMING glass chip"
    },
    {
      "id": "risk-bad-status",
      "thrown": false,
      "isError": false,
      "ok_field": false,
      "retry_hint": false,
      "ms": 1,
      "error": "to_status required: INTACT | WATCH | FIRED"
    },
    {
      "id": "register-early",
      "thrown": false,
      "isError": false,
      "ok_field": false,
      "retry_hint": false,
      "ms": 1,
      "error": "08 is thin and there are not enough pending add_risk chips. Dump full 08, propose, then GO."
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

Highest description Jaccard pairs: accept_house_proposal/accept_risk_proposal=0.625; propose_add_metric/get_metric_sor=0.375; commit_on_go/accept_house_proposal=0.37; propose_risk_status/propose_add_risk=0.35; propose_house_view/commit_on_go=0.333; list_house_proposals/list_risk_proposals=0.333; list_risk_proposals/list_driver_proposals=0.333; propose_keep_driver/propose_skip_driver=0.313. propose_add_metric's schema mirrors propose_add_risk and then returns "not wired". get_house_assist_context embeds the house markdown that get_house_view also returns (assist chars=2579, house chars=692).

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
      "a": "commit_on_go",
      "b": "accept_house_proposal",
      "jaccard": 0.37
    },
    {
      "a": "propose_risk_status",
      "b": "propose_add_risk",
      "jaccard": 0.35
    },
    {
      "a": "propose_house_view",
      "b": "commit_on_go",
      "jaccard": 0.333
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
      "a": "propose_keep_driver",
      "b": "propose_skip_driver",
      "jaccard": 0.313
    }
  ]
}
```

## F18 — Register GO returns ok while the drivers gate still says the register is open

**Severity:** P1 · **Verdict:** confirmed · **Area:** tools

**Hypothesis:** commit_on_go kind=register closes the register before drivers can proceed.

commit_on_go kind=register returned ok=true in 4 ms. commit_on_go kind=drivers then returned ok=false: Register is not closed. 08 missing or thin (### Rn 2, tripwire tables 2; need ≥4). Draft register, dump full 08 in Grok. Drivers start after register-closeout PASS. Three of the four add_risk chips in the same run were skipped as already in the source of record, and the success result still stamped the session. There is no retry hint on either call.

**Repro**

- node harness-stress/run.mjs
- See tools.json calls register-go and drivers-go.

**Evidence**

```json
{
  "register_excerpt": "{\n  \"ok\": true,\n  \"available\": true,\n  \"kind\": \"register\",\n  \"slug\": \"demo\",\n  \"applied\": [\n    {\n      \"id\": \"rp_mv3exba7_01fe0a\",\n      \"kind\": \"add_risk\",\n      \"status\": \"accepted\"\n    }\n  ],\n  \"skipped\": [\n    {\n      \"id\": \"rp_mv3exba6_2f26d8\",\n      \"error\": \"already in SoR\"\n    },\n    {\n      \"id\": \"rp_mv3exba5_a5a7be\",\n      \"error\": \"already in SoR\"\n    },\n    {\n      \"id\": \"rp_mv3exba3_665e26\",\n      \"error\": \"already in SoR\"\n    }\n  ],\n  \"header_accepted\": true,\n  \"snapshot\": \"cockpit/history/register-demo.2026-10-11T05-58-49-952Z.md\",\n  \"session\": {\n    \"version\": 1,\n    \"slug\": \"demo\",\n    \"phase\": \"REGISTER_COMMITTED\",\n    \"house_proposal_id\": \"hp_mv3exb98_caa442\",\n    \"house_committed_at\": \"2026-10-11T05:58:49.940Z\",\n    \"house_snapshot\": \"cockpit/history/house-demo.2026-10-11T05-58-49-939Z.md\",\n    \"compile\": {\n      \"ran\": false,\n      \"reason\": \"COCKPIT_GO_COMMIT_NO_CO",
  "drivers_error": "Register is not closed. 08 missing or thin (### Rn 2, tripwire tables 2; need ≥4). Draft register, dump full 08 in Grok. Drivers start after register-closeout PASS."
}
```

## F15 — In the sandbox, a shell append changed the fixture house with no GO utterance

**Severity:** P1 · **Verdict:** confirmed · **Area:** tools

**Hypothesis:** Predefined tools are what make writes safe. Bash-capable hosts can ignore them.

propose_house_view with FORMING was refused (error=propose_house refuses FORMING. Only CONFIRMED markdown after user GO.). propose with intent save_draft was refused (error=SAVE DRAFT / FORMING does not propose — stay in Grok. Glass never gets a FORMING house proposal.). A one-line shell append on the sandbox house file set appended=true, exit=0, bytes 254 → 274. The product tree was not the target. product_desks_unchanged=true.

**Repro**

- node harness-stress/run.mjs
- The probe builds /tmp/cockpit-tool-sandbox-<pid>, appends inside that vault, then deletes the sandbox.
- See tools.json bash_bypass. Re-run to reproduce. Do not point this at a real vault.

**Evidence**

```json
{
  "exit": 0,
  "bytes_before": 254,
  "bytes_after": 274,
  "appended": true,
  "go_utterance_required": false
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
