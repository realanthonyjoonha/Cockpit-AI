"""Pack-only ask surface."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.ask import answer
from compile.run import write_pack


class TestAsk(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        write_pack("MU")

    def test_house_view(self):
        out = answer("MU", "what is my house view")
        self.assertIn("House prior", out)
        self.assertIn("CONFIRMED", out)

    def test_risks_watch(self):
        out = answer("MU", "what is on watch")
        self.assertIn("WATCH", out)
        self.assertRegex(out, r"Positioning|positioning|Policy")

    def test_q3(self):
        out = answer("MU", "Q3 revenue")
        self.assertIn("41.46", out)

    def test_refuse_buy(self):
        out = answer("MU", "should I buy more MU")
        self.assertIn("don't give buy/sell", out.lower())

    def test_price(self):
        out = answer("MU", "what's the price")
        self.assertIn("price-mu", out)

    def test_sca_backlog(self):
        out = answer("MU", "SCA backlog")
        self.assertTrue(
            "100B" in out or "$100" in out or "strategic customer" in out.lower(),
            out[:400],
        )
        # primary claim should dominate — not only supply-wall neighbor
        self.assertRegex(
            out,
            r"strategic customer|100B|SCA",
            msg="expected explicit SCA language",
        )
        # ranked claim block should mention agreements or 100B near the top
        head = out[:600]
        self.assertTrue(
            "100B" in head or "strategic customer" in head.lower() or "SCA" in head,
            head,
        )


if __name__ == "__main__":
    unittest.main()
