#!/usr/bin/env python3
"""BANNED for scenario underwrites — thin seeder that undercuts kernel deep pipeline.

Scenario tests must mirror cockpit-kernel /cockpit-new-desk DEEP underwrite.
Use scenario-pipeline-e2e only after a real deep book exists.

Plumbing-only light fixture:
  ./scripts/scenario-pipeline-e2e.sh demox --ticker DEMO --port 4798 \\
    --fixture-light --allow-light-fixture
"""
import sys

sys.stderr.write(
    "REFUSED: seed-scenario-megacap-book.py is banned for scenario underwrites.\n"
    "Mirror kernel: DEEP /cockpit-new-desk (or equivalent) inside the scenario vault,\n"
    "then ./scripts/scenario-pipeline-e2e.sh for ACCEPT + verify + glass gates.\n"
    "See docs/SCENARIO-DEPTH-LAW.md\n"
    "Light plumbing only: --fixture-light --allow-light-fixture\n"
)
raise SystemExit(2)
