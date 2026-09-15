"""ContextPack v2 — pinned book + one live claim per metric. No LLM. No store writes."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = ROOT / "schema" / "contextpack_metrics.json"

_AMOUNT_RE = re.compile(
    r"\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|trillion|b|m|k)?",
    re.I,
)
_PCT_OR_DOLLAR = re.compile(r"\$[\d,]+|\d+(?:\.\d+)?\s*%")

GRADE_W = {"A": 3, "B": 2, "C": 1}


def load_rules() -> dict[str, Any]:
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def classify_metric(text: str, rules: dict[str, Any] | None = None) -> str | None:
    t = (text or "").lower()
    rules = rules or load_rules()
    for rule in rules.get("metrics") or []:
        none = [n.lower() for n in (rule.get("none") or [])]
        if none and any(n in t for n in none):
            continue
        rx = rule.get("regex")
        if rx:
            if re.search(rx, t, re.I):
                return str(rule["id"])
            continue
        alls = [a.lower() for a in (rule.get("all") or [])]
        anys = [a.lower() for a in (rule.get("any") or [])]
        if alls and not all(a in t for a in alls):
            continue
        if anys and not any(a in t for a in anys):
            continue
        if alls or anys:
            return str(rule["id"])
    return None


def is_boilerplate(text: str, rules: dict[str, Any] | None = None) -> bool:
    t = (text or "").lower()
    rules = rules or load_rules()
    return any(p.lower() in t for p in (rules.get("boilerplate") or []))


def parse_amounts(text: str) -> list[float]:
    out: list[float] = []
    for m in _AMOUNT_RE.finditer(text or ""):
        try:
            n = float(m.group(1).replace(",", ""))
        except ValueError:
            continue
        unit = (m.group(2) or "").lower()
        if unit in ("billion", "b"):
            n *= 1_000_000_000
        elif unit in ("million", "m"):
            n *= 1_000_000
        elif unit in ("trillion",):
            n *= 1_000_000_000_000
        elif unit == "k":
            n *= 1_000
        out.append(n)
    return out


def _claim_key(c: dict[str, Any]) -> tuple:
    return (c.get("as_of") or "", GRADE_W.get(c.get("grade") or "C", 0))


def live_claims(
    claims: list[dict[str, Any]],
    rules: dict[str, Any] | None = None,
    *,
    residual_cap: int = 8,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """One latest claim per metric_id. Residual numbered claims capped. Boilerplate dropped."""
    rules = rules or load_rules()
    buckets: dict[str, list[dict[str, Any]]] = {}
    residual: list[dict[str, Any]] = []
    for c in claims or []:
        text = c.get("text") or ""
        mid = classify_metric(text, rules)
        if mid:
            buckets.setdefault(mid, []).append(c)
        elif is_boilerplate(text, rules):
            continue
        elif _PCT_OR_DOLLAR.search(text):
            residual.append(c)

    live: list[dict[str, Any]] = []
    superseded: list[dict[str, Any]] = []
    for mid, group in buckets.items():
        ordered = sorted(group, key=_claim_key, reverse=True)
        winner = dict(ordered[0])
        winner["metric_id"] = mid
        live.append(winner)
        for old in ordered[1:]:
            superseded.append({
                "metric_id": mid,
                "id": old.get("id"),
                "as_of": old.get("as_of"),
                "grade": old.get("grade"),
                "text": old.get("text"),
                "source_id": old.get("source_id"),
            })

    residual_sorted = sorted(residual, key=_claim_key, reverse=True)[:residual_cap]
    for c in residual_sorted:
        row = dict(c)
        row["metric_id"] = "other"
        live.append(row)

    live.sort(key=_claim_key, reverse=True)
    return live, superseded


def _risk_metric(name: str, rules: dict[str, Any]) -> str | None:
    t = (name or "").lower()
    for needle, mid in rules.get("risk_metric") or []:
        if str(needle).lower() in t:
            return str(mid)
    return None


def stale_tripwires(
    risks: list[dict[str, Any]],
    live: list[dict[str, Any]],
    rules: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """WATCH/FIRED wires whose $ state disagrees with the live claim for that metric."""
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
        claim_amts = parse_amounts(claim.get("text") or "")
        if not claim_amts:
            continue
        live_amt = max(claim_amts)
        for tw in r.get("tripwires") or []:
            if not isinstance(tw, dict):
                continue
            state = str(tw.get("state") or "")
            tw_amts = parse_amounts(state)
            if not tw_amts:
                continue
            def close(a: float, b: float) -> bool:
                if a <= 0 or b <= 0:
                    return False
                return abs(a - b) / max(a, b) <= 0.15

            same_scale = [a for a in tw_amts if 0.2 * live_amt <= a <= 5 * live_amt]
            if not same_scale:
                continue
            if any(close(a, live_amt) for a in same_scale):
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


def assemble_agent_pack(store: dict[str, Any], *, residual_cap: int = 8) -> dict[str, Any]:
    """Pinned ContextPack v2 from a compiled store dict. Does not write."""
    rules = load_rules()
    claims = list(store.get("claims") or [])
    live, superseded = live_claims(claims, rules, residual_cap=residual_cap)
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
    stale = stale_tripwires(all_risks, live, rules)
    hp = store.get("house_prior") or {}
    obj = store.get("object") or {}
    rs = store.get("risk_summary") or {}
    src_cat = [
        {"id": s.get("id"), "title": s.get("title"), "kind": s.get("kind")}
        for s in (store.get("sources") or [])[:12]
    ]
    return {
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
        "claims": [
            {
                "id": c.get("id"),
                "metric_id": c.get("metric_id"),
                "text": c.get("text"),
                "as_of": c.get("as_of"),
                "grade": c.get("grade"),
                "source_id": c.get("source_id"),
            }
            for c in live
        ],
        "superseded_count": len(superseded),
        "stale_tripwires": stale,
        "gaps": list(store.get("gaps") or []),
        "sources": src_cat,
        "store_claims": len(claims),
        "decision_support_only": True,
    }


def to_agent_markdown(pack: dict[str, Any]) -> str:
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
        lines.append((hp.get("view_excerpt") or "")[:1200])
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
            lines.append(
                f"- `{c.get('metric_id')}` [{c.get('grade')}] ({c.get('as_of')}) {c.get('text')} "
                f"← {c.get('source_id')}"
            )
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
