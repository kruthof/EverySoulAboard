using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Gen.Validate;
using Perilune.Sim;

namespace Perilune.Tools
{
    /// <summary>
    /// Headless scenario harness: builds a small ship section, runs the full system
    /// stack for a requested stretch of sim-time at maximum speed, prints a daily
    /// status line, and verifies twin-run determinism at the end.
    ///
    ///   dotnet run --project tools/ScenarioRunner -- --days 30 --seed 42
    /// </summary>
    public static class Program
    {
        private const int TicksPerDay = Simulation.TicksPerSecond * 60 * 60 * 24;

        public static int Main(string[] args)
        {
            // WS-SHIPGEN verbs (procedural ship generation + validation gates). The default
            // verb-less path below is kept byte-identical (the determinism proof CI keys on it).
            if (args.Length > 0 && args[0] == "gen") return RunGen(args);
            if (args.Length > 0 && args[0] == "sweep") return RunSweep(args);
            if (args.Length > 0 && args[0] == "dump-personas") return RunDumpPersonas(args);
            // A1: the "are the crew actually working?" measurement (ECONOMY-PLAN §E0).
            if (args.Length > 0 && args[0] == "occupancy") return RunOccupancy(args);
            // E0-8: the ledger + the ShipMetrics honesty table (LedgerHarness).
            if (args.Length > 0 && args[0] == "ledger") return RunLedger(args);
            // P2 live-provider smoke: env-gated, spends real money, NEVER in ci.sh.
            if (args.Length > 0 && args[0] == "llm-smoke") return LlmSmoke.Run(args);

            int days = 3;
            ulong seed = 42;
            string dataDir = null;
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--days") days = int.Parse(args[i + 1]);
                if (args[i] == "--seed") seed = ulong.Parse(args[i + 1]);
                if (args[i] == "--data") dataDir = args[i + 1];
            }

            Console.WriteLine($"ScenarioRunner — headless sim, {days} day(s), seed {seed}");
            Console.WriteLine("(the simulation is the game; Unity is elsewhere)");

            var defs = LoadDefs(dataDir ?? DefaultDataDir(), out int fileCount, out int ruleCount, out var problems);
            Console.WriteLine($"defs: {defs.Checksum:x16} ({fileCount} files, {problems.Count} problems, {ruleCount} rules)");
            foreach (var problem in problems) Console.WriteLine($"  {problem}");
            Console.WriteLine();

            var sim = BuildScenario(seed, defs);
            var twin = BuildScenario(seed, defs);

            var clock = Stopwatch.StartNew();
            long totalTicks = (long)days * TicksPerDay;
            long nextReport = 0;

            for (long t = 0; t < totalTicks; t++)
            {
                sim.Tick();
                twin.Tick();

                if (sim.TickCount >= nextReport)
                {
                    Report(sim);
                    nextReport += TicksPerDay;
                }
            }
            clock.Stop();

            Report(sim);
            ulong h1 = sim.StateHash(), h2 = twin.StateHash();
            double simSeconds = totalTicks / (double)Simulation.TicksPerSecond;
            double speedup = simSeconds / clock.Elapsed.TotalSeconds;

            Console.WriteLine($"\n{totalTicks:N0} ticks in {clock.Elapsed.TotalSeconds:0.0}s wall " +
                              $"({speedup:0}x real time; {totalTicks / clock.Elapsed.TotalSeconds / 1000:0.0}k ticks/s)");
            Console.WriteLine($"determinism: twin hashes {(h1 == h2 ? "MATCH" : "DIVERGED!!")} ({h1:x16})");
            return h1 == h2 ? 0 : 1;
        }

        // ------------------------------------------------------------ WS-SHIPGEN verbs

        /// <summary><c>gen --seed N [--validate] [--days D] [--data DIR]</c>: build a procedural
        /// ship variant from the seed and (with --validate) run the V1–V7 gate suite. Exit 0 when
        /// all gates pass, 1 on any gate failure.</summary>
        /// <summary><c>dump-personas [--ship perilune|slice] [--seed N] [--crew C] [--out FILE] [--data DIR]</c>:
        /// boot a ship, generate each citizen's persona, and emit the deterministic JSON array the
        /// portrait pipeline (art/spritegen) consumes. <c>--ship perilune</c> (default) boots a
        /// seeded PROCEDURAL ship (the host's one-per-citizen worldgen call). <c>--ship slice</c>
        /// boots the AUTHORED P2 "Talking Ship" 8-crew slice (AuthoredShips.PeriluneSlice +
        /// PopulateSlice), the same crew the terminal/web hosts boot with <c>--ship slice</c>, and
        /// defaults --seed to the slice's own identity (AuthoredShips.SliceSeed) so the pk_ keys
        /// match the ship-lane roster. Read-only boot + print — no sim ticks, no file writes beyond
        /// --out. Same arguments ⇒ byte-identical output (the W4 portrait handoff contract).</summary>
        private static int RunDumpPersonas(string[] args)
        {
            string shipName = ArgString(args, "--ship", "perilune");
            bool slice = shipName == "slice";
            bool grid = shipName == "grid";
            bool wreck = shipName == "wreck";   // the wreck start (W3)
            ulong seed = ArgULong(args, "--seed",
                slice ? AuthoredShips.SliceSeed : grid ? AuthoredShips.GridSeed :
                wreck ? AuthoredShips.WreckSeed : 7UL);
            int crew = ArgInt(args, "--crew", 8);
            string outPath = ArgString(args, "--out", null);
            string dataDir = ArgString(args, "--data", null) ?? DefaultDataDir();
            var defs = LoadDefs(dataDir, out _, out _, out _);

            GenSimHost host;
            if (slice)
            {
                // The authored slice: same plan the hosts boot with --ship slice. GenSimHost builds
                // the sim from the plan; PopulateSlice weaves the authored minds/secrets (and, with a
                // SocialSystem, the seeded relationships — null here since the persona dump reads only
                // the authored persona sheet, never the social graph). RNG-free ⇒ byte-deterministic.
                host = GenSimHost.Build(AuthoredShips.PeriluneSlice(), defs);
                AuthoredShips.PopulateSlice(host.Sim, host.Minds, host.Facts, null);
            }
            else if (grid)
            {
                // The authored grid ship (--ship grid): the multi-deck 8-slot lattice. It carries no
                // authored personas (its crew are held under player control, not an LLM slice), so
                // the dump emits whatever PersonaGenerator produces for the built citizens.
                host = GenSimHost.Build(AuthoredShips.PeriluneGrid(), defs);
            }
            else if (wreck)
            {
                // The authored wreck start (--ship wreck): one crew member, no authored personas.
                host = GenSimHost.Build(AuthoredShips.PeriluneWreck(), defs);
            }
            else
            {
                var recipe = ShipRecipe.FromSeed(seed);
                recipe.CrewCount = crew;
                host = GenSimHost.Build(ProceduralShips.Generate(recipe), defs);
            }

            string json = PersonaDump.Render(seed, host.Sim, host.Minds, host.Facts);
            if (outPath != null)
            {
                File.WriteAllText(outPath, json);
                Console.WriteLine($"dump-personas: {host.Sim.Citizens.Items.Count} personas " +
                                  $"({(slice ? "slice" : grid ? "grid" : wreck ? "wreck" : "procedural")}, seed {seed}) -> {outPath}");
            }
            else
            {
                Console.Write(json);
            }
            return 0;
        }

        private static int RunGen(string[] args)
        {
            ulong seed = ArgULong(args, "--seed", 1UL);
            int days = ArgInt(args, "--days", 1);
            bool validate = HasFlag(args, "--validate");
            string dataDir = ArgString(args, "--data", null) ?? DefaultDataDir();
            var defs = LoadDefs(dataDir, out int fileCount, out _, out var problems);

            var plan = ProceduralShips.Generate(ShipRecipe.FromSeed(seed));
            Console.WriteLine($"gen: {plan.Name}");
            Console.WriteLine($"defs: {defs.Checksum:x16} ({fileCount} files, {problems.Count} problems)");
            Console.WriteLine($"  {plan.Rooms.Count} rooms, {plan.Devices.Count} devices, " +
                              $"{plan.Citizens.Count} crew, {plan.Items.Count} item stacks");

            if (!validate)
            {
                Console.WriteLine("(pass --validate to run the V1–V7 gate suite)");
                return 0;
            }

            var report = ShipGates.Run(plan, defs, days);
            Console.WriteLine(report.Format());
            return report.AllPassed ? 0 : 1;
        }

        /// <summary>
        /// <c>occupancy [--ship perilune|slice|grid] [--days D] [--seed N] [--data DIR]</c>:
        /// THE A1 MEASUREMENT — "are the crew actually working?"
        ///
        /// `ECONOMY-PLAN.md` §E0 states its goal as a number: **A1 ≥ 25 % busy at sim-hour 24**.
        /// Nothing in the repo measured it. `MECHANICS §13.6`'s occupancy table (`None 99.92 %`)
        /// was taken **pre-E0-1** and has not been refreshed across E0-1 (recruitability), E0-2
        /// (the 10× work-rate rebase + movement retune) or E0-3 (the player verbs), so the phase
        /// has been building toward a target nobody has checked. This verb is that check.
        ///
        /// Samples every crew member's <see cref="JobKind"/> every tick and reports three things:
        ///   1. the occupancy table (share of crew-ticks per JobKind) — comparable to §13.6's;
        ///   2. the **A1 headline** — busy share over the hour-23→24 window, i.e. "at sim-hour 24";
        ///   3. an hourly curve, because the shape matters: playtest round 3 found a *boot-window*
        ///      economy (crew idle again a few sim-minutes after the dig starts). A flat 25 % and a
        ///      spike that decays to 0 average the same and mean opposite things.
        ///
        /// Reports busy TWO ways on purpose. **any** = `JobKind != None`, which includes Eat, Drink
        /// and Flee; **work** = the productive kinds only (Dig/Haul*/Craft/Maintain/Build). A crew
        /// that clears 25 % by eating and fleeing has not met the intent of A1, and a single number
        /// would hide that. Read-only: no sim mutation beyond ticking, no files written.
        /// </summary>
        private static int RunOccupancy(string[] args)
        {
            string shipName = ArgString(args, "--ship", "slice");
            bool slice = shipName == "slice";
            bool grid = shipName == "grid";
            bool wreck = shipName == "wreck";   // the wreck start (W3)
            int days = ArgInt(args, "--days", 1);
            ulong seed = ArgULong(args, "--seed",
                slice ? AuthoredShips.SliceSeed : grid ? AuthoredShips.GridSeed :
                wreck ? AuthoredShips.WreckSeed : 42UL);
            string dataDir = ArgString(args, "--data", null) ?? DefaultDataDir();
            var defs = LoadDefs(dataDir, out _, out _, out _);

            GenSimHost host;
            if (slice)
            {
                host = GenSimHost.Build(AuthoredShips.PeriluneSlice(), defs);
                AuthoredShips.PopulateSlice(host.Sim, host.Minds, host.Facts, null);
            }
            else if (grid)
            {
                host = GenSimHost.Build(AuthoredShips.PeriluneGrid(), defs);
            }
            else if (wreck)
            {
                // The wreck start: ONE crew member, a mostly-airless ship. Every occupancy
                // percentage here is over a single pawn, so the denominator is 1/8th of grid's and
                // a single job start moves it by whole points — read the raw counts, not the rates.
                host = GenSimHost.Build(AuthoredShips.PeriluneWreck(), defs);
            }
            else
            {
                var recipe = ShipRecipe.FromSeed(seed);
                host = GenSimHost.Build(ProceduralShips.Generate(recipe), defs);
            }

            var sim = host.Sim;
            int crewCount = sim.Citizens.Items.Count;
            if (crewCount == 0) { Console.WriteLine("occupancy: no crew aboard — nothing to measure."); return 1; }

            // OPT-IN E0-5 measurement source (--strip N, default 0). Host-side: it designates the
            // first N legal interior walls for deconstruct at t=0 via the same command the client
            // issues, so the h29+ flatline has something to lift. --strip 0 (the default) touches
            // nothing and keeps the CI-pinned verb-less path byte-identical. See StripHarness.
            // OPT-IN E0-7 measurement lever (--makeup <liters>, default: leave the shipped value
            // alone). B-2's greywater makeup floor is the STAND-IN the ice chain replaces, and
            // WaterSystem now suppresses it on any ship that owns a melter — so on a melter ship
            // this flag changes nothing and on every other ship it is how you ask "what did B-2
            // actually buy?". Host-side and opt-in: with no flag the defs are untouched, so the
            // CI-pinned verb-less path stays byte-identical. NOTE it mutates the PARSED defs graph
            // after the checksum was printed, so a run with this flag reports a `defs:` line that no
            // longer describes it — deliberately, so the number stays comparable to every other run.
            string makeupArg = ArgString(args, "--makeup", null);
            if (makeupArg != null)
            {
                float makeup = float.Parse(makeupArg, System.Globalization.NumberStyles.Float,
                                           System.Globalization.CultureInfo.InvariantCulture);
                float wasMakeup = defs.Water.MakeupFloorLiters;
                defs.Water.MakeupFloorLiters = makeup;
                Console.WriteLine($"--makeup {makeup:0.###}: greywater makeup floor overridden " +
                                  $"(shipped {wasMakeup:0.###} L; 0 = the B-2 stand-in is OFF)");
                Console.WriteLine();
            }

            int stripN = ArgInt(args, "--strip", 0);
            // OPT-IN deck restriction for --strip (default -1 = every deck, the shipped behaviour).
            // The grid ship's decks 2..7 boot AIRLESS, and a strip designated there is the second
            // instance of the HANDOVER §5 item-2 livelock; the canonical z,y,x prefix can never
            // reach them because deck 0 alone has hundreds of legal walls. Host-side selection
            // only — the same DesignateDeconstructCommand a client click issues.
            int stripDeck = ArgInt(args, "--strip-deck", -1);
            int stripped = 0;
            if (stripN > 0)
            {
                stripped = StripHarness.EnqueueStrip(sim, stripN, stripDeck);
                Console.WriteLine($"--strip {stripN}: designated {stripped} interior wall(s) for " +
                                  "deconstruct at t=0 (canonical z,y,x" +
                                  (stripDeck >= 0 ? $", deck {stripDeck} only" : "") + ")" +
                                  (stripped < stripN ? $"  [ship had only {stripped} legal]" : ""));
                Console.WriteLine();
            }

            // OPT-IN E0-4 measurement source (--stockpile <bench|far|filtered-far>
            // [--stockpile-n N], default N=4). Host-side: it designates N stockpile tiles at t=0 via
            // the same command the client issues — `bench` hugs (and, on the slice, mostly sits ON)
            // the crafting benches, `far` lands on the opposite deck, and `filtered-far` is `far`'s
            // tiles plus a Potato-rejecting accept mask. `bench` and `far` are accept-all (unfiltered
            // — the pre-WP-4 "before"); `filtered-far` carries the WP-2 filter.
            //
            // ⚠️ RETRACTED: `far` was published as reproducing ECONOMY.md §8's −14 % wrong-deck
            // regression. It did not. Before WP-4b's reachability gate it zoned the slice's SEALED
            // observatory (walkable, but behind a permanently closed door), so the old `far` /
            // `filtered-far` numbers measured an unreachable-tile haul livelock — a pre-existing bug,
            // since fixed by WP-7 — not a cross-deck haul cost. Every tile the harness picks is now
            // reachable by some crew member at t=0; see StockpileHarness.SelectStockpile.
            //
            // No flag ⇒ the CI-pinned verb-less path is byte-identical (nothing below runs).
            string stockMode = ArgString(args, "--stockpile", null);
            int stockN = ArgInt(args, "--stockpile-n", 4);
            int zoned = 0;
            if (stockMode != null)
            {
                if (stockMode != "bench" && stockMode != "far" && stockMode != "filtered-far")
                {
                    Console.WriteLine($"--stockpile: unknown mode '{stockMode}' (expected 'bench', 'far' or 'filtered-far').");
                    return 1;
                }
                // The tiles the reachability gate REJECTED on the way to filling the N slots — printed
                // so a reader of the log can see the gate working instead of taking it on trust.
                var skipped = new List<Int3>();
                var zonedTiles = new List<Int3>();
                if (stockMode == "filtered-far")
                {
                    zoned = StockpileHarness.EnqueueFilteredFarStockpile(sim, stockN, skipped, zonedTiles);
                    Console.WriteLine($"--stockpile filtered-far {stockN}: designated {zoned} FILTERED stockpile " +
                                      $"tile(s) at t=0 (opposite deck, farthest from the crafting benches, crew-REACHABLE; " +
                                      $"accept-mask 0x{StockpileHarness.RejectPotatoMask:x16} — REJECTS Potato)" +
                                      (zoned < stockN ? $"  [ship had only {zoned} legal]" : ""));
                }
                else
                {
                    // `far` is every mode but `bench`; naming it here (not from `stockMode == "far"`
                    // higher up) keeps the flag next to its only reader, so a fourth mode cannot
                    // silently inherit `false`.
                    bool stockFar = stockMode != "bench";
                    zoned = StockpileHarness.EnqueueStockpile(sim, stockFar, stockN, skipped, zonedTiles);
                    Console.WriteLine($"--stockpile {stockMode} {stockN}: designated {zoned} accept-all stockpile " +
                                      // "on and beside", not "adjacent to": DesignateStockpileCommand
                                      // gates only on Walkable, so the bench TILES qualify at distance
                                      // 0 and 3 of the slice's 4 bench picks are the benches themselves.
                                      $"tile(s) at t=0 ({(stockFar ? "opposite deck, farthest from" : "on and beside")} the " +
                                      "crafting benches, crew-REACHABLE; NO filter — the pre-rule 'before')" +
                                      (zoned < stockN ? $"  [ship had only {zoned} legal]" : ""));
                }
                Console.Write($"  tiles zoned ({zonedTiles.Count})");
                if (zonedTiles.Count == 0) Console.Write("  (none)");
                foreach (var p in zonedTiles) Console.Write($"  {p}");
                Console.WriteLine();
                // NOT a ship survey: the gate is probed lazily in rank order and stops once N tiles
                // survive, so this lists only the rejects ranked ABOVE the last pick. The slice has 150
                // unreachable walkable tiles in total; a far-40 run prints 26 of them.
                Console.Write($"  tiles SKIPPED unreachable ({skipped.Count}, rank-order audit — NOT a ship survey)");
                if (skipped.Count == 0) Console.Write("  (none)");
                foreach (var p in skipped) Console.Write($"  {p}");
                Console.WriteLine();
                Console.WriteLine();
            }

            // OPT-IN LIVELOCK AUDIT (--maint-audit). Host-side, printing only; no flag ⇒ the
            // CI-comparable verb-less report is byte-identical.
            //
            // WHY IT EXISTS (HANDOVER §5 item 2). The occupancy table cannot tell a working ship
            // from a livelocked one: `Maintain 40 %` reads as productive whether the crew are
            // servicing machines or walking into vacuum, fleeing, recovering and walking back
            // forever. A1 scores the livelock as a PASS. This block adds the number that
            // separates them — SERVICES ACTUALLY COMPLETED — plus the churn that produces none.
            //
            // "Service completed" is measured, not inferred: a device's Condition is monotonically
            // NON-INCREASING under MachineWearSystem, so the ONLY thing that raises it is
            // MaintenanceSystem's restore. Sampled at the 1 Hz cadence both systems run at.
            bool maintAudit = HasFlag(args, "--maint-audit");
            var prevKind = new JobKind[sim.Citizens.Items.Count];
            for (int i = 0; i < prevKind.Length; i++) prevKind[i] = sim.Citizens.Items[i].JobKind;
            var prevCondition = new Dictionary<uint, float>();
            long maintStarts = 0, maintToFlee = 0, deconStarts = 0, deconToFlee = 0, fleeStarts = 0, services = 0;
            long lastHourMaintStarts = 0, lastHourMaintToFlee = 0, lastHourServices = 0;
            long lastHourDeconStarts = 0, lastHourDeconToFlee = 0;

            const int TicksPerHour = Simulation.TicksPerSecond * 60 * 60;
            int kindCount = Enum.GetValues(typeof(JobKind)).Length;
            var kindTicks = new long[kindCount];        // crew-ticks per JobKind, whole run
            int hours = days * 24;
            var hourAny = new long[hours];              // crew-ticks with ANY job, per sim-hour
            var hourWork = new long[hours];             // crew-ticks with a PRODUCTIVE job, per sim-hour
            // E0-4 on-job travel proxy: of the ticks a crew member is ON a productive job, how many
            // are spent WALKING to the site (a path still to follow) vs actually WORKING at it. A
            // far-deck stockpile inflates the walking share — MEASURED at +0.6 pp on the slice at
            // N=40 (bench 4.6 % → far 5.2 %). ECONOMY.md §8's −14 % throughput figure is NOT
            // reproduced here and this ship CANNOT reproduce it; see the ⚠️ RETRACTED block above and
            // StockpileHarness's class doc. Only meaningful under --stockpile (haul is 0 % otherwise),
            // but always counted — it is free.
            long onJobTravel = 0, onJobWork = 0;
            // WP-4b (review NICE-TO-HAVE 3): a delivery COUNT, so the haul-cost comparison between two
            // zone placements is normalised per haul instead of inferred from equal zone capacity.
            // `deliveryLegs` counts HaulDeliver→(anything else) transitions per crew member — an UPPER
            // BOUND on successful deliveries, because an abandon ends the leg too. Paired with the
            // end-of-run "stacks resting on stockpile tiles", which is the direct saturation reading.
            long deliveryLegs = 0;
            var wasDelivering = new bool[sim.Citizens.Items.Count];
            long totalTicks = (long)days * TicksPerDay;

            Console.WriteLine($"occupancy — {shipName} ship, {crewCount} crew, {days} day(s), seed {seed}");
            Console.WriteLine($"defs: {defs.Checksum:x16}");
            Console.WriteLine();

            var clock = Stopwatch.StartNew();
            for (long t = 0; t < totalTicks; t++)
            {
                sim.Tick();
                int hour = (int)(t / TicksPerHour);
                if (hour >= hours) hour = hours - 1;
                var crew = sim.Citizens.Items;
                for (int i = 0; i < crew.Count; i++)
                {
                    var c = crew[i];
                    // Count the delivery leg BEFORE the Dead skip: a crew member who dies mid-carry
                    // has still ended its leg, and dropping it here would silently under-count.
                    bool delivering = !c.Dead && c.JobKind == JobKind.HaulDeliver;
                    if (i < wasDelivering.Length)
                    {
                        if (wasDelivering[i] && !delivering) deliveryLegs++;
                        wasDelivering[i] = delivering;
                    }
                    if (c.Dead) continue;
                    kindTicks[(int)c.JobKind]++;
                    if (c.JobKind == JobKind.None) continue;
                    hourAny[hour]++;
                    if (IsProductive(c.JobKind))
                    {
                        hourWork[hour]++;
                        // HasPath ⇒ still en route to the job site (travelling); path exhausted ⇒
                        // standing at the site consuming JobWorkTicks (working).
                        if (c.HasPath) onJobTravel++; else onJobWork++;
                    }
                }

                if (maintAudit)
                {
                    for (int i = 0; i < crew.Count && i < prevKind.Length; i++)
                    {
                        var c = crew[i];
                        var now = c.Dead ? JobKind.None : c.JobKind;
                        var was = prevKind[i];
                        if (now != was)
                        {
                            if (now == JobKind.Maintain) maintStarts++;
                            if (now == JobKind.Deconstruct) deconStarts++;
                            if (now == JobKind.Flee)
                            {
                                fleeStarts++;
                                if (was == JobKind.Maintain) maintToFlee++;
                                if (was == JobKind.Deconstruct) deconToFlee++;
                            }
                            prevKind[i] = now;
                        }
                    }
                    // 1 Hz — the cadence MachineWearSystem and MaintenanceSystem both run at, so no
                    // restore can be missed and no wear step can be mistaken for one.
                    if (t % Simulation.TicksPerSecond == 0)
                    {
                        var devs = sim.Devices.Items;
                        for (int i = 0; i < devs.Count; i++)
                        {
                            var d = devs[i];
                            if (prevCondition.TryGetValue(d.Id, out float before) && d.Condition > before) services++;
                            prevCondition[d.Id] = d.Condition;
                        }
                    }
                    // The last measured hour, captured while the loop still has the counters, so the
                    // headline "N transitions in one hour, M services" is read off ONE hour rather
                    // than divided out of a whole-run total that includes the pre-onset quiet.
                    if (t == totalTicks - TicksPerHour)
                    {
                        lastHourMaintStarts = maintStarts;
                        lastHourMaintToFlee = maintToFlee;
                        lastHourServices = services;
                        lastHourDeconStarts = deconStarts;
                        lastHourDeconToFlee = deconToFlee;
                    }
                }
            }
            clock.Stop();

            long grandTotal = 0;
            for (int k = 0; k < kindCount; k++) grandTotal += kindTicks[k];
            if (grandTotal == 0) { Console.WriteLine("occupancy: every crew member died — nothing to measure."); return 1; }

            Console.WriteLine("job occupancy (share of live crew-ticks):");
            foreach (JobKind k in Enum.GetValues(typeof(JobKind)))
            {
                double pct = 100.0 * kindTicks[(int)k] / grandTotal;
                string tag = k == JobKind.None ? "" : IsProductive(k) ? "  (work)" : "  (survival)";
                Console.WriteLine($"  {k,-12} {pct,7:0.00} %{tag}");
            }

            Console.WriteLine();
            Console.WriteLine("busy by sim-hour (any = incl. eat/drink/flee · work = productive only):");
            for (int h = 0; h < hours; h++)
            {
                long denom = (long)TicksPerHour * crewCount;
                double any = 100.0 * hourAny[h] / denom, work = 100.0 * hourWork[h] / denom;
                Console.WriteLine($"  h{h + 1,-3} any {any,6:0.0} %   work {work,6:0.0} %   {Bar(work)}");
            }

            // A1 is stated "at sim-hour 24" — read the hour-23→24 window, not an instant (a single
            // tick is noise), and not the whole-run average (which a decaying boot window flatters).
            if (hours >= 24)
            {
                long denom = (long)TicksPerHour * crewCount;
                double anyAt24 = 100.0 * hourAny[23] / denom, workAt24 = 100.0 * hourWork[23] / denom;
                Console.WriteLine();
                Console.WriteLine($"A1 (busy at sim-hour 24, target >= 25 %):  any {anyAt24:0.000} %   work {workAt24:0.000} %");
                Console.WriteLine($"A1 verdict (work): {(workAt24 >= 25.0 ? "PASS" : "FAIL")}");
            }
            else
            {
                Console.WriteLine();
                Console.WriteLine("A1 needs --days 1 or more to reach sim-hour 24.");
            }

            if (maintAudit)
            {
                double maintPct = 100.0 * kindTicks[(int)JobKind.Maintain] / grandTotal;
                double deconPct = 100.0 * kindTicks[(int)JobKind.Deconstruct] / grandTotal;
                double fleePct = 100.0 * kindTicks[(int)JobKind.Flee] / grandTotal;
                int needy = 0, needyUnbreathable = 0, devicesUnbreathable = 0;
                foreach (var d in sim.Devices.Items)
                {
                    bool safe = AtmosphereSafety.IsBreathable(sim.Rooms.RoomAt(sim.World, d.Pos), sim.Defs.Needs);
                    if (!safe) devicesUnbreathable++;
                    if (d.Condition >= sim.Defs.Machines[(int)d.Kind].MaintainBelow) continue;
                    needy++;
                    if (!safe) needyUnbreathable++;
                }
                Console.WriteLine();
                Console.WriteLine("livelock audit (--maint-audit; HANDOVER §5 item 2):");
                Console.WriteLine($"  Maintain occupancy     {maintPct,8:0.000} %   Deconstruct {deconPct:0.000} %   Flee {fleePct:0.000} %");
                Console.WriteLine($"  Maintain job starts    {maintStarts,8}   of which Maintain->Flee aborts {maintToFlee}");
                Console.WriteLine($"  Deconstruct starts     {deconStarts,8}   of which Deconstruct->Flee aborts {deconToFlee}");
                Console.WriteLine($"  Flee starts            {fleeStarts,8}");
                Console.WriteLine($"  SERVICES COMPLETED     {services,8}   (a device Condition that ROSE — wear only " +
                                  "ever lowers it, so this is the one number a livelock cannot fake)");
                Console.WriteLine($"  final sim-hour         starts {maintStarts - lastHourMaintStarts}   " +
                                  $"Maintain->Flee {maintToFlee - lastHourMaintToFlee}   services {services - lastHourServices}   " +
                                  $"| decon starts {deconStarts - lastHourDeconStarts}  decon->Flee {deconToFlee - lastHourDeconToFlee}");
                Console.WriteLine($"  devices in bad air     {devicesUnbreathable,8}   (of {sim.Devices.Items.Count})");
                Console.WriteLine($"  needy machines at end  {needy,8}   of which in UNBREATHABLE air {needyUnbreathable}");
                // Designated tiles the worksite staging rule refuses (MECHANICS §13.21). This is the
                // number that turns "the work silently never happens" into something an operator can
                // read — the rule's own honest cost, printed.
                int refusedTiles = 0, firstShown = 0;
                var w = sim.World;
                for (int z = 0; z < w.Depth; z++)
                    for (int y = 0; y < w.Height; y++)
                        for (int x = 0; x < w.Width; x++)
                        {
                            var p = new Int3(x, y, z);
                            if ((w.GetFlags(p) & TileFlags.Designated) == 0) continue;
                            bool stageable = false, anyWalkable = false;
                            for (int i = 0; i < 4; i++)
                            {
                                var n = Int3.Neighbor4(p, i);
                                if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                                anyWalkable = true;
                                if (WorksiteSafety.CanStageWorkerAt(sim, n)) { stageable = true; break; }
                            }
                            if (stageable || !anyWalkable) continue; // walled in is not an AIR refusal
                            refusedTiles++;
                            if (firstShown++ >= 4) continue;
                            for (int i = 0; i < 4; i++)
                            {
                                var n = Int3.Neighbor4(p, i);
                                if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                                var nr = sim.Rooms.RoomAt(sim.World, n);
                                Console.WriteLine($"    refused {p} staging {n}  roomId={sim.Rooms.RoomIdAt(sim.World, n)}  " +
                                                  $"p={nr.PressureKPa:0.0} kPa  o2={nr.PressureKPa * nr.O2Fraction:0.0} kPa  " +
                                                  $"co2={nr.CO2Ppm:0} ppm  T={nr.TemperatureK - 273.15:0.0} C");
                            }
                        }
                // Deconstruct designations live in a REGISTRY, not in TileFlags.Designated, so the
                // world pass above cannot see them. Counting them here is the difference between
                // "the rule's honest cost" and "the rule's honest cost for digs only".
                int refusedStrips = 0;
                if (sim.Deconstruct != null)
                    foreach (var site in sim.Deconstruct.Pending)
                    {
                        bool stageable = false, anyWalkable = false;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(site.Pos, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            anyWalkable = true;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { stageable = true; break; }
                        }
                        if (!stageable && anyWalkable) refusedStrips++;
                    }
                // BUILD sites live in their own registry too, and this is the class where the rule
                // genuinely destroys ACHIEVABLE work: a floor build is 20 ticks (2 s) against a 45 s
                // vacuum deadline, so it would have landed. Leaving builds out would have made the
                // one loss that matters invisible to the instrument built to measure the loss.
                int refusedBuilds = 0;
                BuildSystem buildSys = null;
                foreach (var sysm in sim.Systems) if (sysm is BuildSystem bs) { buildSys = bs; break; }
                if (buildSys != null)
                    foreach (var site in buildSys.Pending)
                    {
                        bool stageable = false, anyWalkable = false;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(site.Pos, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            anyWalkable = true;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { stageable = true; break; }
                        }
                        if (!stageable && anyWalkable) refusedBuilds++;
                    }
                Console.WriteLine($"  unstageable dig/strip/build  {refusedTiles} / {refusedStrips} / {refusedBuilds}   " +
                                  "(designations a player made that the worksite staging rule refuses — its honest " +
                                  "cost, MECHANICS §13.21. 'Walled in' is excluded: this is AIR only. The BUILD " +
                                  "column is the one that can destroy achievable work — a 20-tick floor build " +
                                  "would have landed inside the 45 s flee deadline)");
                foreach (var d in sim.Devices.Items)
                {
                    if (d.Condition >= sim.Defs.Machines[(int)d.Kind].MaintainBelow) continue;
                    var room = sim.Rooms.RoomAt(sim.World, d.Pos);
                    bool safe = AtmosphereSafety.IsBreathable(room, sim.Defs.Needs);
                    Console.WriteLine($"    {d.Kind,-16} {d.Pos}  cond {d.Condition:0.000}  " +
                                      $"{(safe ? "breathable" : "UNBREATHABLE")}  " +
                                      $"p={room.PressureKPa:0.0} kPa  co2={room.CO2Ppm:0} ppm  T={room.TemperatureK - 273.15:0.0} C");
                }
            }

            // E0-4 measurement block — the numbers acceptance needs (plan §11 items 2/3/4). Gated on
            // the --stockpile flag so the CI-pinned no-flag report stays byte-identical: haul is a flat
            // 0 % without a zone, so these lines only carry signal under the harness.
            if (stockMode != null)
            {
                double haulPickup = 100.0 * kindTicks[(int)JobKind.HaulPickup] / grandTotal;
                double haulDeliver = 100.0 * kindTicks[(int)JobKind.HaulDeliver] / grandTotal;
                long onJob = onJobTravel + onJobWork;
                double travelPct = onJob > 0 ? 100.0 * onJobTravel / onJob : 0.0;
                int controllers = 0;
                foreach (var it in sim.Items.Items)
                    if (it.Kind == ItemKind.ControllerModule) controllers += it.Count;

                Console.WriteLine();
                Console.WriteLine($"E0-4 measurement (--stockpile {stockMode}, {zoned} tile(s) zoned):");
                Console.WriteLine($"  haul occupancy         HaulPickup {haulPickup:0.000} %  +  HaulDeliver {haulDeliver:0.000} %");
                Console.WriteLine($"  throughput             ControllerModule end-count {controllers}   (A1 baseline 31)");
                Console.WriteLine($"  on-job travel          {travelPct:0.0} %   (share of productive-job ticks spent walking, not working)");
                // WP-4b: the matter-ceiling warning is NOT printed here. It lives beside the
                // unconditional `ground stock` line below, because the run that most needs it is the
                // plain verb-less `occupancy --ship slice --days 3` — the command MECHANICS §13.15
                // documents, and the exact run whose `31` was misread into this lane's retracted claim.
                //
                // `delivery legs ended` counts HaulDeliver→(anything else) transitions. It is an UPPER
                // BOUND on successful deliveries, and the direction of that bias matters: the only
                // over-count is a leg abandoned mid-carry, which enters the count with FEWER ticks than
                // a completed delivery. Extra legs therefore inflate the denominator of any
                // cost-per-delivery figure, so a far/bench cost RATIO computed from these counts is a
                // LOWER BOUND on the true per-delivery penalty. (On the slice the bias is small anyway:
                // `Flee` is 0.00 % and 8/8 crew survive in every leg, so abandons are path-loss only.)
                Console.WriteLine($"  delivery legs ended    {deliveryLegs}   (upper bound on deliveries — an " +
                                  "abandon ends a leg too, with fewer ticks, so a cost-per-delivery " +
                                  "ratio from these is a LOWER bound)");
                Console.WriteLine($"  stacks on zone tiles   {StacksOnStockpileTiles(sim)} / {zoned} zoned   " +
                                  "(>= zoned ⇒ the zone is plausibly saturated and stopped accepting; " +
                                  "counts stacks RESTING there however they arrived — hauled, dropped, or " +
                                  "spawned by a bench standing on a zoned tile — so > zoned is normal)");
            }

            // "0 % busy" is a symptom, not a diagnosis. The interesting question is always WHY the
            // work ran out, so close with the state of every demand source the dispatcher scans.
            // Without this the operator has to re-derive it by hand every time.
            Console.WriteLine();
            Console.WriteLine("end-of-run demand sources (why work did or didn't exist):");
            int designated = 0, stockpile = 0, debris = 0;
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (world.GetWall(p) == TileDefs.Debris) debris++;
                        var f = world.GetFlags(p);
                        if ((f & TileFlags.Designated) != 0) designated++;
                        if ((f & TileFlags.Stockpile) != 0) stockpile++;
                    }
            Console.WriteLine($"  debris tiles left      {debris,6}   (dig work remaining: {designated})");
            Console.WriteLine($"  stockpile tiles zoned  {stockpile,6}   (0 ⇒ HaulPickup/HaulDeliver can never be assigned)");
            // E0-5: pending deconstruct sites (the strip demand source). Read the registry, not a
            // tile flag — deconstruct is a registry. Prints only when the harness seeded any, so the
            // default verb-less report is unchanged.
            if (stripN > 0)
            {
                int pending = sim.Deconstruct != null ? sim.Deconstruct.Pending.Count : 0;
                Console.WriteLine($"  strip sites pending    {pending,6}   (of {stripped} designated ⇒ " +
                                  $"{stripped - pending} torn down this run)");
            }

            var stock = new Dictionary<ItemKind, int>();
            foreach (var it in sim.Items.Items)
            {
                stock.TryGetValue(it.Kind, out int n);
                stock[it.Kind] = n + it.Count;
            }
            // Iterate the ENUM, not the dictionary: hash order is not a contract, and this report
            // is meant to be diffable between runs.
            Console.Write("  ground stock          ");
            if (stock.Count == 0) Console.Write("  (none)");
            foreach (ItemKind k in Enum.GetValues(typeof(ItemKind)))
                if (stock.TryGetValue(k, out int n) && n > 0) Console.Write($"  {k}={n}");
            Console.WriteLine();
            // WP-4b — UNCONDITIONAL, and deliberately here rather than in the --stockpile block. The
            // plain verb-less run is the one whose `ControllerModule=31` was misread as a throughput
            // measurement and published as a wrong-deck regression, so the warning has to reach a reader
            // who passed no flags at all. This adds ONE line to the default occupancy report; nothing in
            // ci.sh pins that report's text, and no determinism pin is affected (host printing only).
            string headroom = StockpileHarness.MatterHeadroomWarning(stripN);
            if (headroom != null) Console.WriteLine(headroom);

            // E0-7 — THE WATER LEDGER. Unconditional, because "the crew are busy" was never the
            // question the water loop asks: the slice's food production died on day 1.2 with the
            // HUD still reading full (ECONOMY.md §1.4), and no occupancy number would ever have
            // said so. Every figure here is read off live state at the end of the run.
            float tankLiters = 0f, tankCapacity = 0f, melterBuffered = 0f;
            int tanks = 0, dryTanks = 0, melters = 0, growBeds = 0, dryBeds = 0;
            foreach (var d in sim.Devices.Items)
            {
                if (d.Kind == DeviceKind.WaterTank)
                {
                    tanks++;
                    tankLiters += d.StoredLiters;
                    tankCapacity += sim.Defs.Water.TankCapacityLiters;
                    // "Dry" is the SIM'S OWN test, the one SustenanceSystem gates drinking on —
                    // not a round number, and not `<= 0`, which would call a 0.02 L tank full.
                    if (d.StoredLiters < sim.Defs.Sustenance.DrinkLiters) dryTanks++;
                }
                else if (d.Kind == DeviceKind.IceMelter) { melters++; melterBuffered += d.StoredLiters; }
                else if (d.Kind == DeviceKind.GrowBed) growBeds++;
            }
            // A bed is DRY when its own fluid network cannot cover one second of irrigation — the
            // all-or-nothing draw HydroponicsSystem actually makes, evaluated read-only, exactly as
            // ShipSystems does it. NOT `Progress <= 0`: that was the first spelling and it carried
            // no information, because a bed frozen mid-crop keeps whatever progress it had, so the
            // dead-loop leg (--makeup 0, tanks run down) reported "3 of 3 still turning" alongside
            // the healthy one. This test separates them.
            foreach (var bed in sim.Devices.Items)
            {
                if (bed.Kind != DeviceKind.GrowBed) continue;
                // Deliberately NOT gated on bed.Powered. A shed grow bed is a POWER fault, and on
                // this ship power flaps on a one-second brownout sawtooth (ECONOMY.md §1.2), so
                // folding it in here made this line report the instant the run happened to end
                // instead of the state of the water loop. Unplumbed still counts: a bed on no
                // network can never irrigate, whatever the tanks hold.
                if (bed.FluidNetworkId == 0) { dryBeds++; continue; }
                float onNetwork = 0f;
                foreach (var t in sim.Devices.Items)
                    if (t.Kind == DeviceKind.WaterTank && t.FluidNetworkId == bed.FluidNetworkId)
                        onNetwork += t.StoredLiters;
                if (onNetwork < sim.Defs.Hydro.GrowBedWaterPerSecond) dryBeds++;
            }
            stock.TryGetValue(ItemKind.Ice, out int iceLeft);
            Console.WriteLine();
            Console.WriteLine("end-of-run WATER (E0-7 — the loop occupancy cannot see):");
            Console.WriteLine($"  tanks                  {tankLiters,8:0.0} / {tankCapacity:0.0} L across {tanks} tank(s), " +
                              $"{dryTanks} below one drink");
            Console.WriteLine($"  greywater pool         {sim.WastewaterLiters,8:0.0} L");
            Console.WriteLine($"  grow beds              {growBeds - dryBeds,8} of {growBeds} can irrigate " +
                              "(its own network holds at least one second of the all-or-nothing draw; " +
                              "a bed that cannot is frozen mid-crop, however much progress it kept)");
            if (melters > 0)
            {
                Console.WriteLine($"  ice melters            {melters,8}   (B-2 makeup floor SUPPRESSED — this ship " +
                                  "lives on what its crew haul and melt)");
                Console.WriteLine($"  hold ice left          {iceLeft,8} unit(s)  ⇒ {iceLeft * sim.Defs.Water.IceLitersPerUnit:0} L still in the hold");
                Console.WriteLine($"  buffered in melters    {melterBuffered,8:0.0} L   (a buffer stuck at capacity = the " +
                                  "network is full, absent, unpowered or broken)");
            }
            else
            {
                // Say which of the two things is true, rather than asserting the conjuring in the
                // one leg that exists to disprove it: `--makeup 0` turns the stand-in OFF, and this
                // line used to announce it as ACTIVE at 0 L in exactly that run.
                Console.WriteLine(sim.Defs.Water.MakeupFloorLiters > 0f
                    ? $"  ice melters            {melters,8}   (no ice chain ⇒ the B-2 makeup floor is " +
                      $"ACTIVE at {sim.Defs.Water.MakeupFloorLiters:0.###} L — water is being conjured)"
                    : $"  ice melters            {melters,8}   (no ice chain AND no makeup floor ⇒ NOTHING " +
                      "sources water on this ship — the loop can only run down)");
            }

            int alive = 0;
            foreach (var c in sim.Citizens.Items) if (!c.Dead) alive++;
            Console.WriteLine($"  crew alive             {alive,6} / {crewCount}");

            Console.WriteLine($"\n{totalTicks:N0} ticks in {clock.Elapsed.TotalSeconds:0.0}s wall");
            return 0;
        }

        /// <summary>WP-4b — how many item stacks are resting ON a stockpile tile at end of run, the
        /// saturation reading the review asked for. <c>HaulJobSource</c> only offers a tile as a
        /// destination while <c>IsFreeStockpileTile</c> holds, so once every zoned tile carries a stack
        /// the zone stops accepting — and THAT is what bounds haul volume in these legs, not distance.
        ///
        /// HONEST LIMIT, because the obvious reading is wrong: this is NOT "stacks the haul board
        /// delivered". It counts whatever rests there, including stacks a crafting station SPAWNED on a
        /// zoned tile (outputs appear at the worker's position, and `bench` mode zones the bench tiles
        /// themselves) and stacks simply dropped. So it routinely EXCEEDS the zoned-tile count —
        /// several stacks may share a tile — and is an UPPER bound on stored-by-haul. Read it as
        /// "&gt;= zoned ⇒ plausibly saturated", never as a delivery count; `delivery legs ended` is the
        /// volume metric. Counts uncarried stacks only — a stack in transit is not stored.</summary>
        private static int StacksOnStockpileTiles(Simulation sim)
        {
            int n = 0;
            foreach (var it in sim.Items.Items)
                if (it.CarriedBy == 0 && (sim.World.GetFlags(it.Pos) & TileFlags.Stockpile) != 0) n++;
            return n;
        }

        /// <summary>Productive work, as opposed to survival (Eat/Drink) or self-preservation (Flee).
        /// A1's intent is "the economy has work for the crew", so the headline number counts only
        /// these — a ship whose crew are 25 % busy eating has not met it.</summary>
        private static bool IsProductive(JobKind k) =>
            k == JobKind.Dig || k == JobKind.HaulPickup || k == JobKind.HaulDeliver ||
            k == JobKind.Craft || k == JobKind.Maintain || k == JobKind.HaulToBuild ||
            k == JobKind.Build || k == JobKind.Deconstruct; // E0-5: a closed whitelist, so a new
            // productive kind that is not listed here is silently measured as idle.

        private static string Bar(double pct)
        {
            int n = (int)(pct / 2.5); // 40 cells = 100 %
            if (n > 40) n = 40;
            return new string('#', n < 0 ? 0 : n);
        }

        /// <summary><c>sweep --count M [--start-seed S] [--days D] [--data DIR]</c>: gate M seeded
        /// variants, print a summary table. Exit-code contract (CI): 0 = all pass, 1 = any gate
        /// failure, 2 = a crash while building/validating.</summary>
        private static int RunSweep(string[] args)
        {
            int count = ArgInt(args, "--count", 10);
            ulong start = ArgULong(args, "--start-seed", 1UL);
            int days = ArgInt(args, "--days", 1);
            string dataDir = ArgString(args, "--data", null) ?? DefaultDataDir();
            var defs = LoadDefs(dataDir, out _, out _, out _);

            Console.WriteLine($"sweep: {count} seed(s) from {start}, {days} day survivability, defs {defs.Checksum:x16}");
            Console.WriteLine("  seed      result   first failure");

            int failures = 0;
            for (int i = 0; i < count; i++)
            {
                ulong seed = start + (ulong)i;
                try
                {
                    var plan = ProceduralShips.Generate(ShipRecipe.FromSeed(seed));
                    var report = ShipGates.Run(plan, defs, days);
                    if (report.AllPassed)
                    {
                        Console.WriteLine($"  {seed,-8}  PASS");
                    }
                    else
                    {
                        failures++;
                        var f = report.FirstFailure();
                        Console.WriteLine($"  {seed,-8}  FAIL     {f.Code} {f.Name}: {(f.Findings.Count > 0 ? f.Findings[0] : "")}");
                    }
                }
                catch (Exception e)
                {
                    Console.WriteLine($"  {seed,-8}  CRASH    {e.GetType().Name}: {e.Message}");
                    return 2; // crash exit code (CI contract)
                }
            }

            Console.WriteLine(failures == 0
                ? $"=> all {count} variants pass every gate"
                : $"=> {failures} of {count} variants failed a gate");
            return failures == 0 ? 0 : 1;
        }

        /// <summary>
        /// <c>ledger [--ship perilune|slice|grid] [--days D] [--seed N] [--data DIR]</c>: E0-8's
        /// measurement fixture. Ticks a ship and prints, hourly, the four new
        /// <see cref="ShipLedger"/> members, then the <see cref="ShipMetrics"/> HONESTY TABLE at the
        /// end — every existing HUD metric beside an independently derived truth.
        ///
        /// <para>Read-only: no designation, no command, no file. The CI-pinned verb-less path is
        /// untouched.</para>
        /// </summary>
        private static int RunLedger(string[] args)
        {
            string shipName = ArgString(args, "--ship", "slice");
            bool slice = shipName == "slice";
            bool grid = shipName == "grid";
            bool wreck = shipName == "wreck";   // the wreck start (W3)
            int days = ArgInt(args, "--days", 3);
            ulong seed = ArgULong(args, "--seed",
                slice ? AuthoredShips.SliceSeed : grid ? AuthoredShips.GridSeed :
                wreck ? AuthoredShips.WreckSeed : 42UL);
            string dataDir = ArgString(args, "--data", null) ?? DefaultDataDir();
            var defs = LoadDefs(dataDir, out _, out _, out _);

            GenSimHost host;
            if (slice)
            {
                host = GenSimHost.Build(AuthoredShips.PeriluneSlice(), defs);
                AuthoredShips.PopulateSlice(host.Sim, host.Minds, host.Facts, null);
            }
            else if (grid)
            {
                host = GenSimHost.Build(AuthoredShips.PeriluneGrid(), defs);
            }
            else if (wreck)
            {
                // The wreck start: ONE crew member, a mostly-airless ship. Every occupancy
                // percentage here is over a single pawn, so the denominator is 1/8th of grid's and
                // a single job start moves it by whole points — read the raw counts, not the rates.
                host = GenSimHost.Build(AuthoredShips.PeriluneWreck(), defs);
            }
            else
            {
                host = GenSimHost.Build(ProceduralShips.Generate(ShipRecipe.FromSeed(seed)), defs);
            }

            var sim = host.Sim;
            Console.WriteLine($"ledger — {shipName} ship, {sim.Citizens.Items.Count} crew, {days} day(s), seed {seed}");
            Console.WriteLine($"defs: {defs.Checksum:x16}");
            Console.WriteLine($"item kinds known to the ledger: {ShipLedger.KindCount}");
            Console.WriteLine();

            const int TicksPerHour = Simulation.TicksPerSecond * 60 * 60;
            var tracker = new ShipLedgerTracker();
            long totalTicks = (long)days * TicksPerDay;
            for (long t = 0; t < totalTicks; t++)
            {
                sim.Tick();
                if ((t + 1) % TicksPerHour != 0) continue;
                var report = tracker.Observe(sim);
                Console.WriteLine($"h{(t + 1) / TicksPerHour,-3}" + LedgerHarness.FormatLedgerLine(report));
            }

            Console.WriteLine();
            Console.WriteLine("matter census at end of run (units per ItemKind):");
            var final = ShipLedger.Sample(sim);
            for (int k = 0; k < ShipLedger.KindCount; k++)
                Console.WriteLine($"  {ShipLedger.KindName(k),-18} {final.Units[k],8}");
            Console.WriteLine($"  {"(unknown kind)",-18} {final.UnknownUnits,8}");
            Console.WriteLine($"  {"TOTAL",-18} {final.TotalUnits,8}   in {final.Stacks} stacks");
            Console.WriteLine($"  greywater pool     {final.GreywaterLiters,8:0.0} L   " +
                              $"tanks {final.TankLiters:0.0} / {final.TankCapacityLiters:0.0} L");

            Console.WriteLine();
            Console.WriteLine("ShipMetrics HONESTY TABLE — what the HUD shows vs an independent derivation:");
            foreach (var a in LedgerHarness.Audit(sim))
            {
                Console.WriteLine($"  {a.Name,-14} shown {a.Shown,-12} true: {a.Truth}");
                Console.WriteLine($"                 => {a.Verdict}");
            }
            return 0;
        }

        private static bool HasFlag(string[] args, string name)
        {
            for (int i = 0; i < args.Length; i++) if (args[i] == name) return true;
            return false;
        }

        private static string ArgString(string[] args, string name, string fallback)
        {
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
            return fallback;
        }

        private static int ArgInt(string[] args, string name, int fallback) =>
            int.TryParse(ArgString(args, name, null), NumberStyles.Integer, CultureInfo.InvariantCulture, out int v) ? v : fallback;

        private static ulong ArgULong(string[] args, string name, ulong fallback) =>
            ulong.TryParse(ArgString(args, name, null), NumberStyles.Integer, CultureInfo.InvariantCulture, out ulong v) ? v : fallback;

        /// <summary>Probe upward from the binary for the repo's content/core/SimDefs
        /// (so `dotnet run` finds it without a --data flag). Null if not found — the
        /// loader then falls back to compiled defaults.</summary>
        private static string DefaultDataDir()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(dir.FullName, "content", "core", "SimDefs");
                if (Directory.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
            return null;
        }

        /// <summary>Overlay every <c>*.def</c> in <paramref name="dir"/> (sorted by
        /// filename) onto the compiled defaults; a missing directory ⇒ defaults. Mirror
        /// of Bootstrap.LoadDefs, engine-free (Sim.Core stays file-IO-free — the IO
        /// lives here in the host).</summary>
        private static SimDefs LoadDefs(string dir, out int fileCount, out int ruleCount, out List<string> problems)
        {
            problems = new List<string>();
            fileCount = 0;
            ruleCount = 0;
            if (dir == null || !Directory.Exists(dir)) return SimDefs.Default;

            string[] paths = Directory.GetFiles(dir, "*.def");
            Array.Sort(paths, StringComparer.Ordinal);
            fileCount = paths.Length;

            var files = new List<(string name, string text)>(paths.Length);
            foreach (var path in paths)
            {
                // Fail-soft covers IO too: an unreadable file warns, never aborts.
                try { files.Add((Path.GetFileName(path), File.ReadAllText(path))); }
                catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
                {
                    problems.Add($"{Path.GetFileName(path)}: unreadable ({e.GetType().Name}), using defaults for this file");
                }
            }

            var ruleFiles = RulesLoader.Load(dir, problems);
            ruleCount = ruleFiles.Count;
            return DefsParser.Parse(files, ruleFiles, problems);
        }

        private static Simulation BuildScenario(ulong seed, SimDefs defs)
        {
            // A compact self-sustaining section: quarters + hydro bay + power + water.
            string[] deck =
            {
                "######################",
                "#........#...........#",
                "#........#...........#",
                "#........D...........#",
                "#........#...........#",
                "######################",
            };
            var map = new string[deck.Length];
            for (int i = 0; i < deck.Length; i++) map[i] = deck[i].Replace('D', '.');

            var registry = new DeviceRegistry();
            var moss = new ScriptRuntime(registry);
            // Designer rules (B5): construct the rule system only when rules exist, so a
            // rules-absent run keeps the pre-B5 system stack and hashes identically. Both
            // this sim and its determinism twin build one from the same defs.Rules.
            ISimSystem designerRules = RulesLoader.CreateSystem(defs, registry);
            var sim = new Simulation(AsciiWorld.Build(map), seed, SystemStack.CreateDefault(moss, designerRules), defs);
            // The read-only ship-metrics namespace, on the shared registry (this scenario
            // wires its own adapters rather than via MossBindings), so rules can read ship.*.
            registry.Register("ship", new ShipMetricsAdapter(sim));

            // Open passage: the first run of this scenario killed both citizens with a
            // closed door (CO2 buildup, no water access) — systemic death, working as
            // designed. Institutions leave their doors open.
            sim.AddDevice(DeviceKind.Door, new Int3(9, 3, 0), "door_a").IsOpen = true;

            // Power: solar wing + battery on a conduit run with a leg down to y4.
            for (int x = 11; x <= 20; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 2, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(11, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Battery, new Int3(12, 1, 0), "battery").StoredKWh = 20f;
            sim.AddDevice(DeviceKind.Conduit, new Int3(16, 3, 0), "c_leg1");
            sim.AddDevice(DeviceKind.Conduit, new Int3(16, 4, 0), "c_leg2");

            // Water + food loop: every consumer has both pipe and power adjacency.
            sim.AddDevice(DeviceKind.Pipe, new Int3(13, 3, 0), "p1");
            sim.AddDevice(DeviceKind.Pipe, new Int3(14, 3, 0), "p2");
            sim.AddDevice(DeviceKind.Pipe, new Int3(15, 3, 0), "p3");
            sim.AddDevice(DeviceKind.Reclaimer, new Int3(12, 3, 0), "reclaimer"); // pipe(13,3)+conduit(12,2)
            sim.AddDevice(DeviceKind.WaterTank, new Int3(13, 4, 0), "tank").StoredLiters = 200f;
            sim.AddDevice(DeviceKind.GrowBed, new Int3(15, 4, 0), "bed_1");       // pipe(15,3)+conduit(16,4)
            sim.AddDevice(DeviceKind.Scrubber, new Int3(18, 1, 0), "scrubber");
            sim.AddDevice(DeviceKind.AirVent, new Int3(19, 1, 0), "vent");
            sim.AddDevice(DeviceKind.Light, new Int3(18, 3, 0), "light_a");
            // Radiators: without them the machines cook the compartment past 45C and
            // the crew dies of heat stroke — the M4 thermal cascade, working as designed.
            sim.AddDevice(DeviceKind.Radiator, new Int3(20, 1, 0), "radiator_a");
            sim.AddDevice(DeviceKind.Radiator, new Int3(7, 1, 0), "radiator_b");
            // Conservation: seed the greywater pool so the reclaimer has something to cycle.
            sim.WastewaterLiters = 150f;

            sim.AddCitizen("Okafor", new Int3(3, 2, 0));
            sim.AddCitizen("Reyes", new Int3(5, 2, 0));

            sim.Rooms.SetAnchor("quarters", new Int3(2, 2, 0));
            sim.Rooms.SetAnchor("hydro", new Int3(14, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            foreach (var anchor in new[] { "quarters", "hydro" })
                for (int i = 0; i < sim.Rooms.Anchors.Count; i++)
                    if (sim.Rooms.Anchors[i].Name == anchor)
                        RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, sim.Rooms.Anchors[i].Probe));

            // Life support watch, straight from the game's default program family.
            registry.Register("hydro", new HeadlessRoomSensor(sim, new Int3(14, 2, 0)));
            const string program = "every 5s:\n" +
                                   "  if hydro.pressure < 96kPa: open(vent)\n" +
                                   "  if hydro.pressure > 100kPa: close(vent)\n";
            registry.Register("vent", new HeadlessVent(sim, "vent"));
            sim.SetScript("term_main", program);
            moss.SetProgram("term_main", program);

            return sim;
        }

        private static void Report(Simulation sim)
        {
            double day = sim.TickCount / (double)TicksPerDay;
            var world = sim.World;
            double pressure = sim.Rooms.RoomAt(world, new Int3(14, 2, 0)).PressureKPa;
            float water = 0f;
            int potatoes = 0;
            foreach (var d in sim.Devices.Items) if (d.Kind == DeviceKind.WaterTank) water += d.StoredLiters;
            foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Potato) potatoes += it.Count;
            Console.WriteLine($"day {day,6:0.00}  pop {sim.Citizens.Count}  hydro {pressure,6:0.0} kPa  " +
                              $"water {water,7:0.0} L  potatoes {potatoes,3}  hash {sim.StateHash():x16}");
        }

        /// <summary>Minimal headless MOSS adapters (the game's live in Game.View, which we deliberately don't reference).</summary>
        private sealed class HeadlessRoomSensor : IScriptable
        {
            private readonly Simulation _sim;
            private readonly Int3 _probe;
            public HeadlessRoomSensor(Simulation sim, Int3 probe) { _sim = sim; _probe = probe; }

            public bool TryGetProperty(string name, out DslValue value)
            {
                var room = _sim.Rooms.RoomAt(_sim.World, _probe);
                switch (name)
                {
                    case "pressure": value = DslValue.Number(room.PressureKPa); return true;
                    case "o2": value = DslValue.Number(room.O2Fraction * 100.0); return true;
                    case "co2": value = DslValue.Number(room.CO2Ppm); return true;
                    default: value = default; return false;
                }
            }

            public bool TryInvoke(string verb, DslValue[] args, int argCount, out string error)
            {
                error = "rooms have no commands";
                return false;
            }
        }

        private sealed class HeadlessVent : IScriptable
        {
            private readonly Simulation _sim;
            private readonly string _name;
            public HeadlessVent(Simulation sim, string name) { _sim = sim; _name = name; }

            private Device Find()
            {
                foreach (var d in _sim.Devices.Items) if (d.Name == _name) return d;
                return null;
            }

            public bool TryGetProperty(string name, out DslValue value)
            {
                var d = Find();
                value = default;
                if (d == null) return false;
                if (name == "open") { value = DslValue.Boolean(d.IsOpen); return true; }
                return false;
            }

            public bool TryInvoke(string verb, DslValue[] args, int argCount, out string error)
            {
                error = null;
                var d = Find();
                if (d == null) { error = "vent missing"; return false; }
                if (verb == "open") { _sim.EnqueueCommand(new SetDeviceStateCommand(d.Id, open: true)); return true; }
                if (verb == "close") { _sim.EnqueueCommand(new SetDeviceStateCommand(d.Id, open: false)); return true; }
                error = $"no command '{verb}'";
                return false;
            }
        }
    }
}
