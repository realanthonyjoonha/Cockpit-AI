"""Open long research sources registered in a focus pack.

Modes:
  list     — catalog only
  meta     — one source metadata + outline
  head     — first N lines
  section  — extract ## Section by title substring
  search   — grep lines matching query (with context)
  full     — entire file (dangerous for 40pp; allowed with explicit flag)
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from api.retrieve import load_store, resolve_ticker
from compile.frontmatter import parse_frontmatter

HEADING_RE = re.compile(r"^(#{1,3})\s+(.+)$", re.MULTILINE)


def list_sources(focus: str) -> list[dict[str, Any]]:
    store = load_store(resolve_ticker(focus))
    return list(store.get("sources") or [])


def _find_source(focus: str, source_id: str) -> dict[str, Any]:
    sources = list_sources(focus)
    sid = source_id.strip().lower()
    # exact
    for s in sources:
        if (s.get("id") or "").lower() == sid:
            return s
    # substring / fuzzy
    hits = [s for s in sources if sid in (s.get("id") or "").lower() or sid in (s.get("title") or "").lower()]
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        # prefer longest
        hits.sort(key=lambda s: -(s.get("n_lines") or 0))
        return hits[0]
    # path stem match
    for s in sources:
        p = Path(s.get("path") or "")
        if p.stem.lower() == sid or sid in p.stem.lower():
            return s
    known = [s.get("id") for s in sources[:20]]
    raise KeyError(f"Unknown source '{source_id}'. Known (sample): {known}")


def _load_text(path: str) -> str:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"Source file missing: {path}")
    return p.read_text(encoding="utf-8")


def outline(text: str) -> list[dict[str, Any]]:
    _, body = parse_frontmatter(text)
    return [
        {"level": len(m.group(1)), "title": m.group(2).strip()}
        for m in HEADING_RE.finditer(body)
    ]


def extract_section(text: str, section_query: str) -> str:
    """Return body under the first heading matching section_query (case-insensitive).

    Includes nested subheadings until the next heading of the *same or higher*
    level (fewer or equal #). So `# §2 Exec` includes its `###` children.
    Prefers the best title match if several headings contain the query.
    """
    _, body = parse_frontmatter(text)
    q = section_query.lower().strip()
    # strip leading §N — noise
    q_norm = re.sub(r"^§?\d+\s*[—–-]?\s*", "", q).strip()
    matches = list(HEADING_RE.finditer(body))
    if not matches:
        raise KeyError(f"No headings in file; cannot extract section '{section_query}'")

    candidates: list[tuple[int, int, re.Match[str]]] = []
    for i, m in enumerate(matches):
        title = m.group(2).strip()
        tlow = title.lower()
        if q in tlow or (q_norm and q_norm in tlow):
            # score: exact-ish > startswith > substring; prefer shorter titles
            score = 0
            if tlow == q or tlow == q_norm:
                score = 100
            elif tlow.startswith(q) or tlow.startswith(q_norm):
                score = 80
            else:
                score = 50
            score -= min(len(title), 40) // 10
            candidates.append((score, i, m))

    if not candidates:
        raise KeyError(f"No section matching '{section_query}'")

    candidates.sort(key=lambda x: -x[0])
    _, i, m = candidates[0]
    level = len(m.group(1))
    start = m.start()
    end = len(body)
    for j in range(i + 1, len(matches)):
        if len(matches[j].group(1)) <= level:
            end = matches[j].start()
            break
    chunk = body[start:end].strip()
    if len(chunk) < len(m.group(0)) + 20:
        # almost empty — still return nested content attempt / note
        pass
    return chunk + "\n"


def search_text(text: str, query: str, context: int = 2, limit: int = 20) -> list[dict[str, Any]]:
    """Line search. Short tokens (≤3 chars) use word boundaries so 'SCA' ≠ 'scorecard'."""
    tokens = [t for t in re.split(r"\s+", query.lower()) if t]
    lines = text.splitlines()
    hits = []

    def _line_match(low: str) -> bool:
        if not tokens:
            return False
        for t in tokens:
            if len(t) <= 3:
                if not re.search(rf"\b{re.escape(t)}\b", low):
                    return False
            elif t not in low:
                return False
        return True

    for i, line in enumerate(lines):
        low = line.lower()
        if _line_match(low):
            lo = max(0, i - context)
            hi = min(len(lines), i + context + 1)
            hits.append({
                "line": i + 1,
                "text": line,
                "context": "\n".join(lines[lo:hi]),
            })
            if len(hits) >= limit:
                break
    return hits


def get_source(
    focus: str,
    source_id: str,
    *,
    mode: str = "meta",
    section: str | None = None,
    query: str | None = None,
    head_lines: int = 80,
    max_chars: int = 50_000,
) -> dict[str, Any]:
    """
    mode:
      meta | outline | head | section | search | full
    """
    meta = _find_source(focus, source_id)
    path = meta["path"]
    mode = (mode or "meta").lower()

    out: dict[str, Any] = {
        "focus": resolve_ticker(focus),
        "source": {
            "id": meta.get("id"),
            "title": meta.get("title"),
            "path": path,
            "kind": meta.get("kind"),
            "n_lines": meta.get("n_lines"),
            "n_chars": meta.get("n_chars"),
            "about": meta.get("about"),
        },
        "mode": mode,
    }

    if mode == "meta":
        text = _load_text(path)
        out["outline"] = outline(text)[:50]
        out["hint"] = (
            "Use mode=outline|head|section|search|full to read body. "
            "Prefer section/search for long masters."
        )
        return out

    text = _load_text(path)

    if mode == "outline":
        out["outline"] = outline(text)
        return out

    if mode == "head":
        chunk = "\n".join(text.splitlines()[:head_lines])
        out["text"] = chunk
        out["truncated"] = len(text.splitlines()) > head_lines
        return out

    if mode == "section" or section:
        sec = section or query or ""
        if not sec:
            raise ValueError("section mode needs --section 'Heading substring'")
        body = extract_section(text, sec)
        if len(body) > max_chars:
            out["text"] = body[:max_chars] + "\n\n…[truncated]…"
            out["truncated"] = True
        else:
            out["text"] = body
            out["truncated"] = False
        return out

    if mode == "search" or (query and mode == "meta"):
        q = query or ""
        if not q:
            raise ValueError("search mode needs --query")
        out["hits"] = search_text(text, q)
        out["hit_count"] = len(out["hits"])
        return out

    if mode == "full":
        if len(text) > max_chars:
            out["text"] = text[:max_chars] + "\n\n…[truncated at max_chars]…"
            out["truncated"] = True
            out["warning"] = (
                f"File is {len(text)} chars; returning first {max_chars}. "
                "Use section/search for precision."
            )
        else:
            out["text"] = text
            out["truncated"] = False
        return out

    raise ValueError(f"Unknown mode '{mode}'")


def format_source_result(result: dict[str, Any]) -> str:
    s = result.get("source") or {}
    lines = [
        f"**Source:** {s.get('title')} (`{s.get('id')}`)",
        f"path: {s.get('path')}",
        f"kind: {s.get('kind')} · {s.get('n_lines')} lines · {s.get('n_chars')} chars",
        f"mode: {result.get('mode')}",
        "",
    ]
    if result.get("outline") is not None and result.get("mode") in ("meta", "outline"):
        lines.append("**Outline**")
        for h in result["outline"][:40]:
            indent = "  " * max(0, (h.get("level") or 1) - 1)
            lines.append(f"{indent}- {h.get('title')}")
        lines.append("")
    if result.get("hint"):
        lines.append(result["hint"])
        lines.append("")
    if result.get("hits") is not None:
        lines.append(f"**Search hits:** {result.get('hit_count', 0)}")
        for hit in result["hits"][:15]:
            lines.append(f"— line {hit['line']}:")
            lines.append(hit.get("context") or hit.get("text") or "")
            lines.append("")
    if result.get("text"):
        if result.get("warning"):
            lines.append(f"_Warning: {result['warning']}_")
            lines.append("")
        lines.append(result["text"])
    if result.get("mode") == "meta" and not result.get("text"):
        lines.append("Next: `ont source MU get <id> --outline` or `--section '…'` or `--search '…'`")
    return "\n".join(lines)


def format_source_list(focus: str) -> str:
    sources = list_sources(focus)
    if not sources:
        return "No sources cataloged for this focus. Add source_globs/sources to packs/MU.json and recompile."
    lines = [f"**Sources for {resolve_ticker(focus)}** ({len(sources)} files)", ""]
    for s in sources:
        lines.append(
            f"- `{s.get('id')}` — {s.get('title')} "
            f"[{s.get('kind')}, {s.get('n_lines')} lines]"
        )
        lines.append(f"  {s.get('path')}")
    lines.append("")
    lines.append("Open: `ont source MU get <id>` · `… --outline` · `… --section 'X'` · `… --search 'Y'`")
    return "\n".join(lines)
