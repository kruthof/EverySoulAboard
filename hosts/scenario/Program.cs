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
        /// <summary><c>dump-personas [--seed N] [--crew C] [--out FILE] [--data DIR]</c>: boot a
        /// seeded procedural ship, generate each citizen's persona (the host's one-per-citizen
        /// worldgen call), and emit the deterministic JSON array the portrait pipeline
        /// (art/spritegen) consumes. Same arguments ⇒ byte-identical output.</summary>
        private static int RunDumpPersonas(string[] args)
        {
            ulong seed = ArgULong(args, "--seed", 7UL);
            int crew = ArgInt(args, "--crew", 8);
            string outPath = ArgString(args, "--out", null);
            string dataDir = ArgString(args, "--data", null) ?? DefaultDataDir();
            var defs = LoadDefs(dataDir, out _, out _, out _);

            var recipe = ShipRecipe.FromSeed(seed);
            recipe.CrewCount = crew;
            var host = GenSimHost.Build(ProceduralShips.Generate(recipe), defs);

            string json = PersonaDump.Render(seed, host.Sim, host.Minds, host.Facts);
            if (outPath != null)
            {
                File.WriteAllText(outPath, json);
                Console.WriteLine($"dump-personas: {host.Sim.Citizens.Items.Count} personas (seed {seed}) -> {outPath}");
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
