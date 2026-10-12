"""Load a desk's local companyfacts cache into pack.facts. No network."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from api.companyfacts import (  # noqa: F401
    MISSING_CACHE,
    default_cache,
    load_companyfacts,
)


def load_filing_facts(cfg: dict[str, Any], wiki_root: Path, slug: str) -> dict[str, Any]:
    return load_companyfacts(cfg, wiki_root, slug)
