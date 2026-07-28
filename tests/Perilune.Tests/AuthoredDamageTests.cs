using System.Collections.Generic;
using System.Globalization;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// W1 of the wreck start — <see cref="DeviceSpec.Condition"/> and
    /// <see cref="DeviceSpec.Scriptable"/>: a <see cref="ShipPlan"/> can now author a device that
    /// boots damaged and/or un-commissioned. THIS LANE AUTHORS NO SUCH SHIP; it adds the plumbing
    /// and pins that the plumbing is inert everywhere it is not used.
    ///
    /// ⚠️ EVERY TEST HERE IS DRIVEN. Each one calls the real <see cref="ShipPlanBuilder.Build"/>
    /// and reads the real <see cref="Device"/> that comes out. A source scan asserting that
    /// <c>ShipPlanBuilder.cs</c> contains the token <c>spec.Condition</c> would pass with the
    /// assignment sitting in a comment, and would say nothing at all about the sentinel — which is
    /// the entire risk of this change.
    ///
    /// ⚠️ THE RISK, STATED PLAINLY. <see cref="DeviceSpec"/> is a struct with no field
    /// initialisers, so a plain <c>float Condition</c> would default to <c>0f</c> and a plain
    /// <c>bool Scriptable</c> to <c>false</c>. Applied naively that boots EVERY device on EVERY
    /// existing ship wrecked and un-commissioned — the second of which <see cref="Device"/>'s own
    /// header calls "a catastrophic regression". The encoding is therefore
    /// <c>Nullable&lt;float&gt;</c>/<c>Nullable&lt;bool&gt;</c>, whose "unspecified" state is null
    /// however the struct comes into existence, and <see cref="ShippedShips_BootPristine"/> is the
    /// proof rather than the argument.
    ///
    /// ⚠️ EVERY LEG IS ITS OWN <c>[Test]</c>, DELIBERATELY. <c>Assert</c> throws, so only the
    /// first failing leg of a multi-leg test ever reports and a dead leg is indistinguishable from
    /// a live one (CLAUDE.md, the fifth trap shape). The one test that does loop —
    /// <see cref="ShippedShips_BootPristine"/> — accumulates offenders across all three ships into
    /// one list and asserts ONCE, so no ship can hide behind an earlier ship's failure.
    ///
    /// ⚠️ THE CENSUS' NON-VACUITY IS AN INCLUSION TEST, NOT A POPULATION COUNT.
    /// <see cref="Census_Catches_APlantedWreck"/> and
    /// <see cref="Census_Catches_APlantedUncommissionedDevice"/> plant the violation in a real
    /// <c>PeriluneGrid()</c> plan and require the SAME <see cref="NonPristineDevices"/> matcher to
    /// return it. "The matcher walked 1250 devices" proves it matched something; only planting the
    /// violation proves it would match the thing (CLAUDE.md, the fourth trap shape).
    /// </summary>
    public class AuthoredDamageTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        // ------------------------------------------------------------ the round-trip fixture

        // A single pressurised bay. Small on purpose: the round-trip legs assert about ONE device
        // and must not be able to pass because some other device on a big ship happened to agree.
        private static readonly string[][] OneBay =
        {
            new[]
            {
                "#########",
                "#.......#",
                "#.......#",
                "#.......#",
                "#########",
            },
        };

        private static readonly Int3 MachineTile = new Int3(7, 1, 0);
        private static readonly Int3 CrewTile = new Int3(1, 3, 0);

        /// <summary>The fixture plan. <paramref name="condition"/>/<paramref name="scriptable"/>
        /// are passed STRAIGHT THROUGH to the one <see cref="DeviceSpec"/>, including null — which
        /// is what makes the control legs below a control: the unspecified case travels the exact
        /// same code path as the specified one and differs only in the field's value.</summary>
        private static ShipPlan BayPlan(float? condition = null, bool? scriptable = null)
        {
            var plan = new ShipPlan { Name = "w1_bay", Seed = 20260728UL, DeckRows = OneBay };
            plan.Rooms.Add(new RoomSpec { Anchor = "bay", Type = RoomType.None, Probe = new Int3(1, 1, 0) });
            plan.PressurizedAnchors.Add("bay");
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.Scrubber, Pos = MachineTile, Name = "scrubber_bay",
                Condition = condition, Scriptable = scriptable,
            });
            plan.Citizens.Add(new CitizenSpec { Name = "Adeyemi", Pos = CrewTile });
            return plan;
        }

        private static Device BuiltMachine(float? condition = null, bool? scriptable = null,
                                           ISimSystem[] systems = null)
        {
            var sim = ShipPlanBuilder.Build(BayPlan(condition, scriptable), systems ?? new ISimSystem[0]);
            Assert.That(sim.Devices.Items.Count, Is.EqualTo(1),
                "fixture: exactly one device, so the assertions below cannot read a bystander");
            return sim.Devices.Items[0];
        }

        // ------------------------------------------------------------ 1. the round trip

        [Test]
        public void AuthoredCondition_ReachesTheBuiltDevice()
        {
            Assert.That(BuiltMachine(condition: 0.1f).Condition, Is.EqualTo(0.1f),
                "a plan authoring Condition = 0.1 must produce a device at 0.1 — this is the whole feature");
        }

        [Test]
        public void AuthoredScriptableFalse_ReachesTheBuiltDevice()
        {
            Assert.That(BuiltMachine(scriptable: false).Scriptable, Is.False,
                "a plan authoring Scriptable = false must produce an un-commissioned device");
        }

        [Test]
        public void AuthoredConditionZero_ReachesTheBuiltDevice()
        {
            // 0f is the value a naive `float` field would have produced by ACCIDENT on every
            // device in the repo. It must still be authorable ON PURPOSE — a wreck's dead
            // machines are exactly this — so "unspecified" cannot be spelled 0.
            Assert.That(BuiltMachine(condition: 0f).Condition, Is.EqualTo(0f),
                "Condition = 0 must be an authorable value, not the encoding's 'unset'");
        }

        [Test]
        public void AuthoredScriptableTrue_ReachesTheBuiltDevice()
        {
            // HONEST SCOPE: `true` is also Device's default, so DROPPING the write does not redden
            // this leg (measured — M2 in the harness leaves it green). It is not dead, though: the
            // mutation it does catch is a write that ignores the authored value —
            // `device.Scriptable = false;` — which is the shape a copy-paste from the wreck's
            // authoring would produce. Measured as M10: this is the SOLE red.
            Assert.That(BuiltMachine(scriptable: true).Scriptable, Is.True,
                "an explicitly authored `true` must survive the builder — the write must copy the " +
                "authored value, not a constant");
        }

        // ------------------------------------------------------------ 2. the controls

        [Test]
        public void UnspecifiedSpec_LeavesConditionPristine()
        {
            Assert.That(BuiltMachine().Condition, Is.EqualTo(1f),
                "a spec that says nothing about Condition must leave Device's own 1f initialiser " +
                "standing. If this reads 0f the encoding has become a plain float and EVERY device " +
                "on EVERY ship now boots wrecked.");
        }

        [Test]
        public void UnspecifiedSpec_LeavesScriptableTrue()
        {
            Assert.That(BuiltMachine().Scriptable, Is.True,
                "a spec that says nothing about Scriptable must leave Device's own true initialiser " +
                "standing. If this reads false, MossBindings registers no adapter for any device on " +
                "any ship — the regression Device.Scriptable's header calls catastrophic.");
        }

        [Test]
        public void DefaultDeviceSpec_SaysNothingAboutEitherField()
        {
            // ⚠️ HONEST SCOPE, SAID OUT LOUD RATHER THAN LEFT FOR A REVIEWER TO FIND: NO SOURCE
            // MUTATION CAN REDDEN THIS LEG. Every way of breaking the encoding it characterises —
            // `float? Condition` becoming `float Condition`, or the struct acquiring a non-null
            // initialiser — stops this file COMPILING, which is a crash and not a semantic red.
            // It is therefore documentation of the premise the sentinel rests on, and it is
            // labelled as such rather than counted as a guard. The guards that do bite on the
            // sentinel are UnspecifiedSpec_Leaves* and ShippedShips_BootPristine (harness M3/M4).
            //
            // The state below is what EVERY existing authoring site produces, because none of them
            // mention the two new fields. `default(DeviceSpec)` and an object-initialiser spec
            // must agree — the object initialiser is the form all ~1250 shipped specs use.
            var zeroed = default(DeviceSpec);
            var authored = new DeviceSpec { Kind = DeviceKind.Light, Pos = MachineTile, Name = "l" };
            Assert.That(zeroed.Condition.HasValue || zeroed.Scriptable.HasValue ||
                        authored.Condition.HasValue || authored.Scriptable.HasValue, Is.False,
                "an unmentioned Condition/Scriptable must be 'unspecified' whichever way the struct " +
                "is created — zeroed memory, default(T), or an object initialiser");
        }

        // ------------------------------------------------------------ 3. the two fields are independent

        [Test]
        public void AuthoringCondition_DoesNotDisturbScriptable()
        {
            Assert.That(BuiltMachine(condition: 0.1f).Scriptable, Is.True,
                "authoring damage must not also un-commission the device — the two fields are separate");
        }

        [Test]
        public void AuthoringScriptable_DoesNotDisturbCondition()
        {
            Assert.That(BuiltMachine(scriptable: false).Condition, Is.EqualTo(1f),
                "authoring MOSS-darkness must not also wreck the device — the two fields are separate");
        }

        // ------------------------------------------------------------ 4. the domain check

        [Test]
        public void ConditionAboveOne_IsAnAuthoringError()
        {
            Assert.Throws<System.ArgumentException>(() => BuiltMachine(condition: 1.5f),
                "the builder fails broken plans at boot, not mid-game (its own header) — and a " +
                "Condition above 1 would silently give a device EffectiveRate > 1 forever");
        }

        [Test]
        public void ConditionBelowZero_IsAnAuthoringError()
        {
            Assert.Throws<System.ArgumentException>(() => BuiltMachine(condition: -0.5f));
        }

        [Test]
        public void ConditionNaN_IsAnAuthoringError()
        {
            // Written separately because `< 0 || > 1` is the obvious spelling of the check and it
            // lets NaN through — every comparison against NaN is false.
            Assert.Throws<System.ArgumentException>(() => BuiltMachine(condition: float.NaN));
        }

        // ------------------------------------------------------------ 5. driven to a consumer

        [Test]
        public void AuthoredDamage_IsRecruitedByMaintenance_AndPristineIsNot()
        {
            // End-to-end past the builder: an authored Condition is not merely stored, it changes
            // what the sim DOES. Scrubber maintain_below is 0.4 (machines.def), so 0.2 wants a
            // service and 1.0 does not. No MachineWearSystem in the stack, so nothing else can
            // move Condition and nothing can make a pristine machine drift into the needy set.
            var systems = new ISimSystem[]
            {
                new CitizenSystem(), new JobSystem(), new MaintenanceSystem(),
            };

            int damaged = MaintainTicks(condition: 0.2f, systems: systems);
            int pristine = MaintainTicks(condition: null, systems: systems);

            Assert.That(damaged, Is.GreaterThan(0),
                "a device authored at Condition 0.2 must be recruited for by MaintenanceSystem — " +
                "if this is 0 the field reached the Device object but means nothing to the sim");
            Assert.That(pristine, Is.EqualTo(0),
                "the SAME fixture with no authored damage must never be serviced — this is what " +
                "makes the leg above a measurement of the authored value rather than of the fixture");
        }

        private static int MaintainTicks(float? condition, ISimSystem[] systems)
        {
            var sim = ShipPlanBuilder.Build(BayPlan(condition), systems);
            sim.JobsDirty = JobBoardDirty.All;
            var crew = sim.Citizens.Items;
            int ticks = 0;
            for (int t = 0; t < 400; t++)
            {
                sim.Tick();
                for (int i = 0; i < crew.Count; i++)
                    if (crew[i].JobKind == JobKind.Maintain) ticks++;
            }
            return ticks;
        }

        // ------------------------------------------------------------ 6. the shipped ships did not move

        /// <summary>THE MATCHER. Both the guard and its inclusion controls call this one function,
        /// so "the guard would catch a wreck" is proved about the code the guard actually runs.</summary>
        private static List<string> NonPristineDevices(Simulation sim, string ship)
        {
            var offenders = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Condition != 1f)
                    offenders.Add($"{ship}: {d.Name} ({d.Kind}) Condition=" +
                                  d.Condition.ToString("R", CultureInfo.InvariantCulture));
                if (d.Scriptable != true)
                    offenders.Add($"{ship}: {d.Name} ({d.Kind}) Scriptable=false");
            }
            return offenders;
        }

        private static readonly string[] ShipNames = { "grid", "slice", "perilune" };

        private static ShipPlan PlanOf(string ship) =>
            ship == "grid" ? AuthoredShips.PeriluneGrid() :
            ship == "slice" ? AuthoredShips.PeriluneSlice() :
            AuthoredShips.Perilune();

        [Test]
        public void ShippedShips_BootPristine()
        {
            var offenders = new List<string>();
            var census = new List<string>();
            var empty = new List<string>();
            foreach (var ship in ShipNames)
            {
                var sim = ShipPlanBuilder.Build(PlanOf(ship), Stack());
                int count = sim.Devices.Items.Count;
                if (count == 0) empty.Add(ship);
                census.Add($"{ship}: {count} devices");
                offenders.AddRange(NonPristineDevices(sim, ship));
            }

            // The premise, asserted ONCE over all three rather than per-ship inside the loop: a
            // per-ship `Assert` throws on the first empty ship and the other two are never even
            // built, so "grid is fine" would hide "perilune boots deviceless".
            Assert.That(empty, Is.Empty,
                "fixture: these ships boot with no devices, so the census below asserts nothing " +
                "about them: " + string.Join(", ", empty));

            // ONE assert over ALL THREE ships, so a failure on `perilune` cannot be hidden behind
            // a failure on `grid` — and every offender is named, not just counted.
            Assert.That(offenders, Is.Empty,
                "every device on every shipped ship must still boot Condition = 1 and " +
                "Scriptable = true. W1 adds authoring plumbing and authors NO damage.\n" +
                "census: " + string.Join(", ", census) + "\n" +
                "offenders:\n  " + string.Join("\n  ", offenders));
        }

        [Test]
        public void ShippedShipPlans_AuthorNeitherField()
        {
            // The same guarantee one level UP, at the plan. The built-sim census above would still
            // pass if a helper started emitting `Condition = 1f` explicitly; this one would not,
            // and it is the leg that notices if a future call site passes the new optional
            // arguments to Dev()/Place() by accident.
            var offenders = new List<string>();
            foreach (var ship in ShipNames)
            {
                var plan = PlanOf(ship);
                Assert.That(plan.Devices.Count, Is.GreaterThan(0), $"fixture: {ship} authors devices");
                for (int i = 0; i < plan.Devices.Count; i++)
                {
                    var s = plan.Devices[i];
                    if (s.Condition.HasValue) offenders.Add($"{ship}: {s.Name} authors Condition");
                    if (s.Scriptable.HasValue) offenders.Add($"{ship}: {s.Name} authors Scriptable");
                }
            }
            Assert.That(offenders, Is.Empty,
                "no shipped ship may author damage in W1:\n  " + string.Join("\n  ", offenders));
        }

        // ---------------------------------------------- the census' non-vacuity: INCLUSION tests

        /// <summary>Plant a wreck in a real grid plan and require <see cref="NonPristineDevices"/>
        /// to return it. Without this the census above is a matcher that walked 1250 devices and
        /// found nothing — which proves it ran, never that it can see.</summary>
        [Test]
        public void Census_Catches_APlantedWreck()
        {
            var plan = AuthoredShips.PeriluneGrid();
            int at = plan.Devices.Count / 2;
            var spec = plan.Devices[at];
            string name = spec.Name;
            spec.Condition = 0.3f;
            plan.Devices[at] = spec;   // struct: write it back or the mutation evaporates

            var offenders = NonPristineDevices(ShipPlanBuilder.Build(plan, Stack()), "grid");
            Assert.That(offenders.Count, Is.EqualTo(1),
                "the census must return the planted wreck and nothing else");
            Assert.That(offenders[0], Does.Contain(name).And.Contain("Condition="),
                "and it must name the device it caught");
        }

        [Test]
        public void Census_Catches_APlantedUncommissionedDevice()
        {
            var plan = AuthoredShips.PeriluneGrid();
            int at = plan.Devices.Count / 3;
            var spec = plan.Devices[at];
            string name = spec.Name;
            spec.Scriptable = false;
            plan.Devices[at] = spec;

            var offenders = NonPristineDevices(ShipPlanBuilder.Build(plan, Stack()), "grid");
            Assert.That(offenders.Count, Is.EqualTo(1));
            Assert.That(offenders[0], Does.Contain(name).And.Contain("Scriptable=false"));
        }

        // ------------------------------------------------------------ 7. the helpers stayed inert

        /// <summary>The three authoring helpers grew optional arguments. Their DEFAULTS must emit
        /// the same spec they emitted before W1 — that is what keeps every existing call site
        /// (well over a thousand of them) byte-identical.</summary>
        [Test]
        public void RoomDresserPlace_DefaultsToSayingNothing()
        {
            // The eight furniture kinds below are placed EXCLUSIVELY by RoomDresser.Place — they
            // appear nowhere else in sim/Sim.Gen — so a census restricted to them is a census of
            // Place()'s output. Without this leg, "no shipped ship authors either field" is a
            // claim about the union of three helpers with no evidence that Place() is in the
            // union at all: if Place's defaults changed and the grid ship happened to carry no
            // furniture, the plan census would stay green.
            var plan = AuthoredShips.PeriluneGrid();
            var offenders = new List<string>();
            int dressed = 0;
            for (int i = 0; i < plan.Devices.Count; i++)
            {
                var s = plan.Devices[i];
                if (!RoomDresserKinds(s.Kind)) continue;
                dressed++;
                if (s.Condition.HasValue) offenders.Add($"{s.Name} authors Condition");
                if (s.Scriptable.HasValue) offenders.Add($"{s.Name} authors Scriptable");
            }
            Assert.That(dressed, Is.GreaterThan(0),
                "fixture: the grid ship must carry RoomDresser furniture, or this leg is vacuous");
            Assert.That(offenders, Is.Empty,
                $"Place() must default to saying nothing ({dressed} furniture specs walked):\n  " +
                string.Join("\n  ", offenders));
        }

        private static bool RoomDresserKinds(DeviceKind k) =>
            k == DeviceKind.Bed || k == DeviceKind.Table || k == DeviceKind.Chair ||
            k == DeviceKind.Locker || k == DeviceKind.Desk || k == DeviceKind.PlantPot ||
            k == DeviceKind.MedBed || k == DeviceKind.MedCabinet;
    }
}
