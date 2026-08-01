#!/bin/sh
# PERILUNE CI gate — the full no-Unity verification ritual.
# Usage: ./ci.sh   (from the repo root; dotnet SDK expected at ~/.dotnet)
set -eu
DOTNET="${DOTNET:-$HOME/.dotnet/dotnet}"
cd "$(dirname "$0")"

echo "== tests =="
"$DOTNET" test tests/Perilune.Tests --nologo

# hosts/web is the SHIPPING host but nothing else here compiles it: the test csproj pulls in only
# WireFormat/GameSession/ConversationHub, and the smokes below run tui + scenario. A compile error
# in Program.cs (backend chain, boot wiring) used to sail through a green gate. Seconds to close.
echo "== hosts/web builds =="
"$DOTNET" build hosts/web/PeriluneWeb.csproj --nologo -v q > /dev/null

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
# M3-2 (PIN M3-a, 2026-07-31): 81733e27709f36e4 -> 25f604dd61b221fb. CryoSystem joined the stack as
# an IStatefulSystem, so its 'CRYO' StateChecksum seed now folds into Simulation.StateHash on EVERY
# ship (Simulation.cs:605-608 folds a system seed ONLY through that interface). FOLD-ONLY, and
# MEASURED as such rather than argued: with the identical system registered and ticking but the
# interface removed from its declaration, this hash was still 81733e27709f36e4 and both tick-3000
# goldens were green against their OLD values. The scenario ship has no CryoPod, so nothing about
# its run changed — the day-3 line reads pop 2 / hydro 97.7 kPa / water 0.0 L / potatoes 371 before
# and after.
# M2-2 (PIN M2-e, 2026-07-30): c1bac287230e184e -> 81733e27709f36e4. The work-type VETO landed, so
# the work grid M2-1 stored is now READ at five gates — and under OD-H every work type boots off.
# NOT fold-only this time and deliberately so: this is a BEHAVIOUR change on every ship, on the same
# state, because the default two packages upstream is now consulted. On the scenario ship the one
# live work path is Maintain (20 devices; Scrubber/Reclaimer cross their maint threshold at ~50 h of
# the 72 h run), and it no longer runs unbidden — measured, not predicted.
# M2-1 (PIN M2-a, 2026-07-29): 02257f5bce961570 -> c1bac287230e184e. The CITZ chapter gained the
# per-citizen work-priority grid, the WorkIncapable mask and two reserved fields (Skill, HeldByOrder),
# so Simulation.StateHash's citizen fold changed on every ship. FOLD-ONLY: with the identical state
# present but excluded from the fold, this hash was still 02257f5bce961570 and the full dotnet suite
# was 1330/1330 green — measured, not asserted. Nothing reads the new state.
printf '%s\n' "$OUT" | grep -q "25f604dd61b221fb" || { echo "FAIL: reference hash changed (expected 25f604dd61b221fb) — if intended, update ci.sh + CLAUDE.md + memory in the same commit"; exit 1; }

echo "== screenshot-test metrics (advisory) =="
if command -v python3 >/dev/null 2>&1 && [ -f art/screenshot-test/accepted.png ]; then
  python3 art/spritegen/metrics.py art/screenshot-test/accepted.png --accepted art/screenshot-test/accepted.png --renderstats art/screenshot-test/renderstats.json || true
else
  echo "python3 or committed accepted.png absent — skipped (advisory)"
fi

echo "== OK =="
