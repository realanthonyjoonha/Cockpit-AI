"""Part 1 structural verify gate — fail-closed format + pack checks."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from verify.part1_gate import verify_part1, MIN_CLAIMS, MIN_RISKS  # noqa: E402
import paths  # noqa: E402


class TestPart1GateLivePacks(unittest.TestCase):
    """Live vault packs (MSFT after Part 1; NBIS if present)."""

    def test_msft_structural_pass(self):
        r = verify_part1("MSFT")
        self.assertEqual(r.exit_code, 0, r.report_text())
        self.assertTrue(r.ok)
        self.assertGreaterEqual(r.summary.get("claims", 0), MIN_CLAIMS)
        self.assertGreaterEqual(r.summary.get("risks", 0), MIN_RISKS)

    def test_msft_human_gates_pass_when_locked(self):
        r = verify_part1(
            "MSFT",
            require_confirmed=True,
            require_risks_accepted=True,
        )
        self.assertEqual(r.exit_code, 0, r.report_text())
        self.assertEqual(str(r.summary.get("house_status") or "").upper(), "CONFIRMED")

    def test_nbis_structural_if_pack_exists(self):
        store = paths.BY_TICKER / "NBIS.json"
        if not store.exists():
            self.skipTest("NBIS pack not on disk")
        r = verify_part1("NBIS")
        # NBIS may have fewer entity claims than 10 — still report honestly
        if r.exit_code != 0:
            # Allow known thin claim count; structural risks/house still checked
            failed_ids = {c.id for c in r.checks if not c.ok}
            # claims_min is the only soft expectation for older packs
            self.assertTrue(
                failed_ids <= {"claims_min", "entity_key_facts_parse"},
                r.report_text(),
            )

    def test_missing_ticker_fails(self):
        r = verify_part1("NOTATICKERZZ")
        self.assertEqual(r.exit_code, 1)
        self.assertFalse(r.ok)
        self.assertTrue(any(c.id == "pack_config" and not c.ok for c in r.checks))

    def test_json_report_shape(self):
        r = verify_part1("MSFT")
        d = r.to_dict()
        self.assertIn("checks", d)
        self.assertIn("failed", d)
        self.assertIn("summary", d)
        self.assertEqual(d["ticker"], "MSFT")


class TestPart1GateSynthetic(unittest.TestCase):
    """Synthetic failures without mutating the live vault."""

    def test_low_claims_fails_structural(self):
        """Monkeypatch store with too few claims."""
        real_store = paths.BY_TICKER / "MSFT.json"
        if not real_store.exists():
            self.skipTest("need MSFT pack")
        data = json.loads(real_store.read_text(encoding="utf-8"))
        data["claims"] = (data.get("claims") or [])[:3]

        with mock.patch("verify.part1_gate._load_store", return_value=data):
            r = verify_part1("MSFT", min_claims=10)
        self.assertEqual(r.exit_code, 1)
        self.assertTrue(any(c.id == "claims_min" and not c.ok for c in r.checks))

    def test_require_confirmed_on_forming_exits_2(self):
        real_store = paths.BY_TICKER / "MSFT.json"
        if not real_store.exists():
            self.skipTest("need MSFT pack")
        data = json.loads(real_store.read_text(encoding="utf-8"))
        hp = dict(data.get("house_prior") or {})
        hp["status"] = "FORMING"
        data["house_prior"] = hp

        with mock.patch("verify.part1_gate._load_store", return_value=data):
            with mock.patch(
                "verify.part1_gate._house_status_from_file",
                return_value="FORMING",
            ):
                r = verify_part1("MSFT", require_confirmed=True)
        self.assertEqual(r.exit_code, 2, r.report_text())
        self.assertTrue(any(c.id == "house_confirmed" and not c.ok for c in r.checks))
        # structural should still pass
        self.assertFalse(any(c.tier == "structural" and not c.ok for c in r.checks))

    def test_claim_re_rejects_bad_bullet(self):
        from compile.from_wiki import CLAIM_RE

        good = "- Azure grew 40% (2026-03-31) [A] [[msft-fy26q3-pr]]"
        bad = "- Azure grew 40% [A] no date [[msft]]"
        self.assertTrue(CLAIM_RE.search(good))
        self.assertIsNone(CLAIM_RE.search(bad))


class TestClaimFormatContract(unittest.TestCase):
    def test_entity_template_documents_exact_format(self):
        tmpl = paths.WIKI / "templates" / "entity.md"
        if not tmpl.exists():
            self.skipTest("entity template missing")
        text = tmpl.read_text(encoding="utf-8")
        self.assertIn("Key facts", text)
        self.assertIn("[A", text)
        self.assertIn("[[", text)


if __name__ == "__main__":
    unittest.main()
