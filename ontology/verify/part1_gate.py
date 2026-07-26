"""
Part 1 structural + optional human gates.

Fail-closed. Does not write house or risks. Does not judge thesis quality.
See PART1-GATE.md.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

import paths
from compile.from_wiki import CLAIM_RE, parse_entity
from compile.from_house_view import parse_house_view

ADVICE_KEYS = ("recommendation", "price_target", "position_size", "buy_sell")
VALID_GRADES = frozenset({"A", "B", "C"})
VALID_HOUSE = frozenset({"CONFIRMED", "FORMING", "DRAFT"})
VALID_RISK_STATUS = frozenset({"INTACT", "WATCH", "FIRED", "RESOLVED", "CLOSED", "MONITOR"})

MIN_CLAIMS = 10
MIN_RISKS = 6
MIN_SOURCES = 1

# Status line in risks SoR
ACCEPTED_RE = re.compile(
    r"(?:status:\s*)?\*{0,2}ACCEPTED\*{0,2}\b|"
    r"ACCEPTED\s+(?:ALL|by\s+Anthony)|"
    r"\*\*ACCEPTED\*\*",
    re.I,
)
PENDING_ACCEPT_RE = re.compile(r"pending|not\s+auto-accepted|Step\s*4\s+accept", re.I)


@dataclass
class Check:
    id: str
    ok: bool
    detail: str
    tier: str = "structural"  # structural | human


@dataclass
class GateResult:
    ticker: str
    ok: bool
    exit_code: int
    checks: list[Check] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ticker": self.ticker,
            "ok": self.ok,
            "exit_code": self.exit_code,
            "summary": self.summary,
            "checks": [asdict(c) for c in self.checks],
            "failed": [asdict(c) for c in self.checks if not c.ok],
        }

    def report_text(self) -> str:
        lines = [
            f"Part 1 verify · {self.ticker} · {'PASS' if self.ok else 'FAIL'} · exit {self.exit_code}",
            "",
        ]
        for c in self.checks:
            mark = "✓" if c.ok else "✗"
            lines.append(f"  {mark} [{c.tier}] {c.id}: {c.detail}")
        if self.summary:
            lines.append("")
            lines.append("summary: " + json.dumps(self.summary, ensure_ascii=False))
        return "\n".join(lines) + "\n"


def _load_pack_config(ticker: str) -> dict[str, Any] | None:
    path = paths.PACKS / f"{ticker.upper()}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _load_store(ticker: str) -> dict[str, Any] | None:
    path = paths.BY_TICKER / f"{ticker.upper()}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _wiki_path(rel: str) -> Path:
    return paths.WIKI / rel if not Path(rel).is_absolute() else Path(rel)


def _house_status_from_file(house_path: Path) -> str | None:
    if not house_path.exists():
        return None
    plays = parse_house_view(house_path).get("plays") or []
    if not plays:
        return None
    return str(plays[0].get("status") or "").upper() or None


def _count_unparsed_claim_bullets(entity_path: Path) -> int:
    """Bullets under Key facts that look graded but fail CLAIM_RE."""
    text = entity_path.read_text(encoding="utf-8") if entity_path.exists() else ""
    # section extract light
    m = re.search(
        r"^##\s+Key facts[^\n]*\n(.*?)(?=^##\s+|\Z)",
        text,
        re.M | re.S | re.I,
    )
    sec = m.group(1) if m else ""
    n = 0
    for line in sec.splitlines():
        s = line.strip()
        if not s.startswith("-"):
            continue
        if re.search(r"\[[ABC]\]", s) and not CLAIM_RE.search(s):
            n += 1
    return n


def _risks_accepted(sor_path: Path) -> bool:
    if not sor_path.exists():
        return False
    body = sor_path.read_text(encoding="utf-8")
    # Prefer explicit ACCEPTED over pending noise
    if ACCEPTED_RE.search(body):
        # If both pending and accepted, accepted log rows win if "ACCEPTED" in acceptance log
        return True
    return False


def verify_part1(
    ticker: str,
    *,
    require_confirmed: bool = False,
    require_risks_accepted: bool = False,
    min_claims: int = MIN_CLAIMS,
    min_risks: int = MIN_RISKS,
) -> GateResult:
    t = ticker.upper().strip()
    checks: list[Check] = []
    summary: dict[str, Any] = {"ticker": t}

    def add(cid: str, ok: bool, detail: str, tier: str = "structural") -> None:
        checks.append(Check(id=cid, ok=ok, detail=detail, tier=tier))

    cfg = _load_pack_config(t)
    add(
        "pack_config",
        cfg is not None,
        f"packs/{t}.json" + (" ok" if cfg else " MISSING"),
    )
    if not cfg:
        return GateResult(ticker=t, ok=False, exit_code=1, checks=checks, summary=summary)

    slug = cfg.get("entity_slug") or cfg.get("focus_id") or t.lower()
    entity_rel = f"wiki/entities/{slug}.md"
    entity_path = paths.WIKI / entity_rel
    add("entity_file", entity_path.exists(), str(entity_path))

    house_rel = cfg.get("house_view_path") or f"house-view-{slug}.md"
    house_path = _wiki_path(house_rel)
    add("house_file", house_path.exists() and house_path.stat().st_size > 50, str(house_path))

    risks_rel = cfg.get("risks_source") or ""
    risks_path = _wiki_path(risks_rel) if risks_rel else None
    add(
        "risks_source",
        bool(risks_path and risks_path.exists()),
        str(risks_path) if risks_path else "risks_source not set in pack config",
    )

    store = _load_store(t)
    store_path = paths.BY_TICKER / f"{t}.json"
    add(
        "compiled_pack",
        store is not None,
        f"store/by_ticker/{t}.json" + (" ok" if store else " MISSING — run ./ont compile " + t),
    )
    if not store:
        return GateResult(ticker=t, ok=False, exit_code=1, checks=checks, summary=summary)

    claims = store.get("claims") or []
    risks = store.get("risks") or []
    sources = store.get("sources") or []
    hp = store.get("house_prior") or {}
    summary.update({
        "claims": len(claims),
        "risks": len(risks),
        "sources": len(sources),
        "house_status": hp.get("status"),
        "compiled_at": store.get("compiled_at"),
    })

    add(
        "claims_min",
        len(claims) >= min_claims,
        f"{len(claims)} claims (need ≥{min_claims})",
    )

    bad_claims = []
    for c in claims:
        if c.get("grade") not in VALID_GRADES:
            bad_claims.append("grade")
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(c.get("as_of") or "")):
            bad_claims.append("as_of")
        if not (c.get("source_id") or "").strip():
            bad_claims.append("source_id")
        if not (c.get("text") or "").strip():
            bad_claims.append("text")
    add(
        "claims_discipline",
        len(bad_claims) == 0,
        "all claims have grade/as_of/source_id/text" if not bad_claims else f"defects: {sorted(set(bad_claims))}",
    )

    add(
        "risks_min",
        len(risks) >= min_risks,
        f"{len(risks)} risks (need ≥{min_risks})",
    )
    risk_bad = [r for r in risks if not (r.get("name") or r.get("id")) or not r.get("status")]
    add(
        "risks_shape",
        len(risk_bad) == 0 and len(risks) > 0,
        "each risk has name/id + status" if not risk_bad else f"{len(risk_bad)} risks missing name/status",
    )

    add(
        "sources_min",
        len(sources) >= MIN_SOURCES,
        f"{len(sources)} sources (need ≥{MIN_SOURCES})",
    )

    hs = str(hp.get("status") or "").upper()
    house_ok = hs in VALID_HOUSE and bool(hp.get("view_excerpt") or hp.get("play"))
    add(
        "house_prior",
        house_ok,
        f"status={hp.get('status')!r} excerpt/play={'yes' if (hp.get('view_excerpt') or hp.get('play')) else 'no'}",
    )

    blob = json.dumps(store).lower()
    advice_hit = [k for k in ADVICE_KEYS if f'"{k}"' in blob]
    add(
        "no_advice_keys",
        len(advice_hit) == 0,
        "clean" if not advice_hit else f"forbidden keys: {advice_hit}",
    )

    # Entity-side format
    if entity_path.exists():
        ent = parse_entity(entity_path)
        ent_claims = ent.get("claims") or []
        unparsed = _count_unparsed_claim_bullets(entity_path)
        add(
            "entity_key_facts_parse",
            len(ent_claims) >= min_claims and unparsed == 0,
            f"parsed {len(ent_claims)} claims; unparsed graded bullets={unparsed}",
        )
        # heading presence
        raw_ent = entity_path.read_text(encoding="utf-8")
        has_heading = bool(re.search(r"^##\s+Key facts", raw_ent, re.M | re.I))
        add("entity_key_facts_heading", has_heading, "Key facts section present" if has_heading else "missing ## Key facts heading")
    else:
        add("entity_key_facts_parse", False, "entity missing")
        add("entity_key_facts_heading", False, "entity missing")

    # Human tier
    file_status = _house_status_from_file(house_path) if house_path.exists() else None
    summary["house_file_status"] = file_status
    if require_confirmed:
        conf = (hs == "CONFIRMED") or (file_status == "CONFIRMED")
        add(
            "house_confirmed",
            conf,
            "CONFIRMED" if conf else f"need CONFIRMED (pack={hs!r} file={file_status!r})",
            tier="human",
        )

    if require_risks_accepted:
        accepted = _risks_accepted(risks_path) if risks_path else False
        summary["risks_accepted"] = accepted
        add(
            "risks_accepted",
            accepted,
            "SoR shows ACCEPTED" if accepted else "SoR missing ACCEPTED — Anthony must accept",
            tier="human",
        )

    structural_fail = any(not c.ok for c in checks if c.tier == "structural")
    human_fail = any(not c.ok for c in checks if c.tier == "human")

    if structural_fail:
        exit_code = 1
        ok = False
    elif human_fail:
        exit_code = 2
        ok = False
    else:
        exit_code = 0
        ok = True

    return GateResult(ticker=t, ok=ok, exit_code=exit_code, checks=checks, summary=summary)
