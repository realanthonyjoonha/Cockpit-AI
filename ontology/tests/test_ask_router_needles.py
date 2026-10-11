"""Router needles stay generic. Existing Microsoft/Meta/Nvidia boosts are flagged, not extended."""
from __future__ import annotations

import ast
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

ASK = ROOT / "api" / "ask.py"

# Issuer and product needles are not part of the router.
GRANDFATHERED = set()
ISSUER = {
    "micron", "mu", "nvidia", "nvda", "amazon", "amzn", "nebius", "nbis",
    "apple", "aapl", "google", "goog", "googl", "alphabet", "tesla", "tsla",
    "microsoft", "meta", "jpmorgan", "jpm", "netflix", "nflx", "intel", "intc",
    "asml", "tsm", "broadcom", "avgo", "amd",
}


def _match_calls(path: Path) -> list[list[str]]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[list[str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not isinstance(func, ast.Name) or func.id != "_match":
            continue
        needles: list[str] = []
        for arg in node.args[1:]:
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                needles.append(arg.value)
        found.append(needles)
    return found


def _string_constants(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            found.append(node.value)
    return found


class TestRouterNeedles(unittest.TestCase):
    def test_scorer_literals_removed(self):
        src = ASK.read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"microsoft", src, re.I))
        self.assertIsNone(re.search(r"meta agreement", src, re.I))
        self.assertIsNone(re.search(r"\$100\b", src))
        for banned in ("nvidia", "hbm", "mehrotra", "lpdram"):
            self.assertIsNone(re.search(rf"\b{banned}\b", src, re.I), banned)
        for text in _string_constants(ASK):
            low = text.lower()
            self.assertNotIn("microsoft", low, text)
            self.assertNotIn("meta agreement", low, text)
            self.assertNotIn("$100", text)
            for banned in ("nvidia", "hbm", "mehrotra", "lpdram"):
                self.assertIsNone(re.search(rf"\b{banned}\b", low), text)
            # mode="meta" is the source viewer, not an issuer boost.
            if low.strip() == "meta":
                continue
            self.assertIsNone(re.search(r"\bmeta\b", low), text)

    def test_contract_pattern_is_positive(self):
        src = ASK.read_text(encoding="utf-8")
        start = src.index("contract_re = re.compile(")
        chunk = src[start:src.index("\n        )", start)]
        parts = re.findall(r'r"([^"]*)"', chunk)
        self.assertTrue(parts)
        rx = re.compile("".join(parts), re.I)
        self.assertIsNotNone(rx.search("Remaining performance obligations were $11 million."))
        self.assertIsNotNone(rx.search("RPO was $11 million."))
        self.assertIsNone(rx.search("The regulatory commitment is to keep the rate base intact."))
        self.assertIsNone(rx.search("Regulatory commitment to the rate case"))
        self.assertNotIn("|commitment|", src)

    def test_stance_literal_removed(self):
        src = ASK.read_text(encoding="utf-8").lower()
        self.assertNotIn("what is micron", src)
        stance = next(n for n in _match_calls(ASK) if "stance" in n and "advantaged" in n)
        self.assertEqual(stance, ["stance", "advantaged", "exposed", "contested"])

    def test_no_new_issuer_needles(self):
        for needles in _match_calls(ASK):
            for needle in needles:
                low = needle.lower()
                if low in GRANDFATHERED:
                    continue
                for banned in ISSUER:
                    self.assertIsNone(
                        re.search(rf"\b{re.escape(banned)}\b", low),
                        f"new issuer needle: {needle}",
                    )


if __name__ == "__main__":
    unittest.main()
