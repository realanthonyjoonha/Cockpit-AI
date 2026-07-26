"""Risks, series snapshots, catalysts from research-wiki cockpit + wiki."""
from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Any

from compile.frontmatter import parse_frontmatter

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _parse_tripwires(body: str) -> list[dict]:
    out = []
    in_tw = False
    for ln in body.splitlines():
        if re.match(r"^##\s*Tripwires", ln, re.I):
            in_tw = True
            continue
        if in_tw and re.match(r"^##\s+", ln):
            break
        if not in_tw or not ln.strip().startswith("|"):
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        if cells[0].lower() in ("signal", "---") or set("".join(cells)) <= set("-| :"):
            continue
        out.append({
            "signal": cells[0],
            "tripwire": cells[1] if len(cells) > 1 else "",
            "state": cells[2] if len(cells) > 2 else "",
            "as_of": cells[3] if len(cells) > 3 else "",
        })
    return out[:12]


def load_risks(risks_dir: Path, include_ids: list[str] | None = None) -> list[dict]:
    """Load risk markdown files.

    include_ids:
      - None  → load all risks in dir (legacy MU cockpit behavior)
      - []    → load none (focus has no cockpit risk files yet)
      - [...] → load only those ids
    """
    if not risks_dir.is_dir():
        return []
    if include_ids is not None and len(include_ids) == 0:
        return []
    include = set(include_ids) if include_ids is not None else None
    risks = []
    for path in sorted(risks_dir.glob("*.md")):
        meta, body = parse_frontmatter(_read(path))
        rid = meta.get("id") or path.stem
        if include is not None and rid not in include and path.stem not in include:
            continue
        risks.append({
            "id": rid,
            "type": "Risk",
            "name": meta.get("name") or rid,
            "status": meta.get("status", "UNKNOWN"),
            "grade": meta.get("grade", ""),
            "summary": meta.get("summary", ""),
            "houseview_trigger": bool(meta.get("hv")),
            "series": meta.get("series") or [],
            "updated": str(meta.get("updated") or ""),
            "order": meta.get("order", 99),
            "tripwires": _parse_tripwires(body),
        })
    risks.sort(key=lambda r: r.get("order", 99))
    return risks


def series_snapshot(series_dir: Path, series_ids: list[str]) -> list[dict]:
    out = []
    for sid in series_ids:
        safe = re.sub(r"[^a-z0-9-]", "", sid.lower())
        path = series_dir / f"{safe}.csv"
        if not path.exists():
            out.append({"id": sid, "error": "missing", "latest": None, "as_of": None})
            continue
        rows = []
        try:
            with path.open(encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    date = (row.get("date") or "").strip()
                    val = (row.get("value") or "").strip()
                    if not date or val == "":
                        continue
                    try:
                        v = float(val)
                    except ValueError:
                        continue
                    rows.append((date, v))
        except OSError:
            out.append({"id": sid, "error": "unreadable", "latest": None, "as_of": None})
            continue
        if not rows:
            out.append({"id": sid, "error": "empty", "latest": None, "as_of": None})
            continue
        date, v = rows[-1]
        out.append({
            "id": sid,
            "type": "Series",
            "latest": v,
            "as_of": date,
            "n_points": len(rows),
        })
    return out


def load_catalysts(path: Path, entity_slugs: list[str]) -> list[dict]:
    text = _read(path)
    if not text:
        return []
    slugs = {s.lower() for s in entity_slugs}
    # also match display names
    aliases = set(slugs)
    for s in entity_slugs:
        aliases.add(s.replace("-", " ").lower())
    rows = []
    for ln in text.splitlines():
        if not ln.strip().startswith("|"):
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        when, name, event = cells[0], cells[1], cells[2]
        if when.lower() in ("date", "date (verify)", "when") or "---" in when:
            continue
        name_plain = WIKILINK_RE.sub(lambda m: m.group(1), name).lower()
        event_plain = WIKILINK_RE.sub(lambda m: m.group(1), event)
        hit = any(a in name_plain or a in event_plain.lower() for a in aliases)
        # always keep micron / memory-complex demand catalysts tagged nvidia/hyperscaler lightly
        if not hit and "micron" not in name_plain and "mu" not in name_plain:
            if "hyperscaler" in name_plain or "hbm" in name_plain:
                hit = True
            else:
                continue
        why = cells[3] if len(cells) > 3 else ""
        rows.append({
            "when": when,
            "event": event_plain,
            "name": WIKILINK_RE.sub(lambda m: m.group(1), name),
            "why": WIKILINK_RE.sub(lambda m: m.group(1), why),
            "type": "Catalyst",
        })
    return rows[:12]
