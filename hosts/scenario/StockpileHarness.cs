using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Tools
{
    /// <summary>
    /// E0-4 WP-3/WP-4b — the OPT-IN measurement source for the
    /// `occupancy --stockpile &lt;bench|far|filtered-far&gt; [--stockpile-n N]` flag. The exact
    /// structural twin of <see cref="StripHarness"/> (E0-5's `--strip N`).
    ///
    /// WHY IT EXISTS: the lane's acceptance (plan §1) is a stockpile-placement A/B — a stockpile
    /// beside the benches is a pre-positioning buffer; a stockpile on the WRONG deck is supposed to
    /// cost throughput — but NO authored ship designates a stockpile (plan §0/§1.2:
    /// `HANDOVER.md:199` forbids it, because a zone is the player's decision and authoring one would
    /// delete that decision AND move the four pins). So the lane, exactly like E0-5, ships its own
    /// host-side measurement surface: it enqueues the SAME <see cref="DesignateStockpileCommand"/> a
    /// client click issues, adds zero sim state, and the CI-pinned verb-less default path (no
    /// `--stockpile` flag) never calls it, so the scenario/tick-3000/slice/defs hashes stay
    /// byte-identical.
    ///
    /// ⚠️ RETRACTED — WHAT THIS HARNESS ONCE "MEASURED". ECONOMY.md §8's 75.7 % on-job-travel /
    /// −14 % throughput wrong-deck regression is not reproduced by any leg of this harness — but read
    /// the ⛔ block below before calling that a refutation, because this ship cannot test it. What IS
    /// withdrawn unconditionally is the
    /// `far` numbers this lane published (throughput 6, then 2; ~49 % HaulPickup against ~0.0 %
    /// HaulDeliver; A1 "50.000 %"). They were taken before <see cref="SelectStockpile"/>
    /// had a reachability gate, so on the slice 3 of the 4 `far` tiles sat inside the authored SEALED
    /// observatory (`AuthoredShips.cs:93` `DoorClosed = true`; nothing in the sim ever opens a door):
    /// `Walkable` but unreachable. What the old `far` column measured was an unreachable-tile haul
    /// livelock — a pre-existing engine bug, since fixed by WP-7 — and not a cross-deck haul cost at
    /// all. REACHABILITY, not distance or deck, was the differentiator; cross-deck haul demonstrably
    /// works.
    ///
    /// ⛔ AND THE SLICE CANNOT SETTLE §8 EITHER — WHY, AND WHAT IS MEASURED INSTEAD.
    ///
    /// (1) NO POWER on the headline metric without `--strip`. End-of-run `ControllerModule` is
    /// MATTER-bound on the authored ships, not labour-bound (`MECHANICS.md` §13.15: "the binding
    /// constraint is now MATTER, not LABOUR", and it names this lane — "E0-4 … adds no matter, so it
    /// moves haul off zero without extending the 28-hour runway"). The ladder converts the ship's whole
    /// matter budget by ~sim-hour 28 and then idles: every zone-less/zoned leg ends on the IDENTICAL
    /// ground stock `Corpse=1 Potato=699 ControllerModule=31` with zero Regolith/Scrap/Parts left. A
    /// far-deck stockpile costs ~1.6 crew-hours against ~352 crew-hours of post-cliff idle, so the cost
    /// would have to be ~200× larger AND land as contention during h1–h28 to move the count by one.
    /// "31 in every leg" is therefore UNINFORMATIVE — a saturated instrument, not a null result.
    ///
    /// (2) §8's NAMED MECHANISM IS STRUCTURALLY ABSENT from every unmodified leg. §8's root cause is
    /// "crafting OUTPUTS spawn unreserved, so the haul board drags them to the stockpile and the
    /// downstream station must walk them back". WP-4's bench rule — already committed, present here —
    /// deletes exactly that: `_benchWanted` = {Regolith, Scrap, Parts} is dropped from the candidate
    /// pool first, `Corpse` is hard-excluded, `MetalOre` is dead. The only haulable kinds left are
    /// `Potato` and `ControllerModule`, and NEITHER is an input to any bench — so no haul in any
    /// unmodified leg can strand a crafting input, which is the whole of §8's failure. This harness
    /// measures "is there a regression?" on a tree that already contains the fix for it.
    ///
    /// WHAT IS ACTUALLY MEASURED, AND STANDS (slice, 3 sim-days = 2 592 000 ticks, one seed, n=1;
    /// `bw0` = a MEASUREMENT-ONLY local revert of WP-4's bench rule — `_benchWanted` forced to 0, the
    /// only configuration in which §8's oscillation can physically form. NEVER COMMITTED):
    ///
    ///   leg                        modules  haul %  travel  deliv.legs  A1 h24
    ///   no flag (baseline)           31     0.000     —         0       24.979 FAIL
    ///   bench 40                     31     0.169    4.6 %     74       24.979 FAIL
    ///   far 40                       31     0.278    5.2 %     80       24.979 FAIL
    ///   filtered-far 40              31     0.115    4.2 %     31       25.219 PASS
    ///   strip 40 (headroom, no zone) 50     0.000     —         0       37.424 PASS
    ///   strip 40 + bench 40          51     0.146    2.9 %     63       37.417 PASS
    ///   strip 40 + far 40            51     0.332    3.6 %     91       37.479 PASS
    ///   strip 40 + filtered-far 40   50     0.137    2.9 %     40       37.622 PASS
    ///   bw0 + bench 40               31     0.357    5.0 %    156       24.979 FAIL
    ///   bw0 + far 40                 31     0.762    9.3 %    244       24.979 FAIL
    ///   bw0 + strip 40 (no zone)     50     0.000     —         0       37.424 PASS
    ///   bw0 + strip 40 + bench 40    51     0.389    3.1 %    202       37.417 PASS
    ///   bw0 + strip 40 + far 40      51     0.795    6.8 %    263       37.479 PASS
    ///
    ///   * CROSS-DECK HAUL WORKS. `HaulDeliver` > 0 and delivery legs > 0 in every zoned leg; stacks
    ///     land on deck 1 via the ladders. That alone refutes the STRANDING half of §8's "catastrophic"
    ///     — material does not get marooned on the wrong deck. It says nothing about the COST.
    ///   * A FAR-DECK DELIVERY COSTS ~1.5× A BENCH-SIDE ONE, per delivery — the NORMALISED figure, not
    ///     a total: 0.00348 vs 0.00228 %-of-crew-time per leg at N=40, and 0.00365 vs 0.00232 with
    ///     `--strip 40`. That 1.5× is a LOWER BOUND: an abandoned leg is counted but carries fewer
    ///     ticks, so over-counted legs inflate the denominator (see `delivery legs ended`).
    ///   * THROUGHPUT NEVER MOVES WITH PLACEMENT, IN ANY CONFIGURATION. With headroom the metric
    ///     resolves (50 → 51) and far STILL equals bench; with the bench rule ALSO reverted it is still
    ///     51 = 51. §8's −14 % is not reproduced even when its own mechanism is restored AND the
    ///     instrument can move. That also answers §8's THIRD sentence — "a zone system without a
    ///     'don't haul what a bench wants' rule is a throughput regression": `bw0` is the only
    ///     experiment in the repo that tests it, and it reads 31 = 31 without headroom and 51 = 51 with
    ///     it. Not a throughput regression on this ship, by the only available measurement.
    ///   * §8's MECHANISM IS VISIBLE FOR THE FIRST TIME IN THIS LANE, AND IT IS PLACEMENT-DEPENDENT.
    ///     Reverting the bench rule with a BENCH-SIDE zone costs +0.2–0.4 pp on-job travel and crafting
    ///     occupancy FALLS (21.64 % → 21.33 % with headroom; 12.48 % → 12.12 % without). With a
    ///     FAR-DECK zone it costs +3.2–4.1 pp travel AND crafting occupancy RISES (21.71 % → 22.09 %,
    ///     +0.38 pp) while `None` falls ~1 pp (75.35 % → 74.37 %). That crafting RISE is precisely §8's
    ///     "the downstream station's fetcher must walk them back" — the stations, not the haulers, are
    ///     doing the extra walking. Because the sign flips with placement, the effect is not merely
    ///     "more hauling happens"; it is the §8 round-trip, and WP-4's bench rule is what prevents it.
    ///     In absolute terms the rule's removal adds +0.463 pp of haul cost on the far deck against
    ///     +0.243 pp beside the benches (quoted as pp on purpose: as a RATIO bench is hit harder,
    ///     2.66× vs 2.39×, which inverts the story and is the wrong axis).
    ///   * DELIBERATELY NOT QUANTIFIED: how much of §8 the bench rule removes. The honest answer
    ///     depends entirely on which contrast is chosen — ~47 % of far's absolute travel (6.8 → 3.6 %),
    ///     ~81 % of the far-minus-bench travel PENALTY (+3.7 → +0.7 pp), ~65 % of haul VOLUME (263 → 91
    ///     legs), and ~0 % of the PER-DELIVERY penalty (1.57× with the rule, 1.57× without it — the
    ///     rule does not make a wrong-deck haul cheaper, it makes fewer of them happen by returning
    ///     {Regolith, Scrap, Parts} to the pool, 2.1–3.2× fewer delivery legs). Any single percentage
    ///     would be cherry-picked. DIRECTION and PLACEMENT-DEPENDENCE are measured; MAGNITUDE is not.
    ///   * AND §8's MAGNITUDE IS NEVER REACHED. The worst on-job travel anywhere above is 9.3 % against
    ///     §8's 75.7 % — roughly 8× short — and it never costs a single module.
    /// So `ECONOMY.md` §8's −14 % is NEITHER CONFIRMED NOR REFUTED by this lane: its magnitude is not
    /// reproducible on the slice and this ship cannot settle it. Only the `far` column's own numbers are
    /// withdrawn. Generalising needs a ship whose economy is labour-bound rather than matter-bound.
    ///
    /// TWO KNOBS, and which question each answers: `--stockpile-n N` is CAPACITY (how many free slots
    /// the zone offers, hence how much haul can physically happen before it saturates), and `--strip N`
    /// is HEADROOM (how much new matter exists, hence whether throughput can move at all). N=40 is not
    /// an authored figure — it is this package's own choice with NO prior precedent in the repo, picked
    /// so the two placements have equal capacity and the haul share is ~4× the N=4 value. It composes
    /// with `--strip N` because both apply at t=0, which is what makes the headroom legs one flag away.
    ///
    /// AND A TRAP, for the fourth time in this lane: `filtered-far 40` is the only unmodified leg whose
    /// A1 "PASSES" (25.219 % vs the 25 % target) and its throughput is 31 — identical to the FAILING
    /// baseline. A1 counts crew who are BUSY, and haul is busy-work. Never read A1 as production.
    ///
    /// Three modes. <c>bench</c> and <c>far</c> are accept-all presence stockpiles (no filter — the
    /// pre-WP-4 "before"); <c>filtered-far</c> adds the WP-2 per-tile filter:
    ///   * <c>bench</c> — a small stockpile on the walkable floor NEAREST the crafting benches
    ///     (SalvageRecycler / Fabricator / MachineShop), the pre-positioning-buffer case. LABEL
    ///     CAVEAT: <see cref="DesignateStockpileCommand"/> gates only on <c>Walkable</c>, so the bench
    ///     TILES THEMSELVES are legal candidates at distance 0 — on the slice 3 of the 4 picks are the
    ///     bench tiles and exactly one is merely adjacent.
    ///   * <c>far</c> — a stockpile on the OPPOSITE deck, FARTHEST from the benches (and, since this
    ///     package, REACHABLE).
    ///   * <c>filtered-far</c> — the same tiles as <c>far</c>, each carrying
    ///     <see cref="RejectPotatoMask"/>.
    /// </summary>
    public static class StockpileHarness
    {
        /// <summary>The three crafting stations whose outputs generate the haul traffic this lane
        /// measures (`ShipSystems.cs:144`'s crafting set). A stockpile's usefulness or harm is
        /// entirely relative to where these sit.</summary>
        private static bool IsBench(DeviceKind k) =>
            k == DeviceKind.SalvageRecycler || k == DeviceKind.Fabricator || k == DeviceKind.MachineShop;

        /// <summary>A cross-deck-aware distance from a tile to the NEAREST crafting bench. In-plane
        /// cost is Manhattan; a deck change is a whole ladder traverse, so each <c>|dz|</c> step
        /// carries a large penalty — large enough that ANY off-deck tile is farther than EVERY
        /// on-deck tile. This is what makes <c>far</c> land on the opposite deck (the benches are all
        /// on deck 0 in the slice) rather than merely at the far end of the same deck. Returns
        /// <see cref="int.MaxValue"/> when the ship has no bench (nothing to be near/far from).</summary>
        private const int DeckPenalty = 100000;

        private static int DistToNearestBench(Simulation sim, Int3 pos)
        {
            int best = int.MaxValue;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                if (!IsBench(devices[i].Kind)) continue;
                var b = devices[i].Pos;
                int inPlane = System.Math.Abs(pos.X - b.X) + System.Math.Abs(pos.Y - b.Y);
                int d = inPlane + DeckPenalty * System.Math.Abs(pos.Z - b.Z);
                if (d < best) best = d;
            }
            return best;
        }

        /// <summary>
        /// WP-4b — is <paramref name="tile"/> reachable by at least one LIVE crew member, judged by
        /// the SIM'S OWN pathfinder (<see cref="PathService.FindPath"/>)? The gate asks the engine
        /// rather than re-deriving connectivity, so it shares the engine's DEFINITION of walkability
        /// (closed doors, ladders, bounds) instead of a second implementation that could drift.
        ///
        /// THAT IS NOT THE SAME AS "cannot disagree with the haul board", and the difference is two
        /// quantifiers. The board's delivery predicate is `FindPath(sim, citizen.Pos, tile,
        /// citizen.Path)` — THIS carrier, NOW. This gate is ∃ ANY live crew member, at t=0. So:
        ///   * a tile reachable by crew A but not crew B PASSES the gate, and then B's delivery fails.
        ///     WP-7's per-tile backoff makes that survivable, not identical. Measured inert on the
        ///     slice: 0 of 40 far picks are reachable-by-some-but-not-all across the 8 crew.
        ///   * a `HoldPosition` crew member can never haul (`Citizen.IsIdleForWork` excludes it) yet
        ///     still counts here as a reachability WITNESS. Inert at t=0 on the slice (nobody holds),
        ///     and deliberately not special-cased: a held position is a transient player order, so
        ///     excluding it would make the measurement's tile set depend on a UI state.
        ///
        /// <paramref name="scratch"/> receives the path and is caller-owned — NEVER pass a
        /// <c>Citizen.Path</c>: that buffer is crew state and overwriting it would make a measurement
        /// helper mutate the sim.
        ///
        /// No crew aboard ⇒ nothing is reachable (there is no one to do the hauling, so no tile is a
        /// legal measurement tile).
        /// </summary>
        public static bool IsReachableByAnyCrew(Simulation sim, Int3 tile, List<Int3> scratch)
        {
            if (sim == null) return false;
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++)
            {
                if (crew[i].Dead) continue;
                if (sim.Paths.FindPath(sim, crew[i].Pos, tile, scratch)) return true;
            }
            return false;
        }

        /// <summary>
        /// The N stockpile tiles for a mode, chosen deterministically. Every WALKABLE floor tile is a
        /// candidate (the same gate <see cref="DesignateStockpileCommand"/> enforces — a stockpile
        /// only lives on walkable floor). Candidates are ordered by distance-to-nearest-bench —
        /// ASCENDING for <c>bench</c> (nearest first ⇒ a buffer hugging the stations), DESCENDING for
        /// <c>far</c> (farthest first ⇒ the opposite deck) — with strict canonical z,y,x order as the
        /// tie-break, so the pick is a reproducible prefix (the <see cref="StripHarness"/> determinism
        /// discipline). The first N that pass the REACHABILITY GATE are taken.
        ///
        /// WP-4b — THE REACHABILITY GATE, and why it exists. `Walkable` is a per-tile FLAG, not a
        /// statement about connectivity: the slice's authored observatory is walkable floor behind a
        /// permanently closed door (`AuthoredShips.cs:93`), and ordering by distance DESCENDING puts it
        /// first. Zoning it produced a measurement of a sealed compartment — the confound that
        /// invalidated this lane's whole `far` column. A tile no crew member can path to is not a legal
        /// measurement tile, so <see cref="IsReachableByAnyCrew"/> now filters candidates.
        ///
        /// MEASURED on the slice: 807 walkable tiles, of which **657 are reachable and 150 are not** —
        /// the sealed section is not a rounding error, it is 19 % of the walkable floor, and `far` was
        /// ranking all of it above every legal tile.
        ///
        /// WHEN reachability is evaluated — a t=0 SNAPSHOT, and the gate NEVER re-runs. Crew move,
        /// doors could in principle change, walls get built and stripped; a tile judged reachable when
        /// the zone was designated may not be reachable an hour later, and this function will not
        /// notice. That is honest for its one job (pick legal tiles for a measurement that starts at
        /// t=0) and is NOT a general reachability service.
        ///
        /// COST — this is a measurement helper, not a tick path: allocation-tolerant, and the gate is
        /// evaluated LAZILY, only on candidates in rank order until N survive. Each probe is up to one
        /// A* per live crew member; a FAILED probe is a full flood of the crew member's reachable
        /// region (that is what <see cref="PathService.FindPath"/> costs when it returns false). So the
        /// price is roughly (N + number of unreachable candidates ranked above the Nth pick) × crew,
        /// not W·H·D × crew.
        ///
        /// <paramref name="skippedUnreachable"/> (optional) receives, in rank order, the candidates the
        /// gate REJECTED while filling the N slots — the harness's own audit trail for a report. It is
        /// cleared first, and it is NOT a survey of the whole ship: candidates ranked below the Nth
        /// pick are never probed, so they appear in neither list.
        ///
        /// A ship with fewer than N reachable walkable tiles returns all it has; a ship with no bench,
        /// or with no live crew, returns an empty list (the caller reports the shortfall, exactly as it
        /// already does for a walkable-tile shortfall). PURE with respect to sim STATE — no sim
        /// mutation, no RNG; it does borrow <see cref="Simulation.Paths"/>, whose scratch arrays hold
        /// no saved or hashed state.
        /// </summary>
        public static List<Int3> SelectStockpile(Simulation sim, bool far, int n) =>
            SelectStockpile(sim, far, n, null);

        /// <inheritdoc cref="SelectStockpile(Simulation, bool, int)"/>
        public static List<Int3> SelectStockpile(Simulation sim, bool far, int n, List<Int3> skippedUnreachable)
        {
            var picks = new List<Int3>(n < 0 ? 0 : n);
            skippedUnreachable?.Clear();
            if (sim == null || n <= 0) return picks;
            var world = sim.World;

            // No bench ⇒ "near/far the benches" is undefined; select nothing rather than guess.
            bool hasBench = false;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count && !hasBench; i++) hasBench = IsBench(devices[i].Kind);
            if (!hasBench) return picks;

            // Gather every walkable candidate with its bench distance and a canonical z,y,x key. The
            // scan is itself canonical, so the tie-break is stable without a second sort key beyond it.
            var cands = new List<(int dist, ulong key, Int3 pos)>();
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Walkable) == 0) continue;   // stockpile ⇒ walkable floor
                        if ((world.GetFlags(p) & TileFlags.Stockpile) != 0) continue;  // already zoned
                        cands.Add((DistToNearestBench(sim, p), Pack(p), p));
                    }

            // Deterministic order: primary by distance (near-first for bench, far-first for far),
            // secondary by canonical z,y,x. A stable, total order ⇒ the same N tiles every run.
            cands.Sort((a, b) =>
            {
                int c = far ? b.dist.CompareTo(a.dist) : a.dist.CompareTo(b.dist);
                return c != 0 ? c : a.key.CompareTo(b.key);
            });

            // WP-4b: walk the ranked candidates and take the first N the crew can actually REACH.
            // Lazy on purpose (see the cost note above): a rejected candidate costs one failed A*
            // flood per live crew member, and there is no reason to pay that for tiles ranked below
            // the ones we keep.
            var scratch = new List<Int3>(64);
            for (int i = 0; i < cands.Count && picks.Count < n; i++)
            {
                if (!IsReachableByAnyCrew(sim, cands[i].pos, scratch))
                {
                    skippedUnreachable?.Add(cands[i].pos);
                    continue;
                }
                picks.Add(cands[i].pos);
            }
            return picks;
        }

        /// <summary>
        /// WP-4b — the MATTER-HEADROOM WARNING, or <c>null</c> when <paramref name="stripN"/> gives the
        /// run headroom. Returned rather than printed so the DECISION is testable: this exact misreading
        /// — treating a matter-ceilinged `ControllerModule` count as a throughput measurement — is what
        /// produced this lane's retracted `far` column, and the warning is the remediation. A remediation
        /// that can be deleted with a green gate is not a remediation, so
        /// <c>MatterHeadroomWarning_AppearsWithoutStrip_AndVanishesWithIt</c> pins the branch.
        ///
        /// MUTATION: <c>stripN &lt;= 0</c> → <c>stripN &lt; 0</c> ⇒ the warning silently disappears from
        /// every default run and that test fails.
        ///
        /// HONEST GAP: the single <c>Console.WriteLine</c> call site in <c>Program.cs</c> is NOT covered,
        /// because the test project compiles `StockpileHarness.cs` and `StripHarness.cs` but not
        /// `Program.cs` (`Perilune.Tests.csproj` is outside this package's file set). Deleting the print
        /// statement itself would still be invisible; the `stripN` logic and the message text are not.
        /// </summary>
        public static string MatterHeadroomWarning(int stripN)
        {
            if (stripN > 0) return null;
            return "  ⚠️ NO MATTER HEADROOM — end-of-run ControllerModule is the ship's MATTER CEILING, " +
                   "not a labour/throughput outcome (MECHANICS §13.15): the ladder converts the whole " +
                   "matter budget by ~sim-hour 28 and then idles, so this count cannot respond to zone " +
                   "placement, work rates or haul distance. Add --strip N for headroom before reading it.";
        }

        /// <summary>Canonical z,y,x pack (20 bits/axis) — the tie-break key, identical to the sort
        /// keys the registries use. Copied here as a measurement helper (host-side, not a tick path).</summary>
        private static ulong Pack(Int3 p) =>
            (ulong)(uint)p.X | ((ulong)(uint)p.Y << 20) | ((ulong)(uint)p.Z << 40);

        /// <summary>
        /// Enqueue a <c>DesignateStockpileCommand</c> (on) for each tile <see cref="SelectStockpile"/>
        /// picks, exactly as a client click would. Presence only — NO filter (the pre-WP-4 accept-all
        /// "before" of the lane's A/B). Commands apply at the next tick boundary (t=0), so the zones
        /// are live before the measurement loop counts its first hour. Returns the count enqueued.
        /// <paramref name="skippedUnreachable"/> is forwarded to <see cref="SelectStockpile"/>;
        /// <paramref name="designated"/> (optional, cleared first) receives the tiles actually
        /// enqueued, so a caller can REPORT the exact list rather than recomputing and hoping.
        /// </summary>
        public static int EnqueueStockpile(Simulation sim, bool far, int n,
                                          List<Int3> skippedUnreachable = null,
                                          List<Int3> designated = null)
        {
            var tiles = SelectStockpile(sim, far, n, skippedUnreachable);
            for (int i = 0; i < tiles.Count; i++)
                sim.EnqueueCommand(new DesignateStockpileCommand(tiles[i], on: true));
            if (designated != null) { designated.Clear(); designated.AddRange(tiles); }
            return tiles.Count;
        }

        /// <summary>
        /// The WP-4b <c>filtered-far</c> accept mask: <b>reject <see cref="ItemKind.Potato"/>, accept
        /// every other DECLARED kind</b> — <c>StockZoneSystem.AcceptAllMask &amp; ~(1UL &lt;&lt; Potato)</c>.
        /// Derived from the enum through WP-6's mask, never a hex literal, so an 8th
        /// <see cref="ItemKind"/> is accepted automatically instead of being silently rejected.
        ///
        /// BEHAVIOURALLY, on the slice, this is exactly "accept <see cref="ItemKind.ControllerModule"/>
        /// only" — the complement form is NOT a second mechanism. WP-4's bench rule removes
        /// Regolith/Scrap/Parts from the haul pool BEFORE the filter is ever consulted (the bench-rule
        /// <c>continue</c> in <c>HaulJobSource.Rescan</c> precedes the filter check),
        /// <see cref="ItemKind.Corpse"/> is hard-excluded from hauling outright, and
        /// <see cref="ItemKind.MetalOre"/> is a dead kind no system creates. So of the six bits this
        /// mask sets, five can never decide anything. MEASURED (WP-4b review): this mask and
        /// <c>1UL &lt;&lt; ControllerModule</c> produce a byte-identical item world and crew state over
        /// 60 000 slice ticks, with 601 haul crew-ticks actually occurring in both.
        ///
        /// The complement form is kept only because it states the player-facing INTENT ("this zone is
        /// not a pantry"), which is what a client would paint. The earlier
        /// <c>~(1UL &lt;&lt; Potato)</c> = <c>0xFFFFFFFFFFFFFFF7</c> spelling is gone: its 57 bits above
        /// the last declared kind were inert but were folded verbatim into
        /// <c>StockZoneSystem.StateChecksum</c>, so this harness's zone checksum could not be compared
        /// with a client-authored mask. Masking to the live range makes the two identical.
        /// </summary>
        public static readonly ulong RejectPotatoMask =
            StockZoneSystem.AcceptAllMask & ~(1UL << (int)ItemKind.Potato);

        /// <summary>
        /// WP-4b — the <c>filtered-far</c> measurement mode. NOT a validated "after": see the retraction
        /// in this class's own doc. Zone the SAME N opposite-deck tiles <c>far</c> designates (reuse
        /// <see cref="SelectStockpile"/> with <c>far:true</c> + <see cref="DesignateStockpileCommand"/>),
        /// AND additionally enqueue a <see cref="SetStockpileFilterCommand"/> per tile with
        /// <see cref="RejectPotatoMask"/>, so Potato never becomes a haul candidate for these tiles.
        /// Both commands apply at the next tick boundary (t=0): designate sets the presence bit, then
        /// set-filter records the accept mask in the ZONE registry — order-safe because the filter
        /// command is precondition-light (it does not require the presence bit; the reverse order was
        /// verified to stick too). Returns the count designated. Host-only; adds zero sim state; the
        /// verb-less default path never calls it.
        ///
        /// The mask is NOT a parameter. It had exactly one call site passing exactly one value, and it
        /// is the mode's DEFINITION rather than a knob — a different mask is a different experiment and
        /// should be a different mode with its own name and its own re-measurement.
        /// </summary>
        public static int EnqueueFilteredFarStockpile(Simulation sim, int n,
                                                      List<Int3> skippedUnreachable = null,
                                                      List<Int3> designated = null)
        {
            var tiles = SelectStockpile(sim, far: true, n, skippedUnreachable);
            for (int i = 0; i < tiles.Count; i++)
            {
                sim.EnqueueCommand(new DesignateStockpileCommand(tiles[i], on: true));
                sim.EnqueueCommand(new SetStockpileFilterCommand(tiles[i], RejectPotatoMask));
            }
            if (designated != null) { designated.Clear(); designated.AddRange(tiles); }
            return tiles.Count;
        }
    }
}
