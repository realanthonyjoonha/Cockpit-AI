"""Mechanical gates — not a substitute for Anthony using retrieve on real questions."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import paths
from api.retrieve import retrieve, resolve_ticker, to_markdown
from compile.run import compile_focus, write_pack

REQUIRED_TOP = {
    "focus",
    "compiled_at",
    "house_prior",
    "object",
    "claims",
    "risks",
    "series_snapshot",
    "catalysts",
    "gaps",
    "provenance",
}


class TestCompileAndRetrieve(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack_path = write_pack("MU")
        cls.store = json.loads(cls.pack_path.read_text(encoding="utf-8"))

    def test_store_file_exists(self):
        self.assertTrue(self.pack_path.exists())

    def test_required_top_level_keys(self):
        missing = REQUIRED_TOP - set(self.store.keys())
        self.assertFalse(missing, f"missing keys: {missing}")

    def test_focus_identity(self):
        f = self.store["focus"]
        self.assertEqual(f.get("ticker"), "MU")
        self.assertEqual(f.get("id"), "micron")

    def test_claims_min_count_and_discipline(self):
        claims = self.store.get("claims") or []
        self.assertGreaterEqual(len(claims), 8, "expected ≥8 graded claims from entity")
        for c in claims:
            self.assertIn(c.get("grade"), ("A", "B", "C"), c)
            self.assertRegex(c.get("as_of") or "", r"^\d{4}-\d{2}-\d{2}$")
            self.assertTrue(c.get("source_id"))
            self.assertTrue(c.get("text"))
            self.assertEqual(c.get("about_id"), "micron")

    def test_house_prior_present(self):
        hp = self.store.get("house_prior")
        self.assertIsInstance(hp, dict)
        self.assertIn("play", hp)
        self.assertEqual(hp.get("status"), "CONFIRMED")
        self.assertTrue(hp.get("view_excerpt"))

    def test_gaps_is_list(self):
        self.assertIsInstance(self.store.get("gaps"), list)

    def test_risks_loaded(self):
        risks = self.store.get("risks") or []
        self.assertGreaterEqual(len(risks), 3)
        statuses = {r.get("status") for r in risks}
        # positioning-unwind should be WATCH in vault
        names = " ".join(r.get("id", "") for r in risks)
        self.assertIn("positioning-unwind", names)

    def test_series_price_mu(self):
        series = {s["id"]: s for s in self.store.get("series_snapshot") or []}
        self.assertIn("price-mu", series)
        self.assertIsNotNone(series["price-mu"].get("latest"))
        self.assertTrue(series["price-mu"].get("as_of"))

    def test_retrieve_overview_budget(self):
        pack = retrieve("MU", "overview")
        raw = json.dumps(pack, ensure_ascii=False)
        self.assertLessEqual(len(raw), paths.OVERVIEW_BUDGET_CHARS)
        self.assertIn("gaps", pack)
        self.assertEqual(pack.get("intent"), "overview")
        self.assertTrue(pack.get("claims"))

    def test_retrieve_aliases(self):
        self.assertEqual(resolve_ticker("micron"), "MU")
        self.assertEqual(resolve_ticker("mu"), "MU")
        p = retrieve("micron", "risks")
        self.assertEqual(p.get("intent"), "risks")
        self.assertTrue(p.get("risks"))

    def test_retrieve_markdown_usable(self):
        md = to_markdown(retrieve("MU", "overview"))
        self.assertIn("House prior", md)
        self.assertIn("Claims", md)
        self.assertIn("Gaps", md)
        self.assertIn("Decision-support only", md)

    def test_no_advice_language_in_pack_fields(self):
        """Pack content should not inject buy/sell recommendations (structural check)."""
        blob = json.dumps(self.store).lower()
        # Allow words inside normal English only as false positives risk —
        # we check we didn't add an advice block key.
        self.assertNotIn('"recommendation"', blob)
        self.assertNotIn('"price_target"', blob)
        self.assertNotIn('"position_size"', blob)

    def test_gold_fixture_if_present(self):
        gold_path = paths.FIXTURES / "MU.overview.gold.json"
        if not gold_path.exists():
            self.skipTest("gold fixture not yet curated")
        gold = json.loads(gold_path.read_text(encoding="utf-8"))
        for key in ("focus", "claims", "gaps"):
            self.assertIn(key, gold)
        self.assertGreaterEqual(len(gold.get("claims") or []), 8)


class TestQuestionsFixture(unittest.TestCase):
    def test_ten_questions(self):
        path = paths.FIXTURES / "MU.questions.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(len(data.get("questions") or []), 10)
        refuse = [q for q in data["questions"] if q.get("must_refuse_hints")]
        self.assertTrue(refuse, "need at least one refusal-style question")


if __name__ == "__main__":
    unittest.main()
