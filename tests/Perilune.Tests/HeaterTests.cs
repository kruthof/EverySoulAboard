using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Glyph;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// M3-10 — THE HEATER. The first device in the game that raises a room's temperature on
    /// purpose, and therefore the first answer to a compartment that refuses all work because it is
    /// below <c>needs.def hypothermia_c</c>.
    ///
    /// <para>⭐ WHY THE TEMPERATURE IS NOT THE POINT. <c>AtmosphereSafety.IsBreathable</c> counts
    /// thermal (<c>SafetySystem.cs:17-18</c>), so <c>WorksiteSafety.CanStageWorkerAt</c> refuses a
    /// frozen tile and every job in that compartment silently stops being offered. A test that
    /// watched only <c>Room.TemperatureK</c> would pass for a heater that warmed a room nobody could
    /// work in — which is a heater that delivered nothing. The predicate flip is the leg that
    /// matters and it is its own test, driven end to end.</para>
    ///
    /// <para>⚠️ EVERY LEG IS ITS OWN <c>[Test]</c>. <c>Assert</c> throws, so a multi-leg test reports
    /// only its first failure and a dead leg looks exactly like a live one (CLAUDE.md, the fifth
    /// trap shape). Each test's doc names the mutation that reddens it; every one of those mutations
    /// was physically applied, observed RED for the stated reason, and reverted from an in-memory
    /// copy (CLAUDE.md trap 2 — no <c>git checkout</c> anywhere near this).</para>
    ///
    /// <para>⚠️ NOTHING HERE RE-DERIVES THE SYSTEM'S OWN ARITHMETIC. The thermal legs assert
    /// DIRECTION and THRESHOLD CROSSINGS against a control arm built from the same fixture, never
    /// <c>output × dt / capacity</c> — an expected value computed with the code's own expression is a
    /// second implementation that agrees with whatever it was written against.</para>
    /// </summary>
    public class HeaterTests
    {
        // ══════════════════════════════════════════════════════════════════════════ the fixture

        /// <summary>
        /// One sealed, pressurised, FREEZING compartment.
        ///
        /// <code>
        ///   y=1   solar(1,1) + conduits(1..7,1)
        ///   y=2   the WIRED bay — a heater here reaches the conduit directly above it
        ///   y=3   the UNWIRED bay — no conduit within PowerSystem's 6-neighbourhood
        /// </code>
        ///
        /// The two bays are the same room and the same air; they differ ONLY in whether a device
        /// standing there can claim a power network. That is what lets the unpowered leg be a real
        /// control instead of a second fixture with its own confounds.
        ///
        /// The room is pressurised AFTER its temperature is set, because
        /// <see cref="RoomState.Pressurize"/> solves moles from the room's CURRENT temperature —
        /// filling first and chilling second would leave a partial vacuum and the vacuum clause,
        /// not the thermal one, would be what refused the tile.
        /// </summary>
        private static Simulation BuildFrozenBay(SimDefs defs, double startK)
        {
            string[] map =
            {
                "#########",
                "#.......#",
                "#.......#",
                "#.......#",
                "#########",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), 42, SystemStack.CreateDefault(moss), defs);

            for (int x = 1; x <= 7; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");

            sim.Rooms.SetAnchor("bay", new Int3(4, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            var room = sim.Rooms.RoomAt(sim.World, new Int3(4, 2, 0));
            room.TemperatureK = startK;
            RoomState.Pressurize(room);
            return sim;
        }

        private static readonly Int3 Wired = new Int3(4, 2, 0);
        private static readonly Int3 Unwired = new Int3(4, 3, 0);

        private static Room Bay(Simulation sim) => sim.Rooms.RoomAt(sim.World, Wired);

        private static double BayC(Simulation sim) => Bay(sim).TemperatureK - 273.15;

        private static Device Dev(Simulation sim, string name)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++) if (devices[i].Name == name) return devices[i];
            Assert.Fail("no device named " + name);
            return null;
        }

        private static void Run(Simulation sim, int ticks)
        {
            for (int t = 0; t < ticks; t++) sim.Tick();
        }

        /// <summary>-13.15 °C: below <c>needs.def hypothermia_c</c> (-10) and comfortably above the
        /// integrator floor, so the bay starts UNWORKABLE for a thermal reason and for no other.</summary>
        private const double FrozenK = 260.0;

        private const int OneSimHour = 36_000;   // 3 600 s × 10 Hz

        // ═════════════════════════════════════════════════════ 1. it heats (mutation 1)

        /// <summary>
        /// MUTATION 1: delete the <c>DeviceKind.Heater</c> arm from <c>ThermalSystem.Tick</c> (the
        /// device then falls through to the generic waste-heat line, where its <c>HeatKW</c> is 0)
        /// ⇒ the bay cools instead of warming and this goes RED on the DIRECTION assert.
        ///
        /// The control arm is the SAME fixture with no heater at all, and it is what makes the
        /// claim a claim about the heater rather than about the room: an empty sealed bay at
        /// -13 °C loses heat to the hull every pass, so "warmer than it started" is not something
        /// this fixture does on its own.
        /// </summary>
        [Test]
        public void APoweredHeater_WarmsItsRoom_WhereTheSameRoomWithoutOneCools()
        {
            var withHeater = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);
            withHeater.AddDevice(DeviceKind.Heater, Wired, "heater");
            var control = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);

            double before = BayC(withHeater);
            Assert.That(BayC(control), Is.EqualTo(before).Within(1e-9), "the twins must start equal");

            Run(withHeater, OneSimHour);
            Run(control, OneSimHour);

            Assert.That(BayC(withHeater), Is.GreaterThan(before),
                "a powered, operational heater must RAISE its room's temperature. It read "
                + BayC(withHeater).ToString("F3", CultureInfo.InvariantCulture) + " C after one sim-hour, "
                + "from " + before.ToString("F3", CultureInfo.InvariantCulture) + " C.");
            Assert.That(BayC(control), Is.LessThan(before),
                "THE CONTROL IS NOT DOING ITS JOB: the same sealed bay with NO heater must lose heat "
                + "to the hull. If it warms on its own, the assertion above is vacuous.");
        }

        /// <summary>
        /// MUTATION 1b: make the heater's push a CONSTANT instead of scaling by
        /// <c>Device.EffectiveRate</c> (i.e. drop the <c>* device.EffectiveRate</c> factor) ⇒ the
        /// worn heater keeps up with the intact one and this goes RED.
        ///
        /// ⭐ THIS IS THE LEG THAT JUSTIFIES THE DEF LAYOUT. The heater's output rides
        /// <c>heater_output_kw</c> rather than the machine table's <c>heat</c> column precisely
        /// because the generic waste-heat line is NOT condition-scaled: a heater in the <c>heat</c>
        /// column would have been exactly as strong at Condition 0.15 as at 1.00, which is the
        /// M2-12 generation precedent pointing the other way.
        /// </summary>
        [Test]
        public void AWornHeater_HeatsMeasurablySlowerThanAnIntactOne()
        {
            var intact = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);
            intact.AddDevice(DeviceKind.Heater, Wired, "heater").Condition = 1.00f;
            var worn = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);
            // 0.15 is ABOVE the row's `fail` (0.10), so this heater is running, not broken —
            // the distinction the two `continue` gates make and this leg must not blur.
            worn.AddDevice(DeviceKind.Heater, Wired, "heater").Condition = 0.15f;

            Run(intact, OneSimHour);
            Run(worn, OneSimHour);

            Assert.That(Dev(worn, "heater").IsOperational(worn.Defs), Is.True,
                "the worn heater must still be OPERATIONAL, or this leg is measuring the fail gate "
                + "(which is a different test) instead of condition scaling");
            Assert.That(BayC(worn), Is.LessThan(BayC(intact) - 0.5),
                "a worn heater must deliver measurably less heat than an intact one. worn "
                + BayC(worn).ToString("F3", CultureInfo.InvariantCulture) + " C vs intact "
                + BayC(intact).ToString("F3", CultureInfo.InvariantCulture) + " C.");
            Assert.That(BayC(worn), Is.GreaterThan(-13.15),
                "and it must still be heating — a worn heater is weak, not dead");
        }

        // ═════════════════════════════════════════════ 2. the two gates, SEPARATELY (mutation 2)

        /// <summary>
        /// MUTATION 2a: move the heater arm ABOVE the shared
        /// <c>if (!device.Powered || !device.IsOperational(...)) continue;</c> gate ⇒ an unwired
        /// heater warms the bay and this goes RED.
        ///
        /// The heater is placed on the UNWIRED row of the same fixture, so the only difference from
        /// the passing case above is <see cref="Device.NetworkId"/>. The <c>Powered</c> flag is
        /// asserted directly as well, because a fixture that accidentally wired the tile would make
        /// this test pass for the wrong reason.
        /// </summary>
        [Test]
        public void AnUNPOWEREDHeater_AddsNoHeat()
        {
            var sim = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);
            sim.AddDevice(DeviceKind.Heater, Unwired, "heater");
            double before = BayC(sim);

            Run(sim, OneSimHour);

            Assert.That(Dev(sim, "heater").Powered, Is.False,
                "FIXTURE CHECK: the heater on the unwired row must really be unpowered. If PowerSystem "
                + "reaches it, this test proves nothing about the power gate.");
            Assert.That(BayC(sim), Is.LessThan(before),
                "an unpowered heater must add NOTHING — the bay must cool exactly as an empty one does");
        }

        /// <summary>
        /// MUTATION 2b: drop <c>!device.IsOperational(sim.Defs)</c> from that same gate ⇒ a heater
        /// below its <c>fail</c> floor warms the bay and this goes RED.
        ///
        /// Separate from 2a deliberately: the two clauses of one <c>if</c> are two rules, and a
        /// single test covering both would go green with either one deleted.
        /// </summary>
        [Test]
        public void AHeaterBelowItsFailFloor_AddsNoHeat_EvenWiredAndPowered()
        {
            var sim = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);
            // 0.05 is below the row's `fail` 0.10 — a heater the crew must repair before it works.
            sim.AddDevice(DeviceKind.Heater, Wired, "heater").Condition = 0.05f;
            double before = BayC(sim);

            Run(sim, OneSimHour);

            Assert.That(Dev(sim, "heater").Powered, Is.True,
                "FIXTURE CHECK: this heater must be POWERED, or the test is re-measuring the power gate");
            Assert.That(Dev(sim, "heater").IsOperational(sim.Defs), Is.False,
                "FIXTURE CHECK: and it must be below `fail`");
            Assert.That(BayC(sim), Is.LessThan(before),
                "a heater below its fail floor is inoperative — it must add no heat at all");
        }

        // ══════════════════════════ 3. ⭐ THE LEG THAT MATTERS — the room becomes WORKABLE

        /// <summary>
        /// ⭐⭐ MUTATION 3: assert only the temperature (i.e. delete the
        /// <c>CanStageWorkerAt</c> assertions below) and the test survives a heater that warms a
        /// room nobody can work in. THAT is the mutation this leg exists for, and it is the reason
        /// M3-10 is a package rather than a def row.
        ///
        /// <para>The BEFORE arm is asserted FALSE first — an inclusion check. Without it the whole
        /// test would pass on a rule that answered TRUE for every tile in the game, which is exactly
        /// what <c>CanCycle</c> does when a stack has no <see cref="NeedsSystem"/> or no
        /// <see cref="SafetySystem"/>. Both are asserted present for the same reason.</para>
        ///
        /// <para>The tile queried is the heater's own bay and <c>forced: false</c> — the DISPATCHER'S
        /// question, the one that decides whether autonomous work is ever offered there. A forced
        /// order waives the air question entirely (M3-14 rung 2) and would answer TRUE at any
        /// temperature, so passing <c>true</c> here would have made the test unfalsifiable.</para>
        /// </summary>
        [Test]
        public void AHeaterMakesAFROZENCompartmentWORKABLE_NotMerelyWarmer()
        {
            var sim = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);

            bool hasNeeds = false, hasSafety = false;
            foreach (var s in sim.Systems)
            {
                if (s is NeedsSystem) hasNeeds = true;
                else if (s is SafetySystem) hasSafety = true;
            }
            Assert.That(hasNeeds && hasSafety, Is.True,
                "FIXTURE CHECK: WorksiteSafety.CanCycle answers TRUE for every tile unless BOTH a "
                + "NeedsSystem and a SafetySystem are in the stack, and a rule that says yes to "
                + "everything cannot fail this test.");

            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, Wired), Is.False,
                "BEFORE: a compartment at " + BayC(sim).ToString("F2", CultureInfo.InvariantCulture)
                + " C is below needs.def hypothermia_c and must refuse work. If it does not, the "
                + "AFTER assertion below measures nothing.");
            Assert.That(Bay(sim).PressureKPa, Is.GreaterThan(sim.Defs.Needs.VacuumPressureKPa),
                "AND THE REFUSAL MUST BE THERMAL, not pressure: this bay is full of air. A vacuum "
                + "fixture would flip to TRUE for a reason the heater had nothing to do with.");

            sim.AddDevice(DeviceKind.Heater, Wired, "heater");
            Run(sim, OneSimHour);

            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, Wired), Is.True,
                "AFTER: one powered heater must make the compartment STAGEABLE — the bay reads "
                + BayC(sim).ToString("F2", CultureInfo.InvariantCulture) + " C. A heater that warms a "
                + "room the crew still may not work in has delivered nothing.");
        }

        /// <summary>
        /// The ceiling, and it is not a comfort setting: <c>IsBreathable</c> is false ABOVE
        /// <c>needs.def heat_stroke_c</c> (45 °C) too, so an uncapped 5 kW source in a sealed bay
        /// would end by refusing the very work it was placed to allow.
        ///
        /// MUTATION: delete the <c>deficitJ</c> clamp (push unconditionally) ⇒ the bay runs past
        /// the ceiling and both assertions go RED — the first on the ceiling, the second on
        /// <c>CanStageWorkerAt</c>, which is the consequence that makes the first one matter.
        /// </summary>
        [Test]
        public void AHeaterStopsAtTheCeiling_AndNeverCooksTheRoomItWarmed()
        {
            var sim = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);
            // Three heaters, deliberately: one is a rate, three is a race against the cap. If the
            // clamp were per-device rather than per-room this would overshoot and say so.
            sim.AddDevice(DeviceKind.Heater, Wired, "heater_a");
            sim.AddDevice(DeviceKind.Heater, new Int3(5, 2, 0), "heater_b");
            sim.AddDevice(DeviceKind.Heater, new Int3(6, 2, 0), "heater_c");

            Run(sim, 24 * OneSimHour);   // a full sim-day of unattended heating

            double ceilingC = sim.Defs.Thermal.HeaterCeilingK - 273.15;
            Assert.That(BayC(sim), Is.LessThan(ceilingC + 0.5),
                "three heaters must not carry the bay past heater_ceiling_k. It read "
                + BayC(sim).ToString("F3", CultureInfo.InvariantCulture) + " C against a ceiling of "
                + ceilingC.ToString("F2", CultureInfo.InvariantCulture) + " C.");
            Assert.That(BayC(sim), Is.LessThan(sim.Defs.Needs.HeatStrokeC),
                "and it must stay well below needs.def heat_stroke_c — a cooked compartment refuses "
                + "work exactly as a frozen one does");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, Wired), Is.True,
                "a day under three heaters must leave the bay WORKABLE, which is the whole point");
        }

        // ═══════════════════════════════════════════════ 4. the enum is APPEND-ONLY (mutation 4)

        /// <summary>
        /// MUTATION 4: insert <c>Heater</c> BEFORE <c>CryoPod</c> in <c>DeviceKind</c> ⇒ CryoPod's
        /// byte moves from 27 to 28 and this goes RED naming it.
        ///
        /// Every saved <c>Device.Kind</c> byte, every <c>devices</c> wire row, every def-table index
        /// and the client's own 29-entry mirror are all positional. A renumber is silent everywhere
        /// except here and in <c>client/test/prioritise-menu.test.js</c>.
        /// </summary>
        [Test]
        public void TheEnumIsAppendOnly_HeaterIs28AndCryoPodIsStill27()
        {
            Assert.That((int)DeviceKind.CryoPod, Is.EqualTo(27), "CryoPod's byte must not move");
            Assert.That((int)DeviceKind.IceMelter, Is.EqualTo(26), "IceMelter's byte must not move");
            Assert.That((int)DeviceKind.Heater, Is.EqualTo(28), "Heater must be the APPENDED tail");
            Assert.That(Enum.GetValues(typeof(DeviceKind)).Length, Is.EqualTo(29),
                "29 DeviceKind members. This is an EQUALITY pin: a `>=` floor is satisfied by a "
                + "correlated failure where the enum grows by one and a member silently disappears.");
        }

        /// <summary>The def tables are indexed by <c>(int)DeviceKind</c>, so a member with no row is
        /// an <c>IndexOutOfRangeException</c> waiting for the first ship that authors one — and
        /// <c>Recipes</c> is sized off <c>Machines.Length</c>, so both arrays move together.</summary>
        [Test]
        public void BothDefArraysGrewWithTheEnum_AndHeaterHasNoRecipe()
        {
            var d = SimDefs.Default;
            Assert.That(d.Machines.Length, Is.EqualTo(29), "one Machines row per DeviceKind");
            Assert.That(d.Recipes.Length, Is.EqualTo(29), "Recipes is sized off Machines.Length");
            Assert.That(d.Recipes[(int)DeviceKind.Heater].Defined, Is.False,
                "a heater is not a crafting station — the Recipes entry exists structurally and is "
                + "deliberately undefined; authoring one would be inventing content this package "
                + "does not need.");
        }

        // ═════════════════════════════════ 5. the THREE transcriptions agree (mutation 5)

        /// <summary>
        /// MUTATION 5: change the <c>Heater</c> row in <c>content/core/SimDefs/machines.def</c>
        /// (e.g. draw 1.0 → 2.0) and leave <c>MachineDefs.Table</c> and
        /// <c>SimDefs.CreateDefault</c> alone ⇒ this goes RED naming the column, and
        /// <c>DefsEquivalenceTests.ShippedDefs_Parse_ZeroProblems_ChecksumEqualsDefault</c> goes red
        /// beside it.
        ///
        /// <para>⚠️ IT PARSES THE SHIPPED FILE, it does not scan it for a string. A text assertion
        /// over <c>machines.def</c> would pass for a row the parser rejects and drops — the file is
        /// only as authoritative as what <c>DefsParser</c> makes of it (CLAUDE.md trap 4: pin the
        /// value at the seam, never a text match).</para>
        /// </summary>
        [Test]
        public void TheHeaterRowIsIDENTICAL_InAllThreeTranscriptions()
        {
            string dir = FindSimDefsDir();
            Assert.That(dir, Is.Not.Null, "the shipped SimDefs directory must be discoverable");

            string[] paths = Directory.GetFiles(dir, "*.def");
            Array.Sort(paths, StringComparer.Ordinal);
            var files = new List<(string, string)>(paths.Length);
            foreach (var p in paths) files.Add((Path.GetFileName(p), File.ReadAllText(p)));

            var problems = new List<string>();
            var fromFile = DefsParser.Parse(files, problems);
            Assert.That(problems, Is.Empty, "shipped defs must parse clean: " + string.Join(" | ", problems));

            int i = (int)DeviceKind.Heater;
            var file = fromFile.Machines[i];        // transcription 3 — content/core/SimDefs/machines.def
            var code = SimDefs.Default.Machines[i]; // transcription 2 — SimDefs.CreateDefault
            var table = MachineDefs.Of(DeviceKind.Heater); // transcription 1 — MachineDefs.Table

            var offenders = new List<string>();
            void Cmp(string col, object a, object b, object c)
            {
                if (!Equals(a, b) || !Equals(b, c))
                    offenders.Add(FormattableString.Invariant(
                        $"{col}: machines.def={a} CreateDefault={b} MachineDefs.Table={c}"));
            }
            Cmp("draw", file.DrawKW, code.DrawKW, table.DrawKW);
            Cmp("gen", file.GenerationKW, code.GenerationKW, table.GenerationKW);
            Cmp("tier", file.Tier, code.Tier, table.Tier);
            Cmp("blocks", file.Blocks, code.Blocks, table.Blocks);
            Cmp("heat", file.HeatKW, code.HeatKW, table.HeatKW);
            Cmp("wear", file.WearPerHour, code.WearPerHour, table.WearPerHour);
            Cmp("maint", file.MaintainBelow, code.MaintainBelow, table.MaintainBelow);
            Cmp("fail", file.FailBelow, code.FailBelow, table.FailBelow);
            Cmp("heater_output_kw", fromFile.HeaterOutputKW, SimDefs.Default.HeaterOutputKW,
                MachineDefs.HeaterOutputKW);
            Cmp("heater_ceiling_k", fromFile.Thermal.HeaterCeilingK, SimDefs.Default.Thermal.HeaterCeilingK,
                294.15);

            Assert.That(offenders, Is.Empty,
                "THE THREE TRANSCRIPTIONS OF THE HEATER DISAGREE. A machines.def row is hand-written "
                + "in three places (MachineDefs.Table, SimDefs.CreateDefault, machines.def) and "
                + "nothing joins them at build time — they ship in ONE commit or not at all:\n  "
                + string.Join("\n  ", offenders));
        }

        /// <summary>
        /// The def fields have a real CONSUMER — the tripwire without which they would be pinned by
        /// the checksum alone, which is not pinned at all (CLAUDE.md: "a def pinned only by the
        /// checksum is NOT pinned").
        ///
        /// MUTATION: read <c>MachineDefs.HeaterOutputKW</c> (the static default) instead of
        /// <c>sim.Defs.HeaterOutputKW</c> in <c>ThermalSystem</c> ⇒ the mutated graph is ignored and
        /// the two bays land on the same temperature ⇒ RED.
        /// </summary>
        [Test]
        public void HeaterOutputKW_IsREAD_NotJustFolded()
        {
            var shipped = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);
            var mutatedDefs = SimDefs.CreateDefault();
            mutatedDefs.HeaterOutputKW *= 4f;
            mutatedDefs.ComputeChecksum();
            var hotter = BuildFrozenBay(mutatedDefs, FrozenK);

            shipped.AddDevice(DeviceKind.Heater, Wired, "heater");
            hotter.AddDevice(DeviceKind.Heater, Wired, "heater");
            Run(shipped, OneSimHour / 4);
            Run(hotter, OneSimHour / 4);

            Assert.That(mutatedDefs.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum),
                "the field must be FOLDED as well as read, or a content pack could retune it invisibly");
            Assert.That(BayC(hotter), Is.GreaterThan(BayC(shipped) + 1.0),
                "ThermalSystem must read sim.Defs.HeaterOutputKW. shipped "
                + BayC(shipped).ToString("F3", CultureInfo.InvariantCulture) + " C vs 4x "
                + BayC(hotter).ToString("F3", CultureInfo.InvariantCulture) + " C.");
        }

        /// <summary>The ceiling's own tripwire — same shape, different field. MUTATION: hard-code
        /// 294.15 in <c>ThermalSystem</c> ⇒ the lowered ceiling is ignored and this goes RED.</summary>
        [Test]
        public void HeaterCeilingK_IsREAD_NotJustFolded()
        {
            var lowered = SimDefs.CreateDefault();
            lowered.Thermal.HeaterCeilingK = 268.15;   // -5 °C: above hypothermia, far below 21 °C
            lowered.ComputeChecksum();
            var sim = BuildFrozenBay(lowered, FrozenK);
            sim.AddDevice(DeviceKind.Heater, Wired, "heater");

            Run(sim, 8 * OneSimHour);

            Assert.That(lowered.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));
            Assert.That(BayC(sim), Is.LessThan(-4.0),
                "ThermalSystem must read sim.Defs.Thermal.HeaterCeilingK — with the ceiling lowered "
                + "to -5 C the bay must stop there, and it read "
                + BayC(sim).ToString("F3", CultureInfo.InvariantCulture) + " C.");
            Assert.That(BayC(sim), Is.GreaterThan(-11.0),
                "and it must still have HEATED to that ceiling from -13.15 C, or the test is passing "
                + "because nothing happened at all");
        }

        // ═══════════════════════════════════ 6. NO PINNED SHIP HAS ONE (mutation 6)

        /// <summary>
        /// The PLAN-BUILT ships this census can reach. <b>P2</b> is <see cref="AuthoredShips.Perilune"/>
        /// (the tick-3000 golden) and <b>P3</b> is <see cref="AuthoredShips.PeriluneSlice"/> (the slice
        /// golden); grid and wreck are shipped content whose censuses are pinned elsewhere.
        ///
        /// <para>⛔⭐ <b>P1 IS NOT IN THIS LIST, AND AN EARLIER VERSION OF THIS COMMENT SAID IT WAS.</b>
        /// It claimed P1 was "the scenario host's PROCEDURAL ship at seed 42
        /// (<c>ProceduralShips.Generate(ShipRecipe.FromSeed(seed))</c>)". <b>That is FALSE.</b>
        /// <c>ci.sh</c>'s determinism proof runs <c>hosts/scenario --days 3 --seed 42</c>, and
        /// <c>Program.cs:56</c> builds its sim with <c>BuildScenario(seed, defs)</c> — a HAND-BUILT
        /// <see cref="Simulation"/> with eighteen <c>AddDevice</c> calls written out in that file.
        /// <c>ProceduralShips.Generate</c> feeds the <c>gen</c>/<c>occupancy</c>/<c>metrics</c>
        /// subcommands and stands behind NO pin at all. So this list was censusing a ship no pin
        /// uses while the docs cited it as what keeps P1 safe — the M3-15 send-back's hole, re-cut.
        /// P1's own fixture is covered by <see cref="P1sOwnFixtureAuthorsNoHeater"/>, which scans
        /// <c>Program.cs</c> itself.</para>
        /// </summary>
        private static IEnumerable<(string name, ShipPlan plan)> PinnedShips()
        {
            yield return ("P2 perilune", AuthoredShips.Perilune());
            yield return ("P3 slice", AuthoredShips.PeriluneSlice());
            yield return ("grid", AuthoredShips.PeriluneGrid());
            yield return ("wreck", AuthoredShips.PeriluneWreck());
        }

        /// <summary>P1's fixture is source, not a <see cref="ShipPlan"/>, so it is scanned as source.
        /// Comment-stripped with the SHARED <c>CodeOnly</c> (CLAUDE.md trap 1 — a raw-text guard is
        /// satisfied by commented-out code).</summary>
        private static HashSet<string> ScenarioFixtureKinds(string src)
        {
            var found = new HashSet<string>(StringComparer.Ordinal);
            foreach (System.Text.RegularExpressions.Match m in
                     System.Text.RegularExpressions.Regex.Matches(
                         ArchitectureBoundaryTests.CodeOnly(src), @"AddDevice\(\s*DeviceKind\.(\w+)"))
                found.Add(m.Groups[1].Value);
            return found;
        }

        private static string ScenarioProgramSource()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(dir.FullName, "hosts", "scenario", "Program.cs");
                if (File.Exists(candidate)) return File.ReadAllText(candidate);
                dir = dir.Parent;
            }
            return null;
        }

        private static List<string> HeatersIn(IEnumerable<(string name, ShipPlan plan)> ships)
        {
            var found = new List<string>();
            foreach (var (name, plan) in ships)
                for (int i = 0; i < plan.Devices.Count; i++)
                    if (plan.Devices[i].Kind == DeviceKind.Heater)
                        found.Add(name + ": " + plan.Devices[i].Name);
            return found;
        }

        /// <summary>
        /// ⚠️ THE PIN-SCOPE LEG for the PLAN-BUILT pins. P2 and P3 are asserted to HOLD across this
        /// package, and that claim rests on one fact: no ship behind a pin authors a heater, so no
        /// pinned run ever reaches <c>ThermalSystem</c>'s new arm. This is the fact, mechanised —
        /// for the ships this census can reach. P1's fixture is source and has its own scan.
        ///
        /// MUTATION 6: author one onto any pinned ship ⇒ this names the ship and the device.
        /// </summary>
        [Test]
        public void NoPinnedShipAuthorsAHeater()
        {
            Assert.That(HeatersIn(PinnedShips()), Is.Empty,
                "A PINNED SHIP NOW AUTHORS A HEATER. P2 and P3 are asserted to hold across M3-10 on "
                + "exactly this ground (P1's own fixture is source, covered by "
                + "P1sOwnFixtureAuthorsNoHeater). Re-measure before merging.");
        }

        /// <summary>
        /// ⭐ <b>P1'S OWN FIXTURE.</b> <c>ci.sh</c>'s determinism proof is
        /// <c>hosts/scenario --days 3 --seed 42</c>, whose sim is <c>Program.cs</c>'s hand-built
        /// <c>BuildScenario</c> — not a <see cref="ShipPlan"/>, so <see cref="PinnedShips"/>
        /// structurally cannot reach it. It is scanned at the source instead.
        ///
        /// <para>MUTATION: add <c>sim.AddDevice(DeviceKind.Heater, …)</c> to <c>BuildScenario</c>
        /// ⇒ this goes red. (And so does ci.sh's own literal — this test is the CHEAP alarm that
        /// says which fixture moved, not a second authority on P1.)</para>
        /// </summary>
        [Test]
        public void P1sOwnFixtureAuthorsNoHeater()
        {
            string src = ScenarioProgramSource();
            Assert.That(src, Is.Not.Null, "hosts/scenario/Program.cs must be discoverable from the test binary");
            var kinds = ScenarioFixtureKinds(src);

            // NON-VACUITY FIRST, and as an INCLUSION check: a parse that finds nothing agrees with
            // everything. These four are hand-written, never derived from the parse's own output.
            Assert.That(kinds, Has.Count.GreaterThanOrEqualTo(8),
                "the BuildScenario device scan found only " + kinds.Count + " kinds — the regex is "
                + "matching a fragment, or the fixture moved out of Program.cs");
            foreach (string expected in new[] { "Radiator", "SolarWing", "Battery", "Terminal" })
                Assert.That(kinds, Contains.Item(expected),
                    "the scan lost " + expected + ", which BuildScenario certainly authors");

            Assert.That(kinds, Does.Not.Contain("Heater"),
                "P1's OWN fixture (hosts/scenario BuildScenario) now authors a Heater. P1 is asserted "
                + "to hold across M3-10 on the ground that no pinned run reaches ThermalSystem's new "
                + "arm — re-measure ci.sh's literal before merging.");
        }

        /// <summary>The source scan's own inclusion control: splice a heater into an IN-MEMORY copy
        /// of <c>Program.cs</c> and require the same parser to find it. Without this, a rotted regex
        /// and a clean fixture are the same green.</summary>
        [Test]
        public void TheP1SourceScanCanActuallySEEAHeater()
        {
            string src = ScenarioProgramSource();
            Assert.That(src, Is.Not.Null);
            // ⚠️ A DELTA, NOT AN ABSOLUTE — a control that breaks in the one world where its subject
            // is present is not a control. Measured during this package's own mutation run: an
            // absolute `Does.Not.Contain("Heater")` premise here went red the moment BuildScenario
            // really authored one, which is exactly when the scan is provably working.
            bool before = ScenarioFixtureKinds(src).Contains("Heater");

            string planted = src.Replace(
                "sim.AddDevice(DeviceKind.Radiator, new Int3(20, 1, 0), \"radiator_a\");",
                "sim.AddDevice(DeviceKind.Radiator, new Int3(20, 1, 0), \"radiator_a\");\n"
                + "            sim.AddDevice(DeviceKind.Heater, new Int3(19, 3, 0), \"heater_x\");");
            Assert.That(planted, Is.Not.EqualTo(src),
                "the anchor this control splices onto is gone from Program.cs — fix the anchor, do "
                + "not delete the control");
            Assert.That(ScenarioFixtureKinds(planted), Contains.Item("Heater"),
                "the scan cannot see a heater that is certainly there — it is blind, and "
                + "P1sOwnFixtureAuthorsNoHeater has been passing vacuously (the unspliced source "
                + (before ? "already" : "did not") + " contain one)");
        }

        /// <summary>⛔ AND THE COMMENTED-OUT CASE, which is CLAUDE.md trap 1 exactly: a raw-text
        /// guard is satisfied by code that is commented out. A heater inside a comment must NOT
        /// register, or the scan would fire on a discussion of one.</summary>
        [Test]
        public void TheP1SourceScanIgnoresACOMMENTEDHeater()
        {
            string src = ScenarioProgramSource();
            bool before = ScenarioFixtureKinds(src).Contains("Heater");
            string commented = src.Replace(
                "sim.AddDevice(DeviceKind.Radiator, new Int3(20, 1, 0), \"radiator_a\");",
                "sim.AddDevice(DeviceKind.Radiator, new Int3(20, 1, 0), \"radiator_a\");\n"
                + "            // sim.AddDevice(DeviceKind.Heater, new Int3(19, 3, 0), \"heater_x\");");
            Assert.That(commented, Is.Not.EqualTo(src), "the anchor is gone — fix it");
            Assert.That(ScenarioFixtureKinds(commented).Contains("Heater"), Is.EqualTo(before),
                "a COMMENTED-OUT AddDevice CHANGED the scan's answer. The scan is a raw-text guard "
                + "that CodeOnly is supposed to have closed (CLAUDE.md trap 1). Asserted as a DELTA "
                + "against the unspliced source so this control survives a fixture that really does "
                + "author a heater.");
        }

        /// <summary>
        /// NON-VACUITY, AND AS AN INCLUSION TEST — the fourth trap shape. The census above is a
        /// search that finds nothing; a census that CANNOT find anything looks identical. So: plant
        /// a heater on a copy of the wreck's plan and require the same census to name it.
        /// </summary>
        [Test]
        public void ThePinnedShipCensusCanActuallySEEAHeater()
        {
            var planted = AuthoredShips.PeriluneWreck();
            int before = HeatersIn(new[] { ("wreck", planted) }).Count;
            var spec = planted.Devices[0];
            planted.Devices.Add(new DeviceSpec { Kind = DeviceKind.Heater, Pos = spec.Pos, Name = "planted_heater" });

            var found = HeatersIn(new[] { ("wreck+planted", planted) });
            // ⚠️ A DELTA, NOT AN ABSOLUTE COUNT, and the difference is not pedantry: measured during
            // this package's own mutation run, authoring a heater onto the wreck made an
            // `EqualTo(1)` assertion here fail with TWO — i.e. the control test went red in the one
            // world where the census is provably working. A control that breaks when its subject is
            // present is not a control.
            Assert.That(found, Has.Count.EqualTo(before + 1),
                "the census did not see the heater that was just planted — it is blind, and "
                + "NoPinnedShipAuthorsAHeater has been passing vacuously");
            Assert.That(found, Has.Some.Contains("planted_heater"));
        }

        // ═══════════════════════════ 7. THE PLAYER CAN PLACE ONE (mutation 7)

        /// <summary>
        /// MUTATION 7: remove <c>case DeviceKind.Heater</c> from
        /// <c>PlaceDeviceCommand.IsPlaceableFurniture</c> ⇒ the command is a silent no-op, no device
        /// appears, and this goes RED on the placement.
        ///
        /// <para>DRIVEN THROUGH THE REAL COMMAND at a tick boundary, not asserted on the predicate:
        /// the predicate is one of five conditions <c>Execute</c> checks, and a heater that is
        /// whitelisted but refused by the tile/payment rules is still a heater the player cannot
        /// build. The Parts are placed on the ground because placement CHARGES
        /// <c>build.device_place_cost</c> and an unaffordable request is the same silent no-op.</para>
        ///
        /// <para>It then runs the placed heater and asserts the room warms — the full sentence,
        /// place → power → heat, rather than the existence of a device.</para>
        /// </summary>
        [Test]
        public void APlayerCanPLACEAHeater_AndTheOneTheyPlacedHeats()
        {
            var sim = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);
            sim.AddItem(ItemKind.Parts, 8, new Int3(2, 2, 0));   // enough to pay device_place_cost
            double before = BayC(sim);

            Assert.That(PlaceDeviceCommand.IsPlaceableFurniture(DeviceKind.Heater), Is.True,
                "a heater the player cannot place is a def row: the ship freezes and the only device "
                + "that answers it exists for level authors only");
            Assert.That(PlaceDeviceCommand.IsPlaceableFurniture(DeviceKind.Radiator), Is.False,
                "CONTROL: the whitelist must still REFUSE authored plant, or the assertion above is "
                + "satisfied by a predicate that says yes to everything");

            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Heater, Wired));
            Run(sim, 1);

            Assert.That(sim.TryGetDeviceAt(Wired, out var placed), Is.True,
                "the placement must land — PlaceDeviceCommand refuses silently, so an unplaceable "
                + "kind, an illegal tile or an unaffordable ship all look like nothing happening");
            Assert.That(placed.Kind, Is.EqualTo(DeviceKind.Heater));

            Run(sim, OneSimHour);
            Assert.That(BayC(sim), Is.GreaterThan(before),
                "and the heater the PLAYER placed must heat, not merely exist");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, Wired), Is.True,
                "…all the way to a compartment the crew may work in");
        }

        /// <summary>A heater put in the wrong compartment must come back out.
        /// <c>RemoveDeviceCommand</c> gates on the SAME whitelist, so this rides in free — and
        /// stating it is what stops the next lane assuming it does not.</summary>
        [Test]
        public void APlacedHeaterCanBeRemovedAgain()
        {
            var sim = BuildFrozenBay(SimDefs.CreateDefault(), FrozenK);
            sim.AddItem(ItemKind.Parts, 8, new Int3(2, 2, 0));
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Heater, Wired));
            Run(sim, 1);
            Assert.That(sim.TryGetDeviceAt(Wired, out _), Is.True, "FIXTURE: it must be there first");

            sim.EnqueueCommand(new RemoveDeviceCommand(Wired));
            Run(sim, 1);

            Assert.That(sim.TryGetDeviceAt(Wired, out _), Is.False, "a placed heater must be removable");
        }

        // ═══════════════════════════════════════════════════════════ the glyph + the projection

        /// <summary>The heater must PROJECT. A DeviceKind with no <c>ForDevice</c> arm falls through
        /// to <c>'?'</c>, and the client draws a dashed placeholder chip for it in the shipping game
        /// — the defect the device-sprite coverage guard exists for, on the sim side of the seam.</summary>
        [Test]
        public void TheHeaterHasItsOwnGlyph_AndItCollidesWithNothing()
        {
            char heater = Glyphs.ForDevice(DeviceKind.Heater);
            Assert.That(heater, Is.EqualTo('E'), "the client's space-heater piece claims 'E'");
            Assert.That(heater, Is.Not.EqualTo('?'), "no kind may fall through to the unknown glyph");

            foreach (DeviceKind k in Enum.GetValues(typeof(DeviceKind)))
                if (k != DeviceKind.Heater)
                    Assert.That(Glyphs.ForDevice(k), Is.Not.EqualTo(heater),
                        "DeviceKind " + k + " already claims '" + heater + "'");
            foreach (ItemKind k in Enum.GetValues(typeof(ItemKind)))
                Assert.That(Glyphs.ForItem(k), Is.Not.EqualTo(heater),
                    "ItemKind " + k + " already claims '" + heater + "' — the two switches write the "
                    + "same GlyphCell byte and the client resolves it first-wins");
        }

        private static string FindSimDefsDir()
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
    }
}
