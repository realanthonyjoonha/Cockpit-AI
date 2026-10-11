#!/usr/bin/env python3
"""Budget and agent-context probe. Reads a JSON job on stdin. Writes JSON on stdout.

Never writes the product ontology store. Store files go to job['store_dir'].
"""
from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "ontology"))

import paths  # noqa: E402
from api.contextpack import live_claims, load_rules  # noqa: E402
from api.retrieve import retrieve  # noqa: E402


def main() -> int:
    job = json.loads(sys.stdin.read() or "{}")
    store_dir = Path(job["store_dir"])
    store_dir.mkdir(parents=True, exist_ok=True)
    paths.BY_TICKER = store_dir

    rules = load_rules()
    out: dict = {"ok": True, "cases": []}

    for case in job.get("cases") or []:
        row = {"id": case.get("id")}
        try:
            ticker = str(case.get("ticker") or "DEMO").upper()
            store = case["store"]
            (store_dir / f"{ticker}.json").write_text(
                json.dumps(store), encoding="utf-8"
            )
            if case.get("op") == "live":
                live, superseded = live_claims(
                    store.get("claims") or [], rules
                )
                row["live"] = [
                    {
                        "id": c.get("id"),
                        "metric_id": c.get("metric_id"),
                        "as_of": c.get("as_of"),
                        "grade": c.get("grade"),
                        "text": c.get("text"),
                    }
                    for c in live
                ]
                row["superseded_ids"] = [c.get("id") for c in superseded]
            elif case.get("op") == "retrieve":
                pack = retrieve(
                    ticker,
                    case.get("intent") or "overview",
                    budget=case.get("budget"),
                )
                raw = json.dumps(pack, ensure_ascii=False)
                row["chars"] = len(raw)
                row["over_budget"] = row["chars"] > int(
                    (pack.get("budget") or {}).get("limit_chars") or 10_000
                )
                row["budget"] = pack.get("budget")
                row["claim_ids"] = [c.get("id") for c in (pack.get("claims") or [])]
                row["gap_texts"] = list(pack.get("gaps") or [])
                row["series_ids"] = [
                    s.get("id") for s in (pack.get("series_snapshot") or [])
                ]
                row["has_provenance"] = "provenance" in pack
                hp = pack.get("house_prior") or {}
                row["house_keys"] = sorted(hp.keys())
                row["notes_len"] = len(str(hp.get("notes") or ""))
            elif case.get("op") == "agent":
                from api.agent import build_agent_context

                text = build_agent_context(
                    ticker,
                    case.get("question") or "overview status",
                    include_overview=True,
                )
                row["chars"] = len(text)
                row["truncated"] = "agent context truncated" in text
                row["has_gap_canary"] = "GAP-CANARY-TAIL" in text
                row["has_end_marker"] = "END CONTEXT" in text
                row["has_head_canary"] = "HEAD-CANARY" in text
                row["tail"] = text[-400:]
            else:
                row["error"] = f"unknown op {case.get('op')}"
        except Exception as e:
            row["error"] = f"{type(e).__name__}: {e}"
            row["trace"] = traceback.format_exc()[-1500:]
        out["cases"].append(row)

    sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        sys.stdout.write(json.dumps({"ok": False, "error": traceback.format_exc()}))
        raise SystemExit(1)
