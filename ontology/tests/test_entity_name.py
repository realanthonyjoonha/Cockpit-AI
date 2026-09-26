"""Entity title comes from the heading, not the filename. No ticker is special."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from compile.from_wiki import parse_entity  # noqa: E402


def _write(dirpath: Path, stem: str, body: str) -> Path:
    path = dirpath / f"{stem}.md"
    path.write_text(body, encoding="utf-8")
    return path


class TestEntityName(unittest.TestCase):
    def test_h1_beats_filename_slug(self):
        with tempfile.TemporaryDirectory() as d:
            path = _write(
                Path(d),
                "nwd",
                "# Northwind Holdings (NWD)\n\n## Key facts\n\n- A fact (2026-01-01) [A] [[nwd-src]]\n",
            )
            company = parse_entity(path)["company"]
            self.assertEqual(company["id"], "nwd")
            self.assertEqual(company["name"], "Northwind Holdings")

    def test_frontmatter_beats_h1(self):
        with tempfile.TemporaryDirectory() as d:
            path = _write(
                Path(d),
                "acme",
                "---\nname: Acme Widgets\nticker: ACME\n---\n\n# Other Name (ACME)\n",
            )
            self.assertEqual(parse_entity(path)["company"]["name"], "Acme Widgets")

    def test_ticker_only_heading_stays_slug(self):
        with tempfile.TemporaryDirectory() as d:
            path = _write(Path(d), "zz", "# ZZ\n")
            self.assertEqual(parse_entity(path)["company"]["name"], "zz")

    def test_second_ticker_same_rule(self):
        with tempfile.TemporaryDirectory() as d:
            path = _write(Path(d), "qrs", "# Quarry Systems (QRS)\n")
            self.assertEqual(parse_entity(path)["company"]["name"], "Quarry Systems")


if __name__ == "__main__":
    unittest.main()
