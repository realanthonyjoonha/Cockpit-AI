"""Catalog long-form research markdown as Source objects (paths + metadata, not full body)."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from compile.frontmatter import parse_frontmatter

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")
HEADING_RE = re.compile(r"^(#{1,3})\s+(.+)$", re.MULTILINE)


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _slug_from_path(path: Path) -> str:
    return path.stem.lower().replace("_", "-")


def _title_from_text(path: Path, text: str) -> str:
    meta, body = parse_frontmatter(text)
    if meta.get("name"):
        return str(meta["name"])
    if meta.get("title"):
        return str(meta["title"])
    for line in body.splitlines()[:40]:
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem.replace("-", " ").replace("_", " ")


def _outline(text: str, limit: int = 40) -> list[dict[str, Any]]:
    _, body = parse_frontmatter(text)
    out = []
    for m in HEADING_RE.finditer(body):
        out.append({"level": len(m.group(1)), "title": m.group(2).strip()})
        if len(out) >= limit:
            break
    return out


def catalog_path(
    path: Path,
    *,
    kind: str,
    about: list[str],
    source_id: str | None = None,
) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    text = _read(path)
    if not text.strip():
        return None
    sid = source_id or _slug_from_path(path)
    lines = text.count("\n") + 1
    return {
        "id": sid,
        "type": "Source",
        "kind": kind,  # master | report | wiki-source | anchors | other
        "title": _title_from_text(path, text),
        "path": str(path.resolve()),
        "n_lines": lines,
        "n_chars": len(text),
        "about": about,
        "outline_preview": [h["title"] for h in _outline(text, limit=12)],
    }


def build_source_catalog(cfg: dict[str, Any], wiki_root: Path) -> list[dict[str, Any]]:
    """
    Build Source catalog from pack config.

    Config keys (all optional):
      sources: [{id, path, kind, about}]   # explicit
      source_globs: ["raw/*master*.md", ...]  # relative to wiki_root or absolute
      source_roots: extra dirs to scan for *master*.md
    """
    ticker = (cfg.get("ticker") or "").lower()
    entity = (cfg.get("entity_slug") or cfg.get("focus_id") or ticker).lower()
    about_default = list(cfg.get("themes") or []) + [
        cfg.get("focus_id") or "",
        ticker,
        entity,
    ]
    about_default = [a for a in about_default if a]

    seen: dict[str, dict] = {}

    def add(entry: dict | None) -> None:
        if not entry:
            return
        # prefer longer / more specific path if duplicate id
        prev = seen.get(entry["id"])
        if prev and prev.get("n_lines", 0) >= entry.get("n_lines", 0):
            return
        seen[entry["id"]] = entry

    # 1) explicit sources in pack config
    for item in cfg.get("sources") or []:
        if not isinstance(item, dict) or not item.get("path"):
            continue
        p = Path(item["path"]).expanduser()
        if not p.is_absolute():
            p = wiki_root / p
        add(
            catalog_path(
                p,
                kind=item.get("kind") or "other",
                about=item.get("about") or about_default,
                source_id=item.get("id"),
            )
        )

    # 2) globs relative to wiki
    for pattern in cfg.get("source_globs") or []:
        base = wiki_root
        # allow Trading-relative via absolute pattern later
        for path in sorted(base.glob(pattern)):
            if path.suffix.lower() != ".md":
                continue
            kind = "master" if "master" in path.stem.lower() else "report"
            if path.parent.name == "sources":
                kind = "wiki-source"
            if path.parent.name == "raw":
                kind = "master" if "master" in path.stem.lower() else "raw"
            add(catalog_path(path, kind=kind, about=about_default))

    # 3) this desk's wiki/sources distillates only — never the whole vault.
    # Filename must be {ticker}|{slug}|{focus}-*.md (or exact stem). Extra files
    # (e.g. NBIS citing crwv-*.md) belong in pack source_globs, not this sweep.
    sources_dir = wiki_root / "wiki" / "sources"
    if sources_dir.is_dir():
        prefixes = {ticker, entity, str(cfg.get("focus_id") or "").lower()}
        prefixes.discard("")
        for path in sorted(sources_dir.glob("*.md")):
            stem = path.stem.lower()
            if any(stem == p or stem.startswith(f"{p}-") for p in prefixes):
                add(catalog_path(path, kind="wiki-source", about=about_default))

    # 4) extra roots (e.g. memory-thesis/output)
    for root in cfg.get("source_roots") or []:
        r = Path(root).expanduser()
        if not r.is_dir():
            continue
        for path in sorted(r.glob("*.md")):
            if path.stat().st_size < 500:
                continue
            kind = "master" if "master" in path.stem.lower() else "report"
            add(catalog_path(path, kind=kind, about=about_default))

    # sort: longest first (likely the deep research)
    out = sorted(seen.values(), key=lambda s: (-(s.get("n_lines") or 0), s.get("id") or ""))
    return out
