"""Deterministic retrieve(focus, intent) → ContextPack (budgeted)."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import paths

INTENT_OVERVIEW = "overview"
INTENT_RISKS = "risks"
INTENT_CATALYSTS = "catalysts"
VALID_INTENTS = {INTENT_OVERVIEW, INTENT_RISKS, INTENT_CATALYSTS}

# Map aliases → store file stem
FOCUS_ALIASES = {
    "mu": "MU",
    "micron": "MU",
    "micron-technology": "MU",
    "nbis": "NBIS",
    "nebius": "NBIS",
    "nebius-group": "NBIS",
}


def resolve_ticker(focus: str) -> str:
    key = focus.strip().lower()
    if key in FOCUS_ALIASES:
        return FOCUS_ALIASES[key]
    # direct ticker file
    cand = focus.strip().upper()
    if (paths.BY_TICKER / f"{cand}.json").exists():
        return cand
    raise KeyError("no compiled pack for this focus")


def load_store(ticker: str) -> dict[str, Any]:
    path = paths.BY_TICKER / f"{ticker.upper()}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"No compiled pack at {path}. Run: python -m compile.run {ticker}"
        )
    return json.loads(path.read_text(encoding="utf-8"))


# House fields the markdown renderer reads. Anything else is not an overview field.
HOUSE_PRIOR_KEYS = ("play", "status", "date", "view_excerpt")

# Keys that may appear in an overview, agent, or snapshot pack. No per-ticker extras.
PACK_KEYS = {
    "schema",
    "intent",
    "focus",
    "compiled_at",
    "house_prior",
    "object",
    "claims",
    "risk_summary",
    "risks",
    "series_snapshot",
    "catalysts",
    "sources",
    "related",
    "gaps",
    "provenance",
    "pin",
    "superseded_count",
    "stale_tripwires",
    "store_claims",
    "context_claims",
    "decision_support_only",
    "budget",
    "available",
    "ticker",
    "slug",
    "pack_path",
    "contextpack",
    "sor_ahead_of_pack",
    "note",
}


def _measure_pack(pack: dict[str, Any]) -> int:
    return len(json.dumps(pack, ensure_ascii=False))


def _add_gap(pack: dict[str, Any], msg: str) -> None:
    gaps = list(pack.get("gaps") or [])
    if msg not in gaps:
        gaps.append(msg)
    pack["gaps"] = gaps


def _seal(pack: dict[str, Any], limit: int, trimmed: bool, measure) -> int:
    pack["budget"] = {
        "limit_chars": limit,
        "used_chars": 0,
        "trimmed": bool(trimmed),
    }
    for _ in range(4):
        n = measure(pack)
        if pack["budget"]["used_chars"] == n:
            return n
        pack["budget"]["used_chars"] = n
    return measure(pack)


def _allowlist(pack: dict[str, Any]) -> bool:
    """Drop unknown house_prior fields and unknown top-level keys. Copy, do not mutate the store."""
    changed = False
    hp = pack.get("house_prior")
    if isinstance(hp, dict):
        dropped = [k for k in hp.keys() if k not in HOUSE_PRIOR_KEYS]
        pack["house_prior"] = {k: hp[k] for k in HOUSE_PRIOR_KEYS if k in hp}
        for key in dropped:
            _add_gap(pack, f"dropped house_prior.{key}")
        if dropped:
            changed = True
    for key in [k for k in list(pack.keys()) if k not in PACK_KEYS]:
        pack.pop(key, None)
        _add_gap(pack, f"dropped key {key}")
        changed = True
    return changed


def _clip_claim_texts(pack: dict[str, Any], n: int, metric_id: str | None) -> bool:
    changed = False
    out: list[Any] = []
    for claim in pack.get("claims") or []:
        if not isinstance(claim, dict):
            out.append(claim)
            continue
        row = dict(claim)
        if metric_id is None or row.get("metric_id") == metric_id:
            text = row.get("text")
            if isinstance(text, str) and len(text) > n:
                row["text"] = text[:n]
                changed = True
        out.append(row)
    if changed:
        pack["claims"] = out
    return changed


def _clip_object(pack: dict[str, Any], n: int) -> bool:
    obj = pack.get("object")
    if not isinstance(obj, dict):
        return False
    row = dict(obj)
    changed = False
    for key in ("summary", "role_in_theses"):
        val = row.get(key)
        if isinstance(val, str) and len(val) > n:
            row[key] = val[:n]
            changed = True
    stance = row.get("stance")
    if isinstance(stance, list) and len(stance) > 4:
        row["stance"] = stance[:4]
        changed = True
    if changed:
        pack["object"] = row
    return changed


def _clip_risks(pack: dict[str, Any], summary_n: int, trip_n: int | None) -> bool:
    risks = pack.get("risks")
    if not isinstance(risks, list):
        return False
    changed = False
    out: list[Any] = []
    for risk in risks:
        if not isinstance(risk, dict):
            out.append(risk)
            continue
        row = dict(risk)
        summary = row.get("summary")
        if isinstance(summary, str) and len(summary) > summary_n:
            row["summary"] = summary[:summary_n]
            changed = True
        wires = row.get("tripwires")
        if trip_n is not None and isinstance(wires, list) and len(wires) > trip_n:
            row["tripwires"] = wires[:trip_n]
            changed = True
        out.append(row)
    if changed:
        pack["risks"] = out
    return changed


def _clip_pin(pack: dict[str, Any], n: int) -> bool:
    pin = pack.get("pin")
    if not isinstance(pin, dict) or not isinstance(pin.get("risks"), list):
        return False
    changed = False
    risks = []
    for risk in pin["risks"]:
        if not isinstance(risk, dict):
            risks.append(risk)
            continue
        row = dict(risk)
        summary = row.get("summary")
        if isinstance(summary, str) and len(summary) > n:
            row["summary"] = summary[:n]
            changed = True
        risks.append(row)
    if changed:
        pinned = dict(pin)
        pinned["risks"] = risks
        pack["pin"] = pinned
    return changed


def _clip_excerpt(pack: dict[str, Any], n: int) -> bool:
    hp = pack.get("house_prior")
    if not isinstance(hp, dict):
        return False
    val = hp.get("view_excerpt")
    if not isinstance(val, str) or len(val) <= n:
        return False
    row = dict(hp)
    row["view_excerpt"] = val[:n]
    pack["house_prior"] = row
    return True


def _clip_provenance(pack: dict[str, Any], n: int) -> bool:
    prov = pack.get("provenance")
    if not isinstance(prov, dict):
        return False
    note = prov.get("note")
    if not isinstance(note, str) or len(note) <= n:
        return False
    pack["provenance"] = {
        "note": note[:n],
        "pack_config": prov.get("pack_config") or "",
    }
    return True


def _take_list(pack: dict[str, Any], key: str, n: int) -> bool:
    rows = pack.get(key)
    if not isinstance(rows, list) or len(rows) <= n:
        return False
    pack[key] = rows[:n]
    return True


def _clear_list(pack: dict[str, Any], key: str) -> bool:
    rows = pack.get(key)
    if not isinstance(rows, list) or not rows:
        return False
    pack[key] = []
    return True


def _drop_other_claims(pack: dict[str, Any]) -> bool:
    claims = [c for c in (pack.get("claims") or []) if isinstance(c, dict)]
    kept = [c for c in claims if c.get("metric_id") != "other"]
    dropped = len(claims) - len(kept)
    if not dropped:
        return False
    pack["claims"] = kept
    _add_gap(pack, f"{dropped} residual claims omitted")
    return True


def _is_tagged_claim(claim: dict[str, Any]) -> bool:
    return claim.get("origin") == "xbrl" or claim.get("confidence") == "tagged"


def _drop_tail_claim(pack: dict[str, Any]) -> bool:
    claims = [c for c in (pack.get("claims") or []) if isinstance(c, dict)]
    if not claims:
        return False
    idx = next((i for i in range(len(claims) - 1, -1, -1) if not _is_tagged_claim(claims[i])), None)
    if idx is None:
        idx = len(claims) - 1
    dropped = claims[idx]
    pack["claims"] = [c for i, c in enumerate(claims) if i != idx]
    ident = dropped.get("id") or dropped.get("metric_id") or "claim"
    _add_gap(pack, f"dropped claim {ident}")
    return True


def _drop_untagged_claims(pack: dict[str, Any]) -> bool:
    claims = [c for c in (pack.get("claims") or []) if isinstance(c, dict)]
    kept = [c for c in claims if _is_tagged_claim(c)]
    dropped = len(claims) - len(kept)
    if not dropped:
        return False
    pack["claims"] = kept
    _add_gap(pack, f"{dropped} untagged claims omitted")
    return True


def _stub_pack(pack: dict[str, Any], limit: int, measure) -> dict[str, Any]:
    """Last resort. Identity, house status and date, and the over-budget gap stay."""
    focus = pack.get("focus") if isinstance(pack.get("focus"), dict) else {}
    hp = pack.get("house_prior") if isinstance(pack.get("house_prior"), dict) else {}
    gaps = [g for g in (pack.get("gaps") or []) if isinstance(g, str) and len(g) <= 180]
    if "pack was over budget" not in gaps:
        gaps.append("pack was over budget")
    stub: dict[str, Any] = {
        "focus": {
            "id": str(focus.get("id") or "")[:64],
            "ticker": str(focus.get("ticker") or "")[:16],
        },
        "intent": str(pack.get("intent") or "overview")[:32],
        "house_prior": {
            "status": str(hp.get("status") or "")[:32],
            "date": str(hp.get("date") or "")[:32],
        },
        "gaps": gaps[:12],
        "claims": [],
        "budget": {"limit_chars": limit, "used_chars": 0, "trimmed": True},
    }
    if measure(stub) > limit:
        stub["gaps"] = ["pack was over budget"]
        stub["focus"] = {"ticker": stub["focus"].get("ticker", "")[:12]}
    _seal(stub, limit, True, measure)
    return stub


def enforce_char_budget(
    pack: dict[str, Any],
    limit: int,
    measure=None,
) -> dict[str, Any]:
    """Allowlist cutter. Post-condition: measured size <= limit, including budget metadata.

    The same limit is used for every focus. Unknown house_prior fields are dropped.
    Claim text shrinks before gaps, focus identity, and house status/date.
    Residual metric_id "other" is dropped before named metrics when the live set
    itself does not fit. trimmed=true with used_chars over the limit is not returned.
    """
    if measure is None:
        measure = _measure_pack
    limit = int(limit)
    trimmed = _allowlist(pack)

    def fits() -> bool:
        return _seal(pack, limit, trimmed, measure) <= limit

    if fits():
        return pack
    trimmed = True
    steps = [
        lambda: _clear_list(pack, "related"),
        lambda: _clear_list(pack, "context_claims"),
        lambda: _clip_claim_texts(pack, 480, "other"),
        lambda: _clip_claim_texts(pack, 480, None),
        lambda: _clip_object(pack, 300),
        lambda: _clip_risks(pack, 160, 2),
        lambda: _clip_pin(pack, 160),
        lambda: _clip_excerpt(pack, 500),
        lambda: _clip_provenance(pack, 120),
        lambda: _take_list(pack, "catalysts", 4),
        lambda: _take_list(pack, "series_snapshot", 4),
        lambda: _take_list(pack, "sources", 4),
        lambda: _clip_excerpt(pack, 200),
        lambda: _clip_claim_texts(pack, 160, "other"),
        lambda: _clip_claim_texts(pack, 160, None),
        lambda: _drop_other_claims(pack),
        lambda: _clip_claim_texts(pack, 80, None),
        lambda: _clip_excerpt(pack, 80),
        lambda: _clear_list(pack, "catalysts"),
        lambda: _clear_list(pack, "series_snapshot"),
        lambda: _clear_list(pack, "sources"),
        lambda: _take_list(pack, "risks", 2),
        lambda: _drop_tail_claim(pack),
        lambda: _drop_tail_claim(pack),
        lambda: _drop_tail_claim(pack),
        lambda: _drop_tail_claim(pack),
        lambda: _drop_untagged_claims(pack),
        lambda: _drop_tail_claim(pack),
        lambda: _drop_tail_claim(pack),
        lambda: _clear_list(pack, "claims"),
        lambda: _clear_list(pack, "risks"),
        lambda: _clear_list(pack, "stale_tripwires"),
    ]
    for step in steps:
        if fits():
            return pack
        step()
    if fits():
        return pack
    stub = _stub_pack(pack, limit, measure)
    pack.clear()
    pack.update(stub)
    if measure(pack) > limit:
        pack.clear()
        pack.update({
            "gaps": ["pack was over budget"],
            "budget": {"limit_chars": limit, "used_chars": 0, "trimmed": True},
        })
        _seal(pack, limit, True, measure)
    return pack


def _budget_cut(pack: dict[str, Any], limit: int) -> dict[str, Any]:
    return enforce_char_budget(pack, limit)


def _overview_claims(store: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    """One live claim per metric. Newest-12 is not the overview rule."""
    from api.contextpack import live_claims, load_rules, pack_claim

    extra: list[str] = []
    live, _superseded = live_claims(
        list(store.get("claims") or []),
        load_rules(),
        gaps_out=extra,
        facts=list(store.get("facts") or []),
    )
    return [pack_claim(c) for c in live], extra


def retrieve(
    focus: str,
    intent: str = INTENT_OVERVIEW,
    budget: int | None = None,
) -> dict[str, Any]:
    intent = (intent or INTENT_OVERVIEW).lower().strip()
    if intent not in VALID_INTENTS:
        raise ValueError(f"intent must be one of {sorted(VALID_INTENTS)}")

    ticker = resolve_ticker(focus)
    store = load_store(ticker)
    limit = budget if budget is not None else paths.OVERVIEW_BUDGET_CHARS
    house = store.get("house_prior")

    base = {
        "focus": store.get("focus"),
        "compiled_at": store.get("compiled_at"),
        "intent": intent,
        "house_prior": dict(house) if isinstance(house, dict) else house,
        "gaps": list(store.get("gaps") or []),
        "provenance": store.get("provenance"),
    }

    if intent == INTENT_RISKS:
        pack = {
            **base,
            "risk_summary": store.get("risk_summary"),
            "risks": store.get("risks") or [],
            "series_snapshot": list(store.get("series_snapshot") or []),
        }
        return _budget_cut(pack, limit)

    if intent == INTENT_CATALYSTS:
        pack = {
            **base,
            "catalysts": store.get("catalysts") or [],
            "object": {
                "id": (store.get("object") or {}).get("id"),
                "name": (store.get("object") or {}).get("name"),
                "ticker": (store.get("object") or {}).get("ticker"),
            },
        }
        return _budget_cut(pack, limit)

    # overview
    obj = dict(store.get("object") or {})
    # keep overview lean
    if "role_in_theses" in obj and len(obj["role_in_theses"] or "") > 800:
        obj["role_in_theses"] = (obj["role_in_theses"] or "")[:800] + "…"

    # Source catalog only (id/title/lines/path) — never embed full 20–40pp masters here
    src_cat = [
        {
            "id": s.get("id"),
            "title": s.get("title"),
            "kind": s.get("kind"),
            "n_lines": s.get("n_lines"),
            "path": s.get("path"),
        }
        for s in (store.get("sources") or [])[:15]
    ]

    claims, extra_gaps = _overview_claims(store)
    for gap in extra_gaps:
        if gap not in base["gaps"]:
            base["gaps"].append(gap)

    pack = {
        **base,
        "object": obj,
        "claims": claims,
        "risk_summary": store.get("risk_summary"),
        "risks": [
            {
                "id": r.get("id"),
                "name": r.get("name"),
                "status": r.get("status"),
                "summary": r.get("summary"),
                "houseview_trigger": r.get("houseview_trigger"),
                "tripwires": (r.get("tripwires") or [])[:4],
            }
            for r in (store.get("risks") or [])[:10]
        ],
        "series_snapshot": store.get("series_snapshot") or [],
        "catalysts": (store.get("catalysts") or [])[:6],
        "sources": src_cat,
        "related": store.get("related") or [],
    }
    return _budget_cut(pack, limit)


def to_markdown(pack: dict[str, Any]) -> str:
    """Human-readable underwrite surface (not for agents only)."""
    lines: list[str] = []
    f = pack.get("focus") or {}
    lines.append(f"# {f.get('ticker', '?')} — {pack.get('intent', 'overview')}")
    lines.append(f"compiled_at: {pack.get('compiled_at', '?')}")
    if pack.get("budget"):
        b = pack["budget"]
        lines.append(
            f"budget: {b.get('used_chars')}/{b.get('limit_chars')} chars"
            f"{' (trimmed)' if b.get('trimmed') else ''}"
        )
    lines.append("")

    hp = pack.get("house_prior")
    if hp:
        lines.append(
            f"## House prior — {hp.get('play')} ({hp.get('status')} · {hp.get('date') or 'n.d.'})"
        )
        lines.append((hp.get("view_excerpt") or "")[:900])
        lines.append("")

    obj = pack.get("object") or {}
    if obj.get("summary") or obj.get("stance"):
        lines.append(f"## Company — {obj.get('name')} ({obj.get('ticker')})")
        if obj.get("summary"):
            lines.append(obj["summary"])
        for s in obj.get("stance") or []:
            lines.append(f"- **{s.get('label')}:** {s.get('text')}")
        lines.append("")

    claims = pack.get("claims") or []
    if claims:
        lines.append("## Claims (graded)")
        for c in claims:
            lines.append(
                f"- [{c.get('grade')}] ({c.get('as_of')}) {c.get('text')} "
                f"← {c.get('source_id')}"
            )
        lines.append("")

    rs = pack.get("risk_summary") or {}
    risks = pack.get("risks") or []
    if risks or rs:
        lines.append(
            f"## Risks — {rs.get('count', len(risks))} total; "
            f"WATCH: {', '.join(rs.get('watch') or ['—'])}"
        )
        for r in risks:
            lines.append(
                f"- **{r.get('name')}** [{r.get('status')}] — {r.get('summary')}"
            )
        lines.append("")

    series = pack.get("series_snapshot") or []
    if series:
        lines.append("## Series snapshot")
        for s in series:
            if s.get("error"):
                lines.append(f"- {s.get('id')}: ({s.get('error')})")
            else:
                lines.append(
                    f"- {s.get('id')}: {s.get('latest')} as of {s.get('as_of')}"
                )
        lines.append("")

    cats = pack.get("catalysts") or []
    if cats:
        lines.append("## Catalysts")
        for c in cats:
            lines.append(
                f"- {c.get('when')}: {c.get('event')} ({c.get('name')})"
            )
        lines.append("")

    sources = pack.get("sources") or []
    if sources:
        lines.append("## Research sources (catalog — open with `ont source`)")
        for s in sources[:12]:
            lines.append(
                f"- `{s.get('id')}` — {s.get('title')} "
                f"[{s.get('kind')}, {s.get('n_lines')} lines]"
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
