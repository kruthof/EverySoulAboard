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
    ///
    /// ⚠️ THE HONEST COUNT IS 29 GUARDS + 1 CHARACTERISATION TEST, NOT 30 GUARDS.
    /// (17 + 1 before the two §5 MOSS legs; 19 + 1 before M3-16 added <b>ten</b>: the §2b round-trip
    /// and domain legs for <c>DeviceSpec.Rate</c>/<c>.Faulted</c>, and the two inclusion controls
    /// for the census' new columns — <see cref="Census_Catches_APlantedRateZeroDevice"/> and
    /// <see cref="Census_Catches_APlantedFaultedDevice"/>. A new COLUMN in the matcher without a
    /// planted violation of its own would be exactly the fourth trap shape, one row lower down.)
    /// <see cref="DefaultDeviceSpec_SaysNothingAboutEitherField"/> documents the premise the
    /// encoding rests on and NO source mutation can redden it — every way of breaking that premise
    /// stops this file compiling, which is a crash and not a semantic red. It is labelled in place
    /// rather than counted. <see cref="RoomDresserPlace_DefaultsToSayingNothing"/> is a guard, but a
    /// hedging one: nothing reddens it alone on today's ships (see its own note).
    ///
    /// ⚠️ BOTH FIELDS ARE DRIVEN TO A CONSUMER, AND THAT SYMMETRY IS THE POINT OF §5.
    /// <see cref="DeviceSpec.Condition"/> changes what the sim DOES (MaintenanceSystem recruits at
    /// 0.2 and not at 1.0); <see cref="DeviceSpec.Scriptable"/> changes what it CAN BE TOLD (an
    /// authored-dark device gets no MOSS adapter through the real host boot). Without the second,
    /// every Scriptable leg here would stop at "the bool reached the Device object" —
    /// present-and-INERT, which CLAUDE.md's verb-parity lesson says is indistinguishable from
    /// working.
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

        /// <summary>The fixture device's name. Hoisted to a constant because §5's MOSS legs look
        /// it up in the DeviceRegistry by name, and a plan/lookup name that drifted apart would
        /// make the dark leg pass for the wrong reason (an unregistered name never resolves) —
        /// which is exactly what the control leg exists to catch.</summary>
        private const string MachineName = "scrubber_bay";

        /// <summary>The fixture plan. <paramref name="condition"/>/<paramref name="scriptable"/>
        /// are passed STRAIGHT THROUGH to the one <see cref="DeviceSpec"/>, including null — which
        /// is what makes the control legs below a control: the unspecified case travels the exact
        /// same code path as the specified one and differs only in the field's value.</summary>
        private static ShipPlan BayPlan(float? condition = null, bool? scriptable = null,
                                        float? rate = null, bool? faulted = null)
        {
            var plan = new ShipPlan { Name = "w1_bay", Seed = 20260728UL, DeckRows = OneBay };
            plan.Rooms.Add(new RoomSpec { Anchor = "bay", Type = RoomType.None, Probe = new Int3(1, 1, 0) });
            plan.PressurizedAnchors.Add("bay");
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.Scrubber, Pos = MachineTile, Name = MachineName,
                Condition = condition, Scriptable = scriptable,
                Rate = rate, Faulted = faulted,          // M3-16 (OD-O), same pass-through contract
            });
            plan.Citizens.Add(new CitizenSpec { Name = "Adeyemi", Pos = CrewTile });
            return plan;
        }

        private static Device BuiltMachine(float? condition = null, bool? scriptable = null,
                                           ISimSystem[] systems = null,
                                           float? rate = null, bool? faulted = null)
        {
            var sim = ShipPlanBuilder.Build(BayPlan(condition, scriptable, rate, faulted),
                                            systems ?? new ISimSystem[0]);
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
            // M3-16's two fields, on the same premise. ⚠️ `Rate` is the one that would repeat W1's
            // near-miss exactly: a plain `float Rate` reads 0f out of zeroed memory, so every vent,
            // scrubber and reclaimer in the repo would boot at zero throughput.
            Assert.That(zeroed.Rate.HasValue || zeroed.Faulted.HasValue ||
                        authored.Rate.HasValue || authored.Faulted.HasValue, Is.False,
                "an unmentioned Rate/Faulted must be 'unspecified' whichever way the struct is created");
        }

        // ------------------------------------------------------------ 3. the two fields are independent

        // ------------------------------- 2b. M3-16 (OD-O): the same round trip for the two new fields
        //
        // ⚠️ THEY ARE HERE AND NOT IN `BoardFaultTests` ON PURPOSE. This file is the coverage home
        // for `DeviceSpec`'s optional-authoring contract, and the risk it exists to close is the
        // ENCODING one: a plain `float Rate` reads 0f out of zeroed memory and would boot every
        // vent, scrubber and reclaimer in the repo at zero throughput — W1's own "boot the whole
        // repo WRECKED" argument, one field over. `BoardFaultTests` owns what the FAULT does.

        [Test]
        public void AuthoredRateZero_ReachesTheBuiltDevice()
        {
            Assert.That(BuiltMachine(rate: 0f).Rate, Is.EqualTo(0f),
                "a plan authoring Rate = 0 must produce a device at 0 — and 0 must be an authorable " +
                "value, not the encoding's 'unset'. This is the fault's visible half on the wreck.");
        }

        [Test]
        public void UnspecifiedSpec_LeavesRatePristine()
        {
            Assert.That(BuiltMachine().Rate, Is.EqualTo(1f),
                "a spec that says nothing about Rate must leave Device's own 1f initialiser alone — " +
                "otherwise every machine on every ship boots at zero throughput");
        }

        [Test]
        public void AuthoredFaultedTrue_ReachesTheBuiltDevice()
        {
            Assert.That(BuiltMachine(faulted: true).Faulted, Is.True,
                "a plan authoring Faulted = true must produce a device with a dead controller board");
        }

        [Test]
        public void UnspecifiedSpec_LeavesTheBoardAlive()
        {
            Assert.That(BuiltMachine().Faulted, Is.False,
                "a spec that says nothing about Faulted must leave Device's own `false` alone — OD-O " +
                "item (iii): the fault is ONE authored instance, never a property of devices");
        }

        [Test]
        public void AuthoringRate_DisturbsNothingElse()
        {
            var d = BuiltMachine(rate: 0f);
            Assert.That(d.Condition, Is.EqualTo(1f), "authoring a rate must not wreck the device");
            Assert.That(d.Scriptable, Is.True, "…nor un-commission it");
            Assert.That(d.Faulted, Is.False, "…nor fault it: rate 0 and a dead board are SEPARATE facts, " +
                "which is design question (a) option 3 refused in code rather than in prose");
        }

        // The Rate domain check, mirroring Condition's three legs above and carrying the same
        // caveats: it is an AUTHORING-TIME TYPO-CATCH over this one writer, not an invariant on
        // `Device.Rate` (SaveReader reads a raw Single unclamped; SetDeviceStateCommand clamps).

        [Test]
        public void RateAboveOne_IsAnAuthoringError()
        {
            Assert.Throws<System.ArgumentException>(() => BuiltMachine(rate: 1.5f),
                "a Rate above 1 would silently give a device EffectiveRate > 1 forever");
        }

        [Test]
        public void RateBelowZero_IsAnAuthoringError()
        {
            Assert.Throws<System.ArgumentException>(() => BuiltMachine(rate: -0.5f),
                "a negative Rate would make a vent REMOVE gas from its own room");
        }

        [Test]
        public void RateNaN_IsAnAuthoringError()
        {
            // The leg that pins the `!(a >= 0f && a <= 1f)` FORM: written as `< 0 || > 1` this
            // passes, and a NaN rate poisons every mole the device ever injects.
            Assert.Throws<System.ArgumentException>(() => BuiltMachine(rate: float.NaN),
                "NaN is neither below 0 nor above 1 — the guard must be written as a negated " +
                "in-range test or it lets NaN through");
        }

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
        //
        // ⚠️ WHAT THESE THREE LEGS PIN, AND WHAT THEY DO NOT. They pin an AUTHORING-TIME TYPO-CATCH
        // — the builder refuses a plan whose Condition is outside 0..1, in the same spirit as its
        // bounds/wall/anchor checks. They are NOT an invariant on `Device.Condition`, and reading
        // them as one would be wrong: `SaveReader.cs:307` reads Condition as a raw Single with no
        // clamp, and `MachineWearSystem.cs:280/284` write def scalars unguarded, so an out-of-range
        // Condition can still reach a live device by a route that never passes the builder. See the
        // comment beside the check in ShipPlanBuilder for the full list of writers.

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
            // what the sim DOES. Scrubber maintain_below is 0.4 (machines.def), so 0.3 wants a
            // service and 1.0 does not. No MachineWearSystem in the stack, so nothing else can
            // move Condition and nothing can make a pristine machine drift into the needy set.
            //
            // ⚠️ THIS LEG READ 0.2 UNTIL THE RECOVERY-ECONOMY LANE MERGED, AND 0.2 STOPPED
            // MEANING WHAT IT MEANT. wear.wreck_threshold = 0.25 refuses an empty-handed jury-rig
            // below the floor, and this fixture holds no Parts, Seals or Swarf — so at 0.2 the
            // machine is correctly NEVER RECRUITED FOR and this leg went red on a clean auto-merge
            // that git reported no conflict on. 0.3 is above the wreck floor and below maint, which
            // is the band this leg was always measuring: "an authored Condition changes what the
            // sim does". The subject is unchanged; only the value that expresses it moved.
            // The behaviour that displaced it is not lost — it is pinned by the sibling leg below.
            var systems = new ISimSystem[]
            {
                new CitizenSystem(), new JobSystem(), new MaintenanceSystem(),
            };

            int damaged = MaintainTicks(condition: 0.3f, systems: systems);
            int pristine = MaintainTicks(condition: null, systems: systems);

            Assert.That(damaged, Is.GreaterThan(0),
                "a device authored at Condition 0.3 must be recruited for by MaintenanceSystem — " +
                "if this is 0 the field reached the Device object but means nothing to the sim");
            Assert.That(pristine, Is.EqualTo(0),
                "the SAME fixture with no authored damage must never be serviced — this is what " +
                "makes the leg above a measurement of the authored value rather than of the fixture");
        }

        /// <summary>
        /// <b>THE MERGE, PINNED.</b> Two lanes landed within a day of each other: authored damage
        /// (a ship can boot wrecked) and the recovery economy (a wrecked machine cannot be wished
        /// better). <b>Git reported no conflict and they still disagreed</b> — the sibling leg above
        /// authored 0.2, which the wreck floor at 0.25 now refuses, and it went red on the merge.
        ///
        /// <para>This leg states the merged truth so it can never be discovered by accident again:
        /// authored damage BELOW <c>wear.wreck_threshold</c> is <b>inert on a ship with no
        /// consumable</b> — never recruited for, never serviced — and becomes serviceable the
        /// instant one exists. Both halves are needed. Without the second, "never recruited" is
        /// indistinguishable from a fixture that could not maintain anything at all (the fourth
        /// trap shape: an inclusion control, not a population count).</para>
        ///
        /// <para><b>THIS IS THE DESIGNED BEHAVIOUR AND ALSO A LIVE CONSEQUENCE FOR THE WRECK
        /// SHIP.</b> A ship authored at 0.02–0.35 boots with most of its machines below the floor,
        /// so nothing services them until the player salvages — which is the premise. It is
        /// recorded here because the two lanes were written without knowledge of each other.</para>
        /// </summary>
        [Test]
        public void AuthoredDamageBelowTheWreckFloor_IsInertUntilAConsumableExists()
        {
            var systems = new ISimSystem[]
            {
                new CitizenSystem(), new JobSystem(), new MaintenanceSystem(),
            };
            float floor = SimDefs.Default.Wear.WreckThreshold;
            const float Wrecked = 0.2f;   // the value the sibling leg used to carry
            Assert.That(Wrecked, Is.LessThan(floor), "premise: the fixture really is below the floor");

            int bareHanded = MaintainTicks(condition: Wrecked, systems: systems);
            int withParts = MaintainTicks(condition: Wrecked, systems: systems, seedParts: true);

            Assert.Multiple(() =>
            {
                Assert.That(bareHanded, Is.EqualTo(0),
                    "a machine authored BELOW wear.wreck_threshold on a ship holding no Parts, " +
                    "Seals or Swarf must never be recruited for — that is the wreck rule, and it " +
                    "is what silently displaced the sibling leg's 0.2");
                Assert.That(withParts, Is.GreaterThan(0),
                    "INCLUSION CONTROL: the IDENTICAL fixture with one Parts stack on the floor " +
                    "MUST be serviced. Without this, the assertion above would also pass on a " +
                    "fixture where maintenance could never run — wrong systems, no crew, no room.");
            });
        }

        private static int MaintainTicks(float? condition, ISimSystem[] systems, bool seedParts = false)
        {
            var sim = ShipPlanBuilder.Build(BayPlan(condition), systems);
            // M2-2 (OD-H): work boots off, so the fixture's crew member is never recruited for a
            // service until she is given Repair. This helper's whole output is MAINTAIN TICKS —
            // the observable both callers key on — so an unenrolled fixture would return 0 for a
            // reason that has nothing to do with the authored Condition it is measuring.
            sim.GiveAllCrewAllWork();
            if (seedParts) sim.AddItem(ItemKind.Parts, 1, CrewTile);
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

        // ---- and the same for Scriptable: does an authored `false` change what the sim CAN BE TOLD?

        /// <summary>Boot <see cref="BayPlan"/> through the REAL host pipeline —
        /// <see cref="GenSimHost.Build"/>, which is <see cref="ShipPlanBuilder.Build"/> followed by
        /// <see cref="MossBindings.RegisterAdapters"/>, in that order, the same four steps
        /// <c>SimHost</c> takes — and report whether MOSS can address the fixture device by name.
        ///
        /// ⚠️ IT MUST BE THE HOST AND NOT A HAND-ORDERED PAIR OF CALLS. The hazard this leg exists
        /// for is an ORDERING one: <see cref="ShipPlanBuilder.Build"/> creates the device with
        /// <c>sim.AddDevice</c> and writes <c>device.Scriptable</c> a couple of dozen lines LATER,
        /// so a pipeline that registered adapters any earlier would leave an authored-dark device
        /// silently MOSS-addressable. A test that called <c>RegisterAdapters</c> itself would be
        /// asserting about the order IT chose, which is the one order that cannot be wrong.
        /// Registration is also not a one-time boot step in this repo — <c>GameSession</c> re-runs
        /// it mid-game, for commissioning — so the seam is live, not theoretical.</summary>
        private static bool IsMossAddressable(bool? scriptable)
        {
            var host = GenSimHost.Build(BayPlan(scriptable: scriptable));
            Assert.That(host.Sim.Devices.Items.Count, Is.EqualTo(1),
                "fixture: exactly one device, so the registry lookup below cannot resolve a bystander");
            return host.Registry.TryResolve(MachineName, out _);
        }

        [Test]
        public void AuthoredScriptableFalse_KeepsTheDeviceOutOfTheMossRegistry()
        {
            // The counterpart to the Maintenance leg above, and the reason this section is called
            // "driven to a consumer": without it every Scriptable assertion in this file stops at
            // "the bool reached the Device object", which is the present-and-INERT shape CLAUDE.md's
            // verb-parity lesson is about. `MossBindings.cs:28`'s `if (!device.Scriptable) continue;`
            // is the consumer; this is the leg that says the authored value reaches it.
            Assert.That(IsMossAddressable(scriptable: false), Is.False,
                "an authored Scriptable = false device must get NO MOSS adapter. If this resolves, " +
                "the builder writes the flag after adapters are already registered, a wreck's MOSS " +
                "is addressable at boot when the whole premise is that it is dark — and no shipped " +
                "ship authors the field, so ShippedShips_BootPristine cannot see it.");
        }

        [Test]
        public void UnauthoredDevice_IsMossAddressable()
        {
            // THE CONTROL, and it is its own [Test] rather than a second leg of the one above
            // because `Assert` throws: a second leg only ever reports when the first one passes,
            // so a dead control is indistinguishable from a live one (the fifth trap shape). Split
            // this way, each fires on its own by construction — measured as M11/M12 in the harness,
            // where each mutation reddens exactly one of the two.
            //
            // Without it the leg above would pass for any reason a name fails to resolve: a typo in
            // the fixture name, a DeviceKind dropped from MossBindings' switch, a host that stopped
            // calling RegisterAdapters at all. Same fixture, same code path, one field different.
            Assert.That(IsMossAddressable(scriptable: null), Is.True,
                "the SAME fixture with no authored Scriptable must be MOSS-addressable — this is " +
                "what makes the leg above a measurement of the authored value rather than of a " +
                "device that was never registrable in the first place");
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
                // ⭐ M3-16 (OD-O) WIDENED WHAT "AUTHORED DAMAGE" MEANS, so the matcher grew two
                // columns. This is not tidiness: `DeviceSpec.Rate` and `.Faulted` ride exactly the
                // same Nullable encoding and exactly the same builder path as the two above, so a
                // census that walked only Condition/Scriptable would have declared the three pinned
                // ships pristine while one of them booted at rate 0 with a dead board — and both of
                // those move P1/P2/P3.
                if (d.Rate != 1f)
                    offenders.Add($"{ship}: {d.Name} ({d.Kind}) Rate=" +
                                  d.Rate.ToString("R", CultureInfo.InvariantCulture));
                if (d.Faulted)
                    offenders.Add($"{ship}: {d.Name} ({d.Kind}) Faulted=true");
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
                    // M3-16's two fields — same encoding, same builder path, same census.
                    if (s.Rate.HasValue) offenders.Add($"{ship}: {s.Name} authors Rate");
                    if (s.Faulted.HasValue) offenders.Add($"{ship}: {s.Name} authors Faulted");
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

        /// <summary>M3-16 — the <c>Rate</c> column's own inclusion control. A new column in a census
        /// is a matcher nobody has proved can see; this plants a rate-0 device in a real grid plan
        /// and requires the same <see cref="NonPristineDevices"/> to return it.</summary>
        [Test]
        public void Census_Catches_APlantedRateZeroDevice()
        {
            var plan = AuthoredShips.PeriluneGrid();
            int at = plan.Devices.Count / 4;
            var spec = plan.Devices[at];
            string name = spec.Name;
            spec.Rate = 0f;
            plan.Devices[at] = spec;

            var offenders = NonPristineDevices(ShipPlanBuilder.Build(plan, Stack()), "grid");
            Assert.That(offenders.Count, Is.EqualTo(1),
                "the census must return the planted rate-0 device and nothing else: " +
                string.Join(", ", offenders));
            Assert.That(offenders[0], Does.Contain(name).And.Contain("Rate="));
        }

        /// <summary>M3-16 — the <c>Faulted</c> column's own inclusion control, on a PINNED ship. A
        /// fault authored on grid/slice/perilune is a re-pin of P1/P2/P3, so this column is the one
        /// that has to be able to see.</summary>
        [Test]
        public void Census_Catches_APlantedFaultedDevice()
        {
            var plan = AuthoredShips.PeriluneGrid();
            int at = plan.Devices.Count / 5;
            var spec = plan.Devices[at];
            string name = spec.Name;
            spec.Faulted = true;
            plan.Devices[at] = spec;

            var offenders = NonPristineDevices(ShipPlanBuilder.Build(plan, Stack()), "grid");
            Assert.That(offenders.Count, Is.EqualTo(1),
                "the census must return the planted faulted device and nothing else: " +
                string.Join(", ", offenders));
            Assert.That(offenders[0], Does.Contain(name).And.Contain("Faulted=true"));
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
            // Place()'s output.
            //
            // ⚠️ HONEST SCOPE: THIS LEG CLOSES NO GAP THAT IS OPEN TODAY, AND NO MUTATION REDDENS
            // IT ALONE. On today's ships the grid DOES carry RoomDresser furniture, so every
            // mutation that reaches Place's defaults (harness RM4) reddens this leg and
            // ShippedShipPlans_AuthorNeitherField together — that broader census already covers
            // Place, and this one adds nothing to it. It is a HEDGE AGAINST A FUTURE SHIP, not a
            // load-bearing guard: the day the grid ship stops carrying RoomDresser furniture, the
            // broader census would go silent about Place() while staying green, and this leg's
            // `dressed > 0` fixture assertion is what says so out loud instead of passing
            // vacuously. Keep it for that day; do not count it among the guards that bite on
            // today's tree.
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
                if (s.Rate.HasValue) offenders.Add($"{s.Name} authors Rate");
                if (s.Faulted.HasValue) offenders.Add($"{s.Name} authors Faulted");
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
