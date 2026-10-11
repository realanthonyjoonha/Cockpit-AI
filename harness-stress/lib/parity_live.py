#!/usr/bin/env python3
"""Stdin: {bundles:[{id, claims}]}. Stdout: the same bundles through the Python live picker."""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "ontology"))

from api.contextpack import (  # noqa: E402
    claim_gaps,
    classify_claim,
    live_claims,
    load_rules,
    parse_amounts,
    parse_as_of,
)


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


def main() -> int:
    job = json.loads(sys.stdin.read() or "{}")
    rules = load_rules()
    out = []
    for bundle in job.get("bundles") or []:
        row = snapshot(bundle.get("claims") or [], rules)
        row["id"] = bundle.get("id")
        out.append(row)
    json.dump({"bundles": out}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
