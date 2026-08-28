#!/usr/bin/env python3
"""Thesis-lane printer: wire_figures → assemble → footnote_citations → pandoc → Chrome PDF."""
from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from assemble import assemble  # noqa: E402
from footnote_citations import footnote_citations  # noqa: E402
from wire_figures import wire_text  # noqa: E402

CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def load_config(path: Path):
    spec = importlib.util.spec_from_file_location("report_config", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def section_path(cfg, sid: str) -> Path:
    prefix = getattr(cfg, "SEC_PREFIX", "") or ""
    base = Path(getattr(cfg, "SECTIONS_DIR", getattr(cfg, "SECTIONS", None)))
    return base / f"{prefix}{sid}.md"


def to_html(master: Path, html: Path, css: Path, cfg) -> None:
    cmd = [
        "pandoc",
        str(master),
        "-f", "markdown-tex_math_dollars+footnotes",
        "-t", "html5",
        "-s",
        "--toc",
        "--toc-depth=2",
        f"--css={css}",
        "-o", str(html),
        "--metadata", f"title={getattr(cfg, 'TITLE', 'Thesis report')}",
    ]
    subprocess.check_call(cmd)


def to_pdf(html: Path, pdf: Path) -> None:
    if not CHROME.exists():
        raise SystemExit("Google Chrome not found for PDF")
    html_uri = html.resolve().as_uri()
    cmd = [
        str(CHROME),
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf}",
        html_uri,
    ]
    subprocess.check_call(cmd)


MODEL_READ_ORDER = (
    "thermometer",
    "print-vs-guide",
    "quality",
    "new-guide",
    "still-gap",
    "next-print",
)


def assert_model_read_order(cfg, run: Path) -> None:
    """model_read: refuse a thesis ORDER or extra chapters."""
    meta_path = run / "meta.json"
    if not meta_path.is_file():
        return
    try:
        import json

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        raise SystemExit(f"model_read gate: cannot read meta.json: {e}") from e
    job = str(meta.get("job") or "")
    if job != "model_read":
        return
    order = [str(s) for s in list(getattr(cfg, "ORDER", []) or [])]
    if tuple(order) != MODEL_READ_ORDER:
        raise SystemExit(
            "model_read: ORDER must be "
            + " · ".join(MODEL_READ_ORDER)
            + f" (got {', '.join(order) or 'empty'})."
        )
    graph = run / "numbers-graph.json"
    if not graph.is_file():
        raise SystemExit("model_read: numbers-graph.json missing — refuse to invent.")


def assert_skim_register_omitted(cfg, run: Path) -> None:
    """House-only (skim): refuse ORDER/sections that still ship a register chapter."""
    meta_path = run / "meta.json"
    if not meta_path.is_file():
        return
    try:
        import json

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001 — fail closed on unreadable meta
        raise SystemExit(f"skim gate: cannot read meta.json: {e}") from e
    scope = (
        ((meta.get("thesis") or {}).get("register_scope"))
        or ((meta.get("inputs") or {}).get("register_scope"))
        or ""
    )
    if str(scope).strip().lower() not in ("skim", "house-only", "house_only", "none"):
        return
    bad = {"register-updated", "tripwires"}
    order = [str(s) for s in list(getattr(cfg, "ORDER", []) or [])]
    hit = [s for s in order if s in bad]
    if hit:
        raise SystemExit(
            "skim register_scope: ORDER must omit register-updated/tripwires "
            f"(got {', '.join(hit)}). Fix config.py or re-run with All/Pick."
        )
    sections = Path(getattr(cfg, "SECTIONS_DIR", getattr(cfg, "SECTIONS", run / "sections")))
    for sid in sorted(bad):
        p = sections / f"{sid}.md"
        if p.is_file() and p.stat().st_size > 0:
            raise SystemExit(
                f"skim register_scope: remove {p.name} (House only — no register chapter)."
            )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    args = ap.parse_args()
    cfg_path = Path(args.config).resolve()
    cfg = load_config(cfg_path)

    if hasattr(cfg, "PRE_WIRE"):
        cfg.PRE_WIRE()

    run = Path(getattr(cfg, "RUN", cfg_path.parent)).resolve()
    assert_skim_register_omitted(cfg, run)
    assert_model_read_order(cfg, run)
    outdir = Path(getattr(cfg, "OUTDIR", run / "output"))
    outdir.mkdir(parents=True, exist_ok=True)
    diagrams = Path(getattr(cfg, "DIAGRAMS", run / "diagrams")).resolve()
    figmap = dict(getattr(cfg, "FIGMAP", {}) or {})
    css = Path(getattr(cfg, "CSS", HERE / "report_styles.css")).resolve()
    master = Path(getattr(cfg, "MASTER", outdir / "master.md"))
    html = Path(getattr(cfg, "HTML", outdir / "report.html"))
    pdf = Path(getattr(cfg, "PDF", outdir / "report.pdf"))

    wired = {}
    for sid in cfg.ORDER:
        p = section_path(cfg, sid)
        if not p.exists():
            raise SystemExit(f"missing section file: {p}")
        wired[sid] = wire_text(p.read_text(encoding="utf-8"), figmap, diagrams)

    assembled = assemble(cfg, wired)
    footed = footnote_citations(assembled)
    master.parent.mkdir(parents=True, exist_ok=True)
    master.write_text(footed, encoding="utf-8")

    (outdir / "sections").mkdir(exist_ok=True)
    for sid, body in wired.items():
        (outdir / "sections" / f"{sid}.md").write_text(body, encoding="utf-8")

    to_html(master, html, css, cfg)
    to_pdf(html, pdf)
    print("wrote", master)
    print("wrote", html)
    print("wrote", pdf)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
