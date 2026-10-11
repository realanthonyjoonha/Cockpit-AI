"""Tagged XBRL facts own live numeric slots. Parser cases plus the review-comment sentences."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from api.contextpack import live_claims, load_rules, sentence_has_amount  # noqa: E402
from api.xbrl_facts import (  # noqa: E402
    fact_number,
    load_taxonomy,
    parse_xbrl_facts,
    shift_decimal,
    tagged_slots,
)

FIXTURES = REPO / "harness-stress" / "fixtures"
EXPECTED = json.loads((FIXTURES / "xbrl" / "expected.json").read_text(encoding="utf-8"))
REVIEW = json.loads((FIXTURES / "review-sentences.json").read_text(encoding="utf-8"))
FACT_SETS = {"us-gaap": ("industrial", "xbrl/industrial.htm"), "ifrs-full": ("fpi", "xbrl/fpi.htm")}

HEAD = (
    '<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance"'
    ' xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:iso4217="http://www.xbrl.org/2003/iso4217"'
    ' xmlns:{gaap}="http://fasb.org/us-gaap/2024" xmlns:ifrs-full="https://xbrl.ifrs.org/taxonomy/2024-03-27/ifrs-full"'
    ' xmlns:srt="http://fasb.org/srt/2024" xmlns:fix="http://example.com/fixture/2025"'
    ' xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12"'
    ' xmlns:ixt-sec="http://www.sec.gov/inlineXBRL/transformation/2015-08-31"'
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><body><ix:header><ix:resources>'
)
ENTITY = '<xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000900099</xbrli:identifier>{seg}</xbrli:entity>'


def ctx(cid: str, start: str | None, end: str, seg: str = "") -> str:
    period = (
        f"<xbrli:startDate>{start}</xbrli:startDate><xbrli:endDate>{end}</xbrli:endDate>"
        if start else f"<xbrli:instant>{end}</xbrli:instant>"
    )
    return f'<xbrli:context id="{cid}">{ENTITY.format(seg=seg)}<xbrli:period>{period}</xbrli:period></xbrli:context>'


UNITS = (
    '<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>'
    '<xbrli:unit id="eur"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>'
    '<xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>'
)
CTXS = (
    ctx("FY25", "2025-01-01", "2025-12-31")
    + ctx("FY24", "2024-01-01", "2024-12-31")
    + ctx("I25", None, "2025-12-31")
    + ctx("FY25svc", "2025-01-01", "2025-12-31",
          '<xbrli:segment><xbrldi:explicitMember dimension="srt:ProductOrServiceAxis">fix:ServiceMember</xbrldi:explicitMember></xbrli:segment>')
)


def doc(body: str, gaap: str = "us-gaap") -> str:
    return HEAD.format(gaap=gaap) + CTXS + UNITS + "</ix:resources></ix:header>" + body + "</body></html>"


def nf(name: str, context: str, text: str, unit: str = "usd", **attrs: str) -> str:
    extra = "".join(f' {k.replace("_", ":") if k == "xsi_nil" else k}="{v}"' for k, v in attrs.items())
    return f'<ix:nonFraction name="{name}" contextRef="{context}" unitRef="{unit}"{extra}>{text}</ix:nonFraction>'


def fixture_facts(rel: str) -> list[dict]:
    path = FIXTURES / rel
    return parse_xbrl_facts(path.read_text(encoding="utf-8"), source_id=path.name)["facts"]


def claim(cid: str, text: str, as_of: str) -> dict:
    return {"id": cid, "text": text, "as_of": as_of, "grade": "A", "source_id": "review"}


class TestParser(unittest.TestCase):
    def test_shift_decimal_is_string_exact(self):
        self.assertEqual(shift_decimal("1234.5", 6), "1234500000")
        self.assertEqual(shift_decimal("95.4", 6), "95400000")
        self.assertEqual(shift_decimal("12", -2), "0.12")
        self.assertEqual(shift_decimal("0.07", 3), "70")
        self.assertEqual(shift_decimal("-3", 3), "-3000")

    def test_formats(self):
        self.assertEqual(fact_number("1,234.5", "ixt:num-dot-decimal"), "1234.5")
        self.assertEqual(fact_number("1.234,5", "ixt:num-comma-decimal"), "1234.5")
        self.assertEqual(fact_number("95,4", "ixt:numcommadecimal"), "95.4")
        self.assertEqual(fact_number("\u2014", "ixt:fixed-zero"), "0")
        self.assertEqual(fact_number("-", "ixt:zerodash"), "0")
        self.assertEqual(fact_number("No", "ixt-sec:numwordsen"), "0")
        self.assertIsNone(fact_number("about nine", "ixt:num-dot-decimal"))

    def test_scale_sign_nil_duplicates(self):
        body = (
            nf("us-gaap:Revenues", "FY25", "9,000", scale="6", decimals="-6", format="ixt:num-dot-decimal")
            + nf("us-gaap:Revenues", "FY24", "8,400", scale="6", decimals="-6", format="ixt:num-dot-decimal")
            + nf("us-gaap:NetIncomeLoss", "FY25", "<span>120</span>", scale="6", decimals="-6", sign="-",
                 format="ixt:num-dot-decimal")
            + nf("us-gaap:Goodwill", "I25", "", xsi_nil="true")
            + nf("us-gaap:Revenues", "FY25", "9,000", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:CashAndCashEquivalentsAtCarryingValue", "I25", "500", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:CashAndCashEquivalentsAtCarryingValue", "I25", "501", scale="6", format="ixt:num-dot-decimal")
        )
        parsed = parse_xbrl_facts(doc(body))
        by = {(f["concept"], f["context_id"]): f for f in parsed["facts"]}
        self.assertEqual(by[("us-gaap:Revenues", "FY25")]["value_text"], "9000000000")
        self.assertEqual(by[("us-gaap:Revenues", "FY25")]["value"], 9000000000)
        self.assertEqual(by[("us-gaap:NetIncomeLoss", "FY25")]["value_text"], "-120000000")
        self.assertNotIn(("us-gaap:Goodwill", "I25"), by)
        self.assertEqual(len([f for f in parsed["facts"] if f["concept"] == "us-gaap:Revenues"]), 2)
        self.assertEqual(by[("us-gaap:CashAndCashEquivalentsAtCarryingValue", "I25")]["value_text"], "500000000")
        self.assertTrue(any("disagree" in n for n in parsed["notes"]), parsed["notes"])

    def test_prefix_resolves_by_namespace_uri(self):
        parsed = parse_xbrl_facts(doc(nf("gaap:Revenues", "FY25", "10", scale="6", format="ixt:num-dot-decimal"), gaap="gaap"))
        self.assertEqual(parsed["facts"][0]["concept"], "us-gaap:Revenues")
        self.assertEqual(tagged_slots(parsed["facts"])["company_revenue"]["value_text"], "10000000")

    def test_exclude_text_is_skipped(self):
        body = nf("us-gaap:Revenues", "FY25", '1<ix:exclude>,999</ix:exclude>0', scale="6", format="ixt:num-dot-decimal")
        self.assertEqual(parse_xbrl_facts(doc(body))["facts"][0]["value_text"], "10000000")

    def test_dimensional_facts_never_fill_a_slot(self):
        body = (
            nf("us-gaap:Revenues", "FY25svc", "2,200", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:Revenues", "FY24", "8,000", scale="6", format="ixt:num-dot-decimal")
        )
        facts = parse_xbrl_facts(doc(body))["facts"]
        self.assertTrue(any(f["dimensional"] for f in facts))
        slot = tagged_slots(facts)["company_revenue"]
        self.assertEqual(slot["value_text"], "8000000000")
        self.assertEqual(slot["as_of"], "2024-12-31")

    def test_plain_instance_document(self):
        inst = (
            '<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217"'
            ' xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full">'
            + ctx("FY", "2025-04-01", "2026-03-31") + UNITS
            + '<ifrs-full:Revenue contextRef="FY" unitRef="eur" decimals="-6">1200000000</ifrs-full:Revenue>'
            + "</xbrli:xbrl>"
        )
        slot = tagged_slots(parse_xbrl_facts(inst)["facts"])["company_revenue"]
        self.assertEqual((slot["concept"], slot["unit"], slot["value_text"]), ("ifrs-full:Revenue", "EUR", "1200000000"))

    def test_taxonomy_metrics_have_period_and_unit(self):
        for mid, spec in load_taxonomy()["metrics"].items():
            if not spec.get("concepts"):
                continue
            self.assertIn(spec.get("period"), ("duration", "instant"), mid)
            self.assertTrue(spec.get("unit"), mid)


class TestCompileLoader(unittest.TestCase):
    def test_local_filings_only_consolidated_mapped(self):
        import tempfile

        from compile.from_xbrl import load_filing_facts

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(load_filing_facts({}, root, "demo"), {"facts": [], "notes": [], "files": []})
            filings = root / "raw" / "demo-research" / "filings"
            filings.mkdir(parents=True)
            (filings / "a.htm").write_text((FIXTURES / "xbrl" / "industrial.htm").read_text(encoding="utf-8"), encoding="utf-8")
            (filings / "notes.htm").write_text("<html><body>No tagged facts here.</body></html>", encoding="utf-8")
            got = load_filing_facts({}, root, "demo")
            self.assertEqual(got["files"], ["raw/demo-research/filings/a.htm"])
            self.assertTrue(got["facts"])
            self.assertFalse(any(f["dimensional"] for f in got["facts"]))
            want = {
                mid: {**s, "source_id": "raw/demo-research/filings/a.htm"}
                for mid, s in tagged_slots(fixture_facts("xbrl/industrial.htm")).items()
            }
            self.assertEqual(tagged_slots(got["facts"]), want)
            only = load_filing_facts({"xbrl_globs": ["raw/demo-research/filings/notes.htm"]}, root, "demo")
            self.assertEqual(only["facts"], [])


class TestSectorFixtures(unittest.TestCase):
    def test_tagged_slots_match_expected(self):
        for issuer, want in EXPECTED.items():
            slots = tagged_slots(fixture_facts(f"xbrl/{issuer}.htm"))
            got = {
                mid: {
                    "concept": s["concept"],
                    "end": s["period"]["end"],
                    "value_text": s["value_text"],
                    "prior_value_text": (s.get("prior") or {}).get("value_text"),
                }
                for mid, s in slots.items()
            }
            self.assertEqual(got, want["slots"], issuer)

    def test_sectors_tagged_merge(self):
        rules = load_rules()
        data = json.loads((FIXTURES / "sectors.json").read_text(encoding="utf-8"))
        for issuer in data["issuers"]:
            facts = fixture_facts(issuer["xbrl"])
            gaps: list[str] = []
            context: list[dict] = []
            live, _ = live_claims(issuer["claims"], rules, gaps_out=gaps, facts=facts, context_out=context)
            t = issuer["tagged"]
            self.assertEqual(
                [{"id": c["id"], "metric_id": c["metric_id"], "confidence": c.get("confidence")} for c in live],
                t["live"], issuer["id"])
            self.assertEqual(gaps, t["gaps"], issuer["id"])
            self.assertEqual([{"id": c["id"], "metric_id": c["metric_id"], "reason": c["reason"]} for c in context],
                             t["context"], issuer["id"])
            sentence_ctx: list[dict] = []
            live_claims(issuer["claims"], rules, context_out=sentence_ctx)
            self.assertEqual([{"id": c["id"], "metric_id": c["metric_id"], "reason": c["reason"]} for c in sentence_ctx],
                             issuer.get("context") or [], issuer["id"])


class TestReviewSentences(unittest.TestCase):
    """Every review sentence and held-out case leaves tagged slots alone."""

    @classmethod
    def setUpClass(cls):
        cls.rules = load_rules()
        cls.facts = {tax: fixture_facts(rel) for tax, (_, rel) in FACT_SETS.items()}
        rows = (REVIEW.get("sentences") or []) + (REVIEW.get("held_out") or [])
        cls.claims = [claim(s["id"], s["text"], REVIEW["as_of"]) for s in rows]

    def check(self, tag: str, claims: list[dict], facts: list[dict]) -> None:
        slots = tagged_slots(facts)
        live, _ = live_claims(claims, self.rules, facts=facts)
        by: dict[str, dict] = {}
        for row in live:
            if row["metric_id"] == "other":
                continue
            self.assertNotIn(row["metric_id"], by, f"{tag} two rows for {row['metric_id']}")
            by[row["metric_id"]] = row
        for mid, slot in slots.items():
            row = by.get(mid) or {}
            self.assertEqual(
                (row.get("id"), row.get("value_text"), row.get("confidence")),
                (slot["id"], slot["value_text"], "tagged"),
                f"{tag} {mid}",
            )
        for row in by.values():
            if row.get("origin") == "xbrl":
                continue
            self.assertNotIn(row["metric_id"], slots, f"{tag} {row['id']}")
            self.assertEqual(row.get("confidence"), "low", f"{tag} {row['id']}")
            self.assertTrue(sentence_has_amount(row["metric_id"], row.get("text") or ""), f"{tag} {row['id']}")

    def test_fixture_not_empty(self):
        self.assertGreater(len(REVIEW["sentences"]), 0)
        self.assertGreater(len(REVIEW["held_out"]), 0)

    def test_each_sentence_alone(self):
        for tax, facts in self.facts.items():
            for c in self.claims:
                self.check(f"{tax}/{c['id']}", [c], facts)
        for c in self.claims:
            self.check(f"untagged/{c['id']}", [c], [])

    def test_all_sentences_together(self):
        for tax, facts in self.facts.items():
            self.check(f"{tax}/all", self.claims, facts)
        self.check("untagged/all", self.claims, [])

    def test_pairs(self):
        for pair in REVIEW["pairs"]:
            tax = pair.get("taxonomy") or "us-gaap"
            issuer = FACT_SETS[tax][0]
            want = EXPECTED[issuer]["slots"][pair["metric_id"]]
            claims = [claim("older", pair["older"]["text"], pair["older"]["as_of"]),
                      claim("newer", pair["newer"]["text"], pair["newer"]["as_of"])]
            live, _ = live_claims(claims, self.rules, facts=self.facts[tax])
            row = next(c for c in live if c["metric_id"] == pair["metric_id"])
            self.assertEqual((row.get("origin"), row.get("concept"), row.get("value_text")),
                             ("xbrl", want["concept"], want["value_text"]), pair["id"])
            bare, _ = live_claims(claims, self.rules)
            hit = next((c for c in bare if c["metric_id"] == pair["metric_id"]), None)
            if pair.get("sentence_only"):
                self.assertEqual((hit or {}).get("id"), pair["sentence_only"], pair["id"])
            else:
                self.assertIsNone(hit, pair["id"])
            if hit:
                self.assertEqual(hit.get("confidence"), "low", pair["id"])


class TestReviewerCases(unittest.TestCase):
    """Every case from the latest PR #5 review, both blockers and should-fixes."""

    def test_restatement_same_context_first_kept_in_one_doc(self):
        body = (
            nf("us-gaap:Revenues", "FY25", "10,000", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:Revenues", "FY25", "14,000", scale="6", format="ixt:num-dot-decimal")
        )
        parsed = parse_xbrl_facts(doc(body))
        self.assertEqual(tagged_slots(parsed["facts"])["company_revenue"]["value_text"], "10000000000")
        self.assertTrue(any("duplicate facts" in n for n in parsed["notes"]), parsed["notes"])

    def test_restatement_new_context_later_filed_wins(self):
        orig = parse_xbrl_facts(
            "<FILING-DATE>2026-02-01</FILING-DATE><ACCESSION-NUMBER>0000900001-26-000001</ACCESSION-NUMBER>"
            + doc(nf("us-gaap:Revenues", "FY25", "10,000", scale="6", format="ixt:num-dot-decimal")),
            source_id="10k.htm",
        )["facts"]
        amend = parse_xbrl_facts(
            "<FILING-DATE>2026-03-15</FILING-DATE><ACCESSION-NUMBER>0000900001-26-000010</ACCESSION-NUMBER>"
            + '<ix:nonNumeric name="dei:DocumentType" contextRef="FY25">10-K/A</ix:nonNumeric>'
            + doc(nf("us-gaap:Revenues", "FY25", "14,200", scale="6", format="ixt:num-dot-decimal")),
            source_id="10ka.htm",
            order_base=50,
        )["facts"]
        slot = tagged_slots(orig + amend)["company_revenue"]
        self.assertEqual(slot["value_text"], "14200000000")
        self.assertEqual(slot["filed"], "2026-03-15")
        self.assertEqual(slot["accession"], "0000900001-26-000010")
        self.assertTrue((slot.get("prior") or {}).get("restated"))
        self.assertEqual(slot["prior"]["value_text"], "10000000000")

    def test_restated_context_id_wins_same_file(self):
        extra = ctx("FY25_Restated", "2025-01-01", "2025-12-31")
        body = (
            nf("us-gaap:Revenues", "FY25", "10,000", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:Revenues", "FY25_Restated", "14,200", scale="6", format="ixt:num-dot-decimal")
        )
        html = HEAD.format(gaap="us-gaap") + CTXS + extra + UNITS + "</ix:resources></ix:header>" + body + "</body></html>"
        slot = tagged_slots(parse_xbrl_facts(html)["facts"])["company_revenue"]
        self.assertEqual(slot["value_text"], "14200000000")
        self.assertTrue(slot["prior"]["restated"])

    def test_same_file_new_contexts_later_order_wins(self):
        extra = ctx("FY25b", "2025-01-01", "2025-12-31")
        body = (
            nf("us-gaap:Revenues", "FY25", "10,000", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:Revenues", "FY25b", "14,200", scale="6", format="ixt:num-dot-decimal")
        )
        html = HEAD.format(gaap="us-gaap") + CTXS + extra + UNITS + "</ix:resources></ix:header>" + body + "</body></html>"
        slot = tagged_slots(parse_xbrl_facts(html)["facts"])["company_revenue"]
        self.assertEqual(slot["value_text"], "14200000000")
        self.assertEqual(slot["prior"]["value_text"], "10000000000")
        self.assertTrue(slot["prior"]["restated"])

    def test_amended_filename_wins_without_filed_date(self):
        orig = parse_xbrl_facts(
            doc(nf("us-gaap:Revenues", "FY25", "10,000", scale="6", format="ixt:num-dot-decimal")),
            source_id="10k.htm",
        )["facts"]
        amend = parse_xbrl_facts(
            doc(nf("us-gaap:Revenues", "FY25", "14,200", scale="6", format="ixt:num-dot-decimal")),
            source_id="10ka.htm",
            order_base=50,
        )["facts"]
        slot = tagged_slots(orig + amend)["company_revenue"]
        self.assertEqual(slot["value_text"], "14200000000")
        self.assertEqual(slot["source_id"], "10ka.htm")
        self.assertTrue(slot["prior"]["restated"])
        self.assertEqual(slot["prior"]["value_text"], "10000000000")

    def test_later_period_end_still_wins(self):
        body = (
            nf("us-gaap:Revenues", "FY24", "10,000", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:Revenues", "FY25", "15,000", scale="6", format="ixt:num-dot-decimal")
        )
        slot = tagged_slots(parse_xbrl_facts(doc(body))["facts"])["company_revenue"]
        self.assertEqual(slot["value_text"], "15000000000")
        self.assertEqual(slot["prior"]["value_text"], "10000000000")
        self.assertFalse(slot["prior"].get("restated"))

    def test_headline_sentences_never_fill(self):
        rules = load_rules()
        ctx_rows: list[dict] = []
        gaps: list[str] = []
        live, _ = live_claims([
            claim("total", "Total revenues were $48.2 billion.", "2025-12-31"),
            claim("svc", "Service revenue was $2.2 billion.", "2026-02-20"),
        ], rules, gaps_out=gaps, context_out=ctx_rows)
        self.assertFalse(any(c["metric_id"] == "company_revenue" for c in live))
        self.assertIn("company_revenue: no tagged fact; 2 candidate sentences in context", gaps)
        self.assertEqual({c["id"] for c in ctx_rows}, {"total", "svc"})
        gw, _ = live_claims([
            claim("bal", "Goodwill was $4.1 billion.", "2025-12-31"),
            claim("imp", "Goodwill related to the 2019 acquisition was impaired by $75 million.", "2026-01-20"),
        ], rules)
        self.assertFalse(any(c["metric_id"] in ("goodwill", "goodwill_impairment") for c in gw))

    def test_lowercase_member_is_dimensional(self):
        seg = (
            '<xbrli:context id="FY25low">' + ENTITY.format(
                seg='<xbrli:segment><xbrldi:explicitmember dimension="srt:ProductOrServiceAxis">fix:ServiceMember</xbrldi:explicitmember></xbrli:segment>'
            ) + "<xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>"
        )
        body = (
            nf("us-gaap:OperatingIncomeLoss", "FY25low", "7,000", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:OperatingIncomeLoss", "FY25", "11,000", scale="6", format="ixt:num-dot-decimal")
        )
        html = HEAD.format(gaap="us-gaap") + CTXS + seg + UNITS + "</ix:resources></ix:header>" + body + "</body></html>"
        facts = parse_xbrl_facts(html)["facts"]
        low = next(f for f in facts if f["context_id"] == "FY25low")
        self.assertTrue(low["dimensional"])
        self.assertEqual(tagged_slots(facts)["operating_income"]["value_text"], "11000000000")

    def test_pascal_member_alone_does_not_fill(self):
        seg = (
            '<xbrli:context id="FY25P">' + ENTITY.format(
                seg='<xbrli:segment><xbrldi:ExplicitMember dimension="srt:ProductOrServiceAxis">fix:NorthMember</xbrldi:ExplicitMember></xbrli:segment>'
            ) + "<xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>"
        )
        body = nf("us-gaap:NetIncomeLoss", "FY25P", "4,000", scale="6", format="ixt:num-dot-decimal")
        html = HEAD.format(gaap="us-gaap") + CTXS + seg + UNITS + "</ix:resources></ix:header>" + body + "</body></html>"
        self.assertNotIn("net_income", tagged_slots(parse_xbrl_facts(html)["facts"]))

    def test_duplicate_context_id_first_wins(self):
        seg = ctx("cDup", "2025-01-01", "2025-12-31",
                  '<xbrli:segment><xbrldi:explicitMember dimension="srt:ProductOrServiceAxis">fix:ServiceMember</xbrldi:explicitMember></xbrli:segment>')
        empty = ctx("cDup", "2025-01-01", "2025-12-31")
        body = nf("us-gaap:Revenues", "cDup", "777", scale="6", format="ixt:num-dot-decimal")
        html = HEAD.format(gaap="us-gaap") + seg + empty + UNITS + "</ix:resources></ix:header>" + body + "</body></html>"
        parsed = parse_xbrl_facts(html)
        self.assertTrue(parsed["facts"][0]["dimensional"])
        self.assertTrue(any("duplicate context" in n for n in parsed["notes"]))
        self.assertNotIn("company_revenue", tagged_slots(parsed["facts"]))

    def test_tenq_prefers_quarter_keeps_ytd(self):
        q = ctx("Q3", "2025-07-01", "2025-09-30")
        ytd = ctx("YTD", "2025-01-01", "2025-09-30")
        body = (
            nf("us-gaap:Revenues", "Q3", "2,200", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:SalesRevenueNet", "Q3", "2,100", scale="6", format="ixt:num-dot-decimal")
            + nf("us-gaap:Revenues", "YTD", "9,100", scale="6", format="ixt:num-dot-decimal")
        )
        html = HEAD.format(gaap="us-gaap") + q + ytd + UNITS + "</ix:resources></ix:header>" + body + "</body></html>"
        slot = tagged_slots(parse_xbrl_facts(html)["facts"])["company_revenue"]
        self.assertEqual(slot["value_text"], "2200000000")
        self.assertEqual((slot.get("ytd") or {}).get("value_text"), "9100000000")

    def test_plus_scale_and_sign_abs(self):
        body = (
            nf("us-gaap:LongTermDebtNoncurrent", "I25", "10", scale="+6")
            + nf("us-gaap:ResearchAndDevelopmentExpense", "FY25", "-88", scale="6", sign="-")
            + nf("us-gaap:OperatingIncomeLoss", "FY25", "88", scale="6", sign="-")
        )
        by = {f["concept"]: f for f in parse_xbrl_facts(doc(body))["facts"]}
        self.assertEqual(by["us-gaap:LongTermDebtNoncurrent"]["value_text"], "10000000")
        self.assertEqual(by["us-gaap:ResearchAndDevelopmentExpense"]["value_text"], "-88000000")
        self.assertEqual(by["us-gaap:OperatingIncomeLoss"]["value_text"], "-88000000")


if __name__ == "__main__":
    unittest.main()
