"""Property cases: paraphrases and negations for every metric, across ten sectors.

The expander matches harness-stress/lib/paraphrase.mjs. Review rows are the
verbatim sentences from both PR #5 review comments.
"""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO / "harness-stress" / "lib"))

from api.contextpack import (  # noqa: E402
    _risk_metric,
    classify_claim,
    classify_metric,
    live_claims,
    load_rules,
    parse_amounts,
    parse_as_of,
)
from paraphrase_expand import expand_paraphrases, expected_case_count, load_spec  # noqa: E402


def _close(a, b) -> bool:
    x = float(a)
    y = float(b)
    return abs(x - y) <= 1e-6 * max(1.0, abs(x), abs(y))


def _same_amount(got: dict, exp: dict) -> bool:
    return (
        got.get("unit") == exp.get("unit")
        and (got.get("currency") or None) == (exp.get("currency") or None)
        and (got.get("scale") or None) == (exp.get("scale") or None)
        and _close(got.get("value"), exp.get("value"))
    )


def _check_one(row: dict, rules: dict) -> str | None:
    kind = row.get("kind")
    if kind == "classify" or (kind == "amounts" and "metric" in row):
        got = classify_metric(row.get("text") or "", rules)
        if got != row.get("metric"):
            return f"classify {got} != {row.get('metric')}"
    if kind == "amounts":
        got = parse_amounts(row.get("text") or "")
        exp = row.get("amounts") or []
        if len(got) != len(exp):
            return f"amounts {len(got)} != {len(exp)} {got}"
        for g, e in zip(got, exp):
            if not _same_amount(g, e):
                return f"amount {g} != {e}"
    if kind == "risk":
        got = _risk_metric(row.get("name") or "", rules)
        if got != row.get("metric"):
            return f"risk {got} != {row.get('metric')}"
    if kind == "concept":
        got = classify_claim({"concept": row.get("concept"), "text": row.get("text") or ""}, rules)
        if got.get("metric_id") != row.get("metric"):
            return f"concept {got.get('metric_id')} != {row.get('metric')}"
    if kind == "live":
        live, _ = live_claims(row.get("claims") or [], rules)
        got = {c["id"]: c["metric_id"] for c in live}
        exp = row.get("live") or {}
        if got != exp:
            return f"live {got} != {exp}"
        for cid in row.get("absent") or []:
            if cid in got:
                return f"absent {cid} is live"
        if row.get("winner") and (not live or live[0]["id"] != row["winner"]):
            found = live[0]["id"] if live else None
            return f"winner {found} != {row.get('winner')}"
    if kind == "date":
        parsed = parse_as_of(row.get("text") or "")
        if parsed.get("sort_key") != row.get("sort_key") or parsed.get("precision") != row.get("precision"):
            return f"date {parsed.get('sort_key')}/{parsed.get('precision')} != {row.get('sort_key')}/{row.get('precision')}"
    return None


class TestParaphraseProperty(unittest.TestCase):
    def test_property(self):
        spec = load_spec()
        cases = expand_paraphrases(spec)
        rules = load_rules()
        covered = {group["metric"] for group in spec["groups"]}
        missing_metrics = [rule["id"] for rule in rules["metrics"] if rule["id"] not in covered]
        self.assertEqual(missing_metrics, [])
        for group in spec["groups"]:
            self.assertTrue(group["positive"], group["id"])
            self.assertTrue(group["negative"], group["id"])
        self.assertEqual(len(cases), expected_case_count(spec))
        texts = set()
        names = set()
        for row in cases:
            if row.get("text"):
                texts.add(row["text"])
            if row.get("name"):
                names.add(row["name"])
            for claim in row.get("claims") or []:
                if claim.get("text"):
                    texts.add(claim["text"])
        missing_sentences = [
            sentence for sentence in spec["must_include"]
            if sentence not in texts and sentence not in names
        ]
        self.assertEqual(missing_sentences, [])
        failed = []
        for row in cases:
            err = _check_one(row, rules)
            if err:
                failed.append(f"{row['id']}: {err}")
        passed = len(cases) - len(failed)
        rate = 100.0 * passed / len(cases) if cases else 0
        print(f"paraphrase cases={len(cases)} passed={passed} rate={rate:.0f}%")
        self.assertEqual(failed, [], "\n".join(failed[:20]))

    def test_js_expander_matches(self):
        spec_path = REPO / "harness-stress" / "fixtures" / "paraphrase-spec.json"
        js_path = REPO / "harness-stress" / "lib" / "paraphrase.mjs"
        script = (
            "import { expandParaphrases } from "
            + json.dumps(str(js_path))
            + ";\nimport { readFileSync } from 'node:fs';\nconst spec = JSON.parse(readFileSync("
            + json.dumps(str(spec_path))
            + ", 'utf8'));\nprocess.stdout.write(JSON.stringify(expandParaphrases(spec)));\n"
        )
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        js_cases = json.loads(proc.stdout)
        py_cases = expand_paraphrases(load_spec())
        self.assertEqual(js_cases, py_cases)
        self.assertGreater(len(py_cases), 1000)
