"""ContextPack v2 — pinned book + one live claim per metric. No LLM. No store writes.

A live metric slot is a tagged XBRL fact when the pack has one for that metric.
A sentence fills a slot only when no tagged fact exists, only when it carries an
amount of the slot's kind, and it is marked low confidence. Sentences never
overwrite a tagged value; they stay as context.

Date, unit, and phrase rules match memory-cockpit-v2/server/contextpack.js.
ASCII needles. No ticker branch. No model call.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.companyfacts import (  # noqa: E402
    STRUCTURED_GAP,
    concept_index,
    load_taxonomy,
    sentence_fill_allowed,
    structured_metric,
    tagged_slots,
)

RULES_PATH = ROOT / "schema" / "contextpack_metrics.json"
XBRL_PATH = ROOT / "schema" / "taxonomy_xbrl.json"

GRADE_W = {"A": 3, "B": 2, "C": 1}
FISCAL_GAP = "as_of is a fiscal label without a period-end date"
SENTENCE_GAP = "no companyfacts value; live value is sentence-derived (low confidence): "
HEADLINE_GAP = STRUCTURED_GAP
CONTEXT_CAP = 8
_COUNT = re.compile(r"\b(?!(?:19|20)\d{2}\b)\d[\d,]*(?:\.\d+)?\b")

_MONTHS = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sept": 9, "sep": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}
_MON = (
    "january|february|march|april|june|july|august|september|october|november|december|"
    "sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|may"
)
_MDY = re.compile(
    rf"\b(?P<mon>{_MON})\.?\s+(?P<d>\d{{1,2}})(?:st|nd|rd|th)?,?\s+(?P<y>\d{{4}})\b",
    re.I,
)
_DMY = re.compile(
    rf"\b(?P<d>\d{{1,2}})(?:st|nd|rd|th)?\s+(?P<mon>{_MON})\.?\s+(?P<y>\d{{4}})\b",
    re.I,
)
_ISO = re.compile(
    r"\b(?P<y>\d{4})-(?P<m>\d{1,2})-(?P<d>\d{1,2})"
    r"(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b"
)
_ENDED = re.compile(
    r"\b(?:fiscal\s+year\s+ended|year\s+ended|(?:52|53)\s+weeks\s+ended)\s+(?P<rest>.+)\Z",
    re.I | re.S,
)
_FY = re.compile(r"\b(?:fy\s*20\d{2}|fiscal\s+(?:year\s+)?20\d{2})\b", re.I)

_NUM = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"
_SCALE = r"(?:[Tt]rillion|[Bb]illion|[Mm]illion|[Tt]housand|[Tt][Nn]|[Bb][Nn]|[Mm][Nn]|[Mm][Mm]|[KkBbMm])"
_SYM = r"(?:[Uu][Ss]\$|[€£¥$])"
_CODE = (
    "USD|EUR|GBP|JPY|CNY|RMB|KRW|CAD|AUD|CHF|HKD|SGD|SEK|NOK|DKK|NZD|INR|BRL|MXN|ZAR|"
    "TWD|THB|MYR|IDR|PHP|PLN|CZK|HUF|ILS|TRY|SAR|AED|CLP|COP|PEN|ARS|VND|PKR|BDT|EGP|NGN|KES"
)
_SYM_PREFIX = re.compile(rf"(?P<cur>{_SYM})\s*(?P<num>{_NUM})(?:\s*(?P<scale>{_SCALE}))?\b")
_CODE_PREFIX = re.compile(rf"\b(?P<cur>{_CODE})\b\s*(?P<num>{_NUM})(?:\s*(?P<scale>{_SCALE}))?\b")
_CODE_SUFFIX = re.compile(rf"(?P<num>{_NUM})\s*\b(?P<cur>{_CODE})\b(?:\s*(?P<scale>{_SCALE}))?\b")
_PCT = re.compile(rf"(?P<num>{_NUM})\s*(?:%|[Pp]ercent\b|[Pp][Cc][Tt]\b)")
_BPS = re.compile(
    rf"(?:(?:(?P<cur>{_SYM})|(?:\b(?P<code>{_CODE})\b))\s*)?(?P<num>{_NUM})\s*(?:[Bb]asis\s+[Pp]oints|[Bb][Pp][Ss])\b"
)
_PER_SHARE_AFTER = re.compile(
    r"^(?:\s*/\s*shares?\b|\s*,?\s*(?:per\s+(?:diluted\s+|basic\s+|common\s+)?shares?|a\s+share)\b)",
    re.I,
)
_PER_SHARE_CUE = re.compile(
    r"\b(?:diluted\s+earnings\s+per\s+shares?|basic\s+earnings\s+per\s+shares?|"
    r"earnings\s+per\s+(?:diluted\s+|basic\s+|common\s+)?shares?|"
    r"per\s+(?:diluted\s+|basic\s+|common\s+)?shares?|eps)\b",
    re.I,
)
_PER_SHARE_LEGEND = re.compile(r"\bexcept\s+per[-\s]+shares?\b", re.I)
_EXCLUSION_BEFORE = re.compile(
    r"(?:other than|excluding|except|exclusive of)\b(?:\s+\w+){0,6}\s+$",
    re.I,
)
_SENTENCE_SCALE = re.compile(
    r"\bin\s+(thousands|millions|billions|trillions)\b",
    re.I,
)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")

_SCALE_VALUE = {
    "thousand": ("thousand", 1_000),
    "k": ("thousand", 1_000),
    "million": ("million", 1_000_000),
    "m": ("million", 1_000_000),
    "mn": ("million", 1_000_000),
    "mm": ("million", 1_000_000),
    "billion": ("billion", 1_000_000_000),
    "b": ("billion", 1_000_000_000),
    "bn": ("billion", 1_000_000_000),
    "trillion": ("trillion", 1_000_000_000_000),
    "tn": ("trillion", 1_000_000_000_000),
}
_SENTENCE_SCALE_VALUE = {
    "thousands": ("thousand", 1_000),
    "millions": ("million", 1_000_000),
    "billions": ("billion", 1_000_000_000),
    "trillions": ("trillion", 1_000_000_000_000),
}
_SYMBOL_CODE = {"$": "USD", "us$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY"}

def load_rules() -> dict[str, Any]:
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def load_xbrl() -> dict[str, Any]:
    return load_taxonomy()


def grade_weight(grade: Any) -> int:
    """Missing or blank grade weighs the same as C. Unknown tokens do too, in both languages."""
    if grade is None:
        return 1
    g = str(grade).strip().upper()
    if not g:
        return 1
    return GRADE_W.get(g, 1)


def _leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def _ymd(year: int, month: int, day: int) -> str | None:
    if not (1900 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31):
        return None
    mdays = [0, 31, 29 if _leap(year) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if day > mdays[month]:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def _month_num(name: str) -> int | None:
    return _MONTHS.get(name.lower().rstrip("."))


def _day_in(fragment: str) -> str | None:
    cands: list[tuple[int, str]] = []
    for rx, kind in ((_MDY, "mdy"), (_DMY, "dmy"), (_ISO, "iso")):
        for m in rx.finditer(fragment):
            if kind == "iso":
                sk = _ymd(int(m.group("y")), int(m.group("m")), int(m.group("d")))
            else:
                mon = _month_num(m.group("mon"))
                sk = _ymd(int(m.group("y")), mon, int(m.group("d"))) if mon else None
            if sk:
                cands.append((m.start(), sk))
    if not cands:
        return None
    cands.sort(key=lambda item: item[0])
    return cands[0][1]


def parse_as_of(raw: Any) -> dict[str, Any]:
    """Civil period-end date. Does not invent a month for a bare fiscal label. Does not rewrite raw."""
    text = "" if raw is None else str(raw).strip()
    base: dict[str, Any] = {"sort_key": None, "precision": "unknown", "raw": raw}
    if not text:
        return base
    ended = _ENDED.search(text)
    if ended:
        day = _day_in(ended.group("rest"))
        if day:
            return {"sort_key": day, "precision": "day", "raw": raw}
        if _FY.search(ended.group("rest")) or _FY.search(text):
            return {"sort_key": None, "precision": "fiscal_label", "raw": raw}
        return base
    day = _day_in(text)
    if day:
        return {"sort_key": day, "precision": "day", "raw": raw}
    if _FY.search(text):
        return {"sort_key": None, "precision": "fiscal_label", "raw": raw}
    return base


def _phrase_in(text: str, phrase: str) -> bool:
    p = (phrase or "").lower().strip()
    if not p:
        return False
    left = r"\b" if p[0].isalnum() else ""
    right = r"\b" if p[-1].isalnum() else ""
    return re.search(left + re.escape(p) + right, text) is not None


def _metric_ids(rules: dict[str, Any]) -> set[str]:
    return {str(rule["id"]) for rule in (rules.get("metrics") or []) if rule.get("id")}


def _resolve_concept(concept: str, rules: dict[str, Any], xbrl: dict[str, Any]) -> str | None:
    ids = _metric_ids(rules)
    if concept in ids:
        return concept
    idx = concept_index(xbrl)
    if concept in idx and idx[concept] in ids:
        return idx[concept]
    if ":" in concept:
        local = concept.split(":")[-1]
        if local in idx and idx[local] in ids:
            return idx[local]
    return None


def _span_excluded(text: str, abs_index: int) -> bool:
    before = text[max(0, abs_index - 60):abs_index]
    if re.search(r"non[-\s]+$", before, re.I):
        return True
    return _EXCLUSION_BEFORE.search(before) is not None


def _head_hits(text: str, head: str, start: int, end: int) -> list[int]:
    return [start + m.start() for m in re.finditer(rf"\b{re.escape(head)}\b", text[start:end], re.I)]


def _match_excluded(text: str, head: str, start: int, end: int) -> bool:
    hits = _head_hits(text, head, start, end)
    if not hits:
        return False
    return all(_span_excluded(text, i) for i in hits)


def _has_clean_head(text: str, head: str) -> bool:
    hits = _head_hits(text, head, 0, len(text))
    return any(not _span_excluded(text, i) for i in hits)


def _head_qualified(text: str, head: str, start: int, end: int, qualifiers: set[str]) -> bool:
    hits = _head_hits(text, head, start, end)
    if not hits:
        return False

    def qualified(abs_index: int) -> bool:
        before = text[max(0, abs_index - 40):abs_index]
        m = re.search(r"([a-z0-9-]+)\s+$", before, re.I)
        return bool(m and m.group(1).lower() in qualifiers)

    return all(qualified(i) for i in hits)


def _patterns_match(rule: dict[str, Any], text: str) -> bool:
    head = str(rule.get("head") or "").lower()
    qualifiers = {str(q).lower() for q in (rule.get("qualifier_block") or [])}
    for pat in rule.get("patterns") or []:
        try:
            rx = re.compile(pat, re.I)
        except re.error:
            continue
        for m in rx.finditer(text):
            if head and _match_excluded(text, head, m.start(), m.end()):
                continue
            if head and qualifiers and _head_qualified(text, head, m.start(), m.end(), qualifiers):
                continue
            return True
    return False


def _rule_matches(rule: dict[str, Any], text: str) -> bool:
    """Positive patterns name the thing itself. Exclusion scopes reject a match; co-occurrence does not."""
    if rule.get("patterns"):
        if not _patterns_match(rule, text):
            return False
    else:
        if any(_phrase_in(text, n) for n in (rule.get("none") or [])):
            return False
        positive = False
        rx = rule.get("regex")
        if rx:
            try:
                if re.search(rx, text, re.I):
                    positive = True
            except re.error:
                pass
        groups = rule.get("all_any") or []
        if groups and all(any(_phrase_in(text, p) for p in group) for group in groups):
            positive = True
        alls = rule.get("all") or []
        if alls and all(_phrase_in(text, a) for a in alls):
            positive = True
        anys = rule.get("any") or []
        if anys and any(_phrase_in(text, a) for a in anys):
            positive = True
        if not positive:
            return False
        head = str(rule.get("head") or "").lower()
        if head and not _has_clean_head(text, head):
            return False
    if rule.get("requires_count") and not re.search(r"\d", text):
        return False
    if rule.get("requires_figure") and not _has_figure(text):
        return False
    return True


def classify_metric(text: str, rules: dict[str, Any] | None = None) -> str | None:
    """Layer B. Whole phrases, first rule wins. No concept scan."""
    t = (text or "").lower()
    rules = rules or load_rules()
    for rule in rules.get("metrics") or []:
        if _rule_matches(rule, t):
            return str(rule["id"])
    return None


def classify_claim(claim: dict[str, Any], rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """Layer A when concept is a taxonomy id or a mapped XBRL tag. Otherwise layer B."""
    rules = rules or load_rules()
    notes: list[str] = []
    concept = str((claim or {}).get("concept") or "").strip()
    if concept:
        mapped = _resolve_concept(concept, rules, load_xbrl())
        if mapped:
            return {"metric_id": mapped, "notes": notes}
        notes.append(f"unmapped_concept: {concept}")
    return {"metric_id": classify_metric((claim or {}).get("text") or "", rules), "notes": notes}


def is_boilerplate(text: str, rules: dict[str, Any] | None = None) -> bool:
    t = (text or "").lower()
    rules = rules or load_rules()
    return any(p.lower() in t for p in (rules.get("boilerplate") or []))


def _num(raw: str) -> float | None:
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def _code_of(token: str) -> str | None:
    t = token.strip()
    if t in _SYMBOL_CODE:
        return _SYMBOL_CODE[t]
    low = t.lower()
    if low in _SYMBOL_CODE:
        return _SYMBOL_CODE[low]
    up = t.upper()
    if up == "RMB":
        return "CNY"
    if up in _CODE.split("|"):
        return up
    return None


def _scale_of(token: str | None) -> tuple[str, int] | None:
    if not token:
        return None
    return _SCALE_VALUE.get(token.lower())


def _overlaps(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return not (a["end"] <= b["start"] or b["end"] <= a["start"])


def _keep_spans(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    for row in sorted(rows, key=lambda r: (r["start"], -(r["end"] - r["start"]))):
        if any(_overlaps(row, prev) for prev in kept):
            continue
        kept.append(row)
    kept.sort(key=lambda r: r["start"])
    return kept


def _currency_row(m: re.Match[str], base: int) -> dict[str, Any] | None:
    display = _num(m.group("num"))
    code = _code_of(m.group("cur"))
    if display is None or not code:
        return None
    scale = _scale_of(m.groupdict().get("scale"))
    value = display * scale[1] if scale else display
    return {
        "start": base + m.start(),
        "end": base + m.end(),
        "value": value,
        "display": display,
        "currency": code,
        "scale": scale[0] if scale else None,
        "unit": "currency",
    }


def _amounts_in(fragment: str, base: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    bps_spans = [(base + m.start(), base + m.end()) for m in _BPS.finditer(fragment)]
    for m in _BPS.finditer(fragment):
        display = _num(m.group("num"))
        if display is None:
            continue
        rows.append({
            "start": base + m.start(),
            "end": base + m.end(),
            "value": display,
            "display": display,
            "currency": None,
            "scale": None,
            "unit": "bps",
        })
    for m in _PCT.finditer(fragment):
        span = (base + m.start(), base + m.end())
        if any(not (span[1] <= s or span[0] >= e) for s, e in bps_spans):
            continue
        display = _num(m.group("num"))
        if display is None:
            continue
        rows.append({
            "start": span[0],
            "end": span[1],
            "value": display,
            "display": display,
            "currency": None,
            "scale": None,
            "unit": "percent",
        })
    for rx in (_SYM_PREFIX, _CODE_PREFIX, _CODE_SUFFIX):
        for m in rx.finditer(fragment):
            row = _currency_row(m, base)
            if not row:
                continue
            if any(not (row["end"] <= s or row["start"] >= e) for s, e in bps_spans):
                continue
            rows.append(row)
    return _keep_spans(rows)


def _per_share_amount(frag: str, start: int, end: int, base: int) -> bool:
    """An amount inside a per-share or EPS phrase never takes the sentence scale.

    The scale legend may sit anywhere in the sentence. A lone amount under
    'except per share' is the per-share datum. A later EPS phrase does not
    unscale an earlier line-item amount.
    """
    local_s = start - base
    local_e = end - base
    if _PER_SHARE_AFTER.match(frag[local_e:local_e + 32]):
        return True
    gap_start = 0
    for m in _SYM_PREFIX.finditer(frag):
        if m.start() < local_s and m.end() <= local_s:
            gap_start = m.end()
    gap = _PER_SHARE_LEGEND.sub(" ", frag[gap_start:local_s])
    if _PER_SHARE_CUE.search(gap):
        return True
    dollars = list(_SYM_PREFIX.finditer(frag))
    return len(dollars) == 1 and _PER_SHARE_LEGEND.search(frag) is not None


def _sentence_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    start = 0
    for m in _SENTENCE_SPLIT.finditer(text):
        if text[start:m.start()].strip():
            spans.append((start, m.start()))
        start = m.end()
    if text[start:].strip():
        spans.append((start, len(text)))
    return spans


def parse_amounts(text: str) -> list[dict[str, Any]]:
    """Currency, percent, and basis points. Scale stays inside the sentence. No FX conversion."""
    if not text:
        return []
    out: list[dict[str, Any]] = []
    for start, end in _sentence_spans(text):
        frag = text[start:end]
        sent = _SENTENCE_SCALE.search(frag)
        sent_scale = _SENTENCE_SCALE_VALUE.get(sent.group(1).lower()) if sent else None
        for row in _amounts_in(frag, start):
            per_share = _per_share_amount(frag, row["start"], row["end"], start)
            if row["unit"] == "currency" and row["scale"] is None and sent_scale and not per_share:
                row["value"] = row["display"] * sent_scale[1]
                row["scale"] = sent_scale[0]
            row.pop("start", None)
            row.pop("end", None)
            out.append(row)
    return out


def _has_figure(text: str) -> bool:
    return any(a.get("unit") in ("currency", "percent") for a in parse_amounts(text))


def _claim_sort_key(c: dict[str, Any], index: int) -> tuple:
    sk = parse_as_of(c.get("as_of")).get("sort_key") or "0000-00-00"
    # Earlier index wins when date and grade match (reverse=True, so the index is negated).
    return (sk, grade_weight(c.get("grade")), -index)


def sentence_has_amount(metric_id: str, text: str, tax: dict[str, Any] | None = None) -> bool:
    """A sentence may fill a slot only when it carries an amount of that slot's kind."""
    tax = tax or load_taxonomy()
    kind = ((tax.get("metrics") or {}).get(metric_id) or {}).get("unit") or "currency_or_percent"
    if kind in ("count", "shares"):
        return _COUNT.search(text or "") is not None
    units = {a.get("unit") for a in parse_amounts(text or "")}
    if kind == "currency":
        return "currency" in units
    if kind == "percent":
        return "percent" in units
    return "currency" in units or "percent" in units


def _context_row(c: dict[str, Any], mid: str, reason: str) -> dict[str, Any]:
    return {
        "id": c.get("id"),
        "metric_id": mid,
        "text": c.get("text"),
        "as_of": c.get("as_of"),
        "grade": c.get("grade"),
        "source_id": c.get("source_id"),
        "reason": reason,
    }


def live_claims(
    claims: list[dict[str, Any]],
    rules: dict[str, Any] | None = None,
    *,
    residual_cap: int = 8,
    gaps_out: list[str] | None = None,
    facts: list[dict[str, Any]] | None = None,
    context_out: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """One live row per metric_id. Residual numbered claims capped.

    Companyfacts slots own structured metrics. A sentence never fills those
    slots. Phrase-only metrics may still hold a live row. A fiscal label does
    not beat a real period-end date.
    """
    rules = rules or load_rules()
    tax = load_taxonomy()
    slots = tagged_slots(facts or [], tax)
    buckets: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    residual: list[tuple[int, dict[str, Any]]] = []
    context: list[tuple[int, dict[str, Any]]] = []
    gaps: list[str] = []
    seen: set[str] = set()
    newer: dict[str, int] = {}
    blocked: dict[str, int] = {}
    base = len(slots)

    def add_gap(msg: str) -> None:
        if msg not in seen:
            seen.add(msg)
            gaps.append(msg)

    for j, c in enumerate(claims or []):
        i = base + j
        text = c.get("text") or ""
        classified = classify_claim(c, rules)
        for note in classified.get("notes") or []:
            add_gap(note)
        if parse_as_of(c.get("as_of")).get("precision") == "fiscal_label":
            add_gap(FISCAL_GAP)
        mid = classified.get("metric_id")
        if mid:
            mid = str(mid)
            if mid in slots:
                context.append((i, _context_row(c, mid, "structured_slot")))
                slot_key = parse_as_of(slots[mid]["as_of"]).get("sort_key") or ""
                own_key = parse_as_of(c.get("as_of")).get("sort_key") or ""
                if own_key > slot_key:
                    newer[mid] = newer.get(mid, 0) + 1
            elif structured_metric(mid, tax) or not sentence_fill_allowed(mid, tax):
                context.append((i, _context_row(c, mid, "no_structured_fact")))
                blocked[mid] = blocked.get(mid, 0) + 1
            elif not sentence_has_amount(mid, text, tax):
                context.append((i, _context_row(c, mid, "no_amount")))
            else:
                buckets.setdefault(mid, []).append((i, c))
        elif _has_figure(text):
            residual.append((i, c))

    indexed: list[tuple[int, dict[str, Any]]] = []
    superseded: list[dict[str, Any]] = []
    for mid, n in newer.items():
        add_gap(f"{mid}: {n} newer sentence(s) not used; live value is the companyfacts {slots[mid]['as_of']} fact")
    for mid in blocked:
        add_gap(HEADLINE_GAP.format(mid=mid))
    for k, row in enumerate(slots.values()):
        indexed.append((k, dict(row)))
    if buckets:
        add_gap(SENTENCE_GAP + ", ".join(sorted(buckets)))
    for mid, group in buckets.items():
        ordered = sorted(group, key=lambda ic: _claim_sort_key(ic[1], ic[0]), reverse=True)
        winner = dict(ordered[0][1])
        winner["metric_id"] = mid
        winner["origin"] = "sentence"
        winner["confidence"] = "low"
        indexed.append((ordered[0][0], winner))
        for _, old in ordered[1:]:
            superseded.append({
                "metric_id": mid,
                "id": old.get("id"),
                "as_of": old.get("as_of"),
                "grade": old.get("grade"),
                "text": old.get("text"),
                "source_id": old.get("source_id"),
            })

    if len(residual) > residual_cap:
        add_gap(f"{len(residual) - residual_cap} unclassified numbered claims omitted")
    residual_sorted = sorted(residual, key=lambda ic: _claim_sort_key(ic[1], ic[0]), reverse=True)[:residual_cap]
    for i, c in residual_sorted:
        row = dict(c)
        row["metric_id"] = "other"
        indexed.append((i, row))

    indexed.sort(key=lambda ic: _claim_sort_key(ic[1], ic[0]), reverse=True)
    live = [c for _, c in indexed]
    if gaps_out is not None:
        gaps_out.extend(gaps)
    if context_out is not None:
        context.sort(key=lambda ic: _claim_sort_key(ic[1], ic[0]), reverse=True)
        context_out.extend(row for _, row in context)
    return live, superseded


def claim_gaps(
    claims: list[dict[str, Any]],
    rules: dict[str, Any] | None = None,
    *,
    residual_cap: int = 8,
    facts: list[dict[str, Any]] | None = None,
) -> list[str]:
    gaps: list[str] = []
    live_claims(claims, rules, residual_cap=residual_cap, gaps_out=gaps, facts=facts)
    return gaps


def _risk_metric(name: str, rules: dict[str, Any]) -> str | None:
    t = (name or "").lower()
    for needle, mid in rules.get("risk_metric") or []:
        if _phrase_in(t, str(needle)):
            return str(mid)
    return None


def _currency_values(text: str) -> dict[str, list[float]]:
    by: dict[str, list[float]] = {}
    for amt in parse_amounts(text):
        if amt.get("unit") != "currency" or not amt.get("currency"):
            continue
        by.setdefault(str(amt["currency"]), []).append(float(amt["value"]))
    return by


def stale_tripwires(
    risks: list[dict[str, Any]],
    live: list[dict[str, Any]],
    rules: dict[str, Any] | None = None,
    gaps: list[str] | None = None,
) -> list[dict[str, Any]]:
    """WATCH/FIRED wires whose amount disagrees with the live claim in the same currency."""
    rules = rules or load_rules()
    by_metric = {c.get("metric_id"): c for c in live if c.get("metric_id") and c.get("metric_id") != "other"}
    out: list[dict[str, Any]] = []
    for r in risks or []:
        st = str(r.get("status") or "").upper()
        if st not in ("WATCH", "FIRED"):
            continue
        mid = _risk_metric(r.get("name") or r.get("id") or "", rules)
        if not mid or mid not in by_metric:
            continue
        claim = by_metric[mid]
        if claim.get("origin") in ("companyfacts", "xbrl"):
            unit = str(claim.get("unit") or "")
            claim_by = {unit: [float(claim["value"])]} if re.fullmatch(r"[A-Z]{3}", unit) else {}
        else:
            claim_by = _currency_values(claim.get("text") or "")
        if not claim_by:
            continue
        for tw in r.get("tripwires") or []:
            if not isinstance(tw, dict):
                continue
            state = str(tw.get("state") or "")
            tw_by = _currency_values(state)
            if not tw_by:
                continue
            shared = set(claim_by) & set(tw_by)
            if not shared:
                if gaps is not None:
                    msg = "cross-currency tripwire; currencies not compared"
                    if msg not in gaps:
                        gaps.append(msg)
                continue

            def close(a: float, b: float) -> bool:
                if a <= 0 or b <= 0:
                    return False
                return abs(a - b) / max(a, b) <= 0.15

            disagreed = False
            for cur in shared:
                live_amt = max(claim_by[cur])
                tw_amts = tw_by[cur]
                same_scale = [a for a in tw_amts if 0.2 * live_amt <= a <= 5 * live_amt]
                if not same_scale:
                    continue
                if any(close(a, live_amt) for a in same_scale):
                    continue
                disagreed = True
                break
            if not disagreed:
                continue
            out.append({
                "risk_id": r.get("id"),
                "risk_name": r.get("name"),
                "metric_id": mid,
                "tripwire_state": state,
                "live_claim_as_of": claim.get("as_of"),
                "live_claim_text": claim.get("text"),
                "live_claim_id": claim.get("id"),
            })
            break
    return out


def pack_claim(c: dict[str, Any]) -> dict[str, Any]:
    row = {
        "id": c.get("id"),
        "metric_id": c.get("metric_id"),
        "text": c.get("text"),
        "as_of": c.get("as_of"),
        "grade": c.get("grade"),
        "source_id": c.get("source_id"),
    }
    if c.get("origin"):
        row["origin"] = c.get("origin")
        row["confidence"] = c.get("confidence")
    if c.get("origin") in ("companyfacts", "xbrl"):
        for key in ("concept", "value", "unit"):
            row[key] = c.get(key)
    return row


def context_claim(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": c.get("id"),
        "metric_id": c.get("metric_id"),
        "text": (c.get("text") or "")[:240],
        "as_of": c.get("as_of"),
        "reason": c.get("reason"),
    }


def assemble_agent_pack(store: dict[str, Any], *, residual_cap: int = 8) -> dict[str, Any]:
    """Pinned ContextPack v2 from a compiled store dict. Does not write."""
    rules = load_rules()
    claims = list(store.get("claims") or [])
    extra: list[str] = []
    context: list[dict[str, Any]] = []
    live, superseded = live_claims(
        claims,
        rules,
        residual_cap=residual_cap,
        gaps_out=extra,
        facts=list(store.get("facts") or []),
        context_out=context,
    )
    all_risks = list(store.get("risks") or [])
    pin_risks = []
    for r in all_risks:
        st = str(r.get("status") or "").upper()
        if st not in ("WATCH", "FIRED"):
            continue
        pin_risks.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "status": r.get("status"),
            "grade": r.get("grade"),
            "summary": r.get("summary"),
            "houseview_trigger": r.get("houseview_trigger"),
            "tripwires": (r.get("tripwires") or [])[:4],
        })
    cc: list[str] = []
    stale = stale_tripwires(all_risks, live, rules, gaps=cc)
    hp = store.get("house_prior") or {}
    obj = store.get("object") or {}
    rs = store.get("risk_summary") or {}
    src_cat = [
        {"id": s.get("id"), "title": s.get("title"), "kind": s.get("kind")}
        for s in (store.get("sources") or [])[:12]
    ]
    gaps = list(store.get("gaps") or [])
    for g in extra + cc:
        if g not in gaps:
            gaps.append(g)
    built = {
        "schema": "contextpack.v2",
        "intent": "agent",
        "focus": store.get("focus"),
        "compiled_at": store.get("compiled_at"),
        "house_prior": {
            "play": hp.get("play"),
            "status": hp.get("status"),
            "date": hp.get("date"),
            "view_excerpt": (hp.get("view_excerpt") or "")[:1800],
        },
        "object": {
            "id": obj.get("id"),
            "name": obj.get("name"),
            "ticker": obj.get("ticker"),
            "summary": obj.get("summary"),
            "role_in_theses": (obj.get("role_in_theses") or "")[:500],
        },
        "pin": {
            "watch": rs.get("watch") or [],
            "fired": rs.get("fired") or [],
            "risks": pin_risks,
        },
        "claims": [pack_claim(c) for c in live],
        "context_claims": [context_claim(c) for c in context[:CONTEXT_CAP]],
        "superseded_count": len(superseded),
        "stale_tripwires": stale,
        "gaps": gaps,
        "sources": src_cat,
        "store_claims": len(claims),
        "decision_support_only": True,
    }
    from api.retrieve import enforce_char_budget
    import paths as _paths

    return enforce_char_budget(built, _paths.OVERVIEW_BUDGET_CHARS)


def to_agent_markdown(pack: dict[str, Any]) -> str:
    """Render the packed fields only. Do not read the store or restore a cut field."""
    lines: list[str] = []
    f = pack.get("focus") or {}
    lines.append(f"# {f.get('ticker', '?')} — agent ContextPack v2")
    lines.append(f"compiled_at: {pack.get('compiled_at', '?')}")
    lines.append(
        f"store_claims: {pack.get('store_claims', '?')} · live: {len(pack.get('claims') or [])} · "
        f"superseded: {pack.get('superseded_count', 0)}"
    )
    lines.append("")
    hp = pack.get("house_prior") or {}
    if hp.get("play") or hp.get("view_excerpt"):
        lines.append(f"## House (pinned) — {hp.get('status') or ''} · {hp.get('date') or 'n.d.'}")
        lines.append(hp.get("view_excerpt") or "")
        lines.append("")
    pin = pack.get("pin") or {}
    lines.append(
        f"## WATCH (pinned) — {', '.join(pin.get('watch') or ['—'])}"
    )
    if pin.get("fired"):
        lines.append(f"FIRED: {', '.join(pin.get('fired') or [])}")
    for r in pin.get("risks") or []:
        lines.append(f"- **{r.get('name')}** [{r.get('status')}] — {r.get('summary') or ''}")
    lines.append("")
    stale = pack.get("stale_tripwires") or []
    if stale:
        lines.append("## Stale tripwires (live claim disagrees)")
        for s in stale:
            lines.append(
                f"- {s.get('risk_name')}: wire `{s.get('tripwire_state')}` vs "
                f"[{s.get('live_claim_as_of')}] {s.get('live_claim_text')}"
            )
        lines.append("")
    claims = pack.get("claims") or []
    if claims:
        lines.append("## Live claims (one per metric)")
        for c in claims:
            tag = ""
            if c.get("origin") in ("companyfacts", "xbrl"):
                tag = " · tagged"
            elif c.get("confidence") == "low":
                tag = " · sentence, low confidence"
            lines.append(
                f"- `{c.get('metric_id')}`{tag} [{c.get('grade')}] ({c.get('as_of')}) {c.get('text')} "
                f"← {c.get('source_id')}"
            )
        lines.append("")
    context = pack.get("context_claims") or []
    if context:
        lines.append("## Context sentences (not live values)")
        for c in context:
            lines.append(f"- `{c.get('metric_id')}` ({c.get('as_of')}) {c.get('text')} — {c.get('reason')}")
        lines.append("")
    gaps = pack.get("gaps") or []
    lines.append("## Gaps")
    if not gaps:
        lines.append("- (none listed)")
    else:
        for g in gaps:
            lines.append(f"- {g}")
    lines.append("")
    lines.append("_Decision-support only. No buy/sell/hold/target/sizing._")
    return "\n".join(lines)
