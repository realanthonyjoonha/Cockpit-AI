"""Long-form source catalog + open modes."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.sources import get_source, list_sources
from compile.run import write_pack


class TestSources(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = write_pack("MU")

    def test_catalog_nonempty(self):
        sources = list_sources("MU")
        self.assertGreaterEqual(len(sources), 3, "expected long research masters cataloged")
        for s in sources:
            self.assertTrue(s.get("path"))
            self.assertTrue(Path(s["path"]).is_file(), s.get("path"))
            self.assertGreater(s.get("n_lines") or 0, 10)
        # At least one true long master (>200 lines)
        self.assertTrue(
            any((s.get("n_lines") or 0) > 200 for s in sources),
            "expected at least one long master report",
        )

    def test_get_meta_outline(self):
        sources = list_sources("MU")
        sid = sources[0]["id"]
        meta = get_source("MU", sid, mode="meta")
        self.assertIn("outline", meta)
        self.assertTrue(meta["outline"])

    def test_search_inside_long_file(self):
        sources = list_sources("MU")
        # prefer a memory master if present
        sid = next(
            (s["id"] for s in sources if "earnings" in s["id"] or "ib" in s["id"] or "master" in s["id"]),
            sources[0]["id"],
        )
        result = get_source("MU", sid, mode="search", query="Micron")
        # may be zero if weird file; at least structure works
        self.assertIn("hits", result)
        self.assertIn("hit_count", result)

    def test_section_includes_nested_headings(self):
        """§2 Executive Summary must include body, not just the heading line."""
        result = get_source(
            "MU", "memory-report-ib-master", mode="section", section="Executive Summary"
        )
        text = result.get("text") or ""
        self.assertGreater(len(text), 200, "section body too short")
        self.assertRegex(text, r"Executive Summary")
        # nested content should appear (subheads or thesis language)
        self.assertTrue(
            "Claim" in text or "Profitability" in text or "thesis" in text.lower(),
            "expected nested section content",
        )

    def test_section_investment_thesis(self):
        result = get_source(
            "MU", "memory-report-ib-master", mode="section", section="Investment Thesis"
        )
        self.assertGreater(len(result.get("text") or ""), 300)

    def test_section_query_variants(self):
        """Query variants should still resolve (substring / § stripping)."""
        a = get_source("MU", "memory-report-ib-master", mode="section", section="§2")
        b = get_source("MU", "memory-report-ib-master", mode="section", section="Executive")
        self.assertGreater(len(a.get("text") or ""), 200)
        self.assertGreater(len(b.get("text") or ""), 200)

    def test_pack_has_sources_key(self):
        import json
        store = json.loads(self.pack.read_text(encoding="utf-8"))
        self.assertIn("sources", store)
        self.assertGreaterEqual(len(store["sources"]), 3)


if __name__ == "__main__":
    unittest.main()
