using System.Collections.Generic;
using System.Globalization;
using Perilune.Sim;

namespace Perilune.Gen.Validate
{
    /// <summary>
    /// The WS-SHIPGEN validation gate suite (phase-C sketch V1–V7). Each gate operates on a
    /// BUILT simulation (plan → <see cref="GenSimHost"/> → gates) and returns a structured
    /// <see cref="GateResult"/>; <see cref="Run"/> aggregates them. Gates reuse the sim's own
    /// derived state (RoomState flood, PowerSystem networks, WaterSystem fluid networks) rather
    /// than re-deriving it, so a passing candidate is validated against the exact code the game
    /// runs. Nothing here mutates a caller's sim — every gate that needs to run time builds its
    /// own fresh sim through GenSimHost.
    /// </summary>
    public static class ShipGates
    {
        private const long TicksPerDay = (long)Simulation.TicksPerSecond * 60 * 60 * 24;
        private const int NetworkSettleTicks = 11;  // ≥1 PowerSystem (1 Hz) + WaterSystem (2 Hz) pass
        private const int DeterminismTicks = 3000;  // twin-run horizon for V7
        private const int MaxFindings = 12;         // keep reports readable

        /// <summary>Device MOSS names the shipped content references — must exist exactly once.</summary>
        private static readonly string[] PinnedDeviceNames = { "vent_hydro", "term_hydro", "door_storage" };
        /// <summary>Room anchor MOSS names the shipped content references — must exist exactly once.</summary>
        private static readonly string[] PinnedAnchorNames = { "hydro", "lifesupport" };

        /// <summary>Run every gate against <paramref name="plan"/>. <paramref name="days"/> is the
        /// V6 survivability horizon (default 1). Deterministic and file-IO-free.</summary>
        public static ValidationReport Run(ShipPlan plan, SimDefs defs = null, int days = 1)
        {
            defs ??= SimDefs.Default;
            int crew = plan.Citizens.Count;

            // One probe sim for the static/topology/network gates: build, then let the power
            // and water systems assign network ids before we read them.
            var probe = BuildSettledProbe(plan, defs);

            var gates = new List<GateResult>
            {
                V1Connectivity(probe),
                V2RoomIntegrity(probe),
                V3Power(probe),
                V4WaterFood(probe, crew),
                V5MossNames(plan),
                V6Survivability(plan, defs, days, crew),
                V7Determinism(plan, defs),
            };
            return new ValidationReport(plan.Name, plan.Seed, gates);
        }

        /// <summary>Build a fresh sim from the plan and tick it just enough for the power and water
        /// systems to assign their network ids — the state the topology/network gates (V1–V4) read.
        /// Exposed so tests can drive a single gate cheaply (no full survivability run).</summary>
        public static Simulation BuildSettledProbe(ShipPlan plan, SimDefs defs = null)
        {
            var sim = GenSimHost.Build(plan, defs ?? SimDefs.Default).Sim;
            for (int t = 0; t < NetworkSettleTicks; t++) sim.Tick();
            return sim;
        }

        // ------------------------------------------------------------------ V1 connectivity

        /// <summary>Every open-floor tile is reachable from a crew start (doors are traversable
        /// unless enemy-locked — a closed door is something the crew can open); every door bridges
        /// two open sides; every ladder links to an adjacent deck.</summary>
        public static GateResult V1Connectivity(Simulation sim)
        {
            var w = sim.World;
            var findings = new List<string>();

            var reached = new HashSet<Int3>();
            var queue = new Queue<Int3>();
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
                if (FloorOpen(w, citizens[i].Pos) && reached.Add(citizens[i].Pos))
                    queue.Enqueue(citizens[i].Pos);

            if (queue.Count == 0)
                return GateResult.Fail("V1", "connectivity", new[] { "no crew start on open floor to seed reachability" });

            while (queue.Count > 0)
            {
                var p = queue.Dequeue();
                for (int n = 0; n < 4; n++)
                {
                    var q = Int3.Neighbor4(p, n);
                    if (FloorOpen(w, q) && !EnemyLockedDoor(sim, q) && reached.Add(q)) queue.Enqueue(q);
                }
                // Ladder z-links (mirror FogReveal / PathService).
                if (sim.TryGetDeviceAt(p, out var here) && here.Kind == DeviceKind.Ladder)
                {
                    var up = new Int3(p.X, p.Y, p.Z + 1);
                    if (FloorOpen(w, up) && reached.Add(up)) queue.Enqueue(up);
                }
                if (p.Z > 0 && sim.TryGetDeviceAt(new Int3(p.X, p.Y, p.Z - 1), out var below) && below.Kind == DeviceKind.Ladder)
                {
                    var down = new Int3(p.X, p.Y, p.Z - 1);
                    if (FloorOpen(w, down) && reached.Add(down)) queue.Enqueue(down);
                }
            }

            int stranded = 0;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (!FloorOpen(w, p) || reached.Contains(p)) continue;
                        stranded++;
                        if (findings.Count < MaxFindings)
                            findings.Add($"open-floor tile {p} is unreachable from the crew start");
                    }
            if (stranded > MaxFindings)
                findings.Add($"… and {stranded - MaxFindings} more unreachable tiles ({stranded} total)");

            // Door sanity: each door must bridge two served sides on one axis (a space the crew
            // can occupy — open floor, or a clearable debris seam such as the aft dig lock — as
            // opposed to a door buried in solid hull, which serves nothing).
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Door) continue;
                bool ns = Served(w, new Int3(d.Pos.X, d.Pos.Y - 1, d.Pos.Z)) && Served(w, new Int3(d.Pos.X, d.Pos.Y + 1, d.Pos.Z));
                bool ew = Served(w, new Int3(d.Pos.X - 1, d.Pos.Y, d.Pos.Z)) && Served(w, new Int3(d.Pos.X + 1, d.Pos.Y, d.Pos.Z));
                if (!ns && !ew && findings.Count < MaxFindings)
                    findings.Add($"door '{d.Name}' at {d.Pos} does not connect two served sides");
            }

            // Ladder sanity: each ladder must reach an adjacent deck (open tile above/below).
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Ladder) continue;
                bool up = d.Pos.Z + 1 < w.Depth && FloorOpen(w, new Int3(d.Pos.X, d.Pos.Y, d.Pos.Z + 1));
                bool down = d.Pos.Z - 1 >= 0 && FloorOpen(w, new Int3(d.Pos.X, d.Pos.Y, d.Pos.Z - 1));
                if (!up && !down && findings.Count < MaxFindings)
                    findings.Add($"ladder '{d.Name}' at {d.Pos} links no adjacent deck");
            }

            return findings.Count == 0 ? GateResult.Pass("V1", "connectivity") : GateResult.Fail("V1", "connectivity", findings);
        }

        // ------------------------------------------------------------------ V2 room integrity

        /// <summary>Every typed room anchor resolves to a real (non-vacuum) room — i.e. it is
        /// gas-tight, with no leak path to space through a missing hull wall. Reuses RoomState's
        /// own flood: a leaking region is merged into room 0 (vacuum), so a probe resolving to
        /// room 0 (or a door/wall) is the leak.</summary>
        public static GateResult V2RoomIntegrity(Simulation sim)
        {
            var findings = new List<string>();
            var anchors = sim.Rooms.Anchors;
            var vacuum = sim.Rooms.Rooms[0];
            for (int i = 0; i < anchors.Count; i++)
            {
                var a = anchors[i];
                ushort rid = sim.Rooms.RoomIdAt(sim.World, a.Probe);
                if (rid == RoomState.DoorMarker)
                {
                    findings.Add($"room '{a.Name}' probes a door tile at {a.Probe} (no interior)");
                    continue;
                }
                var room = sim.Rooms.RoomAt(sim.World, a.Probe);
                if (ReferenceEquals(room, vacuum))
                    findings.Add($"room '{a.Name}' at {a.Probe} is not gas-tight — it floods to vacuum (missing hull)");
            }
            return findings.Count == 0 ? GateResult.Pass("V2", "room integrity") : GateResult.Fail("V2", "room integrity", findings);
        }

        // ------------------------------------------------------------------ V3 power

        /// <summary>Every power-drawing device sits on a network fed by a generator, and total
        /// generation covers the life-support baseline draw. Reads the PowerSystem's own network
        /// assignment (valid after the settle ticks).</summary>
        public static GateResult V3Power(Simulation sim)
        {
            var findings = new List<string>();
            var devices = sim.Devices.Items;
            var machines = sim.Defs.Machines;

            // Per-network generation + battery presence.
            var genByNet = new Dictionary<ushort, float>();
            var batteryNet = new HashSet<ushort>();
            float totalGen = 0f, lifeSupportBaseline = 0f;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                var def = machines[(int)d.Kind];
                totalGen += def.GenerationKW;
                if (def.GenerationKW > 0f && d.NetworkId != 0)
                    genByNet[d.NetworkId] = (genByNet.TryGetValue(d.NetworkId, out var g) ? g : 0f) + def.GenerationKW;
                if (d.Kind == DeviceKind.Battery && d.NetworkId != 0) batteryNet.Add(d.NetworkId);
                if (def.Tier == PowerTier.LifeSupport) lifeSupportBaseline += def.DrawKW;
            }

            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                var def = machines[(int)d.Kind];
                if (def.DrawKW <= 0f) continue; // passive
                if (d.NetworkId == 0)
                {
                    if (findings.Count < MaxFindings) findings.Add($"device '{d.Name}' ({d.Kind}) is on no power network");
                    continue;
                }
                bool fed = (genByNet.TryGetValue(d.NetworkId, out var g) && g > 0f) || batteryNet.Contains(d.NetworkId);
                if (!fed && findings.Count < MaxFindings)
                    findings.Add($"device '{d.Name}' ({d.Kind}) is on network {d.NetworkId} with no generator");
            }

            if (totalGen + 1e-4f < lifeSupportBaseline)
                findings.Add($"generation {totalGen.ToString("0.0", CultureInfo.InvariantCulture)} kW < life-support baseline {lifeSupportBaseline.ToString("0.0", CultureInfo.InvariantCulture)} kW");

            return findings.Count == 0 ? GateResult.Pass("V3", "power") : GateResult.Fail("V3", "power", findings);
        }

        // ------------------------------------------------------------------ V4 water / food

        /// <summary>A closed water loop (a reclaimer and a tank sharing a fluid network), an
        /// irrigation loop (a grow bed sharing a network with a tank), and stored water for the
        /// crew. Reads the WaterSystem's own fluid-network assignment.</summary>
        public static GateResult V4WaterFood(Simulation sim, int crew)
        {
            const float ReservePerHead = 15f; // liters
            var findings = new List<string>();
            var devices = sim.Devices.Items;

            var tankNets = new HashSet<ushort>();
            bool reclaimClosed = false, irrigationClosed = false, anyGrowBed = false;
            float storedWater = 0f;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind == DeviceKind.WaterTank && d.FluidNetworkId != 0) { tankNets.Add(d.FluidNetworkId); storedWater += d.StoredLiters; }
                if (d.Kind == DeviceKind.GrowBed) anyGrowBed = true;
            }
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.FluidNetworkId == 0) continue;
                if (d.Kind == DeviceKind.Reclaimer && tankNets.Contains(d.FluidNetworkId)) reclaimClosed = true;
                if (d.Kind == DeviceKind.GrowBed && tankNets.Contains(d.FluidNetworkId)) irrigationClosed = true;
            }

            if (!reclaimClosed) findings.Add("no reclaimer shares a fluid network with a water tank (open water loop)");
            if (!anyGrowBed) findings.Add("no grow bed aboard (no food production)");
            else if (!irrigationClosed) findings.Add("no grow bed shares a fluid network with a water tank (unwatered crops)");
            float need = crew * ReservePerHead;
            if (storedWater + 1e-3f < need)
                findings.Add($"stored water {storedWater.ToString("0.0", CultureInfo.InvariantCulture)} L < {need.ToString("0.0", CultureInfo.InvariantCulture)} L for {crew} crew");

            return findings.Count == 0 ? GateResult.Pass("V4", "water/food") : GateResult.Fail("V4", "water/food", findings);
        }

        // ------------------------------------------------------------------ V5 MOSS names

        /// <summary>The outfitter pins MOSS-addressable device/anchor names: no duplicates
        /// anywhere, and every pinned vocabulary name the shipped content references exists
        /// exactly once.</summary>
        public static GateResult V5MossNames(ShipPlan plan)
        {
            var findings = new List<string>();

            var deviceCounts = new Dictionary<string, int>();
            for (int i = 0; i < plan.Devices.Count; i++)
            {
                string name = plan.Devices[i].Name;
                if (string.IsNullOrEmpty(name)) continue;
                deviceCounts[name] = (deviceCounts.TryGetValue(name, out var c) ? c : 0) + 1;
            }
            var anchorCounts = new Dictionary<string, int>();
            for (int i = 0; i < plan.Rooms.Count; i++)
            {
                string name = plan.Rooms[i].Anchor;
                if (string.IsNullOrEmpty(name)) continue;
                anchorCounts[name] = (anchorCounts.TryGetValue(name, out var c) ? c : 0) + 1;
            }

            // Duplicate names (deterministic report order: plan order).
            var reportedDev = new HashSet<string>();
            for (int i = 0; i < plan.Devices.Count; i++)
            {
                string name = plan.Devices[i].Name;
                if (string.IsNullOrEmpty(name) || deviceCounts[name] <= 1 || !reportedDev.Add(name)) continue;
                findings.Add($"device name '{name}' is defined {deviceCounts[name]} times (must be unique)");
            }
            var reportedAnc = new HashSet<string>();
            for (int i = 0; i < plan.Rooms.Count; i++)
            {
                string name = plan.Rooms[i].Anchor;
                if (string.IsNullOrEmpty(name) || anchorCounts[name] <= 1 || !reportedAnc.Add(name)) continue;
                findings.Add($"anchor name '{name}' is defined {anchorCounts[name]} times (must be unique)");
            }

            // Pinned vocabulary: each referenced name must exist exactly once.
            foreach (var name in PinnedDeviceNames)
            {
                int c = deviceCounts.TryGetValue(name, out var v) ? v : 0;
                if (c != 1) findings.Add($"pinned MOSS device '{name}' must exist exactly once (found {c})");
            }
            foreach (var name in PinnedAnchorNames)
            {
                int c = anchorCounts.TryGetValue(name, out var v) ? v : 0;
                if (c != 1) findings.Add($"pinned MOSS anchor '{name}' must exist exactly once (found {c})");
            }

            return findings.Count == 0 ? GateResult.Pass("V5", "MOSS names") : GateResult.Fail("V5", "MOSS names", findings);
        }

        // ------------------------------------------------------------------ V6 survivability

        /// <summary>Boot the candidate and run it headless for <paramref name="days"/> days: crew
        /// alive, air held, water on hand, food available. The ShipDesign survival gate, generalized
        /// to any plan.</summary>
        public static GateResult V6Survivability(ShipPlan plan, SimDefs defs, int days, int crew)
        {
            var findings = new List<string>();
            var sim = GenSimHost.Build(plan, defs).Sim;
            long ticks = (days < 1 ? 1 : days) * TicksPerDay;
            for (long t = 0; t < ticks; t++) sim.Tick();

            int alive = 0;
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                if (!citizens[i].Dead) { alive++; continue; }
                if (findings.Count < MaxFindings) findings.Add($"crew '{citizens[i].Name}' died within {days} day(s)");
            }
            if (crew > 0 && alive == 0) findings.Add("no crew survived");

            var m = ShipMetrics.Compute(sim);
            if (m.Oxygen < 0.5f) findings.Add($"air not held: mean O2 fell to {(m.Oxygen * 21f).ToString("0.0", CultureInfo.InvariantCulture)}% (of 21%)");

            float storedWater = sim.WastewaterLiters;
            var devices = sim.Devices.Items;
            bool anyGrowBed = false;
            for (int i = 0; i < devices.Count; i++)
            {
                if (devices[i].Kind == DeviceKind.WaterTank) storedWater += devices[i].StoredLiters;
                if (devices[i].Kind == DeviceKind.GrowBed) anyGrowBed = true;
            }
            if (storedWater <= 0f) findings.Add("water exhausted (no tank water or greywater left)");

            int potatoes = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++) if (items[i].Kind == ItemKind.Potato) potatoes += items[i].Count;
            if (potatoes == 0 && !anyGrowBed) findings.Add("no food available (no potatoes, no grow beds)");

            return findings.Count == 0 ? GateResult.Pass("V6", "survivability") : GateResult.Fail("V6", "survivability", findings);
        }

        // ------------------------------------------------------------------ V7 determinism

        /// <summary>Twin-build + twin-run: two sims from the same plan must hash identically after
        /// a fixed run. Proves the whole generate→build→run path is deterministic for the candidate.</summary>
        public static GateResult V7Determinism(ShipPlan plan, SimDefs defs)
        {
            var a = GenSimHost.Build(plan, defs).Sim;
            var b = GenSimHost.Build(plan, defs).Sim;
            if (a.StateHash() != b.StateHash())
                return GateResult.Fail("V7", "determinism", new[] { "twin builds hash differently at tick 0" });
            for (int t = 0; t < DeterminismTicks; t++) { a.Tick(); b.Tick(); }
            ulong ha = a.StateHash(), hb = b.StateHash();
            if (ha != hb)
                return GateResult.Fail("V7", "determinism",
                    new[] { $"twin hashes diverged after {DeterminismTicks} ticks ({ha.ToString("x16", CultureInfo.InvariantCulture)} vs {hb.ToString("x16", CultureInfo.InvariantCulture)})" });
            return GateResult.Pass("V7", "determinism");
        }

        // ------------------------------------------------------------------ helpers

        /// <summary>An open, standable floor tile: non-void floor with no wall (excludes rock/debris,
        /// which carry a wall). Door gaps qualify (floor '.', wall 0).</summary>
        private static bool FloorOpen(World w, Int3 p) =>
            w.InBounds(p) && w.GetFloor(p) != TileDefs.Void && w.GetWall(p) == 0;

        /// <summary>A tile a door can meaningfully serve: open floor, or a clearable debris seam
        /// (the aft dig lock) — anything but solid hull or void.</summary>
        private static bool Served(World w, Int3 p) =>
            w.InBounds(p) && (FloorOpen(w, p) || w.GetFloor(p) == TileDefs.Debris);

        private static bool EnemyLockedDoor(Simulation sim, Int3 p) =>
            sim.TryGetDeviceAt(p, out var d) && d.Kind == DeviceKind.Door && d.IsLocked && d.LockOwner != 0;
    }
}
