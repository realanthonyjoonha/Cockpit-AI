#!/usr/bin/env python3
"""Opt-in live SEC refresh of cached companyfacts extracts.

Used as test input only. Does not write expected dollars. CI never runs this
unless COCKPIT_LIVE_COMPANYFACTS=1 and SEC_USER_AGENT is set.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ontology"))

from api.companyfacts import extract_mapped_document  # noqa: E402
from api.companyfacts_fetch import DEFAULT_URL, pad_cik, user_agent, _default_get, _rate_wait  # noqa: E402

FIX = ROOT / "harness-stress" / "fixtures" / "companyfacts"


def main() -> int:
    if os.environ.get("COCKPIT_LIVE_COMPANYFACTS") != "1":
        print("set COCKPIT_LIVE_COMPANYFACTS=1 to refresh extracts", file=sys.stderr)
        return 2
    ua = user_agent()
    index = json.loads((FIX / "index.json").read_text(encoding="utf-8"))
    for row in index.get("issuers") or []:
        if row.get("kind") != "extract":
            continue
        path = FIX / row["id"] / "companyfacts.json"
        if not path.is_file():
            continue
        current = json.loads(path.read_text(encoding="utf-8"))
        cik = current.get("cik")
        if cik is None:
            continue
        _rate_wait(time.sleep)
        status, body = _default_get(
            DEFAULT_URL.format(cik=pad_cik(cik)),
            {"User-Agent": ua, "Accept": "application/json"},
            30,
        )
        if status != 200:
            print(f"{row['id']} HTTP {status}", file=sys.stderr)
            continue
        live = json.loads(body.decode("utf-8"))
        extracted, _inv = extract_mapped_document(live)
        path.write_text(json.dumps(extracted, indent=2) + "\n", encoding="utf-8")
        print(row["id"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
