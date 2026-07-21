#!/bin/sh
# PERILUNE CI gate — the full no-Unity verification ritual.
# Usage: ./ci.sh   (from the repo root; dotnet SDK expected at ~/.dotnet)
set -eu
DOTNET="${DOTNET:-$HOME/.dotnet/dotnet}"
cd "$(dirname "$0")"

echo "== tests =="
"$DOTNET" test tests/Perilune.Tests --nologo

echo "== TUI dump smoke =="
"$DOTNET" run --project hosts/tui -- --dump --days 1 --metrics > /dev/null

echo "== determinism proof (seed 42, 3 days) =="
OUT="$("$DOTNET" run --project hosts/scenario -- --days 3 --seed 42)"
printf '%s\n' "$OUT" | tail -3
printf '%s\n' "$OUT" | grep -q "twin hashes MATCH" || { echo "FAIL: twin hashes diverged"; exit 1; }
printf '%s\n' "$OUT" | grep -q "35bf7a69023f88a8" || { echo "FAIL: reference hash changed (expected 35bf7a69023f88a8) — if intended, update ci.sh + CLAUDE.md + memory in the same commit"; exit 1; }

echo "== OK =="
