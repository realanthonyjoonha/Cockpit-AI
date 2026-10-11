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
    _risk_metric,
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
        self.assertEqual(classify_metric("FY2026 Data Center revenue was $193.7 billion", r), "company_revenue")
        self.assertIsNone(classify_metric("The inventor was paid $1 million", r))
        self.assertEqual(classify_metric("42.4 thousand employees", r), "headcount")
        self.assertIsNone(classify_metric("Free cash flow was $10 million", r))
        self.assertIsNone(classify_metric("Deferred revenue was $4,050 million.", r))
        self.assertIsNone(classify_metric("Total deposits were $88,000 million.", r))
        self.assertEqual(classify_metric("Net sales were $12.4 billion", r), "company_revenue")

    def test_review_sentences(self):
        """Every adversarial and proved-safe sentence from the PR #5 review."""
        r = self.rules
        pairs = [
            ("Impairment of intangible assets other than goodwill was $4 million.", "impairment"),
            ("Goodwill impairment was $4 million.", "goodwill_impairment"),
            ("Excluding goodwill, impairment of intangibles was $4 million.", "impairment"),
            ("Revenue was $10 billion.", "company_revenue"),
            ("Revenues were $10 billion.", "company_revenue"),
            ("Total net revenue was $10 billion.", "company_revenue"),
            ("Total revenue was $10 billion.", "company_revenue"),
            ("Net sales were $10 million. See guidance in Note 2.", "company_revenue"),
            ("The board sanctions the capital plan of $5 billion.", None),
            ("The company does indemnify customers for $5 million.", "guarantees"),
            ("The inventor was paid $1 million", None),
            ("The guid is stored in the filing.", None),
            ("The guidelines were updated.", None),
            ("Cash was $222 million. See guidance.", "cash"),
            ("Total deposits were $88,000 million.", None),
            ("Deferred revenue was $4,050 million.", None),
            ("Production was 12 million barrels of oil equivalent per day.", None),
            ("Funds from operations were $620 million.", None),
            ("Outlook for next quarter revenue is $100 million", "revenue_guide"),
            ("Operating activities may be affected by weather.", None),
            ("Net cash provided by operating activities may be affected by weather.", None),
            ("Net cash provided by operating activities was $500 million.", "operating_cash_flow"),
            ("Impairment of non-goodwill intangible assets was $4 million.", "impairment"),
            ("Impairment of intangible assets other than the goodwill was $4 million.", "impairment"),
            ("Impairment excluding the goodwill balance was $4 million.", "impairment"),
            ("Impairment of assets other than for goodwill was $4 million.", "impairment"),
            ("Unearned revenue was $40 million.", None),
            ("Interest revenue was $8 billion.", "interest_revenue"),
            ("Other revenue was $3 million.", None),
            ("See guidance: revenue of $12 billion.", "revenue_guide"),
            ("Revenue guidance is $12 billion.", "revenue_guide"),
            ("Cash flow from operating leases was $90 million.", None),
            ("Operating cash in the registers was $4 million.", None),
        ]
        for text, mid in pairs:
            self.assertEqual(classify_metric(text, r), mid, text)
        ni = parse_amounts("Net income was $12, or $0.12 per share, in millions except per share.")
        self.assertTrue(any(a["value"] == 12_000_000 and a["scale"] == "million" for a in ni), ni)
        self.assertTrue(any(a["unit"] == "currency" and a["value"] == 0.12 and a["scale"] is None for a in ni), ni)
        bps = parse_amounts("$12 bps")
        self.assertEqual(len(bps), 1)
        self.assertEqual(bps[0]["unit"], "bps")
        self.assertEqual(bps[0]["value"], 12)
        self.assertIsNone(bps[0]["currency"])
        self.assertEqual(parse_amounts("$12")[0]["unit"], "currency")
        lone = parse_amounts("in millions, except per share data, net income was $0.12.")
        self.assertEqual(len(lone), 1)
        self.assertEqual(lone[0]["value"], 0.12)
        self.assertIsNone(lone[0]["scale"])
        pair = parse_amounts(
            "In millions, except per share data, net income was $400 and diluted earnings per share were $1.25."
        )
        self.assertTrue(any(a["value"] == 400_000_000 and a["scale"] == "million" for a in pair), pair)
        self.assertTrue(any(a["value"] == 1.25 and a["scale"] is None for a in pair), pair)
        slash = parse_amounts("$0.12/share, in millions.")
        self.assertEqual(len(slash), 1)
        self.assertEqual(slash[0]["value"], 0.12)
        self.assertIsNone(slash[0]["scale"])
        for label in ("12 basis points", "€12 bps"):
            row = parse_amounts(label)
            self.assertEqual(len(row), 1, label)
            self.assertEqual(row[0]["unit"], "bps", label)
            self.assertEqual(row[0]["value"], 12, label)
            self.assertIsNone(row[0]["currency"], label)
        self.assertEqual(parse_as_of("2026-9-30")["sort_key"], "2026-09-30")
        self.assertEqual(parse_as_of("2026-10-01")["sort_key"], "2026-10-01")
        self.assertEqual(parse_as_of("53 weeks ended January 28, 2026")["sort_key"], "2026-01-28")
        self.assertEqual(parse_as_of("fiscal year ended 31 March 2026")["sort_key"], "2026-03-31")
        self.assertIsNone(parse_as_of("FY2026")["sort_key"])
        self.assertEqual(parse_as_of("FY2026")["precision"], "fiscal_label")
        self.assertEqual(parse_as_of("2026-10-01T23:30:00-10:00")["sort_key"], "2026-10-01")
        live, _ = live_claims([
            _claim("gw-real", "Goodwill impairment was $4 million.", "2024-06-01"),
            _claim("gw-other", "Impairment of intangible assets other than goodwill was $4 million.", "2026-06-01"),
        ], r)
        self.assertEqual({c["id"]: c["metric_id"] for c in live}, {
            "gw-real": "goodwill_impairment",
            "gw-other": "impairment",
        })
        ocf, _ = live_claims([
            _claim("ocf-2024", "Net cash provided by operating activities was $500 million.", "2024-12-31"),
            _claim("ocf-weather", "Operating activities may be affected by weather.", "2026-06-01"),
        ], r)
        self.assertEqual([c["id"] for c in ocf], ["ocf-2024"])
        kept, _ = live_claims([
            _claim("a", "Goodwill impairment was $9 million.", "2024-06-01"),
            _claim("b", "Impairment of non-goodwill intangible assets was $4 million.", "2026-12-01"),
        ], r)
        self.assertEqual({c["id"]: c["metric_id"] for c in kept}, {
            "a": "goodwill_impairment",
            "b": "impairment",
        })
        top, _ = live_claims([
            _claim("total", "Total revenue was $20 billion.", "2024-01-01"),
            _claim("unearned", "Unearned revenue was $40 million.", "2026-06-01"),
            _claim("interest", "Interest revenue was $8 billion.", "2026-02-01"),
        ], r)
        self.assertEqual({c["id"]: c["metric_id"] for c in top}, {
            "total": "company_revenue",
            "unearned": "other",
            "interest": "interest_revenue",
        })
        blank, _ = live_claims([
            _claim("bare", "Gross margin was 40 percent.", "2026-08-01", ""),
            _claim("cee", "Gross margin was 41 percent.", "2026-08-01", "C"),
        ], r)
        self.assertEqual(blank[0]["id"], "bare")
        self.assertEqual(grade_weight(""), 1)
        self.assertEqual(grade_weight("C"), 1)
        risks = [
            ("Operating margin pressure", None),
            ("Customer lawsuit", None),
            ("The board sanctions the capital plan", None),
            ("Gross margin", "gross_margin"),
            ("Gross margins", "gross_margin"),
            ("Customer concentration", "concentration"),
            ("Largest customer", "concentration"),
            ("Trade sanctions", "export_controls"),
            ("Indemnify", "guarantees"),
            ("Operating leverage in the software model", None),
            ("Water supply interruption", None),
            ("Regulatory commitment to the rate case", None),
            ("Bad debt on the card book", None),
            ("Crude exports", "export_controls"),
            ("Net interest margin compression", None),
        ]
        for name, mid in risks:
            self.assertEqual(_risk_metric(name, r), mid, name)

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
        for row in data.get("risk_metric") or []:
            self.assertEqual(_risk_metric(row["name"], rules), row["metric_id"], row["name"])


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
            needles.extend(rule.get("patterns") or [])
        needles.extend(row[0] for row in rules["risk_metric"])
        for needle in needles:
            self.assertIsNone(re.search(r"\bguid\b", needle, re.I), needle)
            self.assertIsNone(re.search(r"\binventor\b", needle, re.I), needle)
        ids = {rule["id"] for rule in rules["metrics"]}
        for mid in (load_xbrl().get("metrics") or {}):
            self.assertIn(mid, ids, mid)


if __name__ == "__main__":
    unittest.main()
