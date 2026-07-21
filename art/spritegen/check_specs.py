#!/usr/bin/env python3
"""WS-ART pipeline self-check (spec + manifest shape). Runs the run.py `check` stage over
every shipped spec_*.json: structural validation of sprite specs (name/tile_px/style_block/
assets, states as objects, frames as list|int) and portrait specs (name/style_block/personas,
every persona a pk_ key, the spoiler guard that backstory never leaks into a prompt, and the
portraits.g.js manifest <-> file cross-check). Exit 0 = all clean; non-zero on any problem.

    python3 art/spritegen/check_specs.py
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    specs = sorted(HERE.glob("spec_*.json"))
    if not specs:
        print("check_specs: no spec_*.json found")
        return 1
    failed = 0
    for spec in specs:
        print(f"--- {spec.name} ---")
        r = subprocess.run(
            [sys.executable, str(HERE / "run.py"), "--spec", str(spec), "--stage", "check"]
        )
        if r.returncode != 0:
            failed += 1
    print(f"check_specs: {len(specs) - failed}/{len(specs)} specs OK")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
