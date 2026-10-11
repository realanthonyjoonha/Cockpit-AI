"""Slice-card checker reviewer cases (JS checker, Python-driven)."""
from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CHECKER = REPO / "memory-cockpit-v2" / "scripts" / "slice-card-check.mjs"


def run_checker(text: str) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "card.md"
        path.write_text(text, encoding="utf-8")
        return subprocess.run(
            ["node", str(CHECKER), str(path)],
            cwd=str(REPO),
            capture_output=True,
            text=True,
            check=False,
        )


class TestSliceCardReviewer(unittest.TestCase):
    def test_sell_side_is_not_advice(self):
        got = run_checker("- Sell-side coverage was thin. (2026-01-01) [A] [[sec-10k]]\n")
        self.assertEqual(got.returncode, 0, got.stderr)

    def test_hold_a_meeting_is_not_advice(self):
        got = run_checker("- The board will hold a meeting. (2026-01-01) [A] [[sec-8k]]\n")
        self.assertEqual(got.returncode, 0, got.stderr)

    def test_gap_line_with_year_is_allowed(self):
        got = run_checker("GAP: fiscal 2026 filing not read.\n")
        self.assertEqual(got.returncode, 0, got.stderr)

    def test_bare_hold_is_still_refused(self):
        got = run_checker("- We hold the name. (2026-01-01) [A] [[sec-10k]]\n")
        self.assertEqual(got.returncode, 1)
        self.assertIn("buy/sell/target/sizing", got.stderr)


if __name__ == "__main__":
    unittest.main()
