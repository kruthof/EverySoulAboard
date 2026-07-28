using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Glyph;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// W3 of the wreck start — <c>--ship wreck</c>, the authored ship the opening happens on.
    /// Design of record: <c>docs/design/perilune-wreck-start.plan.md</c> revision 2.
    ///
    /// ⚠️ EVERY EXPECTATION HERE IS WRITTEN OUT BY HAND AND NEVER READ FROM THE
    /// <see cref="AuthoredShips"/> CONSTANT IT CHECKS. A test that derives its expected value from
    /// the authoring constant cannot fail when that constant changes — the recurring review defect
    /// in this repo, and one <see cref="GridWreckTests"/> was caught committing (with the wreck
    /// depth read from the constant, halving the collapse left every test green). These literals
    /// ARE the pin: changing the ship's content means changing them in the same commit, on purpose.
    ///
    /// ⚠️ EVERY LEG IS ITS OWN <c>[Test]</c> WHEREVER IT CAN BE. <c>Assert</c> throws, so only the
    /// first failing leg of a multi-leg test ever reports and a leg that cannot bite is
    /// indistinguishable from one that can (CLAUDE.md, the fifth trap shape). The few tests that do
    /// loop accumulate offenders into one list and assert ONCE, so nothing hides behind an earlier
    /// failure.
    ///
    /// ⚠️ THE SHIP IS DRIVEN, NOT ONLY READ. A plan census proves what was authored; it proves
    /// nothing about whether the one crew member lives through the night, whether the cryo bay
    /// freezes, or whether the ladder to the vacuum deck is a death trap. Those three are driven
    /// against the real system stack — that is the E0-4 lesson (a ship that HAS content no crew can
    /// reach is not playable) and the whole reason this file is slower than a census would be.
    ///
    /// ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT TEST: a thaw. There is no <c>CryoSystem</c>, no
    /// <c>ThawCommand</c> and no MOSS thaw op in this lane — pods are visible, INERT props. A pod
    /// that will not open is correct today. That is W5.
    /// </summary>
    public class WreckShipTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static Simulation Boot() => ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());

        // ---------------------------------------------------------------- the hand-written pins

        private const int Decks = 2;
        private const int PodCount = 12;
        private const int PodsOpen = 1;          // the capsule the player's crew member stepped out of
        private const int PodsWreckedDead = 4;   // a wrecked OCCUPIED pod holds a DEAD sleeper (owner)
        private const int PodsIntactOccupied = 7;
        /// <summary>⭐ EIGHT LIVING SOULS — the owner's design target and the roster a won game ends
        /// with: the one already awake plus the seven still to be thawed. NOT a tuning parameter;
        /// the four WRECKED capsules beside them are.</summary>
        private const int LivingSouls = 8;
        /// <summary>Working scrubbers a full roster needs: scrubber_mol_per_second 0.001 against
        /// co2_per_person_per_second 2.73e-4 is ~3.66 crew each, so eight crew needs three. Written
        /// out by hand for the same reason every other literal here is.</summary>
        private const int ScrubbersForAFullRoster = 3;
        private const string AwakeCrew = "Rell";
        private const string CryoAnchor = "cryobay";
        private const string ReactorAnchor = "reactor";
        private const string SpineAnchor = "wreck_spine_0";
        private const string GoalAnchor = "hall_d0_s1";
        private const string MossTerminal = "term_moss";
        private const int DebrisTiles = 80;     // 4 collapsed slots × 2 rows × 10 columns

        /// <summary>The wreck floor and the pod's own fail threshold, restated by hand. Both are
        /// def values this ship is authored AGAINST, so reading them from <c>SimDefs</c> here would
        /// make every census below track a def change instead of catching one.</summary>
        private const float WreckThreshold = 0.25f;
        private const float CryoPodFailBelow = 0.10f;

        [Test]
        public void TheseTestsPinTheAuthoredShip_NotTheOtherWayRound()
        {
            var plan = AuthoredShips.PeriluneWreck();
            Assert.That(Decks, Is.EqualTo(AuthoredShips.WreckDepth), "the ship changed deck count");
            Assert.That(PodsOpen + PodsWreckedDead + PodsIntactOccupied, Is.EqualTo(PodCount),
                "the pod census does not add up");
            Assert.That(PodsOpen + PodsIntactOccupied, Is.EqualTo(LivingSouls),
                "EIGHT living souls is the design target — the open capsule plus the seven thawable " +
                "ones. If this line fails, someone has traded a crew member for set dressing.");
            int scrubbersNeeded = (int)Math.Ceiling(
                LivingSouls * SimDefs.Default.Atmosphere.CO2PerPersonPerSecond
                            / SimDefs.Default.Atmosphere.ScrubberMolPerSecond);
            Assert.That(ScrubbersForAFullRoster, Is.EqualTo(scrubbersNeeded),
                "the scrubber arithmetic moved: at today's defs eight crew need " + scrubbersNeeded +
                " working scrubbers, not " + ScrubbersForAFullRoster + ". The ship is authored " +
                "against this number — re-read the life-support block in AuthoredShips.");
            Assert.That(AwakeCrew, Is.EqualTo(AuthoredShips.WreckCrewName), "the crew member was renamed");
            Assert.That(CryoAnchor, Is.EqualTo(AuthoredShips.WreckCryoAnchor));
            Assert.That(ReactorAnchor, Is.EqualTo(AuthoredShips.WreckReactorAnchor));
            Assert.That(GoalAnchor, Is.EqualTo(AuthoredShips.WreckGoalAnchor));
            Assert.That(plan.DeckRows.Length, Is.EqualTo(Decks));
            Assert.That(WreckThreshold, Is.EqualTo(SimDefs.Default.Wear.WreckThreshold),
                "wear.wreck_threshold moved — this ship is authored against it, re-read the header");
            Assert.That(CryoPodFailBelow, Is.EqualTo(SimDefs.Default.Machines[(int)DeviceKind.CryoPod].FailBelow),
                "the CryoPod fail threshold moved — the two wrecked pods may no longer read as dead");
        }

        // ---------------------------------------------------------------------- 1. the pods

        private static List<Device> Pods(Simulation sim)
        {
            var pods = new List<Device>(16);
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.CryoPod) pods.Add(devices[i]);
            return pods;
        }

        [Test]
        public void CryoBay_HoldsTwelveCapsules()
        {
            Assert.That(Pods(Boot()).Count, Is.EqualTo(PodCount));
        }

        [Test]
        public void PodCensus_IsOneOpen_FourWrecked_SevenIntact()
        {
            var pods = Pods(Boot());
            int open = 0, wrecked = 0, intact = 0;
            var oddities = new List<string>();
            foreach (var p in pods)
            {
                if (p.IsOpen) { open++; continue; }
                if (p.Condition < CryoPodFailBelow) { wrecked++; continue; }
                if (p.Condition >= WreckThreshold) { intact++; continue; }
                oddities.Add($"{p.Name} Condition={p.Condition.ToString("R", CultureInfo.InvariantCulture)} " +
                             "is neither wrecked (below fail) nor intact (at or above the wreck floor)");
            }

            // Asserted ONCE, over the whole census, so a pod in the ambiguous middle band is
            // reported by name rather than swallowed by whichever count it fell into.
            Assert.That(oddities, Is.Empty, string.Join("\n  ", oddities));
            Assert.That(open, Is.EqualTo(PodsOpen), "open pods");
            Assert.That(wrecked, Is.EqualTo(PodsWreckedDead), "wrecked pods (dead sleepers)");
            Assert.That(intact, Is.EqualTo(PodsIntactOccupied), "intact occupied pods");
            Assert.That(open + intact, Is.EqualTo(LivingSouls),
                "⭐ EIGHT LIVING SOULS is the owner's design target: the pawn who is already awake " +
                "plus the seven W5 will thaw one at a time. A wrecked capsule is set dressing with " +
                "a body in it and must never be counted against this number.");
        }

        [Test]
        public void WreckedPods_ReadAsDead_AndCannotBeBodgedForFree()
        {
            foreach (var p in Pods(Boot()))
            {
                if (p.IsOpen || p.Condition >= CryoPodFailBelow) continue;
                Assert.That(p.IsOperational(SimDefs.Default), Is.False,
                    $"{p.Name}: a wrecked capsule must be INOPERATIVE, which is what paints it Broken");
                Assert.That(p.Condition, Is.LessThan(WreckThreshold),
                    $"{p.Name}: a wrecked capsule must be below the wreck floor, or MaintenanceSystem " +
                    "would bodge it back for free with empty hands and the loss would cost nothing");
            }
        }

        [Test]
        public void EachWreckedPod_CarriesACorpseOnItsOwnTile_NamedForTheSleeper()
        {
            var sim = Boot();
            var missing = new List<string>();
            foreach (var p in Pods(sim))
            {
                if (p.IsOpen || p.Condition >= CryoPodFailBelow) continue;
                bool found = false;
                var items = sim.Items.Items;
                for (int i = 0; i < items.Count; i++)
                    if (items[i].Kind == ItemKind.Corpse && items[i].Pos == p.Pos &&
                        !string.IsNullOrEmpty(items[i].Label)) found = true;
                if (!found) missing.Add(p.Name);
            }
            Assert.That(missing, Is.Empty,
                "a wrecked occupied pod holds a DEAD sleeper (owner decision) and the corpse item is " +
                "the only way the sim has to say so: " + string.Join(", ", missing));

            int corpses = 0;
            var all = sim.Items.Items;
            for (int i = 0; i < all.Count; i++) if (all[i].Kind == ItemKind.Corpse) corpses++;
            Assert.That(corpses, Is.EqualTo(PodsWreckedDead), "one body per wrecked pod and no others");
        }

        /// <summary>The death reaches the player as a ship's-log line and NOT as a synthesised
        /// <c>CitizenDiedEvent</c> — see <see cref="ShipPlan.LogLines"/> for why that distinction is
        /// load-bearing. Driven through the real <see cref="HistorySystem"/>.</summary>
        [Test]
        public void EachDeadSleeper_GetsOneShipsLogLine_AndNoDeathEvent()
        {
            var systems = Stack();
            HistorySystem history = null;
            for (int i = 0; i < systems.Length; i++) if (systems[i] is HistorySystem h) history = h;
            Assert.That(history, Is.Not.Null, "fixture: the default stack must carry a HistorySystem");

            ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), systems);

            int lines = 0, deaths = 0;
            foreach (var e in history.Entries)
            {
                lines++;
                if (e.Kind == (byte)HistoryKind.Death || e.Kind == (byte)HistoryKind.Eulogy) deaths++;
            }
            Assert.That(lines, Is.EqualTo(PodsWreckedDead),
                "exactly one boot log line per dead sleeper, and nothing else");
            Assert.That(deaths, Is.Zero,
                "a sleeper who was never a Citizen cannot die: a Death/Eulogy entry here means " +
                "someone synthesised a CitizenDiedEvent, which is a lie in the hashed event stream");
        }

        [Test]
        public void OpenPod_And_ClosedPod_ProjectDifferentGlyphs()
        {
            // The pod is the SECOND kind whose glyph comes from state (doors are the first). Driven
            // through the real projection rather than asserted about Glyphs.ForDevice, because
            // ForDevice knows only the rest glyph and GlyphMapper.DeviceGlyph is what a tile sees.
            // GenSimHost, not Boot(): `GlyphMapper.Project` gates on TileFlags.Explored (the fog
            // gate is the projection's first rule), and `FogReveal.RevealReachable` is a HOST boot
            // step that `ShipPlanBuilder.Build` alone never runs. A bare-builder sim projects a
            // buffer of spaces and every glyph assertion over it passes or fails for the wrong
            // reason.
            var sim = GenSimHost.Build(AuthoredShips.PeriluneWreck()).Sim;
            var buffer = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, 0, Lens.None, null, buffer);

            var seen = new List<char>();
            foreach (var p in Pods(sim)) seen.Add((char)buffer[p.Pos.X, p.Pos.Y].Glyph);

            Assert.That(seen, Does.Contain('k'), "the OPEN capsule must project Glyphs.CryoPodOpen");
            Assert.That(seen, Does.Contain('K'), "an OCCUPIED capsule must project Glyphs.CryoPodClosed");
            Assert.That(Glyphs.ForDevice(DeviceKind.CryoPod), Is.Not.EqualTo('?'),
                "the kind must have a rest glyph or the vocabulary test is the only thing that sees it");
        }

        [Test]
        public void TheSurvivableCore_HoldsEnoughScrubberHardwareForAFullRoster()
        {
            // ⭐ THE THAW CURVE'S CEILING, ASSERTED AGAINST THE ROSTER RATHER THAN AGAINST THE ONE
            // PAWN. CO2 is not clamped when breathing outruns scrubbing, and crossing
            // co2_narcosis_ppm makes a compartment unbreathable, hence unworkable — so a ship that
            // cannot eventually run three scrubbers has a hard ceiling BELOW its own design roster,
            // and the player would meet it with no explanation. The hardware must EXIST to be
            // repaired; almost all of it is allowed to boot broken, which is the game.
            var sim = Boot();
            var core = new List<Room>
            {
                RoomOfAnchor(sim, CryoAnchor), RoomOfAnchor(sim, SpineAnchor), RoomOfAnchor(sim, ReactorAnchor),
            };
            int inCore = 0, working = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Scrubber) continue;
                if (!core.Contains(sim.Rooms.RoomAt(sim.World, d.Pos))) continue;
                inCore++;
                if (d.IsOperational(SimDefs.Default)) working++;
            }
            Assert.That(inCore, Is.GreaterThanOrEqualTo(ScrubbersForAFullRoster),
                $"only {inCore} scrubbers stand in the survivable core; eight crew need " +
                $"{ScrubbersForAFullRoster} working ones, and a player who never opens a door must " +
                "still be able to reach that ceiling by salvage alone");
            Assert.That(working, Is.GreaterThanOrEqualTo(1),
                "and at least one must boot WORKING, or the first pawn is scrubbing nothing");
            Assert.That(working, Is.LessThan(ScrubbersForAFullRoster),
                "…but not all of them: a wreck that boots at its own crew ceiling has no repair game");
        }

        // ------------------------------------------------------------------- 2. the one person

        [Test]
        public void ExactlyOneCrewMemberIsAwake_AndItIsNotEight()
        {
            var sim = Boot();
            Assert.That(sim.Citizens.Items.Count, Is.EqualTo(1),
                "this is a ONE-PAWN opening: the other seven souls are pods, not citizens. Eight " +
                "inert citizens would also distort every LivingCrew denominator in the ledger.");
            Assert.That(sim.Citizens.Items[0].Name, Is.EqualTo(AwakeCrew));
        }

        [Test]
        public void TheCrewMember_StartsBesideTheOpenPod_InBreathableAir()
        {
            var sim = Boot();
            var c = sim.Citizens.Items[0];
            Device open = null;
            foreach (var p in Pods(sim)) if (p.IsOpen) open = p;
            Assert.That(open, Is.Not.Null, "fixture: one pod must be open");
            Assert.That(Int3.IsAdjacent4(c.Pos, open.Pos), Is.True,
                "the crew member must be standing at the capsule they came out of");
            Assert.That(AtmosphereSafety.IsBreathable(sim, c.Pos), Is.True,
                "and in air — a pawn that boots suffocating is a lost run in minute one");
        }

        [Test]
        public void TheCrewMember_IsWorkable_AndWanders()
        {
            var c = Boot().Citizens.Items[0];
            Assert.That(c.HoldPosition, Is.False, "a held hand reads in play as 'my crew ignores me'");
            Assert.That(c.AutoWander, Is.True, "the ship must not read as a still photograph");
            Assert.That(c.RevealsFog, Is.True);
        }

        // -------------------------------------------------------------- 3. the pressure frontier

        private static Room RoomOfAnchor(Simulation sim, string anchor)
        {
            var anchors = sim.Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
                if (anchors[i].Name == anchor) return sim.Rooms.RoomAt(sim.World, anchors[i].Probe);
            return null;
        }

        [Test]
        public void ExactlyThreeSpacesBootBreathable_AndTheRestIsVacuum()
        {
            var sim = Boot();
            var breathable = new List<string>();
            var anchors = sim.Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
            {
                var room = sim.Rooms.RoomAt(sim.World, anchors[i].Probe);
                if (room != null && AtmosphereSafety.IsBreathable(room, SimDefs.Default.Needs))
                    breathable.Add(anchors[i].Name);
            }
            breathable.Sort(StringComparer.Ordinal);
            Assert.That(breathable, Is.EqualTo(new[] { CryoAnchor, ReactorAnchor, SpineAnchor }),
                "THE SURVIVABLE CORE IS THE WHOLE POINT. Everything else on both decks must be " +
                "vacuum, or WorksiteSafety stops confining work and the frontier stops being a game.");
        }

        [Test]
        public void TheGoalCompartment_IsAirlessAtBoot_SoTheGoalIsNotAlreadyMet()
        {
            var sim = Boot();
            var room = RoomOfAnchor(sim, GoalAnchor);
            Assert.That(room, Is.Not.Null, "the goal's anchor must exist");
            Assert.That(AtmosphereSafety.IsBreathable(room, SimDefs.Default.Needs), Is.False,
                "a PressurizeAnchor goal on a compartment that already has air is met the moment it " +
                "is polled — a decoration, not an objective");
        }

        [Test]
        public void EveryAirlessCompartment_BootsBehindAClosedDoor()
        {
            // A typed slot boots its door OPEN (SlotGridPlanner: `IsOpen = !empty`), so a typed
            // AIRLESS slot would vent the core through its own door at tick 0. This is the assertion
            // that makes "the typed set and the pressurised set are the same set" a fact rather than
            // a claim in a header.
            var sim = Boot();
            var offenders = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Door || !d.IsOpen) continue;
                // An open door must have breathable air on BOTH sides of it at boot.
                foreach (var n in new[]
                {
                    new Int3(d.Pos.X, d.Pos.Y - 1, d.Pos.Z), new Int3(d.Pos.X, d.Pos.Y + 1, d.Pos.Z),
                    new Int3(d.Pos.X - 1, d.Pos.Y, d.Pos.Z), new Int3(d.Pos.X + 1, d.Pos.Y, d.Pos.Z),
                })
                {
                    if (!sim.World.InBounds(n) || sim.World.GetWall(n) != 0) continue;
                    if (!AtmosphereSafety.IsBreathable(sim, n))
                        offenders.Add($"{d.Name} is OPEN onto vacuum at {n}");
                }
            }
            Assert.That(offenders, Is.Empty, string.Join("\n  ", offenders));
        }

        [Test]
        public void TheCryoBayVent_IsOpenAndWorking_SoTheCoreRefillsItself()
        {
            var sim = Boot();
            Device vent = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++) if (devices[i].Name == "vent_cryo") vent = devices[i];
            Assert.That(vent, Is.Not.Null);
            Assert.That(vent.IsOpen, Is.True,
                "a CLOSED AirVent draws nothing and injects nothing (PowerSystem.IsWanting); this " +
                "one is what recovers the core after the player opens a hall door");
            Assert.That(vent.Condition, Is.GreaterThan(SimDefs.Default.Machines[(int)DeviceKind.AirVent].MaintainBelow),
                "and it must be above its own maint threshold, or the bay's survival is on the " +
                "maintenance board from tick 0 and the player has to act before they have read anything");
        }

        // ------------------------------------------------------------------ 4. the damaged ship

        [Test]
        public void MostOfTheShip_IsAuthoredDamaged_AndTheCoresLifeSupportIsNot()
        {
            var sim = Boot();
            int wrecked = 0, pristine = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (Simulation.IsUtilityOverlay(d.Kind) || d.Kind == DeviceKind.Door ||
                    d.Kind == DeviceKind.Ladder) continue;   // wear-free structure; never wrecked
                if (d.Condition < WreckThreshold) wrecked++; else pristine++;
            }
            Assert.That(wrecked, Is.GreaterThan(pristine),
                $"a WRECK: most wear-bearing devices must be below the wreck floor " +
                $"({wrecked} wrecked vs {pristine} not)");

            // and the two that keep the pawn alive must NOT be among them
            foreach (var name in new[] { "vent_cryo", "scrubber_cryo" })
            {
                Device d = null;
                for (int i = 0; i < devices.Count; i++) if (devices[i].Name == name) d = devices[i];
                Assert.That(d, Is.Not.Null, name);
                Assert.That(d.Condition, Is.GreaterThan(WreckThreshold),
                    $"{name} keeps the only crew member breathing; it cannot boot unfixable");
            }
        }

        [Test]
        public void NoUtilityOverlayOrDoorOrLadder_IsAuthoredDamaged()
        {
            // Conduits, pipes, ladders and doors are what keeps the hull traversable and powerable,
            // and they are `0 0 0 0` in machines.def — `maint = 0` means MaintenanceSystem never
            // recruits for them and `fail = 0` means they work at any condition. A damaged one would
            // be permanently unrepairable and fully functional: an object that looks broken and
            // behaves perfectly, which is the exact lie the plan (§2 beat 5) rejects.
            var sim = Boot();
            var offenders = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                bool structural = Simulation.IsUtilityOverlay(d.Kind) ||
                                  d.Kind == DeviceKind.Door || d.Kind == DeviceKind.Ladder;
                if (structural && d.Condition != 1f) offenders.Add($"{d.Name} ({d.Kind}) at {d.Condition}");
            }
            Assert.That(offenders, Is.Empty, string.Join("\n  ", offenders));
        }

        [Test]
        public void NoFurnitureIsAuthoredAtAll()
        {
            // RoomDresser.Dress is deliberately not called. Furniture is maint=0/fail=0, so a
            // smashed bed would be unrepairable AND fully functional; a raided ship having no bunks
            // left is both the better fiction and the only honest option until W6 gives furniture a
            // fail threshold.
            var sim = Boot();
            var found = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                switch (devices[i].Kind)
                {
                    case DeviceKind.Bed: case DeviceKind.Table: case DeviceKind.Chair:
                    case DeviceKind.Locker: case DeviceKind.Desk: case DeviceKind.PlantPot:
                    case DeviceKind.MedBed: case DeviceKind.MedCabinet:
                        found.Add(devices[i].Name); break;
                    default: break;
                }
            }
            Assert.That(found, Is.Empty, string.Join(", ", found));
        }

        // -------------------------------------------------------------------- 5. MOSS is dark

        [Test]
        public void TheMossTerminal_BootsUnCommissioned()
        {
            var sim = Boot();
            Device term = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++) if (devices[i].Name == MossTerminal) term = devices[i];
            Assert.That(term, Is.Not.Null, MossTerminal + " must exist — it is the thaw console (W5)");
            Assert.That(term.Kind, Is.EqualTo(DeviceKind.Terminal));
            Assert.That(term.Scriptable, Is.False, "MOSS is DARK until a ControllerModule is spent on it");
            Assert.That(term.Condition, Is.LessThan(WreckThreshold),
                "and it is below the wreck floor too, so it cannot even be bodged back for free");
        }

        /// <summary>
        /// The dark flag driven all the way to ITS OWN consumer. Present-and-INERT is
        /// indistinguishable from working (CLAUDE.md, verb parity), so this drives the real
        /// <see cref="SetScriptCommand"/> through a real tick.
        ///
        /// ⚠️ THE OBVIOUS TEST HERE IS WRONG AND THE FIRST DRAFT OF THIS FILE SHIPPED IT. Asserting
        /// "an authored-dark terminal gets no MOSS adapter" PASSES — and it passes for a reason that
        /// has nothing to do with the flag: <c>MossBindings.RegisterAdapters</c>'s switch covers
        /// Door, AirVent, Scrubber, SolarWing, GrowBed, WaterTank and Reclaimer, and
        /// <b>DeviceKind.Terminal is not one of them</b>. A TERMINAL IS NEVER MOSS-ADDRESSABLE AS A
        /// DEVICE, commissioned or not. Caught by the control below going red: with
        /// <c>Scriptable = true</c> the same terminal still did not register. That is the third trap
        /// shape wearing a green costume — a correct-looking assertion satisfied by an unrelated
        /// code path — and the control is the only thing that found it.
        ///
        /// What `Scriptable` really gates for a Terminal is `SetScriptCommand.Execute`
        /// (`Commands.cs:111`): <c>if (TryFindNamedDevice(...) &amp;&amp; !terminal.Scriptable) return;</c>.
        /// </summary>
        [Test]
        public void TheMossTerminal_RefusesAProgram_UntilItIsCommissioned()
        {
            var sim = Boot();
            Assert.That(sim.Scripts, Is.Empty, "fixture: the wreck authors no scripts");

            sim.EnqueueCommand(new SetScriptCommand(MossTerminal, "every 10 { }"));
            sim.Tick();
            Assert.That(sim.Scripts, Is.Empty,
                "MOSS is DARK: an authored-dark terminal must refuse to take a program until a " +
                "CommissionDeviceCommand has spent a ControllerModule on it");

            // NON-VACUITY AS AN INCLUSION TEST, not a population count: the SAME command on the SAME
            // terminal with the flag cleared must install, or the assertion above is satisfied by a
            // misspelled name, a command that does nothing, or a gate somewhere else entirely.
            var plan = AuthoredShips.PeriluneWreck();
            for (int i = 0; i < plan.Devices.Count; i++)
            {
                var spec = plan.Devices[i];
                if (spec.Name != MossTerminal) continue;
                spec.Scriptable = true;
                plan.Devices[i] = spec;   // struct: write it back or the mutation evaporates
            }
            var lit = ShipPlanBuilder.Build(plan, Stack());
            lit.EnqueueCommand(new SetScriptCommand(MossTerminal, "every 10 { }"));
            lit.Tick();
            Assert.That(lit.Scripts.Count, Is.EqualTo(1),
                "control: with Scriptable=true the SAME terminal must accept the SAME program");
        }

        // ----------------------------------------------------------- 6. nothing is pre-painted

        [Test]
        public void NoDesignationExistsAtTickZero()
        {
            var sim = Boot();
            var plan = AuthoredShips.PeriluneWreck();
            Assert.That(plan.DigDesignations, Is.Empty,
                "the grid ship's 'everyone runs to dig' opening is precisely what this start replaces");

            int designated = 0, stockpile = 0;
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Designated) != 0) designated++;
                        if ((world.GetFlags(p) & TileFlags.Stockpile) != 0) stockpile++;
                    }
            Assert.That(designated, Is.Zero, "no dig or build designation may exist at boot");
            Assert.That(stockpile, Is.Zero, "and no stockpile is zoned — a zone is the player's decision");
        }

        [Test]
        public void TheShipCarriesDebris_ButNoneOfItIsDesignated()
        {
            // Non-vacuity for the test above: "0 designations" is worthless if there is nothing on
            // the ship a designation could sit on.
            var sim = Boot();
            int debris = 0;
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                        if (world.GetWall(new Int3(x, y, z)) == TileDefs.Debris) debris++;
            Assert.That(debris, Is.EqualTo(DebrisTiles));
        }

        [Test]
        public void ThereIsExactlyOneGoal_AndItIsThePressureFrontier()
        {
            var plan = AuthoredShips.PeriluneWreck();
            Assert.That(plan.Goals.Count, Is.EqualTo(1));
            Assert.That(plan.Goals[0].Kind, Is.EqualTo(GoalKind.PressurizeAnchor));
            Assert.That(plan.Goals[0].Param, Is.EqualTo(GoalAnchor));
            Assert.That(plan.Goals[0].Text, Is.Not.Empty);
        }

        // ------------------------------------------------------------ 7. the opening is winnable

        [Test]
        public void TheBootCompartment_HoldsAStrippableWreckedDevice()
        {
            // W3 precondition 2, and it is the one that decides whether the game can start at all.
            //
            // ⚠️ HONEST SCOPE: THIS LEG'S RED IS CORRELATED AND IT WILL NOT FIRE ALONE. Measured by
            // mutation: healing the bay's four wrecked FITTINGS (light, radiator, battery, terminal)
            // leaves it GREEN, because the four wrecked CAPSULES are also strippable and also pay
            // Swarf — a dead pod is salvage. Only healing all eight reddens it, and that reddens
            // `PodCensus_IsOneOpen_FourWrecked_SevenIntact` in the same run. So read it as a
            // statement about the SHIP ("the boot compartment can bootstrap the salvage rung"),
            // which is true and worth pinning, and NOT as a guard that isolates one authored value.
            // Labelled here rather than counted among the guards that bite alone.
            // With W2 shipped, EVERY repair below wear.wreck_threshold needs a consumable, and on a
            // fresh wreck the only consumable in existence comes from stripping a machine. No
            // strippable wreck in breathable air ⇒ the loop cannot bootstrap.
            var sim = Boot();
            var cryo = RoomOfAnchor(sim, CryoAnchor);
            Assert.That(cryo, Is.Not.Null);

            var strippable = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind == DeviceKind.Door) continue;                       // strip refuses doors
                if (Simulation.IsUtilityOverlay(d.Kind)) continue;
                if (!ReferenceEquals(sim.Rooms.RoomAt(sim.World, d.Pos), cryo)) continue;
                // A device pays Swarf exactly when its Parts yield floors to 0.
                if ((int)(SimDefs.Default.Deconstruct.DeviceParts * d.Condition) == 0) strippable.Add(d.Name);
            }
            Assert.That(strippable.Count, Is.GreaterThanOrEqualTo(1),
                "the cryo bay must hold at least one device worth Swarf, or the salvage rung cannot " +
                "start and the ship is unwinnable from tick 0");
        }

        [Test]
        public void TheSurvivableCore_HoldsEnoughSalvageAndMatterToReachAControllerModule()
        {
            // THE ARITHMETIC, ASSERTED. A ControllerModule (the price of commissioning MOSS) is
            // 2 Parts = 4 Scrap = 8 Regolith through the shipped bills, and the three benches plus
            // the terminal each need one consumable service to come back. Both floors are checked
            // against what is reachable WITHOUT opening a door, so a player who never works out the
            // pressure loop still cannot be hard-stuck at tick 0.
            var sim = Boot();
            var core = new List<Room>
            {
                RoomOfAnchor(sim, CryoAnchor), RoomOfAnchor(sim, SpineAnchor), RoomOfAnchor(sim, ReactorAnchor),
            };

            int swarfSources = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind == DeviceKind.Door || Simulation.IsUtilityOverlay(d.Kind)) continue;
                if (!core.Contains(sim.Rooms.RoomAt(sim.World, d.Pos))) continue;
                if ((int)(SimDefs.Default.Deconstruct.DeviceParts * d.Condition) == 0) swarfSources++;
            }
            Assert.That(swarfSources, Is.GreaterThanOrEqualTo(4),
                "four consumable services are needed to bring the three benches and the terminal " +
                "back; the core must be able to pay for all four in Swarf alone");

            int regolith = 0, parts = 0, seals = 0, potatoes = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                switch (items[i].Kind)
                {
                    case ItemKind.Regolith: regolith += items[i].Count; break;
                    case ItemKind.Parts: parts += items[i].Count; break;
                    case ItemKind.Seals: seals += items[i].Count; break;
                    case ItemKind.Potato: potatoes += items[i].Count; break;
                    default: break;
                }
            }
            Assert.That(regolith, Is.GreaterThanOrEqualTo(8),
                "8 Regolith is the floor for one ControllerModule through the shipped bills");
            Assert.That(parts + seals, Is.GreaterThanOrEqualTo(1),
                "at least one free service before the player has to salvage anything");
            Assert.That(potatoes, Is.GreaterThanOrEqualTo(10), "and something to eat while doing it");
        }

        [Test]
        public void TheThreeBenchesOfTheMatterLadder_ExistAndAreAllBehindTheFrontier()
        {
            var sim = Boot();
            var wanted = new[]
            {
                DeviceKind.SalvageRecycler, DeviceKind.Fabricator, DeviceKind.MachineShop,
            };
            foreach (var kind in wanted)
            {
                Device best = null;
                var devices = sim.Devices.Items;
                for (int i = 0; i < devices.Count; i++)
                    if (devices[i].Kind == kind && (best == null || devices[i].Condition > best.Condition))
                        best = devices[i];
                Assert.That(best, Is.Not.Null, $"the ship needs a {kind} or the matter ladder has a missing rung");
                Assert.That(AtmosphereSafety.IsBreathable(sim, best.Pos), Is.False,
                    $"{kind} must start BEHIND the frontier — a bench the player can already reach " +
                    "removes the reason to make air");
                Assert.That(best.Condition, Is.LessThan(WreckThreshold),
                    $"{kind} must start below the wreck floor, or it repairs itself for free and " +
                    "the salvage rung never gets used");
            }
        }

        [Test]
        public void TheBenchesAreOnAPowerNetwork_AndTheirTierIsServed()
        {
            // ⚠️ THIS IS THE ASSERTION THAT CATCHES THE UNWINNABLE SHIP. Generation is
            // CONDITION-BLIND (PowerSystem.cs:174-185 — "a wrecked SolarWing still supplies its full
            // kW"), so authored damage cannot brown a tier back IN; a tier that is shed at boot is
            // shed forever. If PowerTier.Industry is not served here, the player can pressurise the
            // workshop, repair every bench, and still watch nothing happen, with no message anywhere.
            // ⚠️ THE HORIZON IS THE WHOLE GUARD, AND 20 TICKS WAS A HOLE — FOUND BY MUTATION, NOT BY
            // READING. This test ran two sim-seconds and SURVIVED deleting every SolarWing on the
            // ship. `PowerSystem.cs:196` reads `supply = generation + batteryCharge * 3600`, i.e. a
            // battery can burst its whole stored energy inside one balance second, so 15 kWh of
            // authored charge covers a 13 kW demand with ZERO generation for over an hour. A
            // two-second test therefore measured the batteries, not the wings.
            // 60 000 ticks is ~1.7 sim-hours — past the flat point of this ship's authored charge —
            // and costs ~2 s of wall clock because one pawn on a 626-device ship is cheap.
            var sim = Boot();
            for (int i = 0; i < 60_000; i++) sim.Tick();

            var offenders = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.SalvageRecycler && d.Kind != DeviceKind.Fabricator &&
                    d.Kind != DeviceKind.MachineShop) continue;
                if (d.NetworkId == 0) continue;   // deck 1's ruined bench: risers cut, by design
                if (!d.Powered) offenders.Add($"{d.Name} ({d.Kind}) is on network {d.NetworkId} and UNPOWERED");
            }
            Assert.That(offenders, Is.Empty,
                "the matter ladder is unreachable and the opening is unwinnable:\n  " +
                string.Join("\n  ", offenders));

            int onNetwork = 0;
            for (int i = 0; i < devices.Count; i++)
                if ((devices[i].Kind == DeviceKind.SalvageRecycler || devices[i].Kind == DeviceKind.Fabricator ||
                     devices[i].Kind == DeviceKind.MachineShop) && devices[i].NetworkId != 0) onNetwork++;
            Assert.That(onNetwork, Is.GreaterThanOrEqualTo(3),
                "fixture: all three deck-0 benches must be trayed, or the check above is vacuous");
        }

        // ------------------------------------------------------------------- 8. it is survivable

        /// <summary>
        /// ONE SIM-DAY, DRIVEN, WITH NO PLAYER INPUT. The acceptance the plan asks for: the cryo
        /// bay must be survivable without the player doing anything, or the game ends while they
        /// are still reading the tutorial. It also censuses the bay's TEMPERATURE, because there is
        /// no heater device in the game and the only thing holding the compartment above
        /// hypothermia_c is the waste heat of the pods and the lamp.
        /// </summary>
        [Test]
        public void TheOneCrewMember_SurvivesADayAlone_AndTheBayStaysBreathable()
        {
            var sim = Boot();
            const int Day = 864_000;   // 10 Hz
            for (int t = 0; t < Day; t++) sim.Tick();

            Assert.That(sim.Citizens.Items.Count, Is.EqualTo(1), "the only crew member died");
            var cryo = RoomOfAnchor(sim, CryoAnchor);
            Assert.That(AtmosphereSafety.IsBreathable(cryo, SimDefs.Default.Needs), Is.True,
                $"the cryo bay stopped being breathable after one sim-day: " +
                $"{cryo.PressureKPa.ToString("F1", CultureInfo.InvariantCulture)} kPa, " +
                $"ppO2 {(cryo.PressureKPa * cryo.O2Fraction).ToString("F1", CultureInfo.InvariantCulture)} kPa, " +
                $"{cryo.CO2Ppm.ToString("F0", CultureInfo.InvariantCulture)} ppm CO2, " +
                $"{(cryo.TemperatureK - 273.15).ToString("F1", CultureInfo.InvariantCulture)} degC");
            Assert.That(sim.Citizens.Items[0].Suffocation, Is.LessThan(0.5f),
                "and the crew member must not be in the flee band at the end of it");
        }

        /// <summary>
        /// THE LADDER IS A REAL HAZARD AND THIS IS WHY IT IS KEPT. Deck 1 is vacuum and one ladder
        /// away from the only crew member. Driven: order the pawn down, and require
        /// <see cref="SafetySystem"/> to bring it back to air alive.
        /// </summary>
        [Test]
        public void APawnOrderedIntoTheVacuumDeck_FleesBackToAir_Alive()
        {
            var sim = Boot();
            var c = sim.Citizens.Items[0];
            var target = new Int3(SlotGridPlanner.LadderX + 4, SlotGridPlanner.SpineY1, 1);
            Assert.That(AtmosphereSafety.IsBreathable(sim, target), Is.False,
                "fixture: the deck-1 spine must be vacuum, or this test proves nothing");

            sim.EnqueueCommand(new MoveCitizenCommand(c.Id, target));
            bool reachedDeck1 = false;
            for (int t = 0; t < 30_000; t++)   // 50 sim-minutes: down, suffocate, flee, recover
            {
                sim.Tick();
                if (sim.Citizens.Items.Count == 0) break;
                if (sim.Citizens.Items[0].Pos.Z == 1) reachedDeck1 = true;
            }

            Assert.That(reachedDeck1, Is.True,
                "fixture: the pawn never got to deck 1, so the flee path was never exercised — the " +
                "ladder trunk or the move order is broken, which is a different bug");
            Assert.That(sim.Citizens.Items.Count, Is.EqualTo(1),
                "the only crew member died on the vacuum deck. Until W5's emergency thaw exists, " +
                "that is an unrecoverable run, so SafetySystem is the ONLY thing standing between " +
                "one misclick and the end of the game.");
            Assert.That(AtmosphereSafety.IsBreathable(sim, sim.Citizens.Items[0].Pos), Is.True,
                "and it must have got back to air, not merely survived at the margin");
        }

        // ------------------------------------------------- 9. the shipped ships are not disturbed

        [Test]
        public void TheWreckSeed_IsItsOwnIdentity()
        {
            // Portrait keys are pk_fnv1a32(seed, citizenId): a shared seed would collide this
            // ship's crew art with another ship's.
            var seeds = new[]
            {
                AuthoredShips.Perilune().Seed, AuthoredShips.SliceSeed,
                AuthoredShips.GridSeed, AuthoredShips.WreckSeed,
            };
            CollectionAssert.AllItemsAreUnique(seeds);
        }

        [Test]
        public void NoOtherAuthoredShip_GainedAPodOrACryoRoom()
        {
            foreach (var plan in new[]
            {
                AuthoredShips.Perilune(), AuthoredShips.PeriluneSlice(), AuthoredShips.PeriluneGrid(),
            })
            {
                for (int i = 0; i < plan.Devices.Count; i++)
                    Assert.That(plan.Devices[i].Kind, Is.Not.EqualTo(DeviceKind.CryoPod),
                        $"{plan.Name} grew a cryo pod");
                for (int i = 0; i < plan.Rooms.Count; i++)
                    Assert.That(plan.Rooms[i].Type, Is.Not.EqualTo(RoomType.Cryo),
                        $"{plan.Name} grew a cryo bay");
                Assert.That(plan.LogLines, Is.Empty, $"{plan.Name} grew boot log lines");
            }
        }

        // --------------------------------------------------------------------- 10. the census

        /// <summary>
        /// NOT A GUARD — a CHARACTERISATION test that prints the boot census the lane's report
        /// quotes, so the numbers can be argued about without re-deriving them. It asserts only
        /// that the ship boots at all; every real assertion is above. Labelled in place rather than
        /// counted among the guards (CLAUDE.md: an honest count of what bites).
        /// </summary>
        [Test]
        public void PrintTheBootCensus()
        {
            var sim = Boot();
            for (int i = 0; i < 20; i++) sim.Tick();   // let PowerSystem balance once
            var sb = new StringBuilder();
            var inv = CultureInfo.InvariantCulture;
            sb.AppendLine("=== --ship wreck BOOT CENSUS ===");
            sb.AppendLine($"world {sim.World.Width}x{sim.World.Height}x{sim.World.Depth}  seed {AuthoredShips.WreckSeed}");
            sb.AppendLine($"crew alive: {sim.Citizens.Items.Count}");

            int open = 0, wreckedPods = 0, intactPods = 0;
            foreach (var p in Pods(sim))
            {
                if (p.IsOpen) open++;
                else if (p.Condition < CryoPodFailBelow) wreckedPods++;
                else intactPods++;
            }
            sb.AppendLine($"pods: {open} open / {wreckedPods} wrecked (dead sleeper) / {intactPods} intact occupied");

            int total = 0, overlays = 0, belowWreck = 0, belowFail = 0, swarfWorth = 0, dark = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                total++;
                if (Simulation.IsUtilityOverlay(d.Kind)) { overlays++; continue; }
                if (d.Condition < WreckThreshold) belowWreck++;
                if (!d.IsOperational(SimDefs.Default)) belowFail++;
                if (d.Kind != DeviceKind.Door && (int)(SimDefs.Default.Deconstruct.DeviceParts * d.Condition) == 0)
                    swarfWorth++;
                if (!d.Scriptable) dark++;
            }
            sb.AppendLine($"devices: {total} total, {overlays} utility overlays, {total - overlays} tile-resident");
            sb.AppendLine($"  below wear.wreck_threshold ({WreckThreshold.ToString(inv)}): {belowWreck}");
            sb.AppendLine($"  inoperative (below their own fail): {belowFail}");
            sb.AppendLine($"  worth SWARF if stripped (Parts yield floors to 0): {swarfWorth}");
            sb.AppendLine($"  un-commissioned (Scriptable=false): {dark}");

            var anchors = sim.Rooms.Anchors;
            for (int z = 0; z < sim.World.Depth; z++)
            {
                int breathableTiles = 0, breathableRooms = 0, rooms = 0;
                for (int i = 0; i < anchors.Count; i++)
                {
                    if (anchors[i].Probe.Z != z) continue;
                    rooms++;
                    var room = sim.Rooms.RoomAt(sim.World, anchors[i].Probe);
                    if (room == null || !AtmosphereSafety.IsBreathable(room, SimDefs.Default.Needs)) continue;
                    breathableRooms++;
                    breathableTiles += room.TileCount;
                }
                sb.AppendLine($"deck {z}: {rooms} anchored spaces, {breathableRooms} breathable, " +
                              $"{breathableTiles} breathable tiles");
            }

            foreach (var name in new[] { CryoAnchor, SpineAnchor, ReactorAnchor, GoalAnchor })
            {
                var r = RoomOfAnchor(sim, name);
                sb.AppendLine($"  {name,-14} {r.PressureKPa.ToString("F1", inv),7} kPa  " +
                              $"ppO2 {(r.PressureKPa * r.O2Fraction).ToString("F1", inv),5}  " +
                              $"{r.CO2Ppm.ToString("F0", inv),6} ppm  " +
                              $"{(r.TemperatureK - 273.15).ToString("F1", inv),6} degC  " +
                              $"{r.TileCount,4} tiles");
            }

            int debris = 0, designated = 0;
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (world.GetWall(p) == TileDefs.Debris) debris++;
                        if ((world.GetFlags(p) & TileFlags.Designated) != 0) designated++;
                    }
            sb.AppendLine($"debris tiles: {debris}   designated: {designated}   zoned stockpile tiles: 0");
            sb.AppendLine($"boot log lines: {AuthoredShips.PeriluneWreck().LogLines.Count}");
            TestContext.Out.WriteLine(sb.ToString());

            Assert.That(sim.Citizens.Items.Count, Is.EqualTo(1), "the census fixture must boot");
        }
    }
}
