"""Companyfacts slots match trimmed SEC fixtures. Sentences never fill them."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from api.companyfacts import (  # noqa: E402
    headline_gaps,
    load_taxonomy,
    parse_companyfacts,
    structured_metric,
    tagged_slots,
    value_text,
)
from api.contextpack import live_claims, load_rules  # noqa: E402

FIXTURES = REPO / "harness-stress" / "fixtures" / "companyfacts"
REVIEW = REPO / "harness-stress" / "fixtures" / "review-sentences.json"


def load_index():
    return json.loads((FIXTURES / "index.json").read_text(encoding="utf-8"))


def load_pair(issuer_id: str):
    folder = FIXTURES / issuer_id
    doc = json.loads((folder / "companyfacts.json").read_text(encoding="utf-8"))
    expected = json.loads((folder / "expected.json").read_text(encoding="utf-8"))
    return doc, expected


class ValueText(unittest.TestCase):
    def test_int_and_eps(self):
        self.assertEqual(value_text(182447000000), "182447000000")
        self.assertEqual(value_text(20.02), "20.02")
        self.assertEqual(value_text(7.7), "7.7")
        self.assertEqual(value_text(-8.45), "-8.45")
        self.assertEqual(value_text(1), "1")


class FixturesMatchExpected(unittest.TestCase):
    def test_every_issuer_matches_expected(self):
        for row in load_index()["issuers"]:
            iid = row["id"]
            doc, expected = load_pair(iid)
            parsed = parse_companyfacts(doc, source_id=f"companyfacts/{iid}")
            slots = tagged_slots(parsed["facts"])
            for mid, want in expected["slots"].items():
                got = slots.get(mid)
                self.assertIsNotNone(got, f"{iid} missing {mid}")
                self.assertEqual(got["value_text"], want["value_text"], f"{iid} {mid} value")
                self.assertEqual(got["period"]["end"], want["end"], f"{iid} {mid} end")
                self.assertEqual(got["concept"], want["concept"], f"{iid} {mid} concept")
                self.assertEqual(got.get("form"), want.get("form"), f"{iid} {mid} form")
                self.assertEqual(got.get("filed"), want.get("filed"), f"{iid} {mid} filed")
                self.assertEqual(got["unit"], want["unit"], f"{iid} {mid} unit")
                if want.get("ytd"):
                    self.assertIsNotNone(got.get("ytd"), f"{iid} {mid} ytd missing")
                    self.assertEqual(got["ytd"]["value_text"], want["ytd"]["value_text"], f"{iid} {mid} ytd")
                else:
                    self.assertIsNone(got.get("ytd"), f"{iid} {mid} unexpected ytd")
                if want.get("prior"):
                    self.assertTrue(got.get("prior") and got["prior"].get("restated"), f"{iid} {mid} prior")
                    self.assertEqual(got["prior"]["value_text"], want["prior"]["value_text"], f"{iid} {mid} prior val")
            for mid in expected.get("empty") or []:
                self.assertNotIn(mid, slots, f"{iid} {mid} should be empty")

    def test_restatement_later_filed_wins(self):
        doc, expected = load_pair("restate")
        slot = tagged_slots(parse_companyfacts(doc)["facts"])["company_revenue"]
        self.assertEqual(slot["value_text"], "29520000000")
        self.assertEqual(slot["prior"]["value_text"], "30871000000")
        self.assertTrue(slot["filed"] > slot["prior"]["filed"] or slot["filed"] >= "2024-02-29")

    def test_qtd_prefers_quarter(self):
        doc, expected = load_pair("qtd")
        slot = tagged_slots(parse_companyfacts(doc)["facts"])["company_revenue"]
        self.assertEqual(slot["value_text"], expected["slots"]["company_revenue"]["value_text"])
        self.assertEqual(slot["ytd"]["value_text"], "51982000000")
        start, end = slot["period"]["start"], slot["period"]["end"]
        from datetime import date
        days = (date.fromisoformat(end) - date.fromisoformat(start)).days
        self.assertTrue(70 <= days <= 110, days)

    def test_fpi_ifrs_eur(self):
        doc, expected = load_pair("fpi")
        slot = tagged_slots(parse_companyfacts(doc)["facts"])["company_revenue"]
        self.assertEqual(slot["concept"], "ifrs-full:Revenue")
        self.assertEqual(slot["unit"], "EUR")
        self.assertEqual(slot["value_text"], "36800000000")

    def test_parse_never_uses_https(self):
        import api.companyfacts as mod
        src = Path(mod.__file__).read_text(encoding="utf-8")
        self.assertNotIn("urllib", src)
        self.assertNotIn("http.client", src)
        self.assertNotIn("requests", src)


class ReviewSentencesNeverFill(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = load_rules()
        cls.tax = load_taxonomy()
        review = json.loads(REVIEW.read_text(encoding="utf-8"))
        cls.rows = [
            {"id": s["id"], "text": s["text"], "as_of": review["as_of"], "grade": "A", "source_id": "review"}
            for s in list(review.get("sentences") or []) + list(review.get("held_out") or [])
        ]
        cls.fact_sets = {}
        for iid in ("industrial", "fpi"):
            doc, _ = load_pair(iid)
            cls.fact_sets[iid] = parse_companyfacts(doc)["facts"]

    def _check(self, tag, claims, facts):
        slots = tagged_slots(facts)
        live, _ = live_claims(claims, self.rules, facts=facts)
        by = {c["metric_id"]: c for c in live if c.get("metric_id") != "other"}
        for mid, slot in slots.items():
            row = by.get(mid)
            self.assertIsNotNone(row, f"{tag} lost {mid}")
            self.assertEqual(row.get("value_text"), slot["value_text"], f"{tag} {mid}")
            self.assertEqual(row.get("origin"), "companyfacts", f"{tag} {mid} origin")
        for row in by.values():
            if structured_metric(row["metric_id"], self.tax):
                self.assertNotEqual(row.get("origin"), "sentence", f"{tag} sentence filled {row['metric_id']}")

    def test_each_review_sentence_alone_and_together(self):
        for tax, facts in self.fact_sets.items():
            for c in self.rows:
                self._check(f"{tax}/{c['id']}", [c], facts)
            self._check(f"{tax}/all", self.rows, facts)
        for c in self.rows:
            live, _ = live_claims([c], self.rules, facts=[])
            for row in live:
                if structured_metric(row.get("metric_id") or "", self.tax):
                    self.fail(f"untagged {c['id']} filled {row['metric_id']}")

    def test_unreadable_doc(self):
        parsed = parse_companyfacts("not-json")
        self.assertEqual(parsed["facts"], [])
        self.assertTrue(any("unreadable" in n for n in parsed["notes"]))


if __name__ == "__main__":
    unittest.main()
