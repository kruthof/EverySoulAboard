using System.Collections.Generic;
using System.IO;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;

namespace Perilune.Tui
{
    /// <summary>Which authored ship the hosts boot. Default is the shipping 2-crew Perilune
    /// (the pinned-golden / CI path); <see cref="Slice"/> is the P2 "Talking Ship" 8-crew
    /// vertical slice, selected with <c>--ship slice</c> and never seen by CI.</summary>
    public enum ShipChoice { Perilune, Slice, Grid }

    /// <summary>
    /// The headless boot of the shipping ship — the terminal/web skins' equivalent of
    /// Game.View/Bootstrap.BuildAuthoredSim. It assembles the SAME sim Unity assembles,
    /// step for step, so a dumped frame and the running game agree bit-for-bit:
    ///
    ///   1. DeviceRegistry + ScriptRuntime (the MOSS host)
    ///   2. AuthoredShips.Perilune() plan (seed overridden by the caller)
    ///   3. DeviceLayout.json overrides applied to the plan (fail-soft)
    ///   4. SimDefs loaded from content/core/SimDefs (fail-soft ⇒ compiled defaults)
    ///   5. ShipPlanBuilder.Build with the MakeSystems stack (EffectPump first,
    ///      SystemStack.CreateDefault in the middle, MemorySystem last) + the SimDefs
    ///   6. FogReveal.RevealReachable — the boot fog seed
    ///   7. MossBindings.RegisterAdapters + ApplyScripts
    ///
    /// Only Unity-only steps are dropped: BuildView/SetupLighting (rendering) and
    /// GenerateMinds (LLM personas). GenerateMinds is safe to skip for determinism —
    /// PersonaGenerator forks its RNG and never advances sim.Rng — so the sim
    /// trajectory and every StateHash are identical to Unity's headless boot.
    /// </summary>
    public sealed class SimHost
    {
        public Simulation Sim { get; private set; }
        public ScriptRuntime Moss { get; private set; }
        public DeviceRegistry Registry { get; private set; }

        // Effect-spine handles (host-owned, not part of StateHash) — A4/A6 wire minds,
        // memory and the event log through these exactly as Bootstrap does.
        public HistorySystem History { get; private set; }
        public GoalSystem Goals { get; private set; }
        public SocialSystem Social { get; private set; }
        public BuildSystem BuildSys { get; private set; }
        public MindState Minds { get; private set; }
        public FactRegistry Facts { get; private set; }
        public PendingEffectBuffer Effects { get; private set; }

        public ShipChoice Ship { get; private set; }
        public ulong Seed { get; private set; }

        /// <summary>The plan's authoring/VIEW-ONLY slot grid (per-deck 2×4 compartment layout) —
        /// the geometry + roomType source for the <c>decks</c> wire channel. Never saved, never
        /// hashed (see <see cref="ShipPlan.SlotGrid"/>); empty on ships that use no slot grid
        /// (Perilune/PeriluneSlice). The host reads it for slot geometry only and derives
        /// occupancy/naming from live <see cref="RoomState"/>, never from this field.</summary>
        public IReadOnlyList<SlotDescriptor> SlotGrid { get; private set; }
        public string LayoutPath { get; private set; }       // resolved file, or null when none loaded
        public string LayoutChecksum { get; private set; }   // stable hash of the layout text, or "none"
        public IReadOnlyList<string> LayoutProblems { get; private set; }
        public int LayoutProblemCount => LayoutProblems.Count;

        // Data-driven tuning (WP B2): the SimDefs that fed this boot. sim.Defs.Checksum
        // is the authoritative fingerprint; these surface the loader's provenance for
        // the dump header (which dir, how many files, how many problems).
        public string DefsDir { get; private set; }          // resolved SimDefs dir, or null when none
        public ulong DefsChecksum { get; private set; }      // == Sim.Defs.Checksum
        public int DefsFileCount { get; private set; }
        public IReadOnlyList<string> DefsProblems { get; private set; }

        public int Width => Sim.World.Width;
        public int Height => Sim.World.Height;
        public int Depth => Sim.World.Depth;

        private SimHost() { }

        /// <summary>The authored ship's default seed (AuthoredShips.Perilune) — the seed
        /// Unity boots with. DumpMode falls back to it when no --seed is given.</summary>
        public static ulong DefaultSeed => AuthoredShips.Perilune().Seed;

        /// <summary>The slice's default seed (a DISTINCT identity from Perilune) — the seed the
        /// portrait pipeline conditions on. Hosts fall back to it for <c>--ship slice</c>.</summary>
        public static ulong SliceSeed => AuthoredShips.SliceSeed;

        /// <summary>The default seed for a given ship choice (so a host with no --seed boots the
        /// right identity per ship).</summary>
        public static ulong DefaultSeedFor(ShipChoice ship) =>
            ship == ShipChoice.Slice ? SliceSeed :
            ship == ShipChoice.Grid ? AuthoredShips.GridSeed :
            DefaultSeed;

        /// <summary>
        /// Build the shipping sim. <paramref name="layoutPath"/> overrides layout
        /// discovery, <paramref name="dataDir"/> overrides SimDefs discovery; when null,
        /// each is auto-discovered by walking up from the running binary. A missing/
        /// unreadable/malformed layout or defs file is a warning (recorded in
        /// <see cref="LayoutProblems"/> / <see cref="DefsProblems"/>), never a hard failure.
        /// </summary>
        public static SimHost Build(ulong seed, string layoutPath = null, string dataDir = null,
                                    ShipChoice ship = ShipChoice.Perilune)
        {
            var host = new SimHost { Seed = seed, Ship = ship };
            var problems = new List<string>();

            var registry = new DeviceRegistry();
            var moss = new ScriptRuntime(registry);

            var plan =
                ship == ShipChoice.Slice ? AuthoredShips.PeriluneSlice() :
                ship == ShipChoice.Grid ? AuthoredShips.PeriluneGrid() :
                AuthoredShips.Perilune();
            plan.Seed = seed;

            // Data-driven tuning (step mirrored from Bootstrap.LoadDefs / ScenarioRunner):
            // overlay *.def onto the compiled defaults; absent dir ⇒ defaults. The sim is
            // built with this SimDefs so headless behaviour tracks the shipping game.
            host.DefsDir = dataDir ?? ResolveDataDir();
            var defs = LoadDefs(host.DefsDir, out int defsFileCount, out var defsProblems);
            host.DefsFileCount = defsFileCount;
            host.DefsProblems = defsProblems;
            host.DefsChecksum = defs.Checksum;

            // Layout overrides (step 4 of Bootstrap.BuildAuthoredSim). Discovery is
            // resilient: absent file ⇒ authored positions stand, with a warning. The
            // DeviceLayout.json is a hand-tuned artefact of the SHIPPING Perilune (it yaws
            // that ship's doors); the slice ships its own authored positions and never takes
            // the overlay, so its canonical boot needs no file at all.
            // The DeviceLayout.json overlay is a hand-tuned artefact of the SHIPPING Perilune
            // (it yaws that ship's doors). The slice and the grid ship carry their own authored
            // positions and never take the overlay.
            string resolved = ship != ShipChoice.Perilune ? null : (layoutPath ?? ResolveLayoutPath());
            if (ship != ShipChoice.Perilune)
            {
                host.LayoutChecksum = "none"; // authored positions; no overlay
            }
            else if (resolved != null && File.Exists(resolved))
            {
                string text;
                try { text = File.ReadAllText(resolved); }
                catch (IOException e) { text = null; problems.Add($"layout: unreadable ({e.Message})"); }

                if (text != null)
                {
                    host.LayoutPath = resolved;
                    host.LayoutChecksum = Checksum(text);
                    var entries = DeviceLayoutFile.Parse(text, out var parseProblems);
                    problems.AddRange(parseProblems);
                    problems.AddRange(DeviceLayout.Apply(plan, entries));
                }
            }
            else
            {
                problems.Add(resolved == null
                    ? "layout: DeviceLayout.json not found (auto-discovery failed) — using authored positions"
                    : $"layout: file not found at {resolved} — using authored positions");
            }
            if (host.LayoutChecksum == null) host.LayoutChecksum = "none";

            var sim = ShipPlanBuilder.Build(plan, host.MakeSystems(moss, RulesLoader.CreateSystem(defs, registry)), defs);

            FogReveal.RevealReachable(sim);
            // Minds: the shipping Perilune skips GenerateMinds (Unity-only; determinism-safe
            // because PersonaGenerator forks its RNG). The slice, by contrast, IS the LLM/talk
            // proof — it needs its authored crew's minds, secrets and seeded relationships woven
            // on deterministically here (RNG-free; only the seeded opinions touch StateHash).
            if (ship == ShipChoice.Slice)
                AuthoredShips.PopulateSlice(sim, host.Minds, host.Facts, host.Social);
            MossBindings.RegisterAdapters(sim, registry);
            MossBindings.ApplyScripts(sim, moss);

            host.Sim = sim;
            host.Moss = moss;
            host.Registry = registry;
            host.SlotGrid = plan.SlotGrid; // authoring/view-only geometry for the `decks` channel
            host.LayoutProblems = problems;
            return host;
        }

        /// <summary>Mirror of Bootstrap.MakeSystems' engine-free body: the effect pump
        /// runs first, the authoritative SystemStack in the middle, memory last. Minds
        /// stay empty here (no LLM), which is inert for the sim — EffectPump/MemorySystem
        /// touch only the host-owned mind state, never the hashed sim state.</summary>
        private ISimSystem[] MakeSystems(ScriptRuntime moss, ISimSystem designerRules)
        {
            Minds = new MindState();
            Facts = new FactRegistry();
            Effects = new PendingEffectBuffer();

            var stack = SystemStack.CreateDefault(moss, designerRules);
            for (int i = 0; i < stack.Length; i++)
            {
                if (stack[i] is HistorySystem history) History = history;
                if (stack[i] is GoalSystem goals) Goals = goals;
                if (stack[i] is SocialSystem social) Social = social;
                if (stack[i] is BuildSystem build) BuildSys = build;
            }

            var systems = new ISimSystem[stack.Length + 3];
            systems[0] = new EffectPump(Effects, Minds, Facts); // MUST run first
            for (int i = 0; i < stack.Length; i++) systems[i + 1] = stack[i];
            systems[systems.Length - 2] = new MemorySystem(Minds, Facts); // after the event publishers; facts persist in its SYSS chapter
            systems[systems.Length - 1] = new EulogySystem(Minds, Social, History); // after memory: eulogies quote settled minds
            return systems;
        }

        /// <summary>Walk up from the running binary to the repo root, identified by the
        /// canonical marker <c>content/core/DeviceLayout.json</c>.
        /// Returns the absolute path to that file, or null if the marker is never found
        /// (running outside a checkout).</summary>
        public static string ResolveLayoutPath()
        {
            const string relative = "content/core/DeviceLayout.json";
            var dir = new DirectoryInfo(System.AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(dir.FullName, relative.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
            return null;
        }

        /// <summary>Walk up from the running binary to the repo's
        /// <c>content/core/SimDefs</c> tuning directory (so `dotnet run`
        /// finds it without a --data flag). Null when not found — the loader then falls
        /// back to the compiled defaults. Mirrors ScenarioRunner.DefaultDataDir.</summary>
        public static string ResolveDataDir()
        {
            var dir = new DirectoryInfo(System.AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(dir.FullName, "content", "core", "SimDefs");
                if (Directory.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
            return null;
        }

        /// <summary>Overlay every <c>*.def</c> in <paramref name="dir"/> (sorted Ordinal by
        /// filename) onto the compiled defaults; a missing directory ⇒ defaults. Mirror of
        /// ScenarioRunner.LoadDefs / Bootstrap.LoadDefs — but with file IO wrapped fail-soft
        /// so an unreadable file becomes a problem line, never a thrown boot failure.</summary>
        private static SimDefs LoadDefs(string dir, out int fileCount, out List<string> problems)
        {
            problems = new List<string>();
            fileCount = 0;
            if (dir == null || !Directory.Exists(dir)) return SimDefs.Default;

            string[] paths;
            try { paths = Directory.GetFiles(dir, "*.def"); }
            catch (IOException e) { problems.Add($"defs: cannot list {dir} ({e.Message})"); return SimDefs.Default; }
            System.Array.Sort(paths, System.StringComparer.Ordinal);

            var files = new List<(string name, string text)>(paths.Length);
            foreach (var path in paths)
            {
                try
                {
                    files.Add((Path.GetFileName(path), File.ReadAllText(path)));
                    fileCount++;
                }
                catch (IOException e) { problems.Add($"defs: unreadable {Path.GetFileName(path)} ({e.Message})"); }
            }
            var ruleFiles = RulesLoader.Load(dir, problems);
            return DefsParser.Parse(files, ruleFiles, problems);
        }

        /// <summary>FNV-1a 64-bit over the checkout-normalised text — a stable, culture-
        /// free fingerprint of the layout that fed this boot (printed in the dump header
        /// so a frame set is traceable to its layout).</summary>
        private static string Checksum(string text)
        {
            text = text.Replace("\r\n", "\n");
            ulong hash = 14695981039346656037UL;
            for (int i = 0; i < text.Length; i++)
            {
                hash ^= text[i];
                hash *= 1099511628211UL;
            }
            return hash.ToString("x16", System.Globalization.CultureInfo.InvariantCulture);
        }
    }
}
