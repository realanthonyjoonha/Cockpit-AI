"""Read-only extract of HouseViewPlay blocks relevant to a focus."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

PLAY_RE = re.compile(
    r"^###\s+(?P<play>.+?)\s+—\s+(?P<status>CONFIRMED|FORMING|DRAFT)"
    r"(?:\s*·\s*(?P<date>\d{4}-\d{2}-\d{2}))?\s*$\n(?P<body>.*?)(?=^###\s|\n##\s|\Z)",
    re.MULTILINE | re.DOTALL,
)

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")


def _strip(s: str) -> str:
    s = WIKILINK_RE.sub(lambda m: m.group(1).strip(), s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_house_view(path: Path, play_match: str | None = None) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return {"plays": [], "gaps": [f"house-view unreadable: {path}"]}

    meta: dict = {}
    text = raw
    if raw.startswith("---"):
        end = raw.find("\n---", 3)
        if end != -1:
            # light frontmatter parse (key: value)
            for line in raw[3:end].splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip().strip('"').strip("'")
            text = raw[end + 4 :]

    plays: list[dict] = []
    for m in PLAY_RE.finditer(text):
        play = m.group("play").strip()
        body = _strip(m.group("body"))[:1500]
        plays.append({
            "id": re.sub(r"[^a-z0-9]+", "-", play.lower()).strip("-"),
            "type": "HouseViewPlay",
            "play": play,
            "status": m.group("status"),
            "date": m.group("date") or "",
            "view_excerpt": body,
        })

    # Single-name house-view files (e.g. house-view-nebius.md) without ### Play blocks
    if not plays:
        status = "DRAFT"
        fm_status = str(meta.get("status") or "")
        if re.search(r"CONFIRMED", fm_status, re.I) or re.search(
            r"\*\*CONFIRMED\b", text[:800], re.I
        ):
            status = "CONFIRMED"
        elif re.search(r"FORMING", fm_status, re.I):
            status = "FORMING"
        title = meta.get("entity") or meta.get("ticker") or path.stem
        m_title = re.search(r"^#\s+(.+)$", text, re.M)
        if m_title:
            title = re.sub(r"\*+", "", m_title.group(1)).strip()[:120]
        date_m = re.search(r"(20\d{2}-\d{2}-\d{2})", fm_status) or re.search(
            r"(20\d{2}-\d{2}-\d{2})", text[:400]
        )
        plays.append({
            "id": re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-"),
            "type": "HouseViewPlay",
            "play": title,
            "status": status,
            "date": date_m.group(1) if date_m else "",
            "view_excerpt": _strip(text)[:2000],
        })

    primary = None
    if play_match:
        needle = play_match.lower()
        for p in plays:
            if needle in p["play"].lower() or any(
                w in p["play"].lower() for w in re.split(r"[/\s]+", needle) if w
            ):
                primary = p
                break

    if primary is None and plays:
        primary = next((p for p in plays if p["status"] == "CONFIRMED"), plays[0])

    return {
        "plays": plays,
        "primary": primary,
        "gaps": [] if primary else ["no house-view play matched for focus"],
    }
