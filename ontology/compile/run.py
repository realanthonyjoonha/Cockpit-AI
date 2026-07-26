"""Compile a focus pack into store/by_ticker/<TICKER>.json."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import paths
from compile.from_cockpit import load_catalysts, load_risks, series_snapshot
from compile.from_house_view import parse_house_view
from compile.from_sources import build_source_catalog
from compile.from_wiki import parse_entity

def load_pack_config(ticker: str) -> dict[str, Any]:
    path = paths.PACKS / f"{ticker.upper()}.json"
    if not path.exists():
        # legacy yaml name hint
        yml = paths.PACKS / f"{ticker.upper()}.yaml"
        raise FileNotFoundError(f"No pack config at {path}" + (f" (found {yml}; use JSON)" if yml.exists() else ""))
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("pack config must be a JSON object")
    return data


def compile_focus(ticker: str) -> dict[str, Any]:
    cfg = load_pack_config(ticker)
    slug = cfg.get("entity_slug") or ticker.lower()
    entity_path = paths.ENTITIES / f"{slug}.md"
    if not entity_path.exists():
        raise FileNotFoundError(f"Entity not found: {entity_path}")

    wiki = parse_entity(entity_path)

    hv_path = paths.HOUSE_VIEW
    if cfg.get("house_view_path"):
        hv_path = Path(cfg["house_view_path"]).expanduser()
        if not hv_path.is_absolute():
            hv_path = paths.WIKI / hv_path
    hv = parse_house_view(
        hv_path,
        play_match=cfg.get("house_view_play_match"),
    )

    risks_dir = paths.RISKS
    if cfg.get("risks_dir"):
        risks_dir = Path(cfg["risks_dir"]).expanduser()
        if not risks_dir.is_absolute():
            risks_dir = paths.WIKI / risks_dir

    # Optional: sync structured risks from a dossier markdown (thin 08-risks-catalysts)
    if cfg.get("risks_source"):
        from compile.from_nebius_risks import sync_from_dossier

        src = Path(cfg["risks_source"]).expanduser()
        if not src.is_absolute():
            src = paths.WIKI / src
        if src.is_file():
            # id_prefix from ticker so MSFT does not emit leftover nbis-r* ids
            id_prefix = str(cfg.get("risk_id_prefix") or cfg.get("ticker") or ticker or "nbis").lower()
            id_prefix = re.sub(r"[^a-z0-9]+", "", id_prefix) or "nbis"
            category = str(cfg.get("entity_slug") or id_prefix).lower()
            sync_from_dossier(src, risks_dir, id_prefix=id_prefix, category=category)

    # Distinguish missing key (load all) vs explicit [] (load none)
    if "risk_ids_include" in cfg:
        risks = load_risks(risks_dir, include_ids=list(cfg.get("risk_ids_include") or []))
    else:
        risks = load_risks(risks_dir, include_ids=None)

    series = series_snapshot(paths.SERIES, cfg.get("series_allowlist") or [])

    cat_slugs = [slug, (cfg.get("ticker") or "").lower()] + list(cfg.get("aliases") or [])
    cat_slugs = [s for s in cat_slugs if s]
    catalysts = load_catalysts(paths.CATALYSTS, entity_slugs=cat_slugs)
    sources = build_source_catalog(cfg, paths.WIKI)

    gaps: list[str] = []
    gaps.extend(wiki.get("gaps_from_parse") or [])
    gaps.extend(hv.get("gaps") or [])
    if not wiki["claims"]:
        gaps.append("no graded claims parsed from entity key facts")
    if not risks:
        gaps.append("no risks loaded for pack")
    missing_series = [s["id"] for s in series if s.get("error")]
    if missing_series:
        gaps.append("series missing or empty: " + ", ".join(missing_series))
    if not catalysts:
        gaps.append("no catalysts matched for focus")
    if not sources:
        gaps.append("no long-form sources cataloged — check packs/*/ source_globs")

    watch = [r["name"] for r in risks if r.get("status") == "WATCH"]
    fired = [r["name"] for r in risks if r.get("status") == "FIRED"]

    primary = hv.get("primary")
    house_prior = None
    if primary:
        house_prior = {
            "play": primary["play"],
            "status": primary["status"],
            "date": primary.get("date") or "",
            "view_excerpt": primary.get("view_excerpt") or "",
        }

    company = wiki["company"]
    if cfg.get("ticker"):
        company["ticker"] = cfg["ticker"]

    pack = {
        "schema_version": "0.1",
        "focus": {
            "type": "company",
            "id": company["id"],
            "ticker": company.get("ticker") or ticker.upper(),
        },
        "compiled_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "house_prior": house_prior,
        "object": company,
        "claims": wiki["claims"],
        "risks": risks,
        "series_snapshot": series,
        "catalysts": catalysts,
        # Catalog only — full bodies loaded via api.sources.get_source when needed
        "sources": sources,
        "related": [{"type": "theme", "id": t} for t in (company.get("themes") or [])[:8]],
        "risk_summary": {
            "count": len(risks),
            "watch": watch,
            "fired": fired,
        },
        "gaps": gaps,
        "provenance": {
            "entity_path": str(entity_path),
            "house_view": str(hv_path),
            "pack_config": f"packs/{ticker.upper()}.json",
            "claim_source_ids": sorted({c["source_id"] for c in wiki["claims"]}),
            "source_count": len(sources),
            "note": (
                "Compiled deterministically. Decision-support only. House view read-only. "
                "Long MD files are cataloged in sources[]; open via source get (section/search), "
                "do not dump full 20–40pp into every retrieve."
            ),
        },
    }
    return pack


def write_pack(ticker: str, pack: dict | None = None) -> Path:
    pack = pack or compile_focus(ticker)
    paths.BY_TICKER.mkdir(parents=True, exist_ok=True)
    out = paths.BY_TICKER / f"{ticker.upper()}.json"
    out.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    ticker = (args[0] if args else "MU").upper()
    path = write_pack(ticker)
    pack = json.loads(path.read_text(encoding="utf-8"))
    print(f"wrote {path}")
    print(
        f"  claims={len(pack.get('claims') or [])} "
        f"risks={len(pack.get('risks') or [])} "
        f"series={len(pack.get('series_snapshot') or [])} "
        f"sources={len(pack.get('sources') or [])} "
        f"gaps={len(pack.get('gaps') or [])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
