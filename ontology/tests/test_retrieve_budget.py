"""P1 cap post-condition, agent closer, and the deleted series prefix filter.

Fixtures are harness constants. No vault write. No per-ticker budget.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

import paths
from api.agent import _fit_agent_text, build_agent_context
from api.contextpack import assemble_agent_pack, claim_gaps, live_claims, to_agent_markdown
from api.retrieve import enforce_char_budget, resolve_ticker, retrieve


def _claim(cid: str, text: str, as_of: str, grade: str = "A") -> dict:
    return {"id": cid, "text": text, "as_of": as_of, "grade": grade, "source_id": "fixture"}


def _store(claims: list, **extra) -> dict:
    house = {
        "play": "fixture",
        "status": "CONFIRMED",
        "date": "2026-01-15",
        "view_excerpt": "HEAD-CANARY fixture excerpt",
    }
    house.update(extra.pop("house_prior", {}))
    return {
        "focus": {"ticker": extra.get("ticker", "DEMO"), "id": extra.get("focus_id", "demo")},
        "compiled_at": "2026-01-15T00:00:00Z",
        "house_prior": house,
        "object": {
            "id": "demo",
            "name": "Demo Fixture",
            "ticker": extra.get("ticker", "DEMO"),
            "summary": extra.get("summary", "HEAD-CANARY company summary"),
            "stance": [],
            "role_in_theses": "",
        },
        "claims": claims,
        "risks": extra.get("risks") or [],
        "risk_summary": {"watch": [], "fired": []},
        "gaps": extra.get("gaps") if "gaps" in extra else ["GAP-CANARY-TAIL"],
        "provenance": {"note": "harness fixture", "pack_config": "demo"},
        "series_snapshot": extra.get("series_snapshot") or [],
        "catalysts": [],
        "sources": [],
        "related": [],
    }


class TestRetrieveBudget(unittest.TestCase):
    def setUp(self):
        self._old = paths.BY_TICKER
        self._tmp = tempfile.TemporaryDirectory()
        paths.BY_TICKER = Path(self._tmp.name)

    def tearDown(self):
        paths.BY_TICKER = self._old
        self._tmp.cleanup()

    def _write(self, ticker: str, store: dict) -> None:
        path = paths.BY_TICKER / f"{ticker.upper()}.json"
        path.write_text(json.dumps(store), encoding="utf-8")

    def _assert_under(self, pack: dict) -> None:
        raw = json.dumps(pack, ensure_ascii=False)
        self.assertLessEqual(len(raw), paths.OVERVIEW_BUDGET_CHARS)
        budget = pack.get("budget") or {}
        self.assertEqual(budget.get("used_chars"), len(raw))
        self.assertLessEqual(budget.get("used_chars"), budget.get("limit_chars"))
        self.assertFalse(budget.get("trimmed") and budget.get("used_chars") > budget.get("limit_chars"))

    def test_fat_claims_stay_under_the_cap(self):
        fat = "Z" * 8000
        self._write("DEMO", _store([
            _claim("fat1", f"Net sales were $10 million {fat}", "2026-01-01"),
            _claim("fat2", f"Gross margin was 40% {fat}", "2026-01-02"),
        ]))
        pack = retrieve("DEMO", "overview")
        self._assert_under(pack)
        self.assertTrue(pack.get("claims"))

    def test_unknown_house_notes_are_dropped(self):
        self._write("DEMO", _store(
            [_claim("rev", "Net sales were $10 million", "2026-01-01")],
            house_prior={"notes": "N" * 20_000},
        ))
        pack = retrieve("DEMO", "overview")
        self._assert_under(pack)
        hp = pack.get("house_prior") or {}
        self.assertNotIn("notes", hp)
        self.assertTrue(any("notes" in str(g) for g in pack.get("gaps") or []))

    def test_repeated_revenue_does_not_crowd_out_older_metrics(self):
        claims = [
            _claim(f"rev{i}", f"Net sales were ${200 + i} million", f"2026-12-{i + 1:02d}")
            for i in range(10)
        ]
        claims += [
            _claim("cash-old", "Cash and cash equivalents were $5 million", "2020-01-01"),
            _claim("debt-old", "Long-term debt was $7 million", "2020-01-01"),
            _claim("gm-old", "Gross margin was 40%", "2020-01-01"),
        ]
        self._write("DEMO", _store(claims))
        ids = [c.get("id") for c in retrieve("DEMO", "overview").get("claims") or []]
        for cid in ("cash-old", "debt-old", "gm-old"):
            self.assertIn(cid, ids)

    def test_risks_intent_returns_the_store_series(self):
        self._write("DEMO", _store(
            [_claim("rev", "Net sales were $10 million", "2026-01-01")],
            series_snapshot=[
                {"id": "demo-price", "name": "fixture"},
                {"id": "mu-price", "name": "in this store"},
            ],
        ))
        ids = [s.get("id") for s in retrieve("DEMO", "risks").get("series_snapshot") or []]
        self.assertIn("demo-price", ids)
        self.assertIn("mu-price", ids)

        self._write("DEMO", _store(
            [_claim("rev", "Net sales were $10 million", "2026-01-01")],
            series_snapshot=[{"id": "demo-price", "name": "fixture"}],
        ))
        only = [s.get("id") for s in retrieve("DEMO", "risks").get("series_snapshot") or []]
        self.assertEqual(only, ["demo-price"])

    def test_residual_cap_names_the_omission(self):
        claims = [
            _claim(f"r{i}", f"Unmatched item {i} cost ${i} million", f"2026-{i:02d}-01")
            for i in range(1, 13)
        ]
        live, _ = live_claims(claims)
        self.assertEqual(len(live), 8)
        self.assertIn("4 unclassified numbered claims omitted", claim_gaps(claims))

    def test_agent_context_keeps_the_closer(self):
        fat = "WORD " * 6000
        self._write("DEMO", _store(
            [_claim("long", f"Net sales were $10 million {fat} HEAD-CANARY", "2026-06-01")],
            summary="HEAD-CANARY",
        ))
        text = build_agent_context("DEMO", "overview status")
        self.assertIn("END CONTEXT", text)
        self.assertLessEqual(len(text), 28_000)
        self.assertNotIn("agent context truncated", text)

        tight = build_agent_context("DEMO", "overview status", max_chars=1500)
        self.assertIn("END CONTEXT", tight)
        self.assertLessEqual(len(tight), 1500)
        self.assertIn("the middle was omitted", tight)

    def test_closer_survives_when_the_middle_is_dropped(self):
        body = "HEAD-CANARY\n" + ("WORD line\n" * 400) + "ONLY-MIDDLE-CANARY\n"
        text = _fit_agent_text(body, 400)
        self.assertIn("END CONTEXT", text)
        self.assertLessEqual(len(text), 400)
        self.assertIn("the middle was omitted", text)
        self.assertNotIn("ONLY-MIDDLE-CANARY", text)
        self.assertNotIn("agent context truncated", text)

    def test_unknown_focus_does_not_name_a_universe(self):
        with self.assertRaises(KeyError) as caught:
            resolve_ticker("not-a-filer")
        msg = str(caught.exception)
        self.assertIn("no compiled pack for this focus", msg)
        self.assertNotIn("NBIS", msg)
        self.assertNotRegex(msg, r"Known:")
        self.assertEqual(resolve_ticker("micron"), "MU")

    def test_markdown_does_not_restore_a_dropped_field(self):
        store = _store(
            [_claim("rev", "Net sales were $10 million " + ("Z" * 8000), "2026-01-01")],
            house_prior={"notes": "N" * 20_000, "view_excerpt": "E" * 5000},
        )
        pack = assemble_agent_pack(store)
        self._assert_under(pack)
        self.assertNotIn("notes", pack.get("house_prior") or {})
        md = to_agent_markdown(pack)
        self.assertNotIn("N" * 200, md)
        excerpt = (pack.get("house_prior") or {}).get("view_excerpt") or ""
        self.assertNotIn("E" * (len(excerpt) + 1), md)

    def test_ten_sectors_keep_their_metric_under_the_cap(self):
        fixture = json.loads((REPO / "harness-stress" / "fixtures" / "sectors.json").read_text())
        self.assertEqual(len(fixture["issuers"]), 10)
        for issuer in fixture["issuers"]:
            distinctive = [row for row in issuer.get("live") or [] if row.get("metric_id") not in (None, "other")]
            claims = [dict(c) for c in issuer.get("claims") or []]
            top = next((c for c in claims if c.get("id") == (distinctive[0]["id"] if distinctive else None)), None)
            if top:
                for i in range(10):
                    copy = dict(top)
                    copy["id"] = f"{top['id']}-rep{i}"
                    copy["as_of"] = f"2026-12-{i + 1:02d}"
                    claims.append(copy)
            ticker = "".join(ch for ch in issuer["id"].upper() if ch.isalnum())[:12]
            self._write(ticker, _store(
                claims,
                ticker=ticker,
                focus_id=issuer["id"],
                house_prior={"notes": "N" * 20_000},
                series_snapshot=[{"id": f"{issuer['id']}-series", "name": "fixture"}],
                gaps=[],
            ))
            pack = retrieve(ticker, "overview")
            self._assert_under(pack)
            self.assertNotIn("notes", pack.get("house_prior") or {})
            got = {c.get("metric_id") for c in pack.get("claims") or []}
            for row in distinctive:
                self.assertIn(row["metric_id"], got, issuer["id"])
            risks = retrieve(ticker, "risks")
            series = [s.get("id") for s in risks.get("series_snapshot") or []]
            self.assertIn(f"{issuer['id']}-series", series)
            text = build_agent_context(ticker, "overview status")
            self.assertIn("END CONTEXT", text)
            self.assertLessEqual(len(text), 28_000)

    def test_stub_still_meets_the_post_condition(self):
        pack = {
            "focus": {"ticker": "DEMO", "id": "demo"},
            "intent": "overview",
            "house_prior": {"status": "CONFIRMED", "date": "2026-01-15", "notes": "N" * 50_000},
            "claims": [
                {"id": f"c{i}", "metric_id": "other", "text": "Q" * 4000, "as_of": "2026-01-01", "grade": "A"}
                for i in range(30)
            ],
            "gaps": ["G" * 3000],
        }
        out = enforce_char_budget(pack, paths.OVERVIEW_BUDGET_CHARS)
        self._assert_under(out)
        self.assertTrue(any("pack was over budget" in str(g) or "notes" in str(g) for g in out.get("gaps") or []))


if __name__ == "__main__":
    unittest.main()
