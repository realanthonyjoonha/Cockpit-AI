"""Tagged XBRL facts for live metric slots. No network. No model. No store writes.

Reads an inline XBRL (iXBRL) document or an XBRL instance as text and returns
normalized numeric facts: canonical concept, value after scale and sign, unit,
decimals, period, dimensions, filing date, and accession. Prefixes are resolved
through the document's xmlns declarations.

Same algorithm as memory-cockpit-v2/server/xbrlFacts.js. Parity is tested.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_PATH = ROOT / "schema" / "taxonomy_xbrl.json"

_TOKEN = re.compile(
    r"<!--.*?-->"
    r"|<!\[CDATA\[(?P<cdata>.*?)\]\]>"
    r"|<\?.*?\?>"
    r"|<![^>]*>"
    r"|<(?P<close>/)?(?P<name>[A-Za-z_][\w.\-]*(?::[A-Za-z_][\w.\-]*)?)"
    r"(?P<attrs>(?:\s+[^\s=/>]+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?)*)\s*(?P<self>/)?>",
    re.S,
)
_ATTR = re.compile(r"([^\s=/>]+)(?:\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+)))?")
_ENTITY = re.compile(r"&(#x[0-9A-Fa-f]+|#\d+|[A-Za-z]+);")
_NAMED = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "nbsp": "\u00a0"}
_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_PLAIN = re.compile(r"^-?\d+(?:\.\d+)?$")
_INT = re.compile(r"^[+-]?\d+$")
_NUM_WORDS = {
    "no": "0", "none": "0", "nil": "0", "zero": "0",
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
}
_TEXT_LOCALS = {"identifier", "startdate", "enddate", "instant", "explicitmember", "typedmember", "measure"}
_DATE_LOCALS = {"startdate": "startDate", "enddate": "endDate", "instant": "instant"}
_DOT_FORMATS = {"", "numdotdecimal", "num-dot-decimal"}
_COMMA_FORMATS = {"numcommadecimal", "num-comma-decimal"}
_ZERO_FORMATS = {"fixed-zero", "fixedzero", "zerodash"}
_WORD_FORMATS = {"numwordsen", "num-word-en"}
_ACCESSION = re.compile(r"ACCESSION[- ]NUMBER[^0-9A-Z]*([0-9]{10}-[0-9]{2}-[0-9]{6})", re.I)
_ACCESSION_NAME = re.compile(r"([0-9]{10}-[0-9]{2}-[0-9]{6})")
_FILING_DATE = re.compile(r"FILING[- ]DATE[^0-9]*([0-9]{4}-[0-9]{2}-[0-9]{2})", re.I)
_ACCEPT = re.compile(r"ACCEPTANCE-DATETIME[^0-9]*([0-9]{8})", re.I)
_TYPE = re.compile(r"(?:^|[\n<])TYPE[:\s>]*([A-Z0-9][-A-Z0-9/]+)", re.I)
_DEI_FLAG = re.compile(r'name="dei:AmendmentFlag"[^>]*>\s*(true|1|yes)', re.I)
_DEI_TYPE = re.compile(r'name="dei:DocumentType"[^>]*>\s*([^<]+)', re.I)
_RESTAT = re.compile(r"restat", re.I)

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
    spec = ((tax or load_taxonomy()).get("metrics") or {}).get(metric_id) or {}
    if spec.get("sentence_fill") is False:
        return False
    return True


def _decode(text: str) -> str:
    def sub(m: re.Match[str]) -> str:
        ent = m.group(1)
        if ent.startswith("#x"):
            return chr(int(ent[2:], 16))
        if ent.startswith("#"):
            return chr(int(ent[1:]))
        return _NAMED.get(ent, m.group(0))

    return _ENTITY.sub(sub, text)


def _attrs(raw: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in _ATTR.finditer(raw or ""):
        val = m.group(2)
        if val is None:
            val = m.group(3)
        if val is None:
            val = m.group(4)
        out[m.group(1)] = _decode(val or "")
    return out


def _local(name: str) -> str:
    return name.split(":")[-1]


def _canonical_prefix(prefix: str, prefixes: dict[str, str], namespaces: dict[str, list[str]]) -> str:
    uri = prefixes.get(prefix)
    if uri:
        for canon, uris in namespaces.items():
            if any(uri.startswith(u) for u in uris):
                return canon
    return prefix


def canonical_concept(qname: str, prefixes: dict[str, str], namespaces: dict[str, list[str]]) -> str:
    if ":" not in qname:
        return qname
    prefix, local = qname.split(":", 1)
    return f"{_canonical_prefix(prefix, prefixes, namespaces)}:{local}"


def _date_only(raw: str) -> str | None:
    m = _DATE.match((raw or "").strip())
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def _is_member(local: str) -> bool:
    loc = (local or "").lower()
    return loc in ("explicitmember", "typedmember") or loc.endswith("member")


def filing_meta(text: str, *, source_id: str | None = None, filed: str | None = None, accession: str | None = None) -> dict[str, Any]:
    """Filing date, accession, form, and amendment flag from the document or the caller."""
    blob = text or ""
    acc = accession or None
    m = _ACCESSION.search(blob)
    if not acc and m:
        acc = m.group(1)
    if not acc and source_id:
        n = _ACCESSION_NAME.search(source_id)
        if n:
            acc = n.group(1)
    day = filed or None
    d = _FILING_DATE.search(blob)
    if not day and d:
        day = d.group(1)
    if not day:
        a = _ACCEPT.search(blob)
        if a:
            raw = a.group(1)
            day = f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"
    form = None
    t = _DEI_TYPE.search(blob)
    if t:
        form = t.group(1).strip()
    if not form:
        t2 = _TYPE.search(blob)
        if t2:
            form = t2.group(1).strip()
    amendment = bool(_DEI_FLAG.search(blob)) or bool(form and form.upper().endswith("/A"))
    if source_id and re.search(r"10-?k/?a|10-?q/?a|20-?f/?a|amend", source_id, re.I):
        amendment = True
    return {"filed": day, "accession": acc, "form": form, "amendment": amendment}


def shift_decimal(num: str, scale: int) -> str:
    """Move the decimal point by scale digits on the string. No float rounding."""
    neg = num.startswith("-")
    s = num.lstrip("+-")
    ip, _, fp = s.partition(".")
    digits = ip + fp
    point = len(ip) + scale
    if point <= 0:
        digits = "0" * (1 - point) + digits
        point = 1
    if point > len(digits):
        digits = digits + "0" * (point - len(digits))
    ip, fp = digits[:point], digits[point:]
    ip = ip.lstrip("0") or "0"
    fp = fp.rstrip("0")
    out = ip + (f".{fp}" if fp else "")
    if neg and out != "0":
        out = "-" + out
    return out


def fact_number(text: str, fmt: str | None) -> str | None:
    """Displayed text plus ixt format to a plain decimal string, before scale and sign."""
    t = re.sub(r"\s+", " ", text or "").strip()
    local = _local(fmt or "").lower()
    if local in _ZERO_FORMATS:
        return "0"
    if local in _WORD_FORMATS:
        return _NUM_WORDS.get(t.lower().strip(" ."))
    if local in _COMMA_FORMATS:
        t = re.sub(r"[\s.'\u00a0]", "", t).replace(",", ".")
    elif local in _DOT_FORMATS:
        t = re.sub(r"[\s,'\u00a0]", "", t)
    else:
        return None
    if not _PLAIN.match(t):
        return None
    if t.startswith("-") and local:
        return None
    return t


def to_number(value_text: str) -> int | float:
    return float(value_text) if "." in value_text else int(value_text)


def _unit_string(unit: dict[str, list[str]]) -> str:
    def join(ms: list[str]) -> str:
        return "*".join(_local(m) for m in ms)

    if unit.get("num") or unit.get("den"):
        return f"{join(unit.get('num') or [])}/{join(unit.get('den') or [])}"
    return join(unit.get("measures") or [])


def _apply_sign(num: str, scale: int, sign: str | None) -> str:
    """iXBRL: sign='-' applies to the absolute displayed value. Scale first, then sign."""
    scaled = shift_decimal(num, scale)
    abs_text = scaled[1:] if scaled.startswith("-") else scaled
    if (sign or "").strip() == "-" and abs_text != "0":
        return "-" + abs_text
    if (sign or "").strip() == "-":
        return "0"
    return scaled


def parse_xbrl_facts(
    text: str,
    *,
    source_id: str | None = None,
    order_base: int = 0,
    filed: str | None = None,
    accession: str | None = None,
) -> dict[str, Any]:
    """Numeric facts from one iXBRL or XBRL instance document."""
    namespaces = load_taxonomy().get("namespaces") or {}
    prefixes: dict[str, str] = {}
    contexts: dict[str, dict[str, Any]] = {}
    units: dict[str, dict[str, list[str]]] = {}
    raw_facts: list[dict[str, Any]] = []
    stack: list[dict[str, Any]] = []
    exclude_depth = 0
    dup_context = 0
    pos = 0
    doc = text or ""
    meta = filing_meta(doc, source_id=source_id, filed=filed, accession=accession)

    def feed(chunk: str) -> None:
        if not chunk or exclude_depth:
            return
        for frame in stack:
            if frame["want"]:
                frame["text"].append(chunk)

    def inside(local: str) -> dict[str, Any] | None:
        want = local.lower()
        for frame in reversed(stack):
            if frame["local"].lower() == want:
                return frame
        return None

    def close(frame: dict[str, Any]) -> None:
        nonlocal exclude_depth, dup_context
        local = frame["local"]
        loc = local.lower()
        body = _decode("".join(frame["text"]))
        attrs = frame["attrs"]
        if loc == "exclude":
            exclude_depth -= 1
            return
        if frame["fact"]:
            raw_facts.append({
                "name": attrs.get("name") or frame["name"],
                "context": attrs.get("contextRef"),
                "unit": attrs.get("unitRef"),
                "decimals": attrs.get("decimals"),
                "scale": attrs.get("scale"),
                "sign": attrs.get("sign"),
                "format": attrs.get("format"),
                "nil": (attrs.get("xsi:nil") or attrs.get("nil") or "").lower() == "true",
                "text": body,
            })
            return
        ctx = inside("context")
        if ctx is not None and loc in _DATE_LOCALS:
            ctx["ctx"][_DATE_LOCALS[loc]] = _date_only(body)
        elif ctx is not None and loc == "forever":
            ctx["ctx"]["forever"] = True
        elif ctx is not None and _is_member(local):
            ctx["ctx"]["dims"].append([attrs.get("dimension") or "", body.strip() or "member"])
        elif ctx is not None and loc in ("segment", "scenario"):
            ctx["ctx"]["has_segment"] = True
        elif loc == "context" and attrs.get("id"):
            cid = attrs["id"]
            if cid not in contexts:
                contexts[cid] = frame["ctx"]
            else:
                dup_context += 1
        unit = inside("unit")
        if unit is not None and loc == "measure":
            if inside("unitNumerator") is not None:
                unit["unit"]["num"].append(body.strip())
            elif inside("unitDenominator") is not None:
                unit["unit"]["den"].append(body.strip())
            else:
                unit["unit"]["measures"].append(body.strip())
        elif loc == "unit" and attrs.get("id"):
            units[attrs["id"]] = frame["unit"]

    for m in _TOKEN.finditer(doc):
        feed(doc[pos:m.start()])
        pos = m.end()
        if m.group("cdata") is not None:
            feed(m.group("cdata"))
            continue
        name = m.group("name")
        if not name:
            continue
        if m.group("close"):
            for k in range(len(stack) - 1, -1, -1):
                if stack[k]["name"] == name:
                    while len(stack) > k:
                        close(stack.pop())
                    break
            continue
        attrs = _attrs(m.group("attrs") or "")
        for key, val in attrs.items():
            if key.startswith("xmlns:"):
                prefixes[key[6:]] = val
        local = _local(name)
        loc = local.lower()
        is_ix_fraction = loc == "nonfraction"
        is_instance_fact = (
            not is_ix_fraction
            and "contextRef" in attrs
            and "unitRef" in attrs
            and loc not in ("nonnumeric", "fraction")
        )
        frame = {
            "name": name,
            "local": local,
            "attrs": attrs,
            "text": [],
            "fact": is_ix_fraction or is_instance_fact,
            "want": is_ix_fraction or is_instance_fact or loc in _TEXT_LOCALS or _is_member(local),
            "ctx": {"dims": [], "has_segment": False} if loc == "context" else None,
            "unit": {"measures": [], "num": [], "den": []} if loc == "unit" else None,
        }
        if loc == "exclude":
            exclude_depth += 1
        stack.append(frame)
        if m.group("self"):
            close(stack.pop())
    feed(doc[pos:])
    while stack:
        close(stack.pop())

    facts: list[dict[str, Any]] = []
    counts = {"nil": 0, "no_context": 0, "no_unit": 0, "unparsed": 0, "conflict": 0}
    seen: dict[tuple[str, str, str], str] = {}
    for idx, raw in enumerate(raw_facts):
        if raw["nil"]:
            counts["nil"] += 1
            continue
        ctx = contexts.get(raw["context"] or "")
        if ctx is None:
            counts["no_context"] += 1
            continue
        unit = units.get(raw["unit"] or "")
        if unit is None:
            counts["no_unit"] += 1
            continue
        num = fact_number(raw["text"], raw["format"])
        if num is None:
            counts["unparsed"] += 1
            continue
        scale_raw = (raw["scale"] or "").strip()
        scale = int(scale_raw) if _INT.match(scale_raw) else 0
        value_text = _apply_sign(num, scale, raw["sign"])
        dec_raw = (raw["decimals"] or "").strip()
        decimals: Any = int(dec_raw) if _INT.match(dec_raw) else ("INF" if dec_raw.upper() == "INF" else None)
        if ctx.get("instant"):
            period = {"type": "instant", "start": None, "end": ctx["instant"]}
        elif ctx.get("endDate"):
            period = {"type": "duration", "start": ctx.get("startDate"), "end": ctx["endDate"]}
        else:
            period = {"type": "forever", "start": None, "end": None}
        concept = canonical_concept(raw["name"], prefixes, namespaces)
        unit_str = _unit_string(unit)
        key = (concept, raw["context"] or "", unit_str)
        if key in seen:
            if seen[key] != value_text:
                counts["conflict"] += 1
            continue
        seen[key] = value_text
        dims = [[canonical_concept(a, prefixes, namespaces), canonical_concept(b, prefixes, namespaces)] for a, b in ctx["dims"]]
        restated = bool(_RESTAT.search(raw["context"] or "")) or any(_RESTAT.search(a) or _RESTAT.search(b) for a, b in dims)
        facts.append({
            "concept": concept,
            "value": to_number(value_text),
            "value_text": value_text,
            "unit": unit_str,
            "decimals": decimals,
            "period": period,
            "dimensional": bool(dims) or bool(ctx.get("has_segment")),
            "dims": dims,
            "context_id": raw["context"],
            "source_id": source_id,
            "order": order_base + idx,
            "filed": meta["filed"],
            "accession": meta["accession"],
            "form": meta["form"],
            "amendment": bool(meta["amendment"]),
            "restated": restated,
        })
    notes: list[str] = []
    if dup_context:
        notes.append(f"xbrl: {dup_context} duplicate context id(s); first definition kept")
    if counts["conflict"]:
        notes.append(f"xbrl: {counts['conflict']} duplicate facts disagree; first kept")
    if counts["unparsed"]:
        notes.append(f"xbrl: {counts['unparsed']} facts with an unsupported format skipped")
    if counts["no_context"] or counts["no_unit"]:
        notes.append(f"xbrl: {counts['no_context'] + counts['no_unit']} facts without a context or unit skipped")
    return {"facts": facts, "notes": notes, "contexts": len(contexts), "units": len(units), "filing": meta}


def _days(period: dict[str, Any]) -> int:
    if period.get("type") != "duration" or not period.get("start") or not period.get("end"):
        return 0
    return (date.fromisoformat(period["end"]) - date.fromisoformat(period["start"])).days


def _duration_pref(days: int) -> int:
    """FY over quarter over YTD. A 10-Q quarter beats YTD; a 10-K year still beats Q4."""
    if days >= 341:
        return 2
    if 70 <= days <= 110:
        return 1
    return 0


def _unit_ok(unit: str, kind: str) -> bool:
    if kind == "currency":
        return re.fullmatch(r"[A-Z]{3}", unit or "") is not None
    if kind == "shares":
        return unit == "shares"
    return False


def concept_index(tax: dict[str, Any] | None = None) -> dict[str, str]:
    """canonical concept and bare local name to metric id. First metric listed wins a local name."""
    tax = tax or load_taxonomy()
    idx: dict[str, str] = {}
    for mid, spec in (tax.get("metrics") or {}).items():
        for concept in spec.get("concepts") or []:
            idx.setdefault(concept, mid)
            idx.setdefault(_local(concept), mid)
    return idx


def group_digits(value_text: str) -> str:
    neg = value_text.startswith("-")
    s = value_text.lstrip("-")
    ip, dot, fp = s.partition(".")
    out = ""
    while len(ip) > 3:
        out = "," + ip[-3:] + out
        ip = ip[:-3]
    out = ip + out + (dot + fp if dot else "")
    return ("-" if neg else "") + out


def _period_desc(period: dict[str, Any]) -> str:
    if period.get("type") == "duration":
        return f"{period.get('start')} to {period.get('end')}"
    return str(period.get("end"))


def _period_label(period: dict[str, Any]) -> str:
    if period.get("type") == "duration":
        return f"{period.get('start')}/{period.get('end')}"
    return str(period.get("end"))


def tagged_slots(facts: list[dict[str, Any]], tax: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    """One consolidated tagged fact per metric. Dimensional facts never fill a slot.

    Latest period end wins. Same end: later-filed/amended/restated, then FY over
    quarter over YTD, then concept priority, then later document order.
    """
    tax = tax or load_taxonomy()
    slots: dict[str, dict[str, Any]] = {}
    for mid, spec in (tax.get("metrics") or {}).items():
        concepts = list(spec.get("concepts") or [])
        if not concepts:
            continue
        want_period = spec.get("period")
        kind = spec.get("unit")
        cands = [
            f for f in facts or []
            if f.get("concept") in concepts
            and not f.get("dimensional")
            and (f.get("period") or {}).get("type") == want_period
            and (f.get("period") or {}).get("end")
            and _unit_ok(str(f.get("unit") or ""), str(kind))
        ]
        if not cands:
            continue

        def rank(f: dict[str, Any]) -> tuple:
            return (
                f["period"]["end"],
                f.get("filed") or "",
                1 if f.get("amendment") else 0,
                1 if f.get("restated") else 0,
                _duration_pref(_days(f["period"])),
                -concepts.index(f["concept"]),
                int(f.get("order") or 0),
            )

        win = max(cands, key=rank)
        same_end = [
            f for f in cands
            if f is not win
            and f["concept"] == win["concept"]
            and f["period"]["end"] == win["period"]["end"]
            and abs(_days(f["period"]) - _days(win["period"])) <= 7
            and f["value_text"] != win["value_text"]
        ]
        restated_from = max(same_end, key=rank) if same_end else None
        older = [
            f for f in cands
            if f["concept"] == win["concept"]
            and f["period"]["end"] < win["period"]["end"]
            and abs(_days(f["period"]) - _days(win["period"])) <= 7
        ]
        prior_year = max(older, key=rank) if older else None
        ytd = None
        if want_period == "duration" and _duration_pref(_days(win["period"])) == 1:
            longer = [
                f for f in cands
                if f["period"]["end"] == win["period"]["end"]
                and 111 <= _days(f["period"]) <= 340
            ]
            if longer:
                ytd = max(longer, key=rank)
        text = (
            f"{_local(win['concept'])} {win['unit']} {group_digits(win['value_text'])} for {_period_desc(win['period'])}"
            f" (consolidated tagged fact"
        )
        prior = None
        if restated_from:
            text += f"; restated from {group_digits(restated_from['value_text'])}"
            prior = {
                "end": restated_from["period"]["end"],
                "value": restated_from["value"],
                "value_text": restated_from["value_text"],
                "restated": True,
                "source_id": restated_from.get("source_id"),
            }
        if prior_year:
            text += f"; prior {prior_year['period']['end']}: {group_digits(prior_year['value_text'])}"
            if prior is None:
                prior = {"end": prior_year["period"]["end"], "value": prior_year["value"], "value_text": prior_year["value_text"]}
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
            "origin": "xbrl",
            "confidence": "tagged",
            "concept": win["concept"],
            "value": win["value"],
            "value_text": win["value_text"],
            "unit": win["unit"],
            "decimals": win.get("decimals"),
            "period": dict(win["period"]),
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


def mapped_facts(facts: list[dict[str, Any]], tax: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Consolidated facts whose concept is in the map. What compile keeps in the store."""
    tax = tax or load_taxonomy()
    known = {c for spec in (tax.get("metrics") or {}).values() for c in (spec.get("concepts") or [])}
    return [f for f in facts or [] if f.get("concept") in known and not f.get("dimensional")]
