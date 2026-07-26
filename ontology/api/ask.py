"""Answer questions from a compiled pack only (no LLM, no web).

This is the pre-Jarvis question surface: keyword routing + pack excerpts.
"""
from __future__ import annotations

import re
from typing import Any

from api.retrieve import load_store, resolve_ticker, retrieve
from api.sources import format_source_list, format_source_result, get_source, list_sources

REFUSAL = (
    "I don't give buy/sell/hold advice, price targets, or position sizing. "
    "I can report state from the pack: house prior, graded claims, risks, series, catalysts, gaps."
)

ADVICE_RE = re.compile(
    r"\b(buy|sell|short|long more|trim|add to|position size|how many shares|"
    r"price target|pt\b|should i (buy|sell)|overweight|underweight|entry)\b",
    re.I,
)


def _match(q: str, *needles: str) -> bool:
    ql = q.lower()
    return any(n in ql for n in needles)


def answer(focus: str, question: str) -> str:
    q = (question or "").strip()
    if not q:
        return "Ask something about the focus (e.g. 'what's on watch?', 'Q3 numbers', 'house view')."

    if ADVICE_RE.search(q):
        return REFUSAL

    ticker = resolve_ticker(focus)
    store = load_store(ticker)
    lines: list[str] = [f"**{ticker}** · pack as of {store.get('compiled_at', '?')}", ""]

    # --- route ---
    # Long research files — find / open / search
    if _match(
        q,
        "source",
        "sources",
        "research file",
        "research report",
        "master report",
        "long form",
        "open the",
        "full report",
        "ib report",
        "earnings master",
        "which report",
        "list research",
        "find research",
        "where is the",
    ):
        # list
        if _match(q, "list", "which", "what research", "sources", "find research", "catalog"):
            return format_source_list(focus)
        # try to identify a source id token
        sources = list_sources(focus)
        sid = _guess_source_id(q, sources)
        if sid:
            if _match(q, "outline", "contents", "toc", "sections"):
                return format_source_result(get_source(focus, sid, mode="outline"))
            if _match(q, "search", "find ", "where does it say"):
                # use remaining keywords as query
                return format_source_result(
                    get_source(focus, sid, mode="search", query=_search_query_from_question(q))
                )
            # default: meta + outline so agent/human can dive
            return format_source_result(get_source(focus, sid, mode="meta"))
        return format_source_list(focus) + "\n\n_Name a source id to open (e.g. memory-report-ib-master)._"

    if _match(
        q,
        "house view",
        "house prior",
        "my prior",
        "what do i believe",
        "my view",
        "super-cycle",
        "supercycle",
        "how i think",
    ) or ( _match(q, "house", "prior") and not _match(q, "sca", "backlog", "100b", "earnings", "q3") ):
        hp = store.get("house_prior") or {}
        if not hp:
            lines.append("Gap: no house_prior in pack.")
        else:
            lines.append(
                f"**House prior** — {hp.get('play')} ({hp.get('status')} · {hp.get('date') or 'n.d.'})"
            )
            lines.append(hp.get("view_excerpt") or "")
        return "\n".join(lines)

    if _match(q, "gap", "missing", "don't have", "do not have", "unknown"):
        gaps = store.get("gaps") or []
        lines.append("**Gaps**")
        if not gaps:
            lines.append("- (none listed)")
        for g in gaps:
            lines.append(f"- {g}")
        return "\n".join(lines)

    if _match(q, "catalyst", "earnings", "when is", "calendar", "burry", "q4 fy"):
        pack = retrieve(focus, "catalysts")
        lines.append("**Catalysts**")
        for c in pack.get("catalysts") or []:
            lines.append(f"- {c.get('when')}: {c.get('event')} ({c.get('name')})")
        if not pack.get("catalysts"):
            lines.append("- (none)")
        _append_gaps(lines, pack)
        return "\n".join(lines)

    if _match(q, "risk", "watch", "tripwire", "falsif", "kill", "unwind", "what would change"):
        pack = retrieve(focus, "risks")
        rs = pack.get("risk_summary") or {}
        lines.append(
            f"**Risks** — WATCH: {', '.join(rs.get('watch') or ['—'])}; "
            f"FIRED: {', '.join(rs.get('fired') or ['—'])}"
        )
        for r in pack.get("risks") or []:
            flag = " ★HV" if r.get("houseview_trigger") else ""
            lines.append(
                f"- **{r.get('name')}** [{r.get('status')}]{flag} — {r.get('summary')}"
            )
            for tw in (r.get("tripwires") or [])[:3]:
                lines.append(
                    f"    · {tw.get('signal')}: {tw.get('tripwire')} "
                    f"[{tw.get('state')}] asof {tw.get('as_of')}"
                )
        _append_gaps(lines, pack)
        return "\n".join(lines)

    if _match(q, "price", "quote", "trading at", "pe", "short interest", "series", "spot"):
        lines.append("**Series snapshot**")
        for s in store.get("series_snapshot") or []:
            if s.get("error"):
                lines.append(f"- {s.get('id')}: ({s.get('error')})")
            else:
                lines.append(f"- {s.get('id')}: {s.get('latest')} as of {s.get('as_of')}")
        return "\n".join(lines)

    if _match(q, "stance", "advantaged", "exposed", "contested", "what is micron"):
        obj = store.get("object") or {}
        lines.append(f"**{obj.get('name')} ({obj.get('ticker')})**")
        if obj.get("summary"):
            lines.append(obj["summary"])
        for s in obj.get("stance") or []:
            lines.append(f"- **{s.get('label')}:** {s.get('text')}")
        return "\n".join(lines)

    # Contract / backlog / SCA-style claims (works for MU SCAs and NBIS MSFT/Meta/RPO)
    if _match(
        q,
        "sca",
        "strategic customer",
        "backlog",
        "take-or-pay",
        "100b",
        "$100",
        "rpo",
        "microsoft",
        "meta agreement",
        "committed revenue",
        "contingent",
    ):
        contract_re = re.compile(
            r"100\s*B|\$100|strategic customer|\bSCAs?\b|minimum revenue|"
            r"Microsoft|Meta|RPO|backlog|take-or-pay|tranche|upfront|"
            r"17,?392|33,?585|deferred revenue|commitment",
            re.I,
        )

        def _contract_score(c: dict) -> int:
            t = c.get("text") or ""
            score = 0
            if re.search(r"Microsoft|take-or-pay|tranche", t, re.I):
                score += 50
            if re.search(r"Meta|RPO|backlog", t, re.I):
                score += 40
            if re.search(r"100\s*B|\$100|strategic customer|\bSCAs?\b", t, re.I):
                score += 50
            if re.search(r"commitment|upfront|deferred", t, re.I):
                score += 10
            if c.get("grade") == "A":
                score += 5
            return score

        candidates = [
            c for c in (store.get("claims") or [])
            if contract_re.search(c.get("text") or "")
        ]
        candidates.sort(key=_contract_score, reverse=True)
        if candidates:
            lines.append("**Contract / backlog claims (graded)**")
            for c in candidates[:6]:
                lines.append(
                    f"- [{c.get('grade')}] ({c.get('as_of')}) {c.get('text')} "
                    f"← {c.get('source_id')}"
                )
        # deep link long research
        try:
            sources = list_sources(focus)
            # prefer nebius handoff/claim-bank/master or MU earnings master
            prefer = (
                "handoff",
                "claim-bank",
                "filings",
                "master-dossier",
                "earnings",
            )
            sid = None
            for key in prefer:
                sid = next((s["id"] for s in sources if key in (s.get("id") or "")), None)
                if sid:
                    break
            if sid:
                for query in ("take-or-pay", "Microsoft", "RPO", "SCA", "strategic customer"):
                    deep = get_source(focus, sid, mode="search", query=query)
                    if deep.get("hit_count"):
                        lines.append("")
                        lines.append(f"**From long source `{sid}` (search: {query})**")
                        for hit in (deep.get("hits") or [])[:3]:
                            lines.append(f"— line {hit.get('line')}:")
                            lines.append((hit.get("context") or hit.get("text") or "")[:500])
                            lines.append("")
                        break
        except Exception:
            pass
        if len(lines) <= 2:
            lines.append("Gap: no contract/backlog claims in pack.")
        return "\n".join(lines)

    # claim / keyword search across store claims
    if _match(
        q,
        "claim",
        "q3",
        "q4",
        "guide",
        "revenue",
        "eps",
        "sca",
        "backlog",
        "hbm",
        "margin",
        "number",
        "fact",
        "mehrotra",
        "nvidia",
        "lpdram",
        "what do we know",
    ) or len(q.split()) <= 12:
        hits = _search_claims(store.get("claims") or [], q)
        if hits:
            lines.append("**Matching claims (graded)**")
            for c in hits[:8]:
                lines.append(
                    f"- [{c.get('grade')}] ({c.get('as_of')}) {c.get('text')} "
                    f"← {c.get('source_id')}"
                )
            if _match(q, "overview", "state of", "summary", "underwrite", "status"):
                lines.append("")
                lines.append(_mini_overview(store))
            return "\n".join(lines)

    # default: compact underwrite
    if _match(q, "overview", "state of", "summary", "underwrite", "status", "how is", "where does"):
        lines.append(_mini_overview(store))
        return "\n".join(lines)

    # fallback search + hint
    hits = _search_claims(store.get("claims") or [], q)
    if hits:
        lines.append("**Closest claims in pack**")
        for c in hits[:6]:
            lines.append(
                f"- [{c.get('grade')}] ({c.get('as_of')}) {c.get('text')} "
                f"← {c.get('source_id')}"
            )
        lines.append("")
        lines.append(
            "_Tip: try house view | risks | catalysts | price | stance | Q3 | SCA_"
        )
        return "\n".join(lines)

    lines.append("Nothing in the pack matched that closely.")
    lines.append("")
    lines.append(_mini_overview(store))
    lines.append("")
    lines.append(
        "Try: `house view` · `risks` · `catalysts` · `price` · `stance` · `Q3 numbers` · `SCA`"
    )
    return "\n".join(lines)


def _search_claims(claims: list[dict], q: str) -> list[dict]:
    tokens = [t for t in re.split(r"[^a-z0-9.%$]+", q.lower()) if len(t) > 1]
    # drop stopwords
    stop = {
        "what", "whats", "the", "a", "an", "is", "are", "of", "for", "on", "to",
        "my", "me", "about", "how", "does", "do", "we", "know", "tell", "show",
        "mu", "micron", "and", "or", "in", "with",
    }
    tokens = [t for t in tokens if t not in stop]
    if not tokens:
        return list(claims)[:5]

    scored: list[tuple[int, dict]] = []
    for c in claims:
        text = (c.get("text") or "").lower()
        score = sum(1 for t in tokens if t in text)
        # boost exact-ish finance tokens
        if score:
            scored.append((score, c))
    scored.sort(key=lambda x: (-x[0], x[1].get("as_of") or ""), reverse=False)
    scored.sort(key=lambda x: (-x[0], x[1].get("as_of") or ""), reverse=True)
    # re-sort: higher score first, then newer date
    scored.sort(key=lambda x: (x[0], x[1].get("as_of") or ""), reverse=True)
    return [c for _, c in scored]


def _mini_overview(store: dict[str, Any]) -> str:
    parts: list[str] = []
    hp = store.get("house_prior") or {}
    if hp:
        parts.append(
            f"**Prior:** {hp.get('play')} ({hp.get('status')}) — "
            f"{(hp.get('view_excerpt') or '')[:280]}…"
        )
    rs = store.get("risk_summary") or {}
    parts.append(
        f"**Risks on WATCH:** {', '.join(rs.get('watch') or ['none'])}"
    )
    claims = store.get("claims") or []
    if claims:
        # newest few
        top = sorted(claims, key=lambda c: c.get("as_of") or "", reverse=True)[:3]
        parts.append("**Latest claims:**")
        for c in top:
            parts.append(
                f"- [{c.get('grade')}] ({c.get('as_of')}) {c.get('text')[:160]}…"
            )
    series = {s["id"]: s for s in store.get("series_snapshot") or [] if not s.get("error")}
    if "price-mu" in series:
        s = series["price-mu"]
        parts.append(f"**price-mu:** {s.get('latest')} as of {s.get('as_of')}")
    gaps = store.get("gaps") or []
    if gaps:
        parts.append("**Gaps:** " + "; ".join(gaps[:3]))
    parts.append("_Decision-support only._")
    return "\n".join(parts)


def _append_gaps(lines: list[str], pack: dict) -> None:
    gaps = pack.get("gaps") or []
    if gaps:
        lines.append("")
        lines.append("**Gaps:** " + "; ".join(gaps[:4]))


def _guess_source_id(q: str, sources: list[dict]) -> str | None:
    ql = q.lower()
    # explicit id-like tokens
    for s in sources:
        sid = (s.get("id") or "").lower()
        if sid and sid in ql:
            return s["id"]
    # soft keywords
    soft = [
        ("earnings", "earnings"),
        ("ib report", "ib"),
        ("initiation", "supercycle"),
        ("dram etf", "dram-etf"),
        ("dram-etf", "dram-etf"),
        ("hedge", "hedge"),
        ("hbf", "hbf"),
        ("socamm", "socamm"),
        ("calibration", "calibration"),
        ("token economy", "token"),
        ("followup", "followup"),
        ("follow-up", "followup"),
    ]
    for needle, key in soft:
        if needle in ql:
            for s in sources:
                sid = (s.get("id") or "").lower()
                if key in sid:
                    return s["id"]
    return None


def _search_query_from_question(q: str) -> str:
    # crude: drop routing words
    drop = {
        "search", "find", "open", "the", "report", "source", "for", "in", "about",
        "where", "does", "it", "say", "full", "research", "file", "master",
    }
    toks = [t for t in re.split(r"\s+", q.lower()) if t and t not in drop and len(t) > 2]
    return " ".join(toks[:6]) or q


def repl(focus: str = "MU") -> None:
    ticker = resolve_ticker(focus)
    print(f"Ontology ask · {ticker}  (pack-only, no LLM)")
    print("Commands: house | risks | catalysts | price | stance | overview | quit")
    print("Or type a free question. Advice questions are refused.\n")
    while True:
        try:
            q = input(f"{ticker}> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not q:
            continue
        if q.lower() in ("quit", "exit", "q", ":q"):
            break
        print()
        print(answer(focus, q))
        print()
