"""Minimal YAML-ish frontmatter parser (stdlib only). Enough for wiki/risk headers."""
from __future__ import annotations

import re
from typing import Any


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    raw = text[3:end].strip("\n")
    body = text[end + 4 :].lstrip("\n")
    meta: dict[str, Any] = {}
    for line in raw.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key = key.strip()
        val = val.strip()
        if not key:
            continue
        meta[key] = _coerce(val)
    return meta, body


def _coerce(val: str) -> Any:
    if val == "":
        return ""
    # quoted string
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        return val[1:-1]
    # boolean
    low = val.lower()
    if low in ("true", "yes"):
        return True
    if low in ("false", "no"):
        return False
    # integer
    if re.fullmatch(r"-?\d+", val):
        return int(val)
    # simple list [a, b, c]
    if val.startswith("[") and val.endswith("]"):
        inner = val[1:-1].strip()
        if not inner:
            return []
        parts = [p.strip() for p in inner.split(",")]
        return [_coerce(p) if p else p for p in parts]
    return val
