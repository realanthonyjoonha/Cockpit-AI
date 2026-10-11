"""Load a desk's local companyfacts cache into pack.facts. No network."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from api.companyfacts import (
    MISSING_CACHE,
    headline_gaps,
    load_companyfacts_file,
    mapped_facts,
    tagged_slots,
)


def default_cache(wiki_root: Path, slug: str) -> Path:
    return wiki_root / "raw" / f"{slug}-research" / "sec" / "companyfacts.json"


def _status_gap(cache: Path) -> str | None:
    status = cache.with_name("companyfacts.status.json")
    if not status.is_file():
        return None
    try:
        data = json.loads(status.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    gap = data.get("gap") if isinstance(data, dict) else None
    return str(gap) if gap else None


def load_companyfacts(cfg: dict[str, Any], wiki_root: Path, slug: str) -> dict[str, Any]:
    """Read the desk cache. Missing file → empty facts + gap. Never fetches."""
    override = cfg.get("companyfacts_path")
    if override:
        path = Path(override).expanduser()
        if not path.is_absolute():
            path = wiki_root / path
    else:
        path = default_cache(wiki_root, slug)
    if not path.is_file():
        notes = [_status_gap(path) or MISSING_CACHE]
        return {"facts": [], "notes": notes, "files": [], "slots": {}}
    parsed = load_companyfacts_file(path, source_id=str(path.relative_to(wiki_root)) if wiki_root in path.parents else str(path))
    kept = mapped_facts(parsed["facts"])
    slots = tagged_slots(kept)
    notes = list(parsed.get("notes") or [])
    status_gap = _status_gap(path)
    if status_gap and status_gap not in notes:
        notes.insert(0, status_gap)
    notes.extend(headline_gaps(slots, facts=kept))
    rel = str(path)
    try:
        rel = str(path.relative_to(wiki_root))
    except ValueError:
        pass
    return {"facts": kept, "notes": notes, "files": [rel], "slots": slots}
