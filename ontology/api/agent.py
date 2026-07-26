"""Thin agent operator — assemble ontology context for LLM/human clients.

Does NOT call an LLM. Produces a bounded, pack-grounded context block that
Grok/Claude/Jarvis must reason from. Decision-support only.
"""
from __future__ import annotations

import re
from typing import Any

from api.ask import ADVICE_RE, REFUSAL, answer
from api.retrieve import load_store, resolve_ticker, retrieve, to_markdown
from api.sources import format_source_result, get_source, list_sources

AGENT_PREAMBLE = """# ONTOLOGY AGENT CONTEXT (binding)

You are operating on Anthony's investment research ontology.
Rules:
1. Use ONLY facts in this context (and explicit tool follow-ups). Do not invent numbers.
2. Every load-bearing figure needs grade [A/B/C] and as_of when present in context.
3. Decision-support only: NO buy/sell/hold, price targets, or position sizing.
4. House view is Anthony's — steelman it, report DELTA, then red-team. Never rewrite it.
5. If something is missing, say GAP — do not fill from general knowledge.
6. Prefer graded claims + risks + series over narrative fluff.

"""


def _match(q: str, *needles: str) -> bool:
    ql = q.lower()
    return any(n in ql for n in needles)


def _maybe_deep_sources(focus: str, question: str, budget_chars: int = 12_000) -> list[str]:
    """Pull 0–2 targeted source excerpts when the question needs depth."""
    q = question.lower()
    blocks: list[str] = []
    sources = list_sources(focus)
    if not sources:
        return blocks

    used = 0

    def add(block: str) -> None:
        nonlocal used
        if used + len(block) > budget_chars:
            return
        blocks.append(block)
        used += len(block)

    # SCA / backlog → earnings master search (check first — high value)
    if _match(q, "sca", "strategic customer", "backlog", "100b", "commitment"):
        sid = next(
            (s["id"] for s in sources if "earnings" in s["id"] and "master" in s["id"]),
            next((s["id"] for s in sources if "earnings" in s["id"]), None),
        )
        if sid:
            try:
                r = get_source(focus, sid, mode="search", query="SCA")
                if not r.get("hit_count"):
                    r = get_source(focus, sid, mode="search", query="strategic customer")
                add("## Deep source (SCA)\n" + format_source_result(r)[:4000])
            except Exception as e:
                add(f"## Deep source error: {e}")

    # thesis / inversion / underwrite depth → IB section
    if _match(q, "thesis", "inversion", "underwrite", "structural", "why hold", "intact"):
        sid = next(
            (s["id"] for s in sources if s["id"] == "memory-report-ib-master"),
            next((s["id"] for s in sources if "ib" in s["id"] and "master" in s["id"]), None),
        )
        if sid:
            try:
                r = get_source(focus, sid, mode="section", section="Investment Thesis")
                text = (r.get("text") or "")[:5000]
                add(f"## Deep source (Investment Thesis · `{sid}`)\n{text}")
            except Exception as e:
                add(f"## Deep source error: {e}")

    # earnings / q3 / calibration
    if _match(q, "q3", "earnings", "calibration", "print", "guide", "q4"):
        sid = next(
            (s["id"] for s in sources if "earnings" in s["id"] and "master" in s["id"]),
            None,
        )
        if sid:
            try:
                r = get_source(focus, sid, mode="search", query="Q3")
                add("## Deep source (earnings master)\n" + format_source_result(r)[:4000])
            except Exception as e:
                add(f"## Deep source error: {e}")

    # explicit open/report language
    if _match(q, "open report", "full report", "ib report", "show me the report"):
        sid = next((s["id"] for s in sources if "ib-master" in s["id"]), sources[0]["id"])
        try:
            r = get_source(focus, sid, mode="outline")
            add("## Source outline\n" + format_source_result(r)[:3000])
        except Exception as e:
            add(f"## Source outline error: {e}")

    return blocks


def build_agent_context(
    focus: str,
    question: str,
    *,
    refresh: bool = False,
    include_overview: bool = True,
    max_chars: int = 28_000,
) -> str:
    """Assemble binding context for an agent to answer `question`."""
    if refresh:
        from compile.run import write_pack

        write_pack(resolve_ticker(focus))

    q = (question or "").strip()
    ticker = resolve_ticker(focus)
    store = load_store(ticker)

    parts: list[str] = [AGENT_PREAMBLE]
    parts.append(f"**Focus:** {ticker} (`{store.get('focus', {}).get('id', '')}`)")
    parts.append(f"**Pack compiled_at:** {store.get('compiled_at', '?')}")
    parts.append(f"**User question:** {q or '(none — general underwrite)'}")
    parts.append("")

    if q and ADVICE_RE.search(q):
        parts.append("## Pack response")
        parts.append(REFUSAL)
        parts.append("")
        parts.append(
            "## Still provide state (for reframe)\n"
            "Below: house prior + risks so you can reframe without advice."
        )
        parts.append("")

    # 1) routed pack answer (code ask)
    if q:
        parts.append("## Pack ask (deterministic router)")
        parts.append(answer(focus, q))
        parts.append("")

    # 2) compact overview always useful for underwrite questions
    if include_overview and (
        not q
        or _match(
            q,
            "thesis",
            "intact",
            "underwrite",
            "overview",
            "state",
            "status",
            "risk",
            "house",
            "sca",
            "earnings",
            "q3",
            "how is",
        )
    ):
        try:
            ov = retrieve(focus, "overview")
            parts.append("## Retrieve overview (budgeted)")
            parts.append(to_markdown(ov))
            parts.append("")
        except Exception as e:
            parts.append(f"## Overview error: {e}\n")

    # 3) deep sources when needed
    deep = _maybe_deep_sources(focus, q or "overview")
    if deep:
        parts.append("## On-demand long sources")
        parts.extend(deep)
        parts.append("")

    # 4) source catalog short list
    sources = list_sources(focus)
    if sources:
        parts.append("## Source catalog (top long files — open via `ont source`)")
        for s in sources[:12]:
            parts.append(
                f"- `{s.get('id')}` — {s.get('title')} [{s.get('n_lines')} lines]"
            )
        parts.append("")

    # 5) gaps
    gaps = store.get("gaps") or []
    parts.append("## Ontology gaps")
    if gaps:
        for g in gaps:
            parts.append(f"- {g}")
    else:
        parts.append("- (none listed)")
    parts.append("")
    parts.append("---")
    parts.append(
        "END CONTEXT. Answer the user question using only the material above. "
        "Cite claim grades/dates. Flag gaps."
    )

    text = "\n".join(parts)
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n…[agent context truncated at max_chars]…"
    return text


def agent_system_prompt() -> str:
    """Short system prompt for LLM sessions using the ontology."""
    return (
        "You are Anthony's ontology-backed research operator for investment decision-support. "
        "You never give buy/sell/hold, targets, or sizing. "
        "You only assert load-bearing facts that appear in ontology tool/context output "
        "(retrieve, ask, source get) with grades and as_of when available. "
        "Steelman his house view, report delta, then red-team. "
        "If the pack has a gap, say so — do not invent from general knowledge."
    )
