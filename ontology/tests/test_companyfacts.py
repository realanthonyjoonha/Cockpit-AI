"""V2 companyfacts: properties, constructed documents, sentences never fill.

No frozen live issuer dollars. No ranking leftovers. Values in constructed
documents stay local to those files.
"""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from api.companyfacts import (  # noqa: E402
    agree,
    headline_gaps,
    latest_accession,
    latest_filing_slots,
    load_taxonomy,
    parse_companyfacts,
    structured_metric,
    tagged_slots,
    value_text,
)
from api.contextpack import live_claims, load_rules  # noqa: E402

FIXTURES = REPO / "harness-stress" / "fixtures" / "companyfacts"
REVIEW = REPO / "harness-stress" / "fixtures" / "review-sentences.json"
CONSTRUCTED = ("unique", "two-periods", "same-period-disagree", "none")


def load_index():
    return json.loads((FIXTURES / "index.json").read_text(encoding="utf-8"))


def load_doc(issuer_id: str):
    return json.loads((FIXTURES / issuer_id / "companyfacts.json").read_text(encoding="utf-8"))


def parse_id(issuer_id: str):
    return parse_companyfacts(load_doc(issuer_id), source_id=f"companyfacts/{issuer_id}")


def slot_properties(facts, slots, gaps):
    errors = []
    accn = latest_accession(facts)
    for mid, slot in (slots or {}).items():
        if slot.get("ytd") or slot.get("prior"):
            errors.append(f"{mid} has ranking sidecar")
        values = slot.get("values") or []
        if slot.get("value_text") is not None and len(values) != 1:
            errors.append(f"{mid} value_text set with {len(values)} periods")
        if slot.get("value_text") is None and len(values) == 1:
            errors.append(f"{mid} value_text null with one period")
        if slot.get("accession") != accn:
            errors.append(f"{mid} accession {slot.get('accession')} != latest {accn}")
        for val in values:
            if val.get("accession") != accn:
                errors.append(f"{mid} shown period not latest filing")
            matches = [
                f for f in facts
                if f.get("value_text") == val.get("value_text")
                and f.get("unit") == val.get("unit")
                and (f.get("period") or {}).get("start") == (val.get("period") or {}).get("start")
                and (f.get("period") or {}).get("end") == (val.get("period") or {}).get("end")
                and f.get("form") == val.get("form")
                and f.get("filed") == val.get("filed")
                and f.get("accession") == val.get("accession")
                and (f.get("concept") == val.get("concept") or f.get("concept") in (val.get("tags") or []))
            ]
            if not matches:
                errors.append(f"{mid} shown value is not a tagged fact")
            for other in matches:
                if not agree(val, other):
                    errors.append(f"{mid} invented a value")
    return errors


class ValueText(unittest.TestCase):
    def test_canonical_decimal(self):
        self.assertEqual(value_text(1), "1")
        self.assertEqual(value_text(20.02), "20.02")
        self.assertEqual(value_text(7.7), "7.7")
        self.assertEqual(value_text(-8.45), "-8.45")
        self.assertNotIn("e", value_text(1e-7) or "")
        self.assertNotIn("E", value_text(1e-7) or "")


class TaxonomyTotalsOnly(unittest.TestCase):
    def test_no_kind_fallback_stale_or_lease(self):
        tax = load_taxonomy()
        blob = json.dumps(tax)
        self.assertNotIn('"kind"', blob)
        self.assertNotIn("stale_days", blob)
        for spec in (tax.get("metrics") or {}).values():
            self.assertNotIn("fallback", spec)
            self.assertNotIn("kind", spec)
            self.assertNotIn("selection", spec)
        listed = tax["metrics"]["company_revenue"].get("concepts") or []
        self.assertNotIn("us-gaap:OperatingLeaseLeaseIncome", listed)
        self.assertIn("true-total", (tax.get("comment") or "").lower())


class ParseOffline(unittest.TestCase):
    def test_parse_never_uses_https(self):
        src = Path(__file__).resolve().parents[1].joinpath("api", "companyfacts.py").read_text(encoding="utf-8")
        self.assertNotIn("urllib", src)
        self.assertNotIn("http.client", src)
        self.assertNotIn("requests", src)
        self.assertNotIn("companyfacts_fetch", src)

    def test_unreadable_doc(self):
        parsed = parse_companyfacts("not-json")
        self.assertEqual(parsed["facts"], [])
        self.assertTrue(any("unreadable" in n for n in parsed["notes"]))


class ConstructedDocuments(unittest.TestCase):
    def test_unique(self):
        parsed = parse_id("unique")
        slots, gaps = latest_filing_slots(parsed["facts"])
        rev = slots["company_revenue"]
        self.assertEqual(len(rev["values"]), 1)
        self.assertEqual(rev["value_text"], rev["values"][0]["value_text"])
        self.assertIsNotNone(rev["value_text"])
        self.assertIn("form", rev["text"])
        self.assertFalse(any("disagreeing tagged facts" in g for g in gaps if g.startswith("company_revenue")))
        self.assertEqual(slot_properties(parsed["facts"], slots, gaps), [])

    def test_two_periods(self):
        parsed = parse_id("two-periods")
        slots, gaps = latest_filing_slots(parsed["facts"])
        rev = slots["company_revenue"]
        self.assertEqual(len(rev["values"]), 2)
        self.assertIsNone(rev["value_text"])
        starts = {(v["period"].get("start"), v["period"].get("end")) for v in rev["values"]}
        self.assertEqual(len(starts), 2)
        self.assertFalse(any("disagreeing tagged facts" in g for g in gaps))
        self.assertEqual(slot_properties(parsed["facts"], slots, gaps), [])

    def test_same_period_disagree(self):
        parsed = parse_id("same-period-disagree")
        slots, gaps = latest_filing_slots(parsed["facts"])
        self.assertNotIn("company_revenue", slots)
        joined = "\n".join(gaps)
        self.assertIn("disagreeing tagged facts", joined)
        self.assertIn("us-gaap:Revenues", joined)
        self.assertIn("us-gaap:RevenuesNetOfInterestExpense", joined)
        self.assertEqual(slot_properties(parsed["facts"], slots, gaps), [])

    def test_none(self):
        parsed = parse_id("none")
        slots, gaps = latest_filing_slots(parsed["facts"])
        accn = latest_accession(parsed["facts"])
        self.assertNotIn("company_revenue", slots)
        self.assertIn(f"company_revenue: not reported in latest filing {accn}", gaps)
        self.assertIn("cash", slots)
        self.assertEqual(slot_properties(parsed["facts"], slots, gaps), [])


class PropertiesOnCachedExtracts(unittest.TestCase):
    def test_every_issuer_obeys_properties(self):
        for row in load_index()["issuers"]:
            parsed = parse_id(row["id"])
            slots, gaps = latest_filing_slots(parsed["facts"])
            errs = slot_properties(parsed["facts"], slots, gaps)
            self.assertEqual(errs, [], f"{row['id']}: {errs}")

    def test_constructed_ids_present(self):
        ids = {row["id"] for row in load_index()["issuers"]}
        for name in CONSTRUCTED:
            self.assertIn(name, ids)


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
            cls.fact_sets[iid] = parse_id(iid)["facts"]

    def _check(self, tag, claims, facts):
        slots = tagged_slots(facts)
        live, _ = live_claims(claims, self.rules, facts=facts)
        by = {c["metric_id"]: c for c in live if c.get("metric_id") != "other"}
        for mid, slot in slots.items():
            row = by.get(mid)
            self.assertIsNotNone(row, f"{tag} lost {mid}")
            self.assertEqual(row.get("value_text"), slot["value_text"], f"{tag} {mid}")
            self.assertEqual(row.get("origin"), "companyfacts", f"{tag} {mid} origin")
            self.assertEqual(len(row.get("values") or []), len(slot.get("values") or []))
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

    def test_long_term_debt_alias_uses_total_debt_gap(self):
        from api.companyfacts import canonical_metric
        self.assertEqual(canonical_metric("long_term_debt"), "total_debt")
        gaps = headline_gaps({})
        self.assertTrue(any(g.startswith("total_debt: not reported in latest filing") for g in gaps))
        self.assertFalse(any(g.startswith("long_term_debt:") for g in gaps))
        gout = []
        live, _ = live_claims(
            [{"id": "d", "text": "Long-term debt was $5 billion.", "as_of": "2025-12-31", "grade": "A"}],
            self.rules,
            facts=[],
            gaps_out=gout,
        )
        self.assertFalse(any(r.get("metric_id") == "long_term_debt" for r in live))
        self.assertIn("total_debt: not reported in structured data", gout)


@unittest.skipUnless(
    os.environ.get("COCKPIT_LIVE_COMPANYFACTS") == "1" and (os.environ.get("SEC_USER_AGENT") or os.environ.get("COCKPIT_SEC_UA")),
    "opt-in live SEC refresh",
)
class LiveRefreshProperties(unittest.TestCase):
    def test_live_bytes_are_deterministic_and_obey_properties(self):
        from api.companyfacts_fetch import DEFAULT_URL, pad_cik, user_agent, _default_get, _rate_wait
        import time

        ciks = []
        for row in load_index()["issuers"]:
            if row.get("kind") != "extract":
                continue
            doc = load_doc(row["id"])
            if doc.get("cik") is not None:
                ciks.append(str(doc["cik"]))
            if len(ciks) >= 2:
                break
        self.assertTrue(ciks)
        ua = user_agent()
        for cik in ciks:
            _rate_wait(time.sleep)
            status, body = _default_get(DEFAULT_URL.format(cik=pad_cik(cik)), {"User-Agent": ua, "Accept": "application/json"}, 30)
            self.assertEqual(status, 200, f"live fetch {cik} HTTP {status}")
            doc = json.loads(body.decode("utf-8"))
            first = latest_filing_slots(parse_companyfacts(doc)["facts"])
            second = latest_filing_slots(parse_companyfacts(doc)["facts"])
            self.assertEqual(first[0].keys(), second[0].keys())
            for mid in first[0]:
                a = [(v["value_text"], v["period"], v["accession"], v["concept"]) for v in first[0][mid]["values"]]
                b = [(v["value_text"], v["period"], v["accession"], v["concept"]) for v in second[0][mid]["values"]]
                self.assertEqual(a, b, mid)
            self.assertEqual(first[1], second[1])
            facts = parse_companyfacts(doc)["facts"]
            self.assertEqual(slot_properties(facts, first[0], first[1]), [])


if __name__ == "__main__":
    unittest.main()
