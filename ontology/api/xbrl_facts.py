"""Facade over companyfacts. The iXBRL instance parser is removed."""
from __future__ import annotations

from api.companyfacts import (  # noqa: F401
    STRUCTURED_GAP,
    concept_index,
    group_digits,
    load_taxonomy,
    mapped_facts,
    parse_companyfacts,
    sentence_fill_allowed,
    structured_metric,
    tagged_slots,
    value_text,
)
