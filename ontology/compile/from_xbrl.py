"""Tagged XBRL / iXBRL facts from filing documents already on disk. No network."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from api.xbrl_facts import mapped_facts, parse_xbrl_facts

DEFAULT_GLOBS = (
    "raw/{slug}-research/filings/*.htm",
    "raw/{slug}-research/filings/*.html",
    "raw/{slug}-research/filings/*.xhtml",
    "raw/{slug}-research/filings/*.xml",
)


def load_filing_facts(cfg: dict[str, Any], wiki_root: Path, slug: str) -> dict[str, Any]:
    """Consolidated mapped facts across the desk's local filings.

    `xbrl_globs` in the pack config overrides the default globs (relative to the vault).
    Files that carry no numeric facts contribute nothing.
    """
    globs = cfg.get("xbrl_globs")
    patterns = [str(g) for g in globs] if isinstance(globs, list) else [g.format(slug=slug) for g in DEFAULT_GLOBS]
    files: list[Path] = []
    for pattern in patterns:
        base = Path(pattern).expanduser()
        if base.is_absolute():
            hits = sorted(base.parent.glob(base.name))
        else:
            hits = sorted(wiki_root.glob(pattern))
        for p in hits:
            if p.is_file() and p not in files:
                files.append(p)

    facts: list[dict[str, Any]] = []
    notes: list[str] = []
    used: list[str] = []
    order = 0
    for path in files:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            notes.append(f"xbrl: {path.name} unreadable ({exc.__class__.__name__})")
            continue
        try:
            rel = str(path.relative_to(wiki_root))
        except ValueError:
            rel = str(path)
        parsed = parse_xbrl_facts(text, source_id=rel, order_base=order)
        if parsed["facts"]:
            order = max(int(f["order"]) for f in parsed["facts"]) + 1
        kept = mapped_facts(parsed["facts"])
        if not kept:
            continue
        used.append(rel)
        facts.extend(kept)
        notes.extend(f"{n} ({path.name})" for n in parsed["notes"])
    return {"facts": facts, "notes": notes, "files": used}
