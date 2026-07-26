"""Thin agent context builder."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.agent import agent_system_prompt, build_agent_context
from compile.run import write_pack


class TestAgent(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        write_pack("MU")

    def test_system_prompt_guardrails(self):
        sp = agent_system_prompt()
        self.assertIn("buy/sell", sp.lower())
        self.assertIn("house view", sp.lower())

    def test_context_contains_question_and_rules(self):
        ctx = build_agent_context("MU", "what is on watch")
        self.assertIn("ONTOLOGY AGENT CONTEXT", ctx)
        self.assertIn("WATCH", ctx)
        self.assertIn("User question:", ctx)
        self.assertLessEqual(len(ctx), 28_000 + 100)

    def test_sca_context_has_claim(self):
        ctx = build_agent_context("MU", "SCA backlog")
        self.assertTrue("100B" in ctx or "strategic customer" in ctx.lower())

    def test_advice_refused_in_context(self):
        ctx = build_agent_context("MU", "should I buy more MU")
        self.assertIn("don't give buy/sell", ctx.lower())

    def test_thesis_pulls_deep_section(self):
        ctx = build_agent_context("MU", "is the investment thesis intact")
        # should include either overview or deep thesis material
        self.assertTrue(
            "House prior" in ctx
            or "Investment Thesis" in ctx
            or "CONFIRMED" in ctx,
            ctx[:500],
        )


if __name__ == "__main__":
    unittest.main()
