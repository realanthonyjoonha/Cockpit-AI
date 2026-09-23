"""Parse 09-drivers.md into pack.drivers[]. Missing House: drops the line (not a pack gap).

A driver is a user-named engine: house cite, watching, optional why, figures,
a dated log, and still-open questions. Status is not a field. Legacy
**Status:** / **Kill:** / monitor tables are ignored.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

SECTION_RE = re.compile(
    r"^###\s+(D\d+)\s*[—–-]\s*(.+?)\s*$",
    re.MULTILINE,
)
HEAD_RE = re.compile(r"^\*\*(Figures|Log|Open)\*\*\s*$", re.I)
HEADING_TITLE = re.compile(
    r"load-bearing|flip trigger|advantaged|exposed|what would change the view|linked register",
    re.I,
)
SEP_RE = re.compile(r"^\|\s*:?-{3,}")


def _strip(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _slug(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    return s[:48]


def _field(head: str, name: str) -> str:
    m = re.search(rf"\*\*{name}:\*\*\s*(.+)", head, re.I)
    return _strip(m.group(1)) if m else ""


def _split_body(body: str) -> dict[str, str]:
    parts: dict[str, list[str]] = {"head": [], "figures": [], "log": [], "open": []}
    mode = "head"
    for ln in body.splitlines():
        h = HEAD_RE.match(ln.strip())
        if h:
            mode = h.group(1).lower()
            continue
        parts[mode].append(ln)
    return {k: "\n".join(v) for k, v in parts.items()}


def _table(text: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for ln in text.splitlines():
        t = ln.strip()
        if not t.startswith("|"):
            continue
        if SEP_RE.match(t):
            continue
        cells = [c.strip() for c in t.strip("|").split("|")]
        if not cells:
            continue
        if cells[0].lower() in ("item", "date", "signal"):
            continue
        rows.append(cells)
    return rows


def _figures(text: str) -> list[dict[str, str]]:
    out = []
    for c in _table(text):
        if len(c) >= 2 and c[0] and c[1]:
            out.append({"item": c[0], "figure": c[1], "note": c[2] if len(c) > 2 else ""})
    return out[:8]


def _log(text: str) -> list[dict[str, str]]:
    out = []
    for c in _table(text):
        if len(c) >= 3 and c[0] and c[2]:
            out.append({"date": c[0], "via": c[1].lower(), "fact": c[2]})
    return out


def _open(text: str) -> list[str]:
    items = []
    for ln in text.splitlines():
        m = re.match(r"^\s*-\s+(.+)\s*$", ln)
        if m and m.group(1).strip():
            items.append(m.group(1).strip())
    return items


def parse_drivers_md(
    text: str,
    *,
    id_prefix: str = "desk",
) -> list[dict[str, Any]]:
    """Extract D1–Dn. Ignores ### Rn. Drops lines with empty **House:**.

    id_prefix is accepted for callers and is not part of the id. Ids match the
    glass parser: d1-{slug}.
    """
    del id_prefix  # glass and pack share one id
    matches = list(SECTION_RE.finditer(text))
    out: list[dict[str, Any]] = []
    for i, m in enumerate(matches):
        did_raw = m.group(1).upper()
        name = m.group(2).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        next_h2 = text.find("\n## ", start)
        if next_h2 != -1 and next_h2 < end:
            end = next_h2
        body = text[start:end] if end > start else ""
        parts = _split_body(body)
        house = _field(parts["head"], "House")
        if not house:
            continue
        if HEADING_TITLE.search(name):
            continue
        log = _log(parts["log"])
        legacy_last = _field(parts["head"], "Last")
        last = log[0]["fact"] if log else (legacy_last or "—")
        checked = log[0]["date"] if log else ""
        order = int(re.sub(r"\D", "", did_raw) or "99")
        did = f"{did_raw.lower()}-{_slug(name)}".rstrip("-")[:80]
        out.append({
            "id": did,
            "type": "Driver",
            "rid": did_raw,
            "name": name,
            "house": house,
            "watching": _field(parts["head"], "Watching"),
            "why": _field(parts["head"], "Why"),
            "figures": _figures(parts["figures"]),
            "log": log,
            "open": _open(parts["open"]),
            "last": last,
            "checked": checked,
            "order": order,
        })
    return out


def load_drivers_source(path: Path | None, *, id_prefix: str = "desk") -> list[dict[str, Any]]:
    if path is None or not path.is_file():
        return []
    text = path.read_text(encoding="utf-8")
    return parse_drivers_md(text, id_prefix=id_prefix)
