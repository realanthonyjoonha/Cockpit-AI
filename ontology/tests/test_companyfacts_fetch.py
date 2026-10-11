"""Mocked HTTP for companyfacts desk add/refresh. No real network."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from api import companyfacts_fetch as fetch  # noqa: E402
from compile.from_companyfacts import load_companyfacts  # noqa: E402


TICKER_MAP = {
    "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
}
FACTS_DOC = {"cik": 320193, "entityName": "Apple Inc.", "facts": {"us-gaap": {}}}


class MockGet:
    def __init__(self, routes: dict[str, tuple[int, bytes] | list[tuple[int, bytes]]]):
        self.routes = routes
        self.calls: list[tuple[str, dict[str, str]]] = []

    def __call__(self, url: str, headers: dict[str, str], timeout: float = 30.0):
        self.calls.append((url, headers))
        item = self.routes.get(url)
        if item is None:
            return 404, b"{}"
        if isinstance(item, list):
            if not item:
                return 404, b"{}"
            status, body = item.pop(0)
            return status, body
        return item


def _wiki(tmp: str) -> Path:
    root = Path(tmp)
    (root / "wiki" / "entities").mkdir(parents=True)
    return root


class RefreshDesk(unittest.TestCase):
    def test_writes_cache_from_mocked_http(self):
        get = MockGet({
            fetch.TICKERS_URL: (200, json.dumps(TICKER_MAP).encode()),
            fetch.DEFAULT_URL.format(cik="0000320193"): (200, json.dumps(FACTS_DOC).encode()),
        })
        with tempfile.TemporaryDirectory() as tmp:
            wiki = _wiki(tmp)
            out = fetch.refresh_desk_companyfacts(
                "AAPL", wiki, slug="aapl", get=get, sleep=lambda _s: None,
                user_agent_value="Cockpit-AI test@example.com",
            )
            self.assertTrue(out["ok"], out)
            dest = Path(out["path"])
            self.assertTrue(dest.is_file())
            self.assertEqual(json.loads(dest.read_text())["cik"], 320193)
            self.assertEqual(out["cik"], "0000320193")
            self.assertIn("@", get.calls[0][1]["User-Agent"])

    def test_missing_contact_ua_is_a_gap(self):
        get = MockGet({})
        with tempfile.TemporaryDirectory() as tmp:
            wiki = _wiki(tmp)
            out = fetch.refresh_desk_companyfacts(
                "AAPL", wiki, get=get, sleep=lambda _s: None, user_agent_value="no-contact",
            )
            self.assertFalse(out["ok"])
            self.assertIn("contact info", out["gap"])
            self.assertEqual(get.calls, [])
            self.assertFalse(Path(out["path"]).is_file())

    def test_unknown_ticker_is_a_gap(self):
        get = MockGet({fetch.TICKERS_URL: (200, json.dumps(TICKER_MAP).encode())})
        with tempfile.TemporaryDirectory() as tmp:
            wiki = _wiki(tmp)
            out = fetch.refresh_desk_companyfacts(
                "ZZZZ", wiki, get=get, sleep=lambda _s: None,
                user_agent_value="Cockpit-AI test@example.com",
            )
            self.assertFalse(out["ok"])
            self.assertIn("not in SEC universe map", out["gap"])
            self.assertFalse(Path(out["path"]).is_file())

    def test_http_403_is_a_gap(self):
        url = fetch.DEFAULT_URL.format(cik="0000320193")
        get = MockGet({url: (403, b"no")})
        with tempfile.TemporaryDirectory() as tmp:
            wiki = _wiki(tmp)
            out = fetch.refresh_desk_companyfacts(
                "AAPL", wiki, cik="320193", get=get, sleep=lambda _s: None,
                user_agent_value="Cockpit-AI test@example.com",
            )
            self.assertFalse(out["ok"])
            self.assertEqual(out["gap"], "companyfacts fetch failed: HTTP 403")
            self.assertFalse(Path(out["path"]).is_file())

    def test_429_retries_once(self):
        url = fetch.DEFAULT_URL.format(cik="0000320193")
        get = MockGet({url: [(429, b""), (200, json.dumps(FACTS_DOC).encode())]})
        with tempfile.TemporaryDirectory() as tmp:
            wiki = _wiki(tmp)
            out = fetch.refresh_desk_companyfacts(
                "AAPL", wiki, cik="320193", get=get, sleep=lambda _s: None,
                user_agent_value="Cockpit-AI test@example.com",
            )
            self.assertTrue(out["ok"], out)
            self.assertEqual(len([c for c in get.calls if c[0] == url]), 2)

    def test_load_companyfacts_uses_status_gap(self):
        with tempfile.TemporaryDirectory() as tmp:
            wiki = _wiki(tmp)
            dest = fetch.cache_path(wiki, "aapl")
            dest.parent.mkdir(parents=True)
            fetch.write_status(dest, {
                "ok": False,
                "gap": "companyfacts fetch failed: HTTP 503",
            })
            loaded = load_companyfacts({}, wiki, "aapl")
            self.assertEqual(loaded["facts"], [])
            self.assertEqual(loaded["notes"], ["companyfacts fetch failed: HTTP 503"])

    def test_parser_modules_do_not_import_fetch(self):
        text = (ROOT / "api" / "companyfacts.py").read_text(encoding="utf-8")
        pack = (ROOT / "api" / "contextpack.py").read_text(encoding="utf-8")
        compile_mod = (ROOT / "compile" / "from_companyfacts.py").read_text(encoding="utf-8")
        self.assertNotIn("companyfacts_fetch", text)
        self.assertNotIn("urllib", text)
        self.assertNotIn("companyfacts_fetch", pack)
        self.assertNotIn("companyfacts_fetch", compile_mod)


if __name__ == "__main__":
    unittest.main()
