"""SEC companyfacts → normalized facts and live slots. No network. No model.

Reads a local companyfacts JSON (the SEC XBRL companyfacts document, or a
trimmed copy). Same algorithm as memory-cockpit-v2/server/companyfacts.js.
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
ANNUAL_FORMS = {"10-K", "20-F", "40-F", "10-KT"}
QUARTER_FP = {"Q1", "Q2", "Q3"}
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
    if spec.get("concepts") or spec.get("fallback"):
        return False
    return spec.get("sentence_fill") is not False


def structured_metric(metric_id: str, tax: dict[str, Any] | None = None) -> bool:
    spec = ((tax or load_taxonomy()).get("metrics") or {}).get(metric_id) or {}
    if spec.get("alias_of"):
        return True
    return bool(spec.get("concepts") or spec.get("fallback"))


def concept_index(tax: dict[str, Any] | None = None) -> dict[str, str]:
    tax = tax or load_taxonomy()
    idx: dict[str, str] = {}
    for mid, spec in (tax.get("metrics") or {}).items():
        if spec.get("alias_of"):
            continue
        for concept in list(spec.get("concepts") or []) + list(spec.get("fallback") or []):
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


def _days(start: str | None, end: str | None) -> int:
    if not start or not end:
        return 0
    try:
        return (date.fromisoformat(end) - date.fromisoformat(start)).days
    except ValueError:
        return 0


def duration_kind(
    days: int,
    fp: str | None = None,
    form: str | None = None,
    peer_days: list[int] | None = None,
) -> str:
    """Classify a duration by fp / form / relative span. Never uses array order."""
    family = form_family(form)
    fp_u = (fp or "").upper()
    peers = [int(p) for p in (peer_days or [])]
    longer = any(p > days + 14 for p in peers)
    shorter = any(p < days - 14 for p in peers)
    if longer and days <= 200:
        return "quarter"
    if shorter and days <= 340:
        return "ytd"
    if family in ANNUAL_FORMS or fp_u == "FY":
        if days >= 300 or fp_u == "FY":
            return "annual"
    if fp_u in QUARTER_FP:
        if days <= 130:
            return "quarter"
        if days <= 340:
            return "ytd"
        return "annual"
    if days >= 341:
        return "annual"
    if 70 <= days <= 130:
        return "quarter"
    if 131 <= days <= 340:
        return "ytd"
    return "other"


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
    """Normalized facts from a companyfacts object. Never opens a network."""
    notes: list[str] = []
    if not isinstance(doc, dict) or not isinstance(doc.get("facts"), dict):
        return {"facts": [], "notes": [UNREADABLE], "entity": None, "cik": None}
    facts_root = doc["facts"]
    out: list[dict[str, Any]] = []
    order = 0
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
                    out.append({
                        "concept": concept,
                        "value": to_number(text),
                        "value_text": text,
                        "unit": str(unit),
                        "currency": _currency(str(unit)),
                        "period": {"type": period_type, "start": start, "end": end},
                        "fy": raw.get("fy") if isinstance(raw.get("fy"), int) else None,
                        "fp": raw.get("fp") if isinstance(raw.get("fp"), str) else None,
                        "form": form,
                        "filed": str(filed),
                        "accession": str(accn),
                        "dimensional": False,
                        "source_id": source_id or f"companyfacts:{accn}",
                        "order": order,
                    })
                    order += 1
    return {
        "facts": out,
        "notes": notes,
        "entity": doc.get("entityName"),
        "cik": doc.get("cik"),
    }


def load_companyfacts_file(path: Path, *, source_id: str | None = None) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
        doc = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return {"facts": [], "notes": [UNREADABLE], "entity": None, "cik": None}
    return parse_companyfacts(doc, source_id=source_id or str(path))


def mapped_facts(facts: list[dict[str, Any]], tax: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    tax = tax or load_taxonomy()
    known: set[str] = set()
    for spec in (tax.get("metrics") or {}).values():
        if spec.get("alias_of"):
            continue
        for c in list(spec.get("concepts") or []) + list(spec.get("fallback") or []):
            known.add(c)
    return [f for f in facts or [] if f.get("concept") in known and not f.get("dimensional")]


def _period_desc(period: dict[str, Any]) -> str:
    if period.get("type") == "duration":
        return f"{period.get('start')} to {period.get('end')}"
    return str(period.get("end"))


def _period_label(period: dict[str, Any]) -> str:
    if period.get("type") == "duration":
        return f"{period.get('start')}/{period.get('end')}"
    return str(period.get("end"))


def _metric_concepts(spec: dict[str, Any]) -> tuple[list[str], list[str]]:
    return list(spec.get("concepts") or []), list(spec.get("fallback") or [])


def tagged_slots(facts: list[dict[str, Any]], tax: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    """One consolidated companyfacts slot per structured metric."""
    tax = tax or load_taxonomy()
    slots: dict[str, dict[str, Any]] = {}
    for mid, spec in (tax.get("metrics") or {}).items():
        if spec.get("alias_of"):
            continue
        primary, fallback = _metric_concepts(spec)
        concepts = primary + [c for c in fallback if c not in primary]
        if not concepts:
            continue
        want_period = spec.get("period")
        kind = spec.get("unit")
        pool = [
            f for f in facts or []
            if not f.get("dimensional")
            and (f.get("period") or {}).get("type") == want_period
            and (f.get("period") or {}).get("end")
            and _unit_ok(str(f.get("unit") or ""), str(kind))
        ]
        cands = [f for f in pool if f.get("concept") in concepts]
        if not cands:
            continue

        groups: dict[tuple, list[dict[str, Any]]] = {}
        for f in cands:
            key = (f["concept"], f["period"].get("start"), f["period"]["end"], f.get("unit"))
            groups.setdefault(key, []).append(f)

        winners: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
        for rows in groups.values():
            rows = sorted(rows, key=lambda f: (f.get("filed") or "", f.get("accession") or "", int(f.get("order") or 0)))
            win = rows[-1]
            prior = None
            for old in reversed(rows[:-1]):
                if old.get("value_text") != win.get("value_text"):
                    prior = old
                    break
            winners.append((win, prior))

        latest_end = max(w["period"]["end"] for w, _ in winners)
        at_end = [(w, p) for w, p in winners if w["period"]["end"] == latest_end]
        families = {form_family(w.get("form")) for w, _ in at_end}
        fps = {(w.get("fp") or "").upper() for w, _ in at_end}
        interim = (bool(families & {"10-Q"}) or bool(families & {"6-K"} and fps & QUARTER_FP)) and not (families <= ANNUAL_FORMS)

        def _kind(w: dict[str, Any]) -> str:
            days = _days(w["period"].get("start"), w["period"]["end"])
            peers = [
                _days(o["period"].get("start"), o["period"]["end"])
                for o, _ in at_end
                if o is not w
            ]
            return duration_kind(days, w.get("fp"), w.get("form"), peers)

        def rank(pair: tuple[dict[str, Any], Any]) -> tuple:
            w = pair[0]
            kind_d = _kind(w)
            if interim:
                dur = {"quarter": 2, "ytd": 1}.get(kind_d, 0)
            else:
                dur = 2 if kind_d == "annual" else 0
            try:
                cidx = concepts.index(w["concept"])
            except ValueError:
                cidx = 99
            return (dur, -cidx, w.get("filed") or "", w.get("accession") or "")

        win, restated_from = max(at_end, key=rank)
        ytd = None
        if want_period == "duration" and _kind(win) == "quarter":
            ytd_rows = [
                w for w, _ in at_end
                if w["concept"] == win["concept"]
                and _kind(w) == "ytd"
            ]
            if ytd_rows:
                ytd = max(ytd_rows, key=lambda w: (w.get("filed") or "", w.get("accession") or ""))

        text = (
            f"{_local(win['concept'])} {win['unit']} {group_digits(win['value_text'])} "
            f"for {_period_desc(win['period'])} (consolidated companyfacts"
        )
        prior = None
        if restated_from:
            text += f"; restated from {group_digits(restated_from['value_text'])}"
            prior = {
                "end": restated_from["period"]["end"],
                "value": restated_from["value"],
                "value_text": restated_from["value_text"],
                "restated": True,
                "filed": restated_from.get("filed"),
                "accession": restated_from.get("accession"),
                "source_id": restated_from.get("source_id"),
            }
        if ytd:
            text += f"; ytd {group_digits(ytd['value_text'])}"
        text += ")"
        slots[mid] = {
            "id": f"xbrl:{win['concept']}:{_period_label(win['period'])}",
            "metric_id": mid,
            "text": text,
            "as_of": win["period"]["end"],
            "grade": "A",
            "source_id": win.get("source_id"),
            "origin": "companyfacts",
            "confidence": "tagged",
            "concept": win["concept"],
            "value": win["value"],
            "value_text": win["value_text"],
            "unit": win["unit"],
            "currency": win.get("currency"),
            "period": dict(win["period"]),
            "fy": win.get("fy"),
            "fp": win.get("fp"),
            "form": win.get("form"),
            "filed": win.get("filed"),
            "accession": win.get("accession"),
            "prior": prior,
            "ytd": (
                {
                    "start": ytd["period"]["start"],
                    "end": ytd["period"]["end"],
                    "value": ytd["value"],
                    "value_text": ytd["value_text"],
                    "concept": ytd["concept"],
                }
                if ytd else None
            ),
        }
    return slots


def headline_gaps(slots: dict[str, dict[str, Any]], tax: dict[str, Any] | None = None) -> list[str]:
    tax = tax or load_taxonomy()
    gaps: list[str] = []
    for mid, spec in (tax.get("metrics") or {}).items():
        if spec.get("alias_of"):
            continue
        if not (spec.get("concepts") or spec.get("fallback")):
            continue
        if mid not in slots:
            gaps.append(STRUCTURED_GAP.format(mid=mid))
    return gaps
