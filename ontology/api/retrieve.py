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
    raise KeyError(f"Unknown focus '{focus}'. Known: {sorted(set(FOCUS_ALIASES.values()))}")


def load_store(ticker: str) -> dict[str, Any]:
    path = paths.BY_TICKER / f"{ticker.upper()}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"No compiled pack at {path}. Run: python -m compile.run {ticker}"
        )
    return json.loads(path.read_text(encoding="utf-8"))


def _trim_claims(claims: list[dict], n: int = 12) -> list[dict]:
    # Prefer newer as_of, then grade A > B > C
    grade_rank = {"A": 0, "B": 1, "C": 2}

    def key(c: dict):
        return (
            c.get("as_of") or "",
            -grade_rank.get(c.get("grade") or "C", 9),
        )

    ordered = sorted(claims, key=key, reverse=True)
    return ordered[:n]


def _pack_size(pack: dict[str, Any]) -> int:
    return len(json.dumps(pack, ensure_ascii=False))


def _budget_cut(pack: dict[str, Any], limit: int) -> dict[str, Any]:
    """Shrink pack until JSON size <= limit (including budget metadata)."""
    trimmed = False

    def apply_budget_meta(used: int) -> None:
        pack["budget"] = {
            "limit_chars": limit,
            "used_chars": used,
            "trimmed": trimmed,
        }

    # Aim below limit before attaching budget metadata (~100 chars)
    soft = max(limit - 100, 500)

    steps = [
        lambda p: p.__setitem__("related", []),
        lambda p: p.__setitem__("claims", (p.get("claims") or [])[:8]),
        lambda p: p.__setitem__("claims", (p.get("claims") or [])[:5]),
        lambda p: [
            r.__setitem__("tripwires", (r.get("tripwires") or [])[:2])
            for r in (p.get("risks") or [])
        ],
        lambda p: p.__setitem__("risks", (p.get("risks") or [])[:5]),
        lambda p: p.__setitem__("catalysts", (p.get("catalysts") or [])[:3]),
        lambda p: p.get("object", {}).__setitem__(
            "role_in_theses", ((p.get("object") or {}).get("role_in_theses") or "")[:300]
        ),
        lambda p: p.get("object", {}).__setitem__(
            "stance", ((p.get("object") or {}).get("stance") or [])[:4]
        ),
        lambda p: (p.get("house_prior") or {}).__setitem__(
            "view_excerpt", ((p.get("house_prior") or {}).get("view_excerpt") or "")[:500]
        ),
        lambda p: p.__setitem__("claims", (p.get("claims") or [])[:3]),
        lambda p: p.__setitem__("series_snapshot", (p.get("series_snapshot") or [])[:3]),
        lambda p: p.__setitem__("risks", (p.get("risks") or [])[:3]),
        lambda p: p.__setitem__("provenance", {
            "note": (p.get("provenance") or {}).get("note", ""),
            "pack_config": (p.get("provenance") or {}).get("pack_config", ""),
        }),
        lambda p: (p.get("house_prior") or {}).__setitem__(
            "view_excerpt", ((p.get("house_prior") or {}).get("view_excerpt") or "")[:350]
        ),
        lambda p: p.__setitem__("claims", (p.get("claims") or [])[:2]),
    ]
    for step in steps:
        if _pack_size(pack) <= soft:
            break
        step(pack)
        trimmed = True

    # Attach budget; re-trim if metadata pushed us over
    apply_budget_meta(_pack_size(pack))
    hard_steps = [
        lambda p: p.__setitem__("catalysts", (p.get("catalysts") or [])[:2]),
        lambda p: p.__setitem__("series_snapshot", (p.get("series_snapshot") or [])[:2]),
        lambda p: p.__setitem__("risks", (p.get("risks") or [])[:2]),
        lambda p: p.get("object", {}).__setitem__("stance", ((p.get("object") or {}).get("stance") or [])[:2]),
    ]
    for step in hard_steps:
        if _pack_size(pack) <= limit:
            break
        step(pack)
        trimmed = True
        apply_budget_meta(_pack_size(pack))

    if _pack_size(pack) > limit:
        gaps = list(pack.get("gaps") or [])
        msg = f"pack over budget after trim ({_pack_size(pack)} > {limit})"
        if msg not in gaps:
            gaps.append(msg)
        pack["gaps"] = gaps
        # drop provenance entirely if needed
        pack.pop("provenance", None)
        apply_budget_meta(_pack_size(pack))

    apply_budget_meta(_pack_size(pack))
    return pack


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

    base = {
        "focus": store.get("focus"),
        "compiled_at": store.get("compiled_at"),
        "intent": intent,
        "house_prior": store.get("house_prior"),
        "gaps": list(store.get("gaps") or []),
        "provenance": store.get("provenance"),
    }

    if intent == INTENT_RISKS:
        pack = {
            **base,
            "risk_summary": store.get("risk_summary"),
            "risks": store.get("risks") or [],
            "series_snapshot": [
                s for s in (store.get("series_snapshot") or [])
                if s.get("id", "").startswith("mu") or s.get("id") in (
                    "price-mu", "micron-capex", "dram-spot-ddr5", "price-dram-etf"
                )
            ],
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

    pack = {
        **base,
        "object": obj,
        "claims": _trim_claims(list(store.get("claims") or []), 12),
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
