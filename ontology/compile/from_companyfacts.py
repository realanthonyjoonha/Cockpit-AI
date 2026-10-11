"""Load a desk's local companyfacts cache into pack.facts. No network."""
from __future__ import annotations

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
        return {"facts": [], "notes": [MISSING_CACHE], "files": [], "slots": {}}
    parsed = load_companyfacts_file(path, source_id=str(path.relative_to(wiki_root)) if wiki_root in path.parents else str(path))
    kept = mapped_facts(parsed["facts"])
    slots = tagged_slots(kept)
    notes = list(parsed.get("notes") or [])
    notes.extend(headline_gaps(slots))
    rel = str(path)
    try:
        rel = str(path.relative_to(wiki_root))
    except ValueError:
        pass
    return {"facts": kept, "notes": notes, "files": [rel], "slots": slots}
