"""CLI: compile / retrieve / ask ontology packs."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def cmd_compile(args: argparse.Namespace) -> int:
    from compile.run import write_pack

    path = write_pack(args.focus.upper())
    print(f"OK {path}")
    return 0


def cmd_retrieve(args: argparse.Namespace) -> int:
    from api.retrieve import retrieve, to_markdown

    pack = retrieve(args.focus, intent=args.intent, budget=args.budget)
    if args.format == "json":
        print(json.dumps(pack, indent=2, ensure_ascii=False))
    else:
        print(to_markdown(pack))
    return 0


def cmd_ask(args: argparse.Namespace) -> int:
    from compile.run import write_pack
    from api.ask import answer, repl

    if args.refresh:
        write_pack(args.focus.upper())

    if args.repl or not args.question:
        repl(args.focus)
        return 0

    # join remaining question words
    q = " ".join(args.question).strip()
    print(answer(args.focus, q))
    return 0


def cmd_agent(args: argparse.Namespace) -> int:
    from compile.run import write_pack
    from api.agent import agent_system_prompt, build_agent_context
    from api.retrieve import resolve_ticker

    if args.refresh:
        write_pack(resolve_ticker(args.focus).upper())

    q = " ".join(args.question).strip() if args.question else ""
    if args.system:
        print(agent_system_prompt())
        print("---")
    ctx = build_agent_context(
        args.focus,
        q,
        include_overview=not args.no_overview,
        max_chars=args.max_chars,
    )
    print(ctx)
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    """Part 1 structural (+ optional human) gates. Fail-closed. No writes."""
    from verify.part1_gate import verify_part1

    result = verify_part1(
        args.focus,
        require_confirmed=args.require_confirmed,
        require_risks_accepted=args.require_risks_accepted,
        min_claims=args.min_claims,
        min_risks=args.min_risks,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
    else:
        print(result.report_text(), end="")
    return result.exit_code


def cmd_source(args: argparse.Namespace) -> int:
    from compile.run import write_pack
    from api.sources import (
        format_source_list,
        format_source_result,
        get_source,
        list_sources,
    )

    if args.refresh:
        write_pack(args.focus.upper())

    if args.action == "list" or not args.source_id:
        print(format_source_list(args.focus))
        return 0

    # get
    mode = "meta"
    if args.outline:
        mode = "outline"
    elif args.section:
        mode = "section"
    elif args.search:
        mode = "search"
    elif args.full:
        mode = "full"
    elif args.head:
        mode = "head"

    if args.format == "json":
        import json
        print(
            json.dumps(
                get_source(
                    args.focus,
                    args.source_id,
                    mode=mode,
                    section=args.section,
                    query=args.search or args.query,
                    head_lines=args.head_lines,
                    max_chars=args.max_chars,
                ),
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        result = get_source(
            args.focus,
            args.source_id,
            mode=mode,
            section=args.section,
            query=args.search or args.query,
            head_lines=args.head_lines,
            max_chars=args.max_chars,
        )
        print(format_source_result(result))
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="ontology",
        description="Investment research ontology — compile, retrieve, ask (pack-only)",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("compile", help="Compile focus pack from vault")
    c.add_argument("focus", nargs="?", default="MU", help="Focus ticker (default MU)")
    c.set_defaults(func=cmd_compile)

    r = sub.add_parser("retrieve", help="Dump full ContextPack (not Q&A)")
    r.add_argument("focus", nargs="?", default="MU", help="Focus ticker or alias")
    r.add_argument(
        "--intent",
        default="overview",
        choices=["overview", "risks", "catalysts"],
    )
    r.add_argument("--format", choices=["md", "json"], default="md")
    r.add_argument("--budget", type=int, default=None, help="Override char budget")
    r.set_defaults(func=cmd_retrieve)

    a = sub.add_parser(
        "ask",
        help="Ask a question answered ONLY from the pack (no LLM). Use --repl for interactive.",
    )
    a.add_argument("focus", nargs="?", default="MU", help="Focus ticker (default MU)")
    a.add_argument(
        "question",
        nargs="*",
        help="Question words, e.g. ask MU what is on watch",
    )
    a.add_argument(
        "--repl",
        action="store_true",
        help="Interactive prompt (type questions, quit to exit)",
    )
    a.add_argument(
        "--refresh",
        action="store_true",
        help="Recompile pack from wiki before answering",
    )
    a.set_defaults(func=cmd_ask)

    g = sub.add_parser(
        "agent",
        help="Build ontology context block for an LLM/agent (no LLM call)",
    )
    g.add_argument("focus", nargs="?", default="MU")
    g.add_argument("question", nargs="*", help="User question to ground")
    g.add_argument("--system", action="store_true", help="Print system prompt first")
    g.add_argument("--no-overview", action="store_true", help="Skip full overview block")
    g.add_argument("--max-chars", type=int, default=28_000)
    g.add_argument("--refresh", action="store_true")
    g.set_defaults(func=cmd_agent)

    s = sub.add_parser(
        "source",
        help="List or open long research MD files cataloged in the pack",
    )
    s.add_argument("focus", nargs="?", default="MU")
    s.add_argument(
        "action",
        nargs="?",
        default="list",
        choices=["list", "get"],
        help="list catalog or get one source",
    )
    s.add_argument("source_id", nargs="?", help="Source id for get (substring ok)")
    s.add_argument("--outline", action="store_true", help="Heading outline only")
    s.add_argument("--head", action="store_true", help="First N lines")
    s.add_argument("--head-lines", type=int, default=80)
    s.add_argument("--section", type=str, default=None, help="Extract ## section by title substring")
    s.add_argument("--search", type=str, default=None, help="Grep-style search inside the file")
    s.add_argument("--query", type=str, default=None, help="Alias for --search")
    s.add_argument("--full", action="store_true", help="Full file (truncated at --max-chars)")
    s.add_argument("--max-chars", type=int, default=50_000)
    s.add_argument("--format", choices=["md", "json"], default="md")
    s.add_argument("--refresh", action="store_true")
    s.set_defaults(func=cmd_source)

    v = sub.add_parser(
        "verify",
        help="Part 1 gate: structural pack/entity/house/risks checks (fail-closed)",
    )
    v.add_argument("focus", nargs="?", default="MSFT", help="Ticker (default MSFT)")
    v.add_argument(
        "--require-confirmed",
        action="store_true",
        help="Also require house status CONFIRMED (human gate)",
    )
    v.add_argument(
        "--require-risks-accepted",
        action="store_true",
        help="Also require risks SoR ACCEPTED (human gate)",
    )
    v.add_argument("--min-claims", type=int, default=10)
    v.add_argument("--min-risks", type=int, default=6)
    v.add_argument("--json", action="store_true", help="Machine-readable report")
    v.set_defaults(func=cmd_verify)

    args = p.parse_args(argv)
    try:
        return args.func(args)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
