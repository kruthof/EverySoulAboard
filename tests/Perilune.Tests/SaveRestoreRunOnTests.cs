using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Llm;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// SAVE → LOAD → TICK 1000 → RE-COMPARE (ECONOMY-PLAN §5.1, the one mandatory test that
    /// existed nowhere in the suite). Hashing a field proves the FOLD sees it; only running the
    /// reloaded sim on for a long stretch proves the RESTORE was complete. A restore that drops
    /// live tick state — a movement cooldown, a path cursor, a derived index — hashes equal at
    /// the save tick and diverges hundreds of ticks later, which is exactly the hole an
    /// economy's kind-buckets and station→bill maps fall into.
    ///
    /// Driven on the POPULATED 8-crew slice, not the 2-crew reference ship: measured at the
    /// save tick (T = 300), the slice has 8 named crew, **8 carrying a path** (6 of them with a
    /// path still un-walked), 8 with non-zero path progress, 6 with a live <c>MoveCooldown</c>,
    /// 8 with a live <c>IdleCooldown</c>, 8 with <c>AutoWander</c>, 9 labelled item stacks and
    /// 931 named devices. The reference ship exercises NONE of that (its crew are
    /// <c>HoldPosition</c> and it carries no items), which is why the mandatory test has to run
    /// here. Those counts are asserted as preconditions below, so the test fails loudly if the
    /// slice ever stops driving the path.
    ///
    /// LIMITS, named in the test names and meant literally:
    ///   * <b>One save point, one seed, one ship.</b> T = 300, N = 1000, the shipped slice.
    ///   * <b>"Catches a dropped derived index" is not a general claim.</b> It catches indexes
    ///     that never self-heal. Measured: dropping the device-grid re-index (below) reddens
    ///     these tests hard; dropping <c>sim.JobsDirty = true</c> on load reddens **0 of 670**,
    ///     because the job board is rebuilt by the next thing that dirties it. A restore hole in
    ///     a self-healing index is invisible to this test at N = 1000, and probably at any N.
    ///   * <b>The room recompute is a controlled confound, not a fixed bug.</b> A load leaves
    ///     <c>RoomState.Dirty = true</c> (<c>SaveReader</c> class doc), so the loaded sim runs
    ///     <c>Recompute</c> on its first tick while the uninterrupted twin does not — and
    ///     <c>RoomState.RemapGas</c> (<c>Rooms/RoomState.cs:322-340</c>) re-derives every
    ///     room's moles as a sum of per-tile shares <c>moles / TileCount</c>, so recomputing an
    ///     UNCHANGED partition perturbs the gas at ULP scale. That is a real, pre-existing
    ///     defect (HANDOVER "Save-reload thermal ULP drift"), it predates this package, and
    ///     fixing it would change sim behaviour, which W0-1b may not do. The first test
    ///     therefore marks the twin's rooms dirty at the save tick so BOTH sims take the
    ///     identical recompute, and then demands exact whole-<c>StateHash</c> equality. The
    ///     second test runs the uncontrolled comparison and pins the drift's blast radius:
    ///     crew, items, devices, RNG, tick, wastewater and every system fold stay bit-exact;
    ///     only room gas moves, and only in the last bits.
    /// </summary>
    public class SaveRestoreRunOnTests
    {
        private const int SaveTick = 300;
        private const int RunOnTicks = 1000;

        // ------------------------------------------------------------------ the mandatory test

        /// <summary>
        /// The reloaded slice, run on 1000 ticks, is bit-identical to an uninterrupted twin —
        /// whole <c>StateHash</c>, not a subset — once both sims take the same room recompute.
        /// This is what makes W0-1b's fold change meaningful: the thirteen newly-hashed fields
        /// (crew Name/PrevPos/AutoWander/Path/PathIndex/MoveCooldown/IdleCooldown, ItemStack.Label,
        /// Device.Name, NextEntityId, RoomAnchor.Name, ScriptEntry.TerminalId/.Source) are now IN
        /// the hash, so a restore that lost any of them cannot hide.
        ///
        /// NAMED MUTATION (applied, observed, reverted): in <c>SaveReader.ReadDevices</c>, drop
        /// the device-grid re-index — <c>if (false &amp;&amp; !Simulation.IsUtilityOverlay(d.Kind))
        /// sim.RegisterLoadedDevice(d);</c>. This is the §5.1 archetype: the grid is DERIVED and
        /// unhashed, so the save-tick hash is still bit-exact — and 1000 ticks later the ship has
        /// come apart. Measured: both tests in this file fail past their preconditions, first at
        /// <c>citizen[0] 'Amara Okonkwo' Pos — expected (17,5,0), was (59,9,0)</c>. Scope, since
        /// an earlier version of this comment guessed instead of measuring: it is **3 of 670**
        /// full-suite, and the third is the pre-existing
        /// <c>P2ExitTests.P2_MemsSurvivesSaveReload_ByteFaithful_AndContinuesLikeTheTwin</c>. So
        /// the *archetype* holds — invisible at load, fatal on run-on — but the claim that no
        /// existing test would have caught it was false.
        ///
        /// SECOND NAMED MUTATION, and the one that shows what W0-1b bought: in
        /// <c>SaveReader.ReadCitizens</c> discard the restored movement cooldown —
        /// <c>reader.ReadInt32(); c.MoveCooldown = 0;</c>. Measured: both tests now fail at the
        /// at-load precondition, because <c>MoveCooldown</c> is folded. Two honest notes on it.
        /// (a) Before W0-1b that mutation left the save-tick hash EQUAL — the cooldown was saved
        /// but not folded, so nothing in the repo saw it. (b) With the precondition removed, the
        /// run-on comparison at N = 1000 PASSES: the crew re-converge within the window. So the
        /// run-on assertion is not what catches a lost cooldown — the fold is. The two halves of
        /// this package cover different failure modes and neither subsumes the other.
        /// </summary>
        [Test]
        public void SaveLoadTickThousand_IsBitIdenticalToTheTwin_WhenBothTakeTheSameRoomRecompute()
        {
            var twin = BootSlice();
            var host = BootSlice();
            for (int i = 0; i < SaveTick; i++) { twin.Sim.Tick(); host.Sim.Tick(); }

            AssertTheSaveTickActuallyExercisesTheNewlyFoldedFields(host.Sim);
            Assert.That(host.Sim.StateHash(), Is.EqualTo(twin.Sim.StateHash()),
                "precondition: the two boots are twins at the save tick");

            Simulation loaded = RoundTrip(host.Sim);
            Assert.That(loaded.StateHash(), Is.EqualTo(host.Sim.StateHash()),
                "precondition: the round-trip is bit-exact at the save tick (a restore hole here " +
                "makes the run-on comparison meaningless)");

            // Controlled confound: give the twin the same room recompute the load forces, so
            // the pre-existing RemapGas non-idempotence is on BOTH sides. See the class note.
            twin.Sim.Rooms.MarkDirty();

            for (int i = 0; i < RunOnTicks; i++) { loaded.Tick(); twin.Sim.Tick(); }

            // Field-level first, so a failure names the field instead of a 64-bit number.
            AssertCrewItemsAndDevicesMatch(loaded, twin.Sim);
            Assert.That(loaded.StateHash(), Is.EqualTo(twin.Sim.StateHash()),
                $"the reloaded slice diverged from the uninterrupted twin within {RunOnTicks} ticks");
        }

        // ------------------------------------------------------------------ the blast radius

        /// <summary>
        /// The uncontrolled comparison — a plain save/load with no matched recompute — pins the
        /// blast radius of the pre-existing reload drift: crew, items, devices, RNG, tick count,
        /// wastewater and every <c>IStatefulSystem</c> fold continue BIT-EXACT for 1000 ticks;
        /// only room gas and room temperature move, and only at ULP scale. The band is 1e-9
        /// relative, roughly 6.5×10^4 times looser than the worst drift observed at N = 1000
        /// (~1.5e-14 relative) and orders of magnitude tighter than any genuine gas-transport
        /// divergence, which compounds. Note the drift GROWS with run-on — ~2.7e-15 on the first
        /// tick after load, ~1.5e-14 by N = 1000 — so this tolerance is a statement about 1000
        /// ticks, not about forever. It deliberately does NOT assert that the drift exists:
        /// fixing <c>RemapGas</c> must not redden this file, and was verified not to.
        ///
        /// NAMED MUTATION (applied, observed, reverted): the same device-grid re-index drop as
        /// the test above (3 of 670 full-suite). Measured: fails at
        /// <c>citizen[0] 'Amara Okonkwo' Pos</c> — closed doors stop moving gas and the crew walk
        /// a different ship.
        /// </summary>
        [Test]
        public void SaveLoadTickThousand_WithoutAMatchedRecompute_DriftsOnlyInRoomGas()
        {
            var twin = BootSlice();
            var host = BootSlice();
            for (int i = 0; i < SaveTick; i++) { twin.Sim.Tick(); host.Sim.Tick(); }

            AssertTheSaveTickActuallyExercisesTheNewlyFoldedFields(host.Sim);
            Simulation loaded = RoundTrip(host.Sim);
            Assert.That(loaded.StateHash(), Is.EqualTo(host.Sim.StateHash()),
                "precondition: the round-trip is bit-exact at the save tick");

            for (int i = 0; i < RunOnTicks; i++) { loaded.Tick(); twin.Sim.Tick(); }

            AssertCrewItemsAndDevicesMatch(loaded, twin.Sim);

            Assert.That(loaded.TickCount, Is.EqualTo(twin.Sim.TickCount), "tick count");
            Assert.That(loaded.Rng.State, Is.EqualTo(twin.Sim.Rng.State), "RNG stream position");
            Assert.That(loaded.WastewaterLiters, Is.EqualTo(twin.Sim.WastewaterLiters), "wastewater");
            Assert.That(loaded.World.HashInto(0), Is.EqualTo(twin.Sim.World.HashInto(0)), "world tiles + room ids");

            var twinFolds = StatefulByName(twin.Sim);
            int stateful = 0;
            foreach (var pair in StatefulByName(loaded))
            {
                Assert.That(twinFolds.ContainsKey(pair.Key), Is.True, "same stateful systems on both sides");
                Assert.That(pair.Value, Is.EqualTo(twinFolds[pair.Key]), $"the '{pair.Key}' fold continues identically");
                stateful++;
            }
            Assert.That(stateful, Is.GreaterThan(0), "precondition: there are stateful systems to compare");

            var lr = loaded.Rooms.Rooms;
            var tr = twin.Sim.Rooms.Rooms;
            Assert.That(lr.Count, Is.EqualTo(tr.Count), "room count");
            for (int i = 0; i < lr.Count; i++)
            {
                Assert.That(lr[i].TileCount, Is.EqualTo(tr[i].TileCount), $"room {i} tile count (partition is exact)");
                AssertClose(lr[i].O2Moles, tr[i].O2Moles, $"room {i} O2");
                AssertClose(lr[i].CO2Moles, tr[i].CO2Moles, $"room {i} CO2");
                AssertClose(lr[i].N2Moles, tr[i].N2Moles, $"room {i} N2");
                AssertClose(lr[i].TemperatureK, tr[i].TemperatureK, $"room {i} temperature");
            }
        }

        // ------------------------------------------------------------------ preconditions

        /// <summary>Rule §5.2.3 — assert the path was reached before asserting the outcome. If
        /// the slice ever stops carrying live paths, cooldowns, labels or names at the save tick,
        /// the run-on comparison proves nothing about those fields and must fail here.</summary>
        private static void AssertTheSaveTickActuallyExercisesTheNewlyFoldedFields(Simulation sim)
        {
            int named = 0, wandering = 0, livePath = 0, progressed = 0, moveCooldown = 0, idleCooldown = 0, prevPosSet = 0;
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++)
            {
                var c = crew[i];
                if (!string.IsNullOrEmpty(c.Name)) named++;
                if (c.AutoWander) wandering++;
                if (c.Path.Count > 0) livePath++;
                if (c.PathIndex > 0) progressed++;
                if (c.MoveCooldown != 0) moveCooldown++;
                if (c.IdleCooldown != 0) idleCooldown++;
                if (c.PrevPos != c.Pos) prevPosSet++;
            }
            Assert.That(crew.Count, Is.EqualTo(8), "precondition: the 8-crew slice");
            Assert.That(named, Is.EqualTo(8), "precondition: Citizen.Name is populated");
            Assert.That(wandering, Is.GreaterThan(0), "precondition: at least one crew member has AutoWander set");
            Assert.That(livePath, Is.GreaterThan(0), "precondition: at least one crew member carries a path");
            Assert.That(progressed, Is.GreaterThan(0), "precondition: at least one path has non-zero progress (PathIndex)");
            Assert.That(moveCooldown, Is.GreaterThan(0), "precondition: at least one live MoveCooldown");
            Assert.That(idleCooldown, Is.GreaterThan(0), "precondition: at least one live IdleCooldown");
            Assert.That(prevPosSet, Is.GreaterThan(0), "precondition: at least one crew member is mid-step (PrevPos != Pos)");

            int labelled = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++) if (!string.IsNullOrEmpty(items[i].Label)) labelled++;
            Assert.That(labelled, Is.GreaterThan(0), "precondition: at least one labelled item stack");

            int namedDevices = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++) if (!string.IsNullOrEmpty(devices[i].Name)) namedDevices++;
            Assert.That(namedDevices, Is.GreaterThan(0), "precondition: at least one named device");
        }

        // ------------------------------------------------------------------ field comparison
        // Two REAL sims compared field for field — nothing here re-derives what the sim
        // computes (§5.2.1); the expected value is the other sim's observed state.

        private static void AssertCrewItemsAndDevicesMatch(Simulation loaded, Simulation twin)
        {
            var lc = loaded.Citizens.Items;
            var tc = twin.Citizens.Items;
            Assert.That(lc.Count, Is.EqualTo(tc.Count), "crew count");
            for (int i = 0; i < lc.Count; i++)
            {
                string who = $"citizen[{i}] '{tc[i].Name}'";
                Assert.That(lc[i].Id, Is.EqualTo(tc[i].Id), who + " Id");
                Assert.That(lc[i].Name, Is.EqualTo(tc[i].Name), who + " Name");
                Assert.That(lc[i].Pos, Is.EqualTo(tc[i].Pos), who + " Pos");
                Assert.That(lc[i].PrevPos, Is.EqualTo(tc[i].PrevPos), who + " PrevPos");
                Assert.That(lc[i].AutoWander, Is.EqualTo(tc[i].AutoWander), who + " AutoWander");
                Assert.That(lc[i].Path.Count, Is.EqualTo(tc[i].Path.Count), who + " Path length");
                for (int p = 0; p < lc[i].Path.Count; p++)
                    Assert.That(lc[i].Path[p], Is.EqualTo(tc[i].Path[p]), who + $" Path[{p}]");
                Assert.That(lc[i].PathIndex, Is.EqualTo(tc[i].PathIndex), who + " PathIndex");
                Assert.That(lc[i].MoveCooldown, Is.EqualTo(tc[i].MoveCooldown), who + " MoveCooldown");
                Assert.That(lc[i].IdleCooldown, Is.EqualTo(tc[i].IdleCooldown), who + " IdleCooldown");
                Assert.That(lc[i].JobKind, Is.EqualTo(tc[i].JobKind), who + " JobKind");
                Assert.That(lc[i].JobTarget, Is.EqualTo(tc[i].JobTarget), who + " JobTarget");
                Assert.That(lc[i].JobWorkTicks, Is.EqualTo(tc[i].JobWorkTicks), who + " JobWorkTicks");
                Assert.That(lc[i].CarryingItemId, Is.EqualTo(tc[i].CarryingItemId), who + " CarryingItemId");
                Assert.That(lc[i].ReservedItemId, Is.EqualTo(tc[i].ReservedItemId), who + " ReservedItemId");
                Assert.That(lc[i].Dead, Is.EqualTo(tc[i].Dead), who + " Dead");
                Assert.That(lc[i].Hunger, Is.EqualTo(tc[i].Hunger), who + " Hunger");
                Assert.That(lc[i].Thirst, Is.EqualTo(tc[i].Thirst), who + " Thirst");
                Assert.That(lc[i].Fatigue, Is.EqualTo(tc[i].Fatigue), who + " Fatigue");
                Assert.That(lc[i].Suffocation, Is.EqualTo(tc[i].Suffocation), who + " Suffocation");
                Assert.That(lc[i].Health, Is.EqualTo(tc[i].Health), who + " Health");
            }

            var li = loaded.Items.Items;
            var ti = twin.Items.Items;
            Assert.That(li.Count, Is.EqualTo(ti.Count), "item stack count");
            for (int i = 0; i < li.Count; i++)
            {
                string what = $"item[{i}] #{ti[i].Id}";
                Assert.That(li[i].Id, Is.EqualTo(ti[i].Id), what + " Id");
                Assert.That(li[i].Kind, Is.EqualTo(ti[i].Kind), what + " Kind");
                Assert.That(li[i].Count, Is.EqualTo(ti[i].Count), what + " Count");
                Assert.That(li[i].Pos, Is.EqualTo(ti[i].Pos), what + " Pos");
                Assert.That(li[i].CarriedBy, Is.EqualTo(ti[i].CarriedBy), what + " CarriedBy");
                Assert.That(li[i].ReservedForJob, Is.EqualTo(ti[i].ReservedForJob), what + " ReservedForJob");
                Assert.That(li[i].Label, Is.EqualTo(ti[i].Label), what + " Label");
            }

            var ld = loaded.Devices.Items;
            var td = twin.Devices.Items;
            Assert.That(ld.Count, Is.EqualTo(td.Count), "device count");
            for (int i = 0; i < ld.Count; i++)
            {
                string what = $"device[{i}] #{td[i].Id} {td[i].Kind}";
                Assert.That(ld[i].Id, Is.EqualTo(td[i].Id), what + " Id");
                Assert.That(ld[i].Name, Is.EqualTo(td[i].Name), what + " Name");
                Assert.That(ld[i].Pos, Is.EqualTo(td[i].Pos), what + " Pos");
                Assert.That(ld[i].IsOpen, Is.EqualTo(td[i].IsOpen), what + " IsOpen");
                Assert.That(ld[i].IsLocked, Is.EqualTo(td[i].IsLocked), what + " IsLocked");
                Assert.That(ld[i].LockOwner, Is.EqualTo(td[i].LockOwner), what + " LockOwner");
                Assert.That(ld[i].Powered, Is.EqualTo(td[i].Powered), what + " Powered");
                Assert.That(ld[i].NetworkId, Is.EqualTo(td[i].NetworkId), what + " NetworkId");
                Assert.That(ld[i].FluidNetworkId, Is.EqualTo(td[i].FluidNetworkId), what + " FluidNetworkId");
                Assert.That(ld[i].StoredKWh, Is.EqualTo(td[i].StoredKWh), what + " StoredKWh");
                Assert.That(ld[i].StoredLiters, Is.EqualTo(td[i].StoredLiters), what + " StoredLiters");
                Assert.That(ld[i].Progress, Is.EqualTo(td[i].Progress), what + " Progress");
                Assert.That(ld[i].Condition, Is.EqualTo(td[i].Condition), what + " Condition");
            }
        }

        private static void AssertClose(double actual, double expected, string what)
        {
            double tolerance = Math.Abs(expected) * 1e-9 + 1e-12;
            Assert.That(Math.Abs(actual - expected), Is.LessThanOrEqualTo(tolerance),
                what + " drifted beyond the documented reload ULP band (" +
                actual.ToString("R", CultureInfo.InvariantCulture) + " vs " +
                expected.ToString("R", CultureInfo.InvariantCulture) + ")");
        }

        // ------------------------------------------------------------------ harness

        private static Simulation RoundTrip(Simulation sim)
        {
            var blob = new MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;

            // A FRESH system stack, exactly as GenSimHost assembles it — systems hold per-sim
            // caches, so reusing the source sim's instances would hide restore holes.
            var (systems, moss, registry) = RebuildSliceSystems();
            Simulation loaded = SaveReader.Read(blob, systems, SimDefs.Default);
            MossBindings.RegisterAdapters(loaded, registry);
            MossBindings.ApplyScripts(loaded, moss);
            return loaded;
        }

        private static GenSimHost BootSlice()
        {
            var host = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default);
            AuthoredShips.PopulateSlice(host.Sim, host.Minds, host.Facts, Find<SocialSystem>(host.Sim));
            return host;
        }

        private static T Find<T>(Simulation sim) where T : class
        {
            for (int i = 0; i < sim.Systems.Length; i++) if (sim.Systems[i] is T t) return t;
            return null;
        }

        private static Dictionary<string, ulong> StatefulByName(Simulation sim)
        {
            var map = new Dictionary<string, ulong>();
            for (int i = 0; i < sim.Systems.Length; i++)
                if (sim.Systems[i] is IStatefulSystem st) map[sim.Systems[i].Name] = st.StateChecksum();
            return map;
        }

        private static (ISimSystem[] systems, ScriptRuntime moss, DeviceRegistry registry) RebuildSliceSystems()
        {
            var registry = new DeviceRegistry();
            var moss = new ScriptRuntime(registry);
            var minds = new MindState();
            var facts = new FactRegistry();
            var effects = new PendingEffectBuffer();
            var designer = RulesLoader.CreateSystem(SimDefs.Default, registry);

            var stack = SystemStack.CreateDefault(moss, designer);
            SocialSystem social = null;
            HistorySystem history = null;
            for (int i = 0; i < stack.Length; i++)
            {
                if (stack[i] is SocialSystem s) social = s;
                if (stack[i] is HistorySystem h) history = h;
            }

            var systems = new ISimSystem[stack.Length + 3];
            systems[0] = new EffectPump(effects, minds, facts);
            for (int i = 0; i < stack.Length; i++) systems[i + 1] = stack[i];
            systems[systems.Length - 2] = new MemorySystem(minds, facts);
            systems[systems.Length - 1] = new EulogySystem(minds, social, history);
            return (systems, moss, registry);
        }
    }
}
