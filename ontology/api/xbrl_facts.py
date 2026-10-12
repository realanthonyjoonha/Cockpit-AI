"""Facade over companyfacts. The iXBRL instance parser is removed."""
from __future__ import annotations

from api.companyfacts import (  # noqa: F401
    STRUCTURED_GAP,
    agree,
    candidates_for,
    concept_index,
    group_by_period,
    group_digits,
    headline_gaps,
    latest_accession,
    latest_filing_slots,
    load_taxonomy,
    mapped_facts,
    parse_companyfacts,
    period_key,
    sentence_fill_allowed,
    span_label,
    structured_metric,
    tagged_slots,
    value_text,
)
