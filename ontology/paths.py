"""Central paths for the ontology project. Override with env ONTOLOGY_* if needed."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STORE = ROOT / "store"
BY_TICKER = STORE / "by_ticker"
FIXTURES = ROOT / "fixtures"
SCHEMA = ROOT / "schema"
PACKS = ROOT / "packs"


def _default_wiki() -> Path:
    """Prefer monorepo sibling research-wiki, then COCKPIT_VAULT, then ~/Trading legacy."""
    env = os.environ.get("ONTOLOGY_WIKI") or os.environ.get("COCKPIT_VAULT")
    if env:
        return Path(env).expanduser().resolve()
    monorepo_wiki = ROOT.parent / "research-wiki"
    if (monorepo_wiki / "wiki" / "entities").is_dir() or (monorepo_wiki / "house-view-nebius.md").is_file():
        return monorepo_wiki.resolve()
    return Path(os.path.expanduser("~/Trading/research-wiki")).resolve()


WIKI = _default_wiki()
HOUSE_VIEW = WIKI / "house-view.md"
ENTITIES = WIKI / "wiki" / "entities"
SOURCES = WIKI / "wiki" / "sources"
CATALYSTS = WIKI / "wiki" / "catalysts.md"
RISKS = WIKI / "cockpit" / "risks"
SERIES = WIKI / "cockpit" / "series"

# CONTRACT v0.1
OVERVIEW_BUDGET_CHARS = 10_000
