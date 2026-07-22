#!/bin/sh
# PERILUNE CI gate — the full no-Unity verification ritual.
# Usage: ./ci.sh   (from the repo root; dotnet SDK expected at ~/.dotnet)
set -eu
DOTNET="${DOTNET:-$HOME/.dotnet/dotnet}"
cd "$(dirname "$0")"

echo "== tests =="
"$DOTNET" test tests/Perilune.Tests --nologo

echo "== client render tests =="
if command -v node >/dev/null 2>&1; then
  node --test "client/test/*.test.js"
else
  echo "node not found — skipped"
fi

echo "== TUI dump smoke =="
"$DOTNET" run --project hosts/tui -- --dump --days 1 --metrics > /dev/null

echo "== determinism proof (seed 42, 3 days) =="
OUT="$("$DOTNET" run --project hosts/scenario -- --days 3 --seed 42)"
printf '%s\n' "$OUT" | tail -3
printf '%s\n' "$OUT" | grep -q "twin hashes MATCH" || { echo "FAIL: twin hashes diverged"; exit 1; }
printf '%s\n' "$OUT" | grep -q "3afc99d90e849aa0" || { echo "FAIL: reference hash changed (expected 3afc99d90e849aa0) — if intended, update ci.sh + CLAUDE.md + memory in the same commit"; exit 1; }

echo "== screenshot-test metrics (advisory) =="
if command -v python3 >/dev/null 2>&1 && [ -f art/screenshot-test/accepted.png ]; then
  python3 art/spritegen/metrics.py art/screenshot-test/accepted.png --accepted art/screenshot-test/accepted.png --renderstats art/screenshot-test/renderstats.json || true
else
  echo "python3 or committed accepted.png absent — skipped (advisory)"
fi

echo "== OK =="
