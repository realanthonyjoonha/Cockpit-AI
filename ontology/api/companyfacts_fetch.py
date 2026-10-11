"""Download SEC companyfacts into a desk raw cache. Network lives here only.

Never imported by live_claims, retrieve, ask, or assemble_agent_pack.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
MIN_INTERVAL_S = 0.2
_LAST_FETCH = 0.0


def pad_cik(cik: str | int) -> str:
    digits = re.sub(r"\D", "", str(cik))
    if not digits:
        raise ValueError("cik is empty")
    return digits.zfill(10)


def user_agent(explicit: str | None = None) -> str:
    ua = (explicit or os.environ.get("SEC_USER_AGENT") or "").strip()
    if not ua or not re.search(r"@|https?://", ua):
        raise RuntimeError("SEC_USER_AGENT (or sec_user_agent) must include contact info")
    return ua


def cache_path(wiki_root: Path, slug: str, override: str | None = None) -> Path:
    if override:
        p = Path(override).expanduser()
        return p if p.is_absolute() else wiki_root / p
    return wiki_root / "raw" / f"{slug}-research" / "sec" / "companyfacts.json"


def fetch_companyfacts(
    cik: str | int,
    dest: Path,
    *,
    user_agent_value: str | None = None,
    url_template: str = DEFAULT_URL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """GET companyfacts and write dest atomically. Respects a 200ms floor."""
    global _LAST_FETCH
    ua = user_agent(user_agent_value)
    cik10 = pad_cik(cik)
    url = url_template.format(cik=cik10)
    wait = MIN_INTERVAL_S - (time.monotonic() - _LAST_FETCH)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            status = getattr(resp, "status", 200)
    except urllib.error.HTTPError as exc:
        _LAST_FETCH = time.monotonic()
        if exc.code in (429, 503):
            time.sleep(1.5)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    body = resp.read()
                    status = getattr(resp, "status", 200)
            except urllib.error.HTTPError as exc2:
                raise RuntimeError(f"companyfacts fetch failed: HTTP {exc2.code}") from exc2
        else:
            raise RuntimeError(f"companyfacts fetch failed: HTTP {exc.code}") from exc
    _LAST_FETCH = time.monotonic()
    try:
        doc = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("companyfacts fetch returned non-JSON") from exc
    if not isinstance(doc, dict) or "facts" not in doc:
        raise RuntimeError("companyfacts fetch was not a companyfacts document")
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    tmp.replace(dest)
    return {"path": str(dest), "cik": cik10, "bytes": dest.stat().st_size, "status": status}
