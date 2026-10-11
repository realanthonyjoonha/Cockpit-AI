"""Expand paraphrase-spec.json. Same steps as harness-stress/lib/paraphrase.mjs."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

SPEC_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "paraphrase-spec.json"


def load_spec() -> dict[str, Any]:
    return json.loads(SPEC_PATH.read_text(encoding="utf-8"))


def _wrapped(wrap: str, sector: str, text: str) -> str:
    return wrap.replace("{sector}", sector).replace("{text}", text)


def expand_paraphrases(spec: dict[str, Any]) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    sectors = spec.get("sectors") or []
    wrap = spec["wrap"]
    for group in spec.get("groups") or []:
        for i, text in enumerate(group.get("positive") or []):
            for s, sector in enumerate(sectors):
                cases.append({
                    "id": f"{group['id']}:p:{i}:{s}",
                    "kind": "classify",
                    "text": _wrapped(wrap, sector, text),
                    "metric": group["metric"],
                })
        for i, neg in enumerate(group.get("negative") or []):
            metric = neg.get("metric", None)
            for s, sector in enumerate(sectors):
                cases.append({
                    "id": f"{group['id']}:n:{i}:{s}",
                    "kind": "classify",
                    "text": _wrapped(wrap, sector, neg["text"]),
                    "metric": metric,
                })
    for row in spec.get("review") or []:
        cases.append(dict(row))
        if not row.get("across_sectors") or row.get("kind") == "date":
            continue
        for s, sector in enumerate(sectors):
            copy = dict(row)
            copy["id"] = f"{row['id']}:{s}"
            copy.pop("across_sectors", None)
            kind = row.get("kind")
            if kind in ("classify", "amounts", "concept"):
                copy["text"] = _wrapped(wrap, sector, row["text"])
            elif kind == "risk":
                copy["name"] = _wrapped(wrap, sector, row["name"])
            elif kind == "live":
                copy["claims"] = [
                    {**claim, "text": _wrapped(wrap, sector, claim["text"])}
                    for claim in row.get("claims") or []
                ]
            cases.append(copy)
    return cases


def expected_case_count(spec: dict[str, Any]) -> int:
    sectors = len(spec.get("sectors") or [])
    n = 0
    for group in spec.get("groups") or []:
        n += (len(group.get("positive") or []) + len(group.get("negative") or [])) * sectors
    for row in spec.get("review") or []:
        n += 1
        if row.get("across_sectors") and row.get("kind") != "date":
            n += sectors
    return n
