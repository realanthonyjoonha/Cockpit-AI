"""Download SEC companyfacts into a desk raw cache. Network lives here only.

Never imported by live_claims, retrieve, ask, compile, or assemble_agent_pack.
Desk add (scaffold) and explicit refresh call refresh_desk_companyfacts.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
DEFAULT_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
MIN_INTERVAL_S = 0.2
TICKERS_TTL_S = 7 * 24 * 3600
_LAST_FETCH = 0.0

GetFn = Callable[[str, dict[str, str], float], tuple[int, bytes]]
SleepFn = Callable[[float], None]


def pad_cik(cik: str | int | float | None) -> str:
    if isinstance(cik, bool):
        raise ValueError("cik is empty")
    if isinstance(cik, float):
        if not cik.is_integer():
            raise ValueError("cik is empty")
        cik = int(cik)
    s = str(cik or "").strip()
    if re.fullmatch(r"-?\d+\.0+", s):
        s = s.split(".", 1)[0]
    digits = re.sub(r"\D", "", s)
    if not digits:
        raise ValueError("cik is empty")
    return digits.zfill(10)


def pack_user_agent(ticker: str, ont_root: Path | None = None) -> str | None:
    root = Path(ont_root) if ont_root else Path(__file__).resolve().parents[1]
    ident = re.sub(r"[^A-Z0-9.-]", "", str(ticker or "").upper())
    if not ident:
        return None
    path = root / "packs" / f"{ident}.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    ua = str((data or {}).get("sec_user_agent") or "").strip()
    return ua or None


def user_agent(explicit: str | None = None, ticker: str | None = None, ont_root: Path | None = None) -> str:
    ua = (explicit or os.environ.get("SEC_USER_AGENT") or os.environ.get("COCKPIT_SEC_UA") or "").strip()
    if not ua:
        ua = (pack_user_agent(ticker or "", ont_root) or "").strip()
    if not ua or not re.search(r"@|https?://", ua):
        raise RuntimeError("SEC_USER_AGENT (or sec_user_agent) must include contact info")
    return ua


def cache_path(wiki_root: Path, slug: str, override: str | None = None) -> Path:
    if override:
        p = Path(override).expanduser()
        return p if p.is_absolute() else wiki_root / p
    return wiki_root / "raw" / f"{slug}-research" / "sec" / "companyfacts.json"


def status_path(dest: Path) -> Path:
    return dest.with_name("companyfacts.status.json")


def ticker_cache_path(wiki_root: Path) -> Path:
    return Path(wiki_root) / "cockpit" / "compile" / "_sec" / "company_tickers.json"


def _default_get(url: str, headers: dict[str, str], timeout: float) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(getattr(resp, "status", 200) or 200), resp.read()
    except urllib.error.HTTPError as exc:
        body = b""
        try:
            body = exc.read() or b""
        except Exception:
            body = b""
        return int(exc.code), body


def _rate_wait(sleep: SleepFn) -> None:
    global _LAST_FETCH
    wait = MIN_INTERVAL_S - (time.monotonic() - _LAST_FETCH)
    if wait > 0:
        sleep(wait)
    _LAST_FETCH = time.monotonic()


def _write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def write_status(dest: Path, payload: dict[str, Any]) -> Path:
    path = status_path(dest)
    _write_json(path, payload)
    return path


def load_ticker_map(
    wiki_root: Path,
    *,
    get: GetFn | None = None,
    sleep: SleepFn = time.sleep,
    user_agent_value: str | None = None,
    force: bool = False,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Load SEC company_tickers.json (disk cache, 7d). May network."""
    cache = ticker_cache_path(wiki_root)
    if not force and cache.is_file() and (time.time() - cache.stat().st_mtime) < TICKERS_TTL_S:
        data = json.loads(cache.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    ua = user_agent(user_agent_value)
    getter = get or _default_get
    _rate_wait(sleep)
    status, body = getter(TICKERS_URL, {"User-Agent": ua, "Accept": "application/json"}, timeout)
    if status in (429, 503):
        sleep(1.5)
        _rate_wait(sleep)
        status, body = getter(TICKERS_URL, {"User-Agent": ua, "Accept": "application/json"}, timeout)
    if status != 200:
        if cache.is_file():
            data = json.loads(cache.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        raise RuntimeError(f"company_tickers fetch failed: HTTP {status}")
    data = json.loads(body.decode("utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError("company_tickers fetch was not an object")
    _write_json(cache, data)
    return data


def resolve_cik(
    ticker: str,
    wiki_root: Path,
    *,
    get: GetFn | None = None,
    sleep: SleepFn = time.sleep,
    user_agent_value: str | None = None,
    ticker_map: dict[str, Any] | None = None,
    force: bool = False,
) -> dict[str, Any]:
    ident = re.sub(r"[^A-Z0-9.-]", "", str(ticker or "").upper())
    if not ident:
        return {"cik": None, "title": None, "ticker": ident}
    data = ticker_map
    if data is None:
        data = load_ticker_map(
            wiki_root, get=get, sleep=sleep, user_agent_value=user_agent_value, force=force
        )
    for row in data.values():
        if not isinstance(row, dict):
            continue
        if str(row.get("ticker") or "").upper() == ident:
            try:
                cik = pad_cik(row.get("cik_str") if row.get("cik_str") is not None else row.get("cik"))
            except ValueError:
                return {"cik": None, "title": row.get("title"), "ticker": ident}
            return {"cik": cik, "title": row.get("title"), "ticker": ident}
    return {"cik": None, "title": None, "ticker": ident}


def fetch_companyfacts(
    cik: str | int,
    dest: Path,
    *,
    user_agent_value: str | None = None,
    url_template: str = DEFAULT_URL,
    timeout: float = 30.0,
    get: GetFn | None = None,
    sleep: SleepFn = time.sleep,
) -> dict[str, Any]:
    """GET companyfacts and write dest atomically. Respects a 200ms floor."""
    ua = user_agent(user_agent_value)
    cik10 = pad_cik(cik)
    url = url_template.format(cik=cik10)
    getter = get or _default_get
    headers = {"User-Agent": ua, "Accept": "application/json"}
    _rate_wait(sleep)
    status, body = getter(url, headers, timeout)
    if status in (429, 503):
        sleep(1.5)
        _rate_wait(sleep)
        status, body = getter(url, headers, timeout)
    if status != 200:
        raise RuntimeError(f"companyfacts fetch failed: HTTP {status}")
    try:
        doc = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("companyfacts fetch returned non-JSON") from exc
    if not isinstance(doc, dict) or "facts" not in doc:
        raise RuntimeError("companyfacts fetch was not a companyfacts document")
    dest = Path(dest)
    _write_json(dest, doc)
    return {"path": str(dest), "cik": cik10, "bytes": dest.stat().st_size, "status": status}


def refresh_desk_companyfacts(
    ticker: str,
    wiki_root: Path,
    *,
    slug: str | None = None,
    cik: str | int | None = None,
    user_agent_value: str | None = None,
    dest: Path | None = None,
    get: GetFn | None = None,
    sleep: SleepFn = time.sleep,
    ticker_map: dict[str, Any] | None = None,
    url_template: str = DEFAULT_URL,
) -> dict[str, Any]:
    """Resolve ticker → CIK, fetch companyfacts, write cache. Never raises for network."""
    ident = re.sub(r"[^A-Z0-9.-]", "", str(ticker or "").upper())
    desk = re.sub(r"[^a-z0-9-]", "", str(slug or ident.lower()))
    dest = Path(dest) if dest else cache_path(wiki_root, desk)
    result: dict[str, Any] = {
        "ok": False,
        "ticker": ident,
        "slug": desk,
        "cik": None,
        "path": str(dest),
        "gap": None,
    }
    try:
        ua = user_agent(user_agent_value, ticker=ident)
    except RuntimeError as exc:
        result["gap"] = f"companyfacts fetch failed: {exc}"
        write_status(dest, result)
        return result
    resolved_cik = None
    if cik is not None and str(cik).strip():
        try:
            resolved_cik = pad_cik(cik)
        except ValueError:
            resolved_cik = None
    if not resolved_cik:
        try:
            found = resolve_cik(
                ident,
                wiki_root,
                get=get,
                sleep=sleep,
                user_agent_value=ua,
                ticker_map=ticker_map,
            )
        except Exception as exc:
            result["gap"] = f"companyfacts fetch failed: {exc}"
            write_status(dest, result)
            return result
        resolved_cik = found.get("cik")
    if not resolved_cik:
        result["gap"] = f"companyfacts fetch failed: ticker {ident} not in SEC universe map"
        write_status(dest, result)
        return result
    result["cik"] = resolved_cik
    try:
        fetched = fetch_companyfacts(
            resolved_cik,
            dest,
            user_agent_value=ua,
            url_template=url_template,
            get=get,
            sleep=sleep,
        )
    except Exception as exc:
        result["gap"] = str(exc) if str(exc).startswith("companyfacts fetch failed") else f"companyfacts fetch failed: {exc}"
        write_status(dest, result)
        return result
    result["ok"] = True
    result["path"] = fetched["path"]
    result["bytes"] = fetched.get("bytes")
    write_status(dest, {k: result[k] for k in ("ok", "ticker", "slug", "cik", "path")})
    return result
