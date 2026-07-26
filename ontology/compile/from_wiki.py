"""Parse company entity markdown into Company + Claims + stance."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from compile.frontmatter import parse_frontmatter

# Bullet with (date…) [A|B|C] [[source-slug]]
CLAIM_RE = re.compile(
    r"^-\s+(?P<body>.+?)\s+\((?P<as_of>\d{4}-\d{2}-\d{2})(?:[^)]*)?\)\s+"
    r"\[(?P<grade>[ABC])\]\s+\[\[(?P<source>[^\]|#]+)[^\]]*\]\]\s*$",
    re.MULTILINE,
)

STANCE_RE = re.compile(
    r"^-\s+\*\*(?P<label>Advantaged|Exposed|Contested)[^*]*\*\*\s*[—–-]\s*(?P<body>.+)$",
    re.MULTILINE | re.IGNORECASE,
)

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _strip_md(s: str) -> str:
    s = WIKILINK_RE.sub(lambda m: m.group(1).strip(), s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _section(body: str, heading: str) -> str:
    """Return markdown under ## heading until next ##."""
    pat = re.compile(
        rf"^##\s+{re.escape(heading)}\s*\n(.*?)(?=^##\s+|\Z)",
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    m = pat.search(body)
    return m.group(1).strip() if m else ""


def parse_entity(path: Path) -> dict[str, Any]:
    text = _read(path)
    meta, body = parse_frontmatter(text)
    slug = path.stem

    what = ""
    m = re.search(r"\*\*What it is:\*\*\s*(.+)", body)
    if m:
        what = _strip_md(m.group(1))

    role = _strip_md(_section(body, "Role in the active theses"))[:1200]
    facts_sec = _section(body, "Key facts (timestamped · graded · sourced)")
    if not facts_sec:
        facts_sec = _section(body, "Key facts")

    claims: list[dict] = []
    for i, cm in enumerate(CLAIM_RE.finditer(facts_sec or body)):
        claims.append({
            "id": f"{slug}:claim:{i}",
            "text": _strip_md(cm.group("body")),
            "as_of": cm.group("as_of"),
            "grade": cm.group("grade"),
            "source_id": cm.group("source").strip(),
            "about_id": slug,
        })

    stance_sec = _section(body, "Stance — advantaged / exposed / contested")
    if not stance_sec:
        stance_sec = _section(body, "Stance")
    stance: list[dict] = []
    for sm in STANCE_RE.finditer(stance_sec or ""):
        stance.append({
            "label": sm.group("label").capitalize(),
            "text": _strip_md(sm.group("body")),
        })
    # Fallback: any bold stance lines
    if not stance and stance_sec:
        for line in stance_sec.splitlines():
            if line.strip().startswith("-") and "**" in line:
                stance.append({"label": "Stance", "text": _strip_md(line.lstrip("- "))})

    themes = []
    links_sec = _section(body, "Links")
    for lm in WIKILINK_RE.finditer(links_sec or ""):
        themes.append(lm.group(1).strip())

    unparsed = 0
    for line in (facts_sec or "").splitlines():
        if line.strip().startswith("-") and CLAIM_RE.search(line) is None:
            # likely a fact bullet that failed the strict pattern
            if re.search(r"\[([ABC])\]", line):
                unparsed += 1

    company = {
        "id": slug,
        "type": "Company",
        "name": meta.get("name") or slug,
        "ticker": (meta.get("ticker") or "").upper() or None,
        "aliases": meta.get("aliases") or [],
        "summary": what or role[:400],
        "role_in_theses": role,
        "stance": stance,
        "updated": str(meta.get("updated") or ""),
        "themes": themes[:12],
    }
    return {
        "company": company,
        "claims": claims,
        "gaps_from_parse": (
            [f"{unparsed} key-fact bullets did not match strict claim pattern"]
            if unparsed
            else []
        ),
    }
