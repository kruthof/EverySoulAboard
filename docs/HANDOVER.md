# HANDOVER — PERILUNE (2026-07-21, P1 complete, tag `v1-foundations`)

For the next session. Read `CLAUDE.md` first, then this top to bottom. Design intent
lives in `VISION.md`, mechanism in `ARCHITECTURE.md`, phasing/lanes in `PLAN.md`;
moonbase-era mechanism detail (save format, tick model, MOSS, atmosphere math) is
still authoritative in `legacy/TDD.md` + `legacy/TUI.md` where not superseded.

## Where the project stands

- **Repo founded 2026-07-20** as the clean-room successor to `../moonbase` (archived,
  untouched; Unity is gone entirely). Namespaces are `Perilune.*`.
- **P0 done** (`v0-baseline`): migration verified, rename, build hygiene, `ci.sh`.
- **P1 done** (`v1-foundations`): all six foundation lanes landed and composed —
  see `git log v0-baseline..v1-foundations` for the reviewed packages. Suite:
  **247 dotnet tests + 17 node render tests**, all green via `./ci.sh`.

What exists and works (each with its own test surface):
1. **SocialSystem v0** — sparse directed opinion graph; co-location familiarity,
   decay, clamped `Nudge()`; SYSS-saved, SOCL-hashed, tuned by `social.def`.
2. **NavSystem v0** — the space layer (2D Mm chart): contact drift, delta-v burns
   (`BeginBurnCommand`), telescope SNR detection (needs a POWERED, operational
   `DeviceKind.Telescope`); NAVS-hashed, tuned by `nav.def`.
3. **Sim.Llm runtime** — `ConversationService`: player text → `IChatBackend`
   (TemplateBackend offline; capability flags ready for Anthropic/OpenAI-compat/
   Gemini/Ollama) → capability manifest → validated `CitizenEffect` →
   `ApplyCitizenEffectCommand` on the ordinary inbox, applied at tick start.
   Mind state is host-owned and deliberately UNhashed/unsaved (persistence is a
   future integrator-gated spine change).
4. **Sim.Content** — pack loader (`pack.toml`, topo order, later-pack-wins,
   fingerprint). `content/core/` is formally a pack. Hosts still load defs directly
   (bit-equivalence proven by test); host switchover is deliberately deferred.
5. **Sim.Gen gates + variants** — `Validate/ShipGates` V1–V7 on built sims;
   `ShipRecipe.FromSeed`/`ProceduralShips.Generate` seeded variants;
   `hosts/scenario` verbs `gen --seed N --validate`, `sweep --count M` (exit-code
   contract 0/1/2). `GenSimHost` boots any plan with the full stack incl. minds.
6. **client/** — structured skin: pure `composeScene(frame,camera,assets) →
   DisplayList` core + Canvas2D executor (WebGL2 executor is the P2 slot), sprites
   extracted at build time from Client.html's SPRITEGEN block, golden display-list
   tests under `client/test/`.
7. **P1ExitTests** — the six-lane composition proof (generated ship + social +
   nav + conversation + packs + twin-hash). Keep it green; it is the contract.

## Running / testing the game

```bash
./ci.sh                                     # the full gate — run before/after anything
~/.dotnet/dotnet run --project hosts/web    # PLAY: http://localhost:8323 (proven skin,
                                            #   sprites, WASD/drag/zoom, 1-7 lenses, P toggle)
# Structured client (P1 parity port, WebGL/UI work happens here in P2):
~/.dotnet/dotnet run --project hosts/web -- --port 8330   # terminal 1
python3 client/serve.py                                    # terminal 2 → http://localhost:8331
~/.dotnet/dotnet run --project hosts/tui -- --play         # terminal skin
~/.dotnet/dotnet run --project hosts/tui -- --dump --days 1 --metrics   # agent/CI eyes
~/.dotnet/dotnet run --project hosts/scenario -- gen --seed 7 --validate # gates demo
```

## The rituals (cost time to learn — don't relearn)

- **Hash-move ritual:** adding ANY hashed state (new IStatefulSystem, saved field)
  intentionally moves the reference hash. In the SAME commit: regenerate the
  tick-3000 golden (`UPDATE_GOLDEN=1 ... --filter Tick3000`), update the pinned hash
  in `ci.sh` + `CLAUDE.md` + auto-memory, and say why. Happened twice in P1
  (Social, Nav) — current pin `26907c23d7e48a5c` (P2: Social relationship types + History folds).
- **Def-field ritual:** one commit = CreateDefault value + parser key + checksum fold
  (append before the rules fold) + shipped `.def` verbatim + a consumption-tripwire
  test. `social.def`/`nav.def` are clean examples.
- **Parallel lanes:** spawn agents into their own git worktrees
  (`git worktree add ../perilune-wt/<lane> -b lane/<lane>`), exclusive write paths
  per PLAN.md, no spine edits, verify with `./ci.sh` in-worktree, integrator merges
  `--no-ff` + re-gates on main. Worked flawlessly for 3 concurrent Opus lanes.
- **New test files** under `tests/Perilune.Tests/` auto-compile (SDK default items);
  new `sim/` source DIRECTORIES need a csproj glob (tests csproj is integrator-owned).
- Suite quirk: V6 survivability gate tests run a real sim-day (~26 s of the 46 s
  suite). Node 24 needs the glob form: `node --test "client/test/*.test.js"`.
- de-DE machine: test output prints `Bestanden!`/`Fehler`; culture bugs are live —
  InvariantCulture in every wire/dump/parse path, analyzers CA1305/CA1310 warn.

## Next: P2 — "The Talking Ship" vertical slice (PLAN.md has the full list)

The emotional-engine proof: live providers (Anthropic + OpenAI-compat + Ollama)
behind `IChatBackend`; Chronicle v1 + first eulogy from real shared memories;
Director v0 (tension curve, sim-legal levers only); client WebGL executor +
sim-driven lighting + dialogue UI + MOSS terminal IDE; persona-conditioned
portraits (art/spritegen); build/refit v0 (WS-MATTER); **the screenshot test**
(one unstaged frame must beat RimWorld or art/client lanes stop feature work).
P2 exit: a 60-minute unscripted playtest where the tester names a crew member.

Open items on Garvin: API key(s) for live-provider testing (Anthropic and/or any
OpenAI-compatible endpoint; Ollama install optional); judge the current sprite skin
at :8323 before the P2 art pass; non-programmer MOSS playtester still wanted (P3).

## Known issues / backlog (not regressions)

- `RoomState.cs:258` CA2014 stackalloc-in-loop (real hazard) — needs a reviewed fix.
- `InspectorModelTests.cs` CA1310 + `PeriluneGoldenTests.cs` CA1305 culture warnings.
- Mind/persona state not persisted (regenerated per session; spine change when needed).
- Hosts don't consume Sim.Content yet (deliberate; switch with the P3 campaign pack).
- `sweep --count 100` is ~20 min wall (V6 real sim-days) — fine ad hoc, not for CI.
- Client crew-move path (`click`/`move` cmds) ported but not yet exercised live with
  visible crew (fog-gated at boot on the fixture); verify during P2 UI work.
