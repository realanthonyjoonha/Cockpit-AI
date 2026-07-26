"""Parse Nebius 08-risks-catalysts.md into cockpit-style risk dicts / files."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

SECTION_RE = re.compile(
    r"^###\s+(R\d+)\s*[—–-]\s*(.+?)\s*$",
    re.MULTILINE,
)


def _strip(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def parse_nebius_risks_md(
    text: str,
    *,
    id_prefix: str = "nbis",
) -> list[dict[str, Any]]:
    """Extract R1–Rn structured risks from thin-desk dossier markdown.

    id_prefix: ticker-ish prefix for generated ids (e.g. nbis, msft) so multi-desk
    packs do not all share the hard-coded nbis- slug.
    """
    prefix = re.sub(r"[^a-z0-9]+", "", (id_prefix or "nbis").lower()) or "nbis"
    matches = list(SECTION_RE.finditer(text))
    risks: list[dict[str, Any]] = []
    for i, m in enumerate(matches):
        rid_raw = m.group(1).upper()  # R1
        name = m.group(2).strip()
        start = m.end()
        if i + 1 < len(matches):
            end = matches[i + 1].start()
        else:
            end = len(text)
        # Stop at next ## section (B/C/…) so a misplaced Rn after B still parses,
        # and the last risk under A does not swallow catalysts/claims.
        next_h2 = text.find("\n## ", start)
        if next_h2 != -1 and next_h2 < end:
            end = next_h2
        if end <= start:
            end = len(text)
        body = text[start:end]

        status = "INTACT"
        # full status clause up to Grade or end of line (may include "elevated")
        sm = re.search(
            r"\*\*Status:\*\*\s*(.+?)(?:\s*·\s*\*\*Grade|\n)",
            body,
            re.I | re.S,
        )
        if sm:
            st = sm.group(1).strip().upper()
            if "FIRED" in st:
                status = "FIRED"
            elif "WATCH" in st or "ELEVATED" in st:
                status = "WATCH"
            elif "INTACT" in st:
                status = "INTACT"

        grade = ""
        gm = re.search(r"\*\*Grade:\*\*\s*\[([ABC])\]", body, re.I)
        if gm:
            grade = gm.group(1).upper()

        # summary: text after grade on status line, or first · segment
        summary = ""
        sum_m = re.search(
            r"\*\*Status:\*\*[^\n]*·\s*\*\*Grade:\*\*\s*\[[ABC]\]\s*·\s*(.+)$",
            body,
            re.M | re.I,
        )
        if sum_m:
            summary = _strip(sum_m.group(1))[:160]
        if not summary:
            mech = re.search(r"\*\*Mechanism:\*\*\s*(.+?)(?:\n\n|\n\|)", body, re.S)
            if mech:
                summary = _strip(mech.group(1))[:160]

        mechanism = ""
        mm = re.search(r"\*\*Mechanism:\*\*\s*(.+?)(?:\n\n|\n\|)", body, re.S)
        if mm:
            mechanism = _strip(mm.group(1))

        tripwires: list[dict] = []
        # parse markdown table rows
        in_table = False
        for ln in body.splitlines():
            if re.match(r"^\|\s*Signal\s*\|", ln, re.I):
                in_table = True
                continue
            if in_table and re.match(r"^\|\s*---", ln):
                continue
            if in_table and ln.strip().startswith("|"):
                cells = [c.strip() for c in ln.strip().strip("|").split("|")]
                if len(cells) >= 3:
                    tripwires.append({
                        "signal": cells[0],
                        "tripwire": cells[1],
                        "state": cells[2],
                        "as_of": cells[3] if len(cells) > 3 else "",
                    })
            elif in_table and not ln.strip().startswith("|"):
                in_table = False

        order = int(re.sub(r"\D", "", rid_raw) or "99")
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        risk_id = f"{prefix}-{rid_raw.lower()}-{slug}"[:80]

        risks.append({
            "id": risk_id,
            "type": "Risk",
            "name": f"{rid_raw} — {name}",
            "status": status,
            "grade": grade,
            "summary": summary,
            "houseview_trigger": False,
            "series": [],
            "updated": "2026-07-19",
            "order": order,
            "tripwires": tripwires[:12],
            "mechanism": mechanism,
            "rid": rid_raw,
            "category": prefix,
        })
    return risks


def write_risk_files(
    risks: list[dict],
    out_dir: Path,
    *,
    category: str | None = None,
    source_note: str | None = None,
) -> list[str]:
    """Write cockpit-compatible risk markdown files. Returns ids written.

    Clears all prior *.md in out_dir (generated risk cards only) so a desk
    renames (e.g. nbis-r* → msft-r*) do not leave stale ids loadable by pack.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.md"):
        old.unlink()
    ids = []
    cat = (category or (risks[0].get("category") if risks else None) or "thin").lower()
    note = source_note or "risks_source dossier (wired into ontology pack)"
    for r in risks:
        rid = r["id"]
        ids.append(rid)
        trip_lines = [
            "| Signal | Tripwire → | State | As-of |",
            "|---|---|---|---|",
        ]
        for tw in r.get("tripwires") or []:
            trip_lines.append(
                f"| {tw.get('signal', '')} | {tw.get('tripwire', '')} | "
                f"{tw.get('state', '')} | {tw.get('as_of', '')} |"
            )
        # escape quotes in summary for yaml
        summary = (r.get("summary") or "").replace('"', "'")
        name = (r.get("name") or "").replace('"', "'")
        r_cat = (r.get("category") or cat).lower()
        content = f"""---
type: risk
id: {rid}
name: "{name}"
status: {r.get('status') or 'INTACT'}
grade: {r.get('grade') or 'B'}
order: {r.get('order', 99)}
hv: false
summary: "{summary[:200]}"
category: {r_cat}
updated: {r.get('updated') or '2026-07-19'}
---
**The risk:** {r.get('mechanism') or summary}

## Tripwires
{chr(10).join(trip_lines)}

*Source: {note}.*
"""
        (out_dir / f"{rid}.md").write_text(content, encoding="utf-8")
    return ids


def sync_from_dossier(
    dossier_path: Path,
    out_dir: Path,
    *,
    id_prefix: str = "nbis",
    category: str | None = None,
) -> list[str]:
    text = dossier_path.read_text(encoding="utf-8")
    risks = parse_nebius_risks_md(text, id_prefix=id_prefix)
    if not risks:
        raise ValueError(f"No risks parsed from {dossier_path}")
    cat = category or re.sub(r"[^a-z0-9]+", "", (id_prefix or "nbis").lower()) or "nbis"
    try:
        rel = str(dossier_path)
    except Exception:
        rel = "risks_source"
    return write_risk_files(risks, out_dir, category=cat, source_note=rel)


if __name__ == "__main__":
    import os
    import sys

    # Prefer monorepo / env vault over hard-coded ~/Trading
    here = Path(__file__).resolve()
    mono = here.parents[2] / "research-wiki"  # ontology/compile → repo root
    env_wiki = os.environ.get("ONTOLOGY_WIKI") or os.environ.get("COCKPIT_VAULT")
    if env_wiki:
        root = Path(env_wiki).expanduser().resolve()
    elif (mono / "wiki" / "entities").is_dir():
        root = mono
    else:
        root = Path.home() / "Trading/research-wiki"
    prefix = (sys.argv[1] if len(sys.argv) > 1 else "nbis").lower()
    if prefix == "msft":
        src = root / "raw/microsoft-research/08-risks-catalysts.md"
        out = root / "raw/microsoft-research/risks"
    else:
        src = root / "raw/nebius-research/08-risks-catalysts.md"
        out = root / "raw/nebius-research/risks"
    ids = sync_from_dossier(src, out, id_prefix=prefix)
    print(f"wrote {len(ids)} risks → {out}")
    for i in ids:
        print(" ", i)
