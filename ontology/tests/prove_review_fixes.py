#!/usr/bin/env python3
"""Revert each review fix in-process and prove the matching fixture fails.

Does not leave the tree dirty. Exit 0 only if every revert fails its fixture
and the restored code then passes.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ONT = ROOT / "ontology"
TAX = ONT / "schema" / "taxonomy_xbrl.json"
PY = ONT / "api" / "companyfacts.py"
JS = ROOT / "memory-cockpit-v2" / "server" / "companyfacts.js"
FIX = ROOT / "harness-stress" / "fixtures" / "companyfacts"


def run_py(expr: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", expr],
        cwd=str(ONT),
        capture_output=True,
        text=True,
        env={**dict(**{k: v for k, v in __import__("os").environ.items()}), "PYTHONPATH": str(ONT)},
    )


CHECK = r"""
import json, sys
from pathlib import Path
from api.companyfacts import parse_companyfacts, tagged_slots, headline_gaps, load_taxonomy
root = Path(%r)
def pair(iid):
    doc = json.loads((root/iid/'companyfacts.json').read_text())
    exp = json.loads((root/iid/'expected.json').read_text())
    facts = parse_companyfacts(doc)['facts']
    slots = tagged_slots(facts)
    gaps = headline_gaps(slots, facts=facts)
    return slots, exp, gaps
""" % str(FIX)


def check(snippet: str) -> bool:
    proc = run_py(CHECK + "\n" + snippet)
    return proc.returncode == 0


def expect_fail(name: str, snippet: str) -> None:
    if check(snippet):
        raise SystemExit(f"{name}: still passed after revert")
    print(f"PROVED {name} fails when reverted")


def expect_pass(name: str, snippet: str) -> None:
    if not check(snippet):
        proc = run_py(CHECK + "\n" + snippet)
        raise SystemExit(f"{name}: failed after restore\n{proc.stderr}\n{proc.stdout}")
    print(f"OK {name} restored")


BANK_REV = "s, e, g = pair('bank'); assert s['company_revenue']['value_text']=='182447000000' and s['company_revenue']['concept']=='us-gaap:Revenues' and 'total_debt' not in s"
TRUE_REV = "s, e, g = pair('true-total'); assert s['company_revenue']['concept']=='us-gaap:Revenues' and s['company_revenue']['value_text']=='182447000000'"
STALE_REV = "s, e, g = pair('stale-slot'); assert 'total_debt' not in s and any('stale: last reported 2014-06-30' in x for x in g)"
SIXK_REV = "s, e, g = pair('sixk-nofp'); assert s['company_revenue']['value_text']=='80000000' and s['company_revenue']['ytd']['value_text']=='170000000'"
TENKT_REV = "s, e, g = pair('tenkt-q'); assert s['company_revenue']['value_text']=='440000000' and s['company_revenue']['form']=='10-KT'"
KQ4_REV = "s, e, g = pair('k-vs-q4'); assert s['company_revenue']['value_text']=='1000000000' and s['company_revenue']['form']=='10-K'"
PYTD_REV = "s, e, g = pair('primary-ytd'); assert s['company_revenue']['concept']=='us-gaap:Revenues' and s['company_revenue']['value_text']=='500000000'"
SPAN_REV = "a,_e,_=pair('span-tie'); b,_f,_=pair('span-tie-rev'); assert a['company_revenue']['value_text']=='200000000' and b['company_revenue']['value_text']==a['company_revenue']['value_text']"
TAX_REV = "t=load_taxonomy(); listed=list(t['metrics']['company_revenue'].get('concepts') or [])+list(t['metrics']['company_revenue'].get('fallback') or []); assert 'us-gaap:OperatingLeaseLeaseIncome' not in listed"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing patch needle in {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def main() -> None:
    backups = {p: p.read_text(encoding="utf-8") for p in (TAX, PY, JS)}

    def restore() -> None:
        for p, text in backups.items():
            p.write_text(text, encoding="utf-8")

    try:
        tax = json.loads(TAX.read_text())
        tax["metrics"]["company_revenue"]["fallback"].insert(0, "us-gaap:OperatingLeaseLeaseIncome")
        TAX.write_text(json.dumps(tax, indent=2) + "\n")
        expect_fail("true-total/taxonomy", TRUE_REV)
        expect_fail("bank/taxonomy", BANK_REV)
        expect_fail("taxonomy-list", TAX_REV)
        restore()

        replace_once(PY, "        if fact_is_stale(win[\"period\"][\"end\"], latest_periodic):\n            stale[mid] = win[\"period\"][\"end\"]\n            continue\n", "")
        replace_once(JS, "    if (factIsStale(win.period.end, latestPeriodic)) {\n      stale[mid] = win.period.end;\n      continue;\n    }\n", "")
        expect_fail("stale-slot", STALE_REV)
        expect_fail("bank/stale", BANK_REV)
        restore()

        replace_once(PY, 'INTERIM_FORMS = {"10-Q", "6-K"}', 'INTERIM_FORMS = {"10-Q"}')
        replace_once(JS, "const INTERIM_FORMS = new Set(['10-Q', '6-K']);", "const INTERIM_FORMS = new Set(['10-Q']);")
        expect_fail("sixk-nofp", SIXK_REV)
        restore()

        replace_once(
            PY,
            "        annual_form_annual = any(\n            form_family(w.get(\"form\")) in ANNUAL_FORMS and _kind(w) == \"annual\"\n            for w, _ in at_end\n        )\n        interim = bool(families & INTERIM_FORMS) and not (families <= ANNUAL_FORMS) and not annual_form_annual\n",
            "        annual_form_annual = False\n        interim = bool(families & INTERIM_FORMS) and not (families <= ANNUAL_FORMS) and not annual_form_annual\n",
        )
        replace_once(
            JS,
            "    const annualFormAnnual = atEnd.some(([w]) => ANNUAL_FORMS.has(formFamily(w.form)) && kindOf(w) === 'annual');\n    const interim = hasInterimForm && !onlyAnnual && !annualFormAnnual;\n",
            "    const annualFormAnnual = false;\n    const interim = hasInterimForm && !onlyAnnual && !annualFormAnnual;\n",
        )
        expect_fail("tenkt-q", TENKT_REV)
        expect_fail("k-vs-q4", KQ4_REV)
        restore()

        replace_once(PY, "            return (-cidx, dur, span, w.get(\"filed\") or \"\", w.get(\"accession\") or \"\")", "            return (dur, -cidx, span, w.get(\"filed\") or \"\", w.get(\"accession\") or \"\")")
        replace_once(JS, "      return [-(cidx < 0 ? 99 : cidx), dur, span, w.filed || '', w.accession || ''];", "      return [dur, -(cidx < 0 ? 99 : cidx), span, w.filed || '', w.accession || ''];")
        expect_fail("primary-ytd", PYTD_REV)
        restore()

        replace_once(PY, "            return (-cidx, dur, span, w.get(\"filed\") or \"\", w.get(\"accession\") or \"\")", "            return (-cidx, dur, 0, w.get(\"filed\") or \"\", w.get(\"accession\") or \"\")")
        replace_once(JS, "      return [-(cidx < 0 ? 99 : cidx), dur, span, w.filed || '', w.accession || ''];", "      return [-(cidx < 0 ? 99 : cidx), dur, 0, w.filed || '', w.accession || ''];")
        expect_fail("span-tie", SPAN_REV)
        restore()

        for name, snippet in [
            ("true-total", TRUE_REV),
            ("bank", BANK_REV),
            ("stale-slot", STALE_REV),
            ("sixk-nofp", SIXK_REV),
            ("tenkt-q", TENKT_REV),
            ("k-vs-q4", KQ4_REV),
            ("primary-ytd", PYTD_REV),
            ("span-tie", SPAN_REV),
            ("taxonomy-list", TAX_REV),
        ]:
            expect_pass(name, snippet)
    finally:
        restore()
    print("all review-fix reverts proved")


if __name__ == "__main__":
    main()
