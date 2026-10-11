#!/usr/bin/env python3
"""Stdin: {bundles:[{id, claims, xbrl?}]}. Stdout: the same bundles through the Python live picker.

`xbrl` is a path under harness-stress/fixtures; when present the parsed facts and the
tagged-slot merge are emitted too.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FIXTURES = REPO / "harness-stress" / "fixtures"
sys.path.insert(0, str(REPO / "ontology"))

from api.contextpack import (  # noqa: E402
    claim_gaps,
    classify_claim,
    live_claims,
    load_rules,
    parse_amounts,
    parse_as_of,
)
from api.xbrl_facts import parse_xbrl_facts, tagged_slots  # noqa: E402


def _num(n: float):
    f = float(n)
    if abs(f - round(f)) < 1e-6:
        return int(round(f))
    return f


def snapshot(claims: list, rules: dict) -> dict:
    live, _ = live_claims(claims, rules)
    return {
        "live": {c.get("id"): c.get("metric_id") for c in live},
        "gaps": claim_gaps(claims, rules),
        "dates": {
            c.get("id"): {
                "sort_key": parse_as_of(c.get("as_of")).get("sort_key"),
                "precision": parse_as_of(c.get("as_of")).get("precision"),
            }
            for c in claims
        },
        "units": {
            c.get("id"): [
                {
                    "unit": a.get("unit"),
                    "currency": a.get("currency"),
                    "scale": a.get("scale"),
                    "value": _num(a.get("value")),
                }
                for a in parse_amounts(c.get("text") or "")
            ]
            for c in claims
        },
        "classify": {
            c.get("id"): classify_claim(c, rules).get("metric_id")
            for c in claims
        },
    }


def tagged_snapshot(claims: list, rules: dict, rel: str) -> dict:
    path = FIXTURES / rel
    parsed = parse_xbrl_facts(path.read_text(encoding="utf-8"), source_id=path.name)
    facts = parsed["facts"]
    slots = tagged_slots(facts)
    gaps: list[str] = []
    context: list[dict] = []
    live, _ = live_claims(claims, rules, gaps_out=gaps, facts=facts, context_out=context)
    return {
        "facts": facts,
        "notes": parsed["notes"],
        "tagged": {
            "slots": {
                mid: {
                    "id": s["id"],
                    "value_text": s["value_text"],
                    "prior": (s.get("prior") or {}).get("value_text"),
                }
                for mid, s in slots.items()
            },
            "live": [[c.get("id"), c.get("metric_id"), c.get("confidence")] for c in live],
            "gaps": gaps,
            "context": [[c.get("id"), c.get("metric_id"), c.get("reason")] for c in context],
        },
    }


def main() -> int:
    job = json.loads(sys.stdin.read() or "{}")
    rules = load_rules()
    out = []
    for bundle in job.get("bundles") or []:
        claims = bundle.get("claims") or []
        row = snapshot(claims, rules)
        if bundle.get("xbrl"):
            row.update(tagged_snapshot(claims, rules, bundle["xbrl"]))
        row["id"] = bundle.get("id")
        out.append(row)
    json.dump({"bundles": out}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
