"""KEEP verb and core-catalog header reviewer cases (JS module, Python-driven)."""
from __future__ import annotations

import os
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CATALOG = REPO / "memory-cockpit-v2" / "server" / "mcpToolCatalog.js"


def eval_keep(utterance: str) -> bool:
    script = (
        "import { isKeepVerb } from './memory-cockpit-v2/server/mcpToolCatalog.js'; "
        "const u = process.env.KEEP_UTTERANCE || ''; "
        "process.stdout.write(isKeepVerb(u) ? '1' : '0');"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=str(REPO),
        env={**os.environ, "KEEP_UTTERANCE": utterance},
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout or f"exit {proc.returncode}")
    return proc.stdout == "1"


class TestKeepVerbAndCatalogHeader(unittest.TestCase):
    def test_keep_matches_anywhere_word_boundary(self):
        self.assertTrue(eval_keep("KEEP"))
        self.assertTrue(eval_keep("please KEEP the subscription line"))
        self.assertFalse(eval_keep("GO"))
        self.assertFalse(eval_keep("keepers"))
        self.assertFalse(eval_keep("auto-keep"))

    def test_core_header_does_not_overclaim(self):
        text = CATALOG.read_text(encoding="utf-8")
        self.assertNotIn("includes every write the desk loop uses", text)
        self.assertIn("not every write the desk loop uses", text)
        self.assertIn("lazy-load path", text)


if __name__ == "__main__":
    unittest.main()
