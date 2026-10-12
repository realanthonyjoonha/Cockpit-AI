"""SEC companyfacts → labeled per-period slots. No network. No model.

Reads a local companyfacts JSON. Same algorithm as
memory-cockpit-v2/server/companyfacts.js. V2: latest filing, group by period,
unique-or-gap. No ranking engine.
"""
from __future__ import annotations

import json
import math
import re
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_PATH = ROOT / "schema" / "taxonomy_xbrl.json"

ALLOWED_FORMS = {"10-K", "10-Q", "20-F", "40-F", "6-K", "10-KT"}
ISO4217 = re.compile(r"^[A-Z]{3}$")
TAXONOMIES = ("us-gaap", "ifrs-full")

_TAXONOMY: dict[str, Any] | None = None


def load_taxonomy() -> dict[str, Any]:
    global _TAXONOMY
    if _TAXONOMY is None:
        if TAXONOMY_PATH.is_file():
            _TAXONOMY = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
        else:
            _TAXONOMY = {"namespaces": {}, "metrics": {}}
    return _TAXONOMY


def sentence_fill_allowed(metric_id: str, tax: dict[str, Any] | None = None) -> bool:
    spec = ((tax or load_taxonomy()).get("metrics") or {}).get(canonical_metric(metric_id, tax)) or {}
    if spec.get("concepts"):
        return False
    return spec.get("sentence_fill") is not False


def structured_metric(metric_id: str, tax: dict[str, Any] | None = None) -> bool:
    spec = ((tax or load_taxonomy()).get("metrics") or {}).get(metric_id) or {}
    if spec.get("alias_of"):
        return True
    return bool(spec.get("concepts"))


def concept_index(tax: dict[str, Any] | None = None) -> dict[str, str]:
    tax = tax or load_taxonomy()
    idx: dict[str, str] = {}
    for mid, spec in (tax.get("metrics") or {}).items():
        if spec.get("alias_of"):
            continue
        for concept in list(spec.get("concepts") or []):
            idx.setdefault(concept, mid)
            idx.setdefault(concept.split(":")[-1], mid)
    return idx


def _local(name: str) -> str:
    return name.split(":")[-1]


def value_text(val: Any) -> str | None:
    """Canonical decimal string. Shared with JS. No scientific notation."""
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, int):
        return str(val)
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    if abs(f) < 2**53 and f == math.trunc(f):
        return str(int(f))
    s = format(f, ".12f").rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def to_number(text: str) -> int | float:
    return float(text) if "." in text else int(text)


def group_digits(text: str) -> str:
    neg = text.startswith("-")
    s = text.lstrip("-")
    ip, dot, fp = s.partition(".")
    out = ""
    while len(ip) > 3:
        out = "," + ip[-3:] + out
        ip = ip[:-3]
    out = ip + out + (dot + fp if dot else "")
    return ("-" if neg else "") + out


def form_family(form: str | None) -> str:
    return (form or "").split("/")[0].upper()


def _days(start: str | None, end: str | None) -> int | None:
    if not start or not end:
        return None
    try:
        return (date.fromisoformat(end) - date.fromisoformat(start)).days
    except ValueError:
        return None


def canonical_metric(metric_id: str, tax: dict[str, Any] | None = None) -> str:
    spec = ((tax or load_taxonomy()).get("metrics") or {}).get(metric_id) or {}
    alias = spec.get("alias_of")
    return str(alias) if alias else metric_id


def _unit_kind(unit: str) -> str | None:
    if ISO4217.fullmatch(unit or ""):
        return "currency"
    if unit.endswith("/shares") and ISO4217.fullmatch(unit.split("/", 1)[0]):
        return "per_share"
    if unit == "shares":
        return "shares"
    return None


def _currency(unit: str) -> str | None:
    kind = _unit_kind(unit)
    if kind == "currency":
        return unit
    if kind == "per_share":
        return unit.split("/", 1)[0]
    return None


def _unit_ok(unit: str, kind: str) -> bool:
    return _unit_kind(unit) == kind


MISSING_CACHE = "companyfacts cache missing; headline slots empty"
UNREADABLE = "companyfacts cache unreadable"
STRUCTURED_GAP = "{mid}: not reported in structured data"


def parse_companyfacts(doc: Any, *, source_id: str | None = None) -> dict[str, Any]:
    """NormalizedFact list. No network. No ranking."""
    notes: list[str] = []
    if not isinstance(doc, dict) or not isinstance(doc.get("facts"), dict):
        return {"facts": [], "notes": [UNREADABLE], "entity": None, "cik": None}
    facts_root = doc["facts"]
    out: list[dict[str, Any]] = []
    for tax in TAXONOMIES:
        group = facts_root.get(tax)
        if not isinstance(group, dict):
            continue
        for local, node in group.items():
            if not isinstance(node, dict):
                continue
            units = node.get("units")
            if not isinstance(units, dict):
                continue
            concept = f"{tax}:{local}"
            for unit, points in units.items():
                if not isinstance(points, list):
                    continue
                kind = _unit_kind(str(unit))
                if kind is None:
                    continue
                for raw in points:
                    if not isinstance(raw, dict):
                        continue
                    end = raw.get("end")
                    if not isinstance(end, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", end):
                        continue
                    val = raw.get("val")
                    text = value_text(val)
                    if text is None:
                        continue
                    form = str(raw.get("form") or "")
                    family = form_family(form)
                    if family not in ALLOWED_FORMS:
                        continue
                    accn = raw.get("accn")
                    filed = raw.get("filed")
                    if not accn or not filed:
                        continue
                    start = raw.get("start") if isinstance(raw.get("start"), str) else None
                    if start and not re.match(r"^\d{4}-\d{2}-\d{2}$", start):
                        start = None
                    period_type = "duration" if start else "instant"
                    days = _days(start, end) if start else None
                    out.append({
                        "concept": concept,
                        "value": to_number(text),
                        "value_text": text,
                        "unit": str(unit),
                        "currency": _currency(str(unit)),
                        "period": {"type": period_type, "start": start, "end": end},
                        "duration_days": days,
                        "fy": raw.get("fy") if isinstance(raw.get("fy"), int) else None,
                        "fp": raw.get("fp") if isinstance(raw.get("fp"), str) else None,
                        "form": form,
                        "filed": str(filed),
                        "accession": str(accn),
                        "dimensional": False,
                        "source_id": source_id or f"companyfacts:{accn}",
                    })
    return {
        "facts": out,
        "notes": notes,
        "entity": doc.get("entityName"),
        "cik": doc.get("cik"),
        "latest_accession": latest_accession_in_document(doc),
    }


def load_companyfacts_file(path: Path, *, source_id: str | None = None) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
        doc = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return {"facts": [], "notes": [UNREADABLE], "entity": None, "cik": None, "latest_accession": None}
    parsed = parse_companyfacts(doc, source_id=source_id or str(path))
    parsed["latest_accession"] = latest_accession_in_document(doc)
    return parsed


def mapped_facts(facts: list[dict[str, Any]], tax: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    tax = tax or load_taxonomy()
    known: set[str] = set()
    for spec in (tax.get("metrics") or {}).values():
        if spec.get("alias_of"):
            continue
        for c in list(spec.get("concepts") or []):
            known.add(c)
    return [f for f in facts or [] if f.get("concept") in known and not f.get("dimensional")]


def mapped_concepts(tax: dict[str, Any] | None = None) -> list[str]:
    tax = tax or load_taxonomy()
    out: list[str] = []
    for spec in (tax.get("metrics") or {}).values():
        if spec.get("alias_of"):
            continue
        out.extend(list(spec.get("concepts") or []))
    return sorted(set(out))


def mapped_inventory(doc: dict[str, Any], tax: dict[str, Any] | None = None) -> dict[str, dict[str, int]]:
    return extract_mapped_document(doc, tax)[1]


def missing_mapped_from_source(
    fixture_doc: dict[str, Any],
    source_inventory: dict[str, Any],
    tax: dict[str, Any] | None = None,
) -> list[str]:
    have = mapped_inventory(fixture_doc, tax)
    missing: list[str] = []
    for concept, units in (source_inventory or {}).items():
        if concept not in have:
            missing.append(concept)
            continue
        for unit, count in (units or {}).items():
            if have[concept].get(unit, 0) < int(count):
                missing.append(f"{concept}:{unit}")
    return missing


def extract_mapped_document(doc: dict[str, Any], tax: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Copy every mapped concept node. No point deletions. Opt-in refresh helper."""
    tax = tax or load_taxonomy()
    want: dict[str, set[str]] = {}
    for concept in mapped_concepts(tax):
        ns, loc = concept.split(":", 1)
        want.setdefault(ns, set()).add(loc)
    src_facts = doc.get("facts") if isinstance(doc, dict) else None
    if not isinstance(src_facts, dict):
        src_facts = {}
    facts: dict[str, Any] = {}
    inventory: dict[str, dict[str, int]] = {}
    for ns, locals_ in want.items():
        group = src_facts.get(ns)
        if not isinstance(group, dict):
            continue
        kept: dict[str, Any] = {}
        for loc in sorted(locals_):
            node = group.get(loc)
            if not isinstance(node, dict):
                continue
            kept[loc] = node
            units = node.get("units") if isinstance(node.get("units"), dict) else {}
            inventory[f"{ns}:{loc}"] = {
                unit: len(pts) if isinstance(pts, list) else 0
                for unit, pts in units.items()
            }
        if kept:
            facts[ns] = kept
    extracted = {k: doc[k] for k in ("cik", "entityName") if isinstance(doc, dict) and k in doc}
    extracted["facts"] = facts
    return extracted, inventory


def latest_accession_in_document(doc: Any) -> str | None:
    """max (filed, accn) over every namespace and unit. Allowed periodic forms only."""
    facts_root = doc.get("facts") if isinstance(doc, dict) else None
    if not isinstance(facts_root, dict):
        return None
    best: tuple[tuple[str, str], str] | None = None
    for group in facts_root.values():
        if not isinstance(group, dict):
            continue
        for node in group.values():
            units = node.get("units") if isinstance(node, dict) else None
            if not isinstance(units, dict):
                continue
            for points in units.values():
                if not isinstance(points, list):
                    continue
                for raw in points:
                    if not isinstance(raw, dict):
                        continue
                    if form_family(str(raw.get("form") or "")) not in ALLOWED_FORMS:
                        continue
                    accn = raw.get("accn")
                    filed = raw.get("filed")
                    if not accn or not filed:
                        continue
                    key = (str(filed), str(accn))
                    if best is None or key > best[0]:
                        best = (key, str(accn))
    return best[1] if best else None


def latest_filing_facts(
    facts: list[dict[str, Any]], *, accession: str | None = None
) -> list[dict[str, Any]]:
    """Facts whose accession is the chosen latest filing. Empty when none."""
    accn = accession or latest_accession(facts or [])
    if not accn:
        return []
    return [f for f in facts or [] if f.get("accession") == accn]


def mapped_latest_facts(
    facts: list[dict[str, Any]],
    tax: dict[str, Any] | None = None,
    *,
    accession: str | None = None,
) -> list[dict[str, Any]]:
    """Mapped true-totals from the chosen latest filing only. Never older filings."""
    return mapped_facts(latest_filing_facts(facts, accession=accession), tax)


def latest_accession(facts: list[dict[str, Any]]) -> str | None:
    """max (filed, accession) among ALLOWED_FORMS. None if empty."""
    best: tuple[tuple[str, str], str] | None = None
    for f in facts or []:
        if form_family(f.get("form")) not in ALLOWED_FORMS:
            continue
        filed = str(f.get("filed") or "")
        accn = str(f.get("accession") or "")
        if not accn:
            continue
        key = (filed, accn)
        if best is None or key > best[0]:
            best = (key, accn)
    return best[1] if best else None


def period_key(fact: dict[str, Any]) -> tuple[str | None, str | None]:
    """(period.start, period.end). Instant → (None, end)."""
    period = fact.get("period") or {}
    return (period.get("start"), period.get("end"))


def span_label(duration_days: int | None, period_type: str) -> str | None:
    """Display word only. Not a rank key."""
    if period_type == "instant":
        return None
    if duration_days is None:
        return "other"
    if 70 <= duration_days <= 130:
        return "quarter"
    if 131 <= duration_days <= 340:
        return "ytd"
    if duration_days >= 341:
        return "annual"
    return "other"


def candidates_for(
    metric_id: str,
    facts: list[dict[str, Any]],
    accession: str,
    tax: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Mapped true-total facts in that accession with a matching unit kind."""
    tax = tax or load_taxonomy()
    spec = (tax.get("metrics") or {}).get(metric_id) or {}
    concepts = list(spec.get("concepts") or [])
    if spec.get("alias_of") or not concepts:
        return []
    want_period = spec.get("period")
    kind = spec.get("unit")
    out: list[dict[str, Any]] = []
    for f in facts or []:
        if f.get("dimensional"):
            continue
        if f.get("accession") != accession:
            continue
        if f.get("concept") not in concepts:
            continue
        period = f.get("period") or {}
        if period.get("type") != want_period or not period.get("end"):
            continue
        if not _unit_ok(str(f.get("unit") or ""), str(kind)):
            continue
        out.append(f)
    return out


def group_by_period(facts: list[dict[str, Any]]) -> dict[tuple, list[dict[str, Any]]]:
    """Partition by period_key."""
    groups: dict[tuple, list[dict[str, Any]]] = {}
    for f in facts or []:
        groups.setdefault(period_key(f), []).append(f)
    return groups


def agree(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Same value_text and unit. Period is already equal inside a group."""
    return a.get("value_text") == b.get("value_text") and a.get("unit") == b.get("unit")


def _period_agrees(rows: list[dict[str, Any]]) -> bool:
    if not rows:
        return True
    first = rows[0]
    return all(agree(first, row) for row in rows[1:])


def _labeled(rows: list[dict[str, Any]]) -> dict[str, Any]:
    picked = min(rows, key=lambda f: str(f.get("concept") or ""))
    period = dict(picked.get("period") or {})
    days = picked.get("duration_days")
    if days is None:
        days = _days(period.get("start"), period.get("end")) if period.get("start") else None
    return {
        "concept": picked["concept"],
        "tags": sorted({str(f.get("concept")) for f in rows if f.get("concept")}),
        "value_text": picked["value_text"],
        "unit": picked["unit"],
        "currency": picked.get("currency"),
        "period": period,
        "duration_days": days,
        "span": span_label(days, str(period.get("type") or "")),
        "form": picked.get("form"),
        "fp": picked.get("fp"),
        "fy": picked.get("fy"),
        "filed": picked.get("filed"),
        "accession": picked.get("accession"),
        "source_id": picked.get("source_id"),
        "value": picked.get("value"),
    }


def _period_when(period: dict[str, Any]) -> str:
    if period.get("type") == "duration" and period.get("start"):
        return f"for {period.get('start')} to {period.get('end')}"
    return f"at {period.get('end')}"


def _value_block(lab: dict[str, Any]) -> str:
    bits: list[str] = []
    if lab.get("span"):
        bits.append(str(lab["span"]))
    form = lab.get("form") or ""
    bits.append(f"form {form}".rstrip())
    if lab.get("fp"):
        bits.append(f"fp={lab['fp']}")
    if lab.get("fy") is not None:
        bits.append(f"fy={lab['fy']}")
    if lab.get("filed"):
        bits.append(f"filed {lab['filed']}")
    if lab.get("accession"):
        bits.append(f"accn {lab['accession']}")
    return (
        f"{_local(lab['concept'])} {lab['unit']} {group_digits(lab['value_text'])} "
        f"{_period_when(lab['period'])}\n({', '.join(bits)})"
    )


def _period_gap_key(start: str | None, end: str | None) -> str:
    return f"{start or ''}/{end or ''}"


def _conflict_gap(mid: str, accn: str, start: str | None, end: str | None, rows: list[dict[str, Any]]) -> list[str]:
    header = (
        f"{mid} {_period_gap_key(start, end)}: latest filing {accn} "
        f"has {len(rows)} disagreeing tagged facts"
    )
    lines = [header]
    for row in sorted(rows, key=lambda f: (str(f.get("concept") or ""), str(f.get("unit") or ""), str(f.get("value_text") or ""))):
        fp = row.get("fp") or ""
        lines.append(
            f"  - {row.get('concept')} {row.get('unit')} {row.get('value_text')} {row.get('form')} {fp}".rstrip()
        )
    return lines


def sort_values(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Newest period first so visible text leads with the current filing period."""
    return sorted(
        values,
        key=lambda v: (
            str((v.get("period") or {}).get("end") or ""),
            str((v.get("period") or {}).get("start") or ""),
        ),
        reverse=True,
    )


_sort_values = sort_values


def labeled_period_line(lab: dict[str, Any]) -> str:
    """One visible line for a kept labeled period. Works after hard slim."""
    period = lab.get("period") if isinstance(lab.get("period"), dict) else {}
    if lab.get("concept") and lab.get("value_text") is not None and lab.get("unit") is not None:
        try:
            return _value_block(lab)
        except (KeyError, TypeError, AttributeError):
            pass
    start, end = period.get("start"), period.get("end")
    when = f"{start} to {end}" if start else (str(end) if end else "")
    bits = [lab.get("span"), lab.get("unit"), lab.get("value_text"), when]
    return " ".join(str(b) for b in bits if b not in (None, ""))


def claim_period_lines(claim: dict[str, Any]) -> list[str]:
    """Every kept labeled period, newest first. Falls back to claim text."""
    values = [v for v in (claim.get("values") or []) if isinstance(v, dict)]
    if values:
        return [labeled_period_line(v) for v in sort_values(values)]
    text = claim.get("text")
    return [text] if isinstance(text, str) and text else []


def _slot(mid: str, accn: str, values: list[dict[str, Any]]) -> dict[str, Any]:
    values = _sort_values(values)
    text = "\n".join(_value_block(v) for v in values)
    sole = values[0] if len(values) == 1 else None
    return {
        "id": f"xbrl:{mid}:{accn}",
        "metric_id": mid,
        "text": text,
        "as_of": (sole["period"].get("end") if sole else None),
        "grade": "A",
        "source_id": (sole.get("source_id") if sole else f"companyfacts:{accn}"),
        "origin": "companyfacts",
        "confidence": "tagged",
        "values": values,
        "concept": (sole.get("concept") if sole else None),
        "value": (sole.get("value") if sole else None),
        "value_text": (sole.get("value_text") if sole else None),
        "unit": (sole.get("unit") if sole else None),
        "currency": (sole.get("currency") if sole else None),
        "period": (dict(sole["period"]) if sole else None),
        "fy": (sole.get("fy") if sole else None),
        "fp": (sole.get("fp") if sole else None),
        "form": (sole.get("form") if sole else None),
        "filed": (sole.get("filed") if sole else None),
        "accession": accn,
    }


def latest_filing_slots(
    facts: list[dict[str, Any]],
    tax: dict[str, Any] | None = None,
    *,
    accession: str | None = None,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Returns (slots, gaps). slots[mid] has values[] (unique periods) or is absent."""
    tax = tax or load_taxonomy()
    accn = accession or latest_accession(facts or [])
    slots: dict[str, dict[str, Any]] = {}
    gaps: list[str] = []
    for mid, spec in (tax.get("metrics") or {}).items():
        if spec.get("alias_of"):
            continue
        if not spec.get("concepts"):
            continue
        if not accn:
            gaps.append(f"{mid}: not reported in latest filing")
            continue
        cands = candidates_for(mid, facts or [], accn, tax)
        if not cands:
            gaps.append(f"{mid}: not reported in latest filing {accn}")
            continue
        values: list[dict[str, Any]] = []
        for key, rows in group_by_period(cands).items():
            start, end = key
            if _period_agrees(rows):
                values.append(_labeled(rows))
            else:
                gaps.extend(_conflict_gap(mid, accn, start, end, rows))
        if values:
            slots[mid] = _slot(mid, accn, values)
    return slots, gaps


def tagged_slots(
    facts: list[dict[str, Any]],
    tax: dict[str, Any] | None = None,
    *,
    accession: str | None = None,
) -> dict[str, dict[str, Any]]:
    """latest_filing_slots(...)[0]. Name kept so live_claims does not fork."""
    return latest_filing_slots(facts, tax, accession=accession)[0]


def headline_gaps(
    slots: dict[str, dict[str, Any]],
    tax: dict[str, Any] | None = None,
    facts: list[dict[str, Any]] | None = None,
    *,
    accession: str | None = None,
) -> list[str]:
    """latest_filing_slots(...)[1] when facts is provided."""
    if facts is None:
        facts = []
    return latest_filing_slots(facts, tax, accession=accession)[1]


def default_cache(wiki_root: Path, slug: str) -> Path:
    return Path(wiki_root) / "raw" / f"{slug}-research" / "sec" / "companyfacts.json"


def cache_status_gap(cache: Path) -> str | None:
    status = Path(cache).with_name("companyfacts.status.json")
    if not status.is_file():
        return None
    try:
        data = json.loads(status.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    gap = data.get("gap") if isinstance(data, dict) else None
    return str(gap) if gap else None


def load_companyfacts(cfg: dict[str, Any], wiki_root: Path, slug: str) -> dict[str, Any]:
    """Read cache or override path. Missing → empty facts + cache gap. Never fetches."""
    override = (cfg or {}).get("companyfacts_path")
    if override:
        path = Path(override).expanduser()
        if not path.is_absolute():
            path = Path(wiki_root) / path
    else:
        path = default_cache(wiki_root, slug)
    wiki = Path(wiki_root)
    if not path.is_file():
        notes = [cache_status_gap(path) or MISSING_CACHE]
        return {"facts": [], "notes": notes, "files": [], "slots": {}}
    source = str(path.relative_to(wiki)) if wiki in path.parents else str(path)
    parsed = load_companyfacts_file(path, source_id=source)
    accn = parsed.get("latest_accession")
    slots, gaps = latest_filing_slots(parsed["facts"], accession=accn)
    kept = mapped_latest_facts(parsed["facts"], accession=accn)
    notes = list(parsed.get("notes") or [])
    status_gap = cache_status_gap(path)
    if status_gap and status_gap not in notes:
        notes.insert(0, status_gap)
    notes.extend(gaps)
    rel = str(path)
    try:
        rel = str(path.relative_to(wiki))
    except ValueError:
        pass
    return {"facts": kept, "notes": notes, "files": [rel], "slots": slots}
