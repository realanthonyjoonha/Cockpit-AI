"""P0 live-claim correctness. DEMO repros and the ten-sector public-filing fixture."""
from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from api.contextpack import (  # noqa: E402
    claim_gaps,
    classify_claim,
    classify_metric,
    grade_weight,
    live_claims,
    load_rules,
    load_xbrl,
    parse_amounts,
    parse_as_of,
    stale_tripwires,
)

SECTORS = REPO / "harness-stress" / "fixtures" / "sectors.json"
PROFILE = [
    ("bank", "10-K", "us-gaap", "USD"),
    ("insurer", "10-K", "us-gaap", "USD"),
    ("reit", "10-K", "us-gaap", "USD"),
    ("utility", "10-K", "us-gaap", "USD"),
    ("biotech", "10-K", "us-gaap", "USD"),
    ("retail", "10-K", "us-gaap", "USD"),
    ("energy", "10-K", "us-gaap", "USD"),
    ("industrial", "10-K", "us-gaap", "USD"),
    ("software", "10-K", "us-gaap", "USD"),
    ("foreign private issuer", "20-F", "ifrs-full", "EUR"),
]
BANNED = [
    "h20", "h200", "nvda", "shaz", "data center", "china", "rvg", "blackwell",
    "micron", "nebius", "nvidia", "amazon", "microsoft", "azure", "hbm", "dram",
    "mu", "amzn", "msft", "nbis", "aapl", "meta", "tsla", "intc", "amd", "goog",
    "googl", "jpm", "avgo", "qcom",
]


def _close(a, b) -> bool:
    x, y = float(a), float(b)
    return abs(x - y) <= 1e-6 * max(1.0, abs(x), abs(y))


def _claim(cid, text, as_of, grade="A"):
    return {"id": cid, "text": text, "as_of": as_of, "grade": grade, "source_id": "fixture"}


class TestDates(unittest.TestCase):
    def test_accepted_forms(self):
        cases = {
            "2026-9-30": "2026-09-30",
            "2026-10-01": "2026-10-01",
            "2026-10-01T23:30:00-07:00": "2026-10-01",
            "2026-01-01T23:30:00-05:00": "2026-01-01",
            "September 30, 2026": "2026-09-30",
            "31 March 2026": "2026-03-31",
            "53 weeks ended January 28, 2026": "2026-01-28",
            "52 weeks ended August 29, 2026": "2026-08-29",
            "fiscal year ended 31 March 2026": "2026-03-31",
            "year ended December 31, 2025": "2025-12-31",
        }
        for raw, key in cases.items():
            parsed = parse_as_of(raw)
            self.assertEqual(parsed["sort_key"], key, raw)
            self.assertEqual(parsed["precision"], "day", raw)
            self.assertEqual(parsed["raw"], raw)

    def test_no_invented_month(self):
        for raw in ("FY2026", "fiscal 2026", "fiscal year 2026"):
            parsed = parse_as_of(raw)
            self.assertIsNone(parsed["sort_key"], raw)
            self.assertEqual(parsed["precision"], "fiscal_label", raw)
        self.assertEqual(parse_as_of("52 weeks ended August 29, 2026")["sort_key"], "2026-08-29")
        self.assertNotEqual(parse_as_of("53 weeks ended January 28, 2026")["sort_key"], "2026-01-31")

    def test_unpadded_october_beats_september(self):
        rules = load_rules()
        live, _ = live_claims([
            _claim("sep", "Net sales were $111 million", "2026-9-30"),
            _claim("oct", "Net sales were $222 million", "2026-10-01"),
        ], rules)
        self.assertEqual(live[0]["id"], "oct")

    def test_missing_grade_matches_c_and_keeps_earlier(self):
        self.assertEqual(grade_weight(None), 1)
        self.assertEqual(grade_weight(""), 1)
        self.assertEqual(grade_weight("C"), 1)
        rules = load_rules()
        live, _ = live_claims([
            _claim("bare", "Net sales were $10 million", "2026-08-01", ""),
            _claim("cee", "Net sales were $11 million", "2026-08-01", "C"),
        ], rules)
        self.assertEqual(live[0]["id"], "bare")
        tie, _ = live_claims([
            _claim("first", "Net sales were $10 million from the first filing", "2026-08-01"),
            _claim("second", "Net sales were $99 million from the second filing", "2026-08-01"),
        ], rules)
        self.assertEqual(tie[0]["id"], "first")


class TestAmounts(unittest.TestCase):
    def test_units(self):
        def one(text):
            rows = parse_amounts(text)
            self.assertEqual(len(rows), 1, text)
            return rows[0]

        cash = one("Cash was $222 million")
        self.assertEqual(cash["currency"], "USD")
        self.assertEqual(cash["scale"], "million")
        self.assertTrue(_close(cash["value"], 222_000_000))
        spaced = one("Unmatched spend was $ 12")
        self.assertEqual(spaced["value"], 12)
        self.assertIsNone(spaced["scale"])
        eur = one("Total revenues were € 1,200 in millions.")
        self.assertEqual(eur["currency"], "EUR")
        self.assertEqual(eur["scale"], "million")
        self.assertTrue(_close(eur["value"], 1_200_000_000))
        leaked = one("Figures in millions. Unmatched spend was $ 12.")
        self.assertEqual(leaked["value"], 12)
        pct = one("segment mix was 45 percent")
        self.assertEqual(pct["unit"], "percent")
        self.assertEqual(pct["value"], 45)
        self.assertEqual(one("segment mix was 45 pct")["unit"], "percent")
        self.assertEqual(parse_amounts("42.4 thousand employees"), [])
        self.assertEqual(parse_amounts("Production was 12 million barrels"), [])
        self.assertEqual(one("item $12 from sales")["value"], 12)
        self.assertEqual(one("$12m")["scale"], "million")
        self.assertEqual(parse_amounts("$12margin"), [])
        bps = one("spread was 50 basis points")
        self.assertEqual(bps["unit"], "bps")
        self.assertFalse(any(a["unit"] == "percent" for a in parse_amounts("spread was 50 basis points")))

    def test_currencies_are_not_converted(self):
        rules = load_rules()
        live = [{"metric_id": "cash", "text": "Cash was $10 million", "as_of": "2026-01-01", "id": "c"}]
        gaps: list[str] = []
        out = stale_tripwires(
            [{"id": "r", "name": "cash", "status": "WATCH", "tripwires": [{"state": "€10 million"}]}],
            live, rules, gaps=gaps,
        )
        self.assertEqual(out, [])
        self.assertIn("cross-currency tripwire; currencies not compared", gaps)
        gaps2: list[str] = []
        stale = stale_tripwires(
            [{"id": "r", "name": "cash", "status": "WATCH", "tripwires": [{"state": "$40 million"}]}],
            live, rules, gaps=gaps2,
        )
        self.assertEqual(len(stale), 1)
        self.assertEqual(gaps2, [])


class TestClassify(unittest.TestCase):
    def setUp(self):
        self.rules = load_rules()

    def test_demo_repros(self):
        r = self.rules
        self.assertEqual(classify_metric("Cash and cash equivalents were $90 million. See guidance.", r), "cash")
        self.assertEqual(classify_metric("Outlook for next quarter revenue is $100 million", r), "revenue_guide")
        self.assertEqual(classify_metric("Cash was $222 million", r), "cash")
        self.assertEqual(classify_metric("Inventory impairment of $9 million", r), "impairment")
        self.assertEqual(classify_metric("A goodwill balance of $5 billion", r), "goodwill")
        self.assertEqual(classify_metric("Goodwill impairment of $2 million", r), "goodwill_impairment")
        self.assertEqual(classify_metric("Number of employees was $4242 thousand", r), "headcount")
        self.assertEqual(classify_metric("The company has 3 operating segments.", r), "operating_segments")
        self.assertIsNone(classify_metric("CANARY-SEGMENTS the fixture reports exactly 3 segments", r))
        self.assertIsNone(classify_metric("FY2026 Data Center revenue was $193.7 billion", r))
        self.assertIsNone(classify_metric("The inventor was paid $1 million", r))
        self.assertEqual(classify_metric("42.4 thousand employees", r), "headcount")
        self.assertIsNone(classify_metric("Free cash flow was $10 million", r))
        self.assertIsNone(classify_metric("Deferred revenue was $4,050 million.", r))
        self.assertIsNone(classify_metric("Total deposits were $88,000 million.", r))
        self.assertEqual(classify_metric("Net sales were $12.4 billion", r), "company_revenue")

    def test_concept_beats_text(self):
        hit = classify_claim({
            "concept": "us-gaap:CashAndCashEquivalentsAtCarryingValue",
            "text": "Total revenues were $10 million.",
        }, self.rules)
        self.assertEqual(hit["metric_id"], "cash")
        self.assertEqual(hit["notes"], [])
        miss = classify_claim({
            "concept": "us-gaap:NotARealTag",
            "text": "Total revenues were $10 million.",
        }, self.rules)
        self.assertEqual(miss["metric_id"], "company_revenue")
        self.assertEqual(miss["notes"], ["unmapped_concept: us-gaap:NotARealTag"])

    def test_residual_omission_gap(self):
        claims = [
            _claim(f"r{i}", f"Unmatched item {i} cost ${i} million", f"2026-{i:02d}-01")
            for i in range(1, 13)
        ]
        gaps = claim_gaps(claims, self.rules)
        self.assertIn("4 unclassified numbered claims omitted", gaps)
        live, _ = live_claims(claims, self.rules)
        self.assertEqual(len([c for c in live if c["metric_id"] == "other"]), 8)


class TestSectors(unittest.TestCase):
    def test_fixture(self):
        data = json.loads(SECTORS.read_text(encoding="utf-8"))
        issuers = data["issuers"]
        self.assertEqual(len(issuers), 10)
        rules = load_rules()
        for i, issuer in enumerate(issuers):
            sector, form, reporting, currency = PROFILE[i]
            self.assertEqual(issuer["sector"], sector)
            self.assertEqual(issuer["form"], form)
            self.assertEqual(issuer["reporting"], reporting)
            self.assertEqual(issuer["currency"], currency)
            for phrase in issuer.get("forbid_phrases") or []:
                blob = " ".join(c["text"] for c in issuer["claims"])
                self.assertIsNone(re.search(rf"\b{re.escape(phrase)}\b", blob, re.I))
            live, _ = live_claims(issuer["claims"], rules)
            got = {c["id"]: c["metric_id"] for c in live}
            exp = {row["id"]: row["metric_id"] for row in issuer["live"]}
            self.assertEqual(got, exp, issuer["id"])
            for cid in issuer.get("absent") or []:
                self.assertNotIn(cid, got)
            self.assertEqual(claim_gaps(issuer["claims"], rules), issuer.get("gaps") or [], issuer["id"])
            for claim in issuer["claims"]:
                classified = classify_claim(claim, rules)
                self.assertEqual(classified["metric_id"], claim["classify"], f"{issuer['id']}/{claim['id']}")
                parsed = parse_as_of(claim["as_of"])
                self.assertEqual(parsed["sort_key"], claim["sort_key"], claim["id"])
                self.assertEqual(parsed["precision"], claim["precision"], claim["id"])
                self.assertEqual(parsed["raw"], claim["as_of"])
                amounts = parse_amounts(claim["text"])
                self.assertEqual(len(amounts), len(claim["units"]), claim["id"])
                for unit in claim["units"]:
                    self.assertTrue(any(
                        a["unit"] == unit["unit"]
                        and a["currency"] == unit["currency"]
                        and a["scale"] == unit["scale"]
                        and _close(a["value"], unit["value"])
                        for a in amounts
                    ), f"{issuer['id']}/{claim['id']} {amounts}")


class TestNoIssuerTokens(unittest.TestCase):
    def test_rules_and_xbrl(self):
        rules_text = (ROOT / "schema" / "contextpack_metrics.json").read_text(encoding="utf-8")
        xbrl_text = (ROOT / "schema" / "taxonomy_xbrl.json").read_text(encoding="utf-8")
        for label, text in (("metrics", rules_text), ("xbrl", xbrl_text)):
            for word in BANNED:
                self.assertIsNone(
                    re.search(rf"\b{re.escape(word)}\b", text, re.I),
                    f"{label} contains {word}",
                )
        rules = load_rules()
        needles = []
        for rule in rules["metrics"]:
            for key in ("any", "all", "none"):
                needles.extend(rule.get(key) or [])
            for group in rule.get("all_any") or []:
                needles.extend(group)
            if rule.get("regex"):
                needles.append(rule["regex"])
        needles.extend(row[0] for row in rules["risk_metric"])
        for needle in needles:
            self.assertIsNone(re.search(r"\bguid\b", needle, re.I), needle)
            self.assertIsNone(re.search(r"\binventor\b", needle, re.I), needle)
        ids = {rule["id"] for rule in rules["metrics"]}
        for tag, mid in (load_xbrl().get("tags") or {}).items():
            self.assertIn(mid, ids, tag)


if __name__ == "__main__":
    unittest.main()
