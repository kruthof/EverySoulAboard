using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ <b>M3-1 — <c>Device.Name</c> IS IMMUTABLE AFTER BOOT.</b> The one pin behind the owner's
    /// answer to batch item 6 (<b>A — unfreeze only</b>, 2026-07-31): a cryo pod is <b>single-use</b>,
    /// so the field that is simultaneously the MOSS registry key
    /// (<c>sim/Sim.Dsl/MossBindings.cs:32</c>, <c>:40</c> — <c>registry.Register(device.Name, …)</c>)
    /// and the sleeper's identity (<c>sim/Sim.Gen/AuthoredShips.cs:1856</c> —
    /// <c>Name = "pod_" + pod.Who.ToLowerInvariant()</c>) can carry both duties forever, and
    /// <b>no new <c>Device</c> field is needed anywhere</b>. The full record is
    /// <c>docs/MECHANICS.md</c> §13.27.
    ///
    /// <para>⛔ <b>THIS PIN IS DRIVEN, NOT SCANNED, AND THE CHARTER REFUSES THE SCAN BY NAME.</b>
    /// A guard that greps the tree for <c>\.Name =</c> is trap 1 (satisfied by the violation sitting
    /// in a comment) and trap 4 (defeated by <c>device.Name=x</c>, by an aliased local, by a
    /// reflection write, by any spelling the author of the regex did not think of). ⇒ <b>Record the
    /// STATE, not the spelling</b>: boot the wreck, snapshot every device's name, drive the ship,
    /// compare.</para>
    ///
    /// <para>✅ <b>M3-3 PAID THE OWED THAW LEG.</b> The paragraph that stood here said the run
    /// drove "the richest command activity that ships today — a full work grant, a door, a vent"
    /// and that <b>a thaw is precisely the code path most likely to want to write a pod's name</b>,
    /// so the pin was not complete until it opened a capsule for real. It does now: the run below
    /// commissions the wreck's console with a real <c>CommissionDeviceCommand</c>, sends a real
    /// <c>ThawCommand</c>, and is required to have <b>OPENED a capsule and produced a live
    /// citizen</b> before the immutability claim is read (non-vacuity 5). The name of the capsule
    /// that opened is in the snapshot like every other, and <c>CryoSystem.Open</c> is the one
    /// shipped code path that touches a pod's identity — it READS <c>Device.Name</c> to name the
    /// person and must never write it back.</para>
    ///
    /// <para><b>NON-VACUITY IS EXPLICIT AND BY INCLUSION</b> (§13.26's exit-code lesson: a
    /// comparison of two empty sets passes, and a run in which nothing happened proves nothing).
    /// Four preconditions are asserted before the claim: the snapshot is non-empty and contains
    /// both halves of the collision (a <c>CryoPod</c> and a MOSS-registrable named device); the
    /// work grant is <b>read back off the sim</b> rather than trusted; the door command is read
    /// back off the device; and the run is required to have produced at least one crew-tick of
    /// actual work.</para>
    /// </summary>
    [TestFixture]
    public class PodIdentityTests
    {
        private const int Ticks = 3000;

        /// <summary>The wreck's MOSS console — the WHERE gate every thaw goes through.</summary>
        private const string MossConsole = "term_moss";

        /// <summary>Rung 1 of the thaw ladder (<c>Condition 0.94</c> ⇒ 1 Seals, and the wreck
        /// carries Seals loose at boot), so the owed leg drives an ACCEPTED thaw rather than a
        /// refusal wearing the same command's clothes.</summary>
        private const string ThawPod = "pod_lindqvist";

        /// <summary>The shipping ship (<c>./play.sh</c>'s default), booted with the default system
        /// stack — the pods, the MOSS-named machines and the one crew member all present.</summary>
        private static Simulation BootWreck()
            => ShipPlanBuilder.Build(
                AuthoredShips.PeriluneWreck(),
                SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));

        /// <summary>
        /// ⭐⭐ <b>THE PIN: 3 000 ticks of commanded play, and not one device name moved.</b>
        ///
        /// <para>⛔ MUTATION 1 (charter table): a code path writes <c>Device.Name</c> after boot ⇒
        /// RED here, naming the device and both spellings.</para>
        /// </summary>
        [Test]
        public void DeviceNames_NeverChangeAfterBoot_AcrossThreeThousandTicksOfCommandedPlay()
        {
            var sim = BootWreck();

            // ── the snapshot, taken at tick 0: the boot state is the claim's baseline ──────────
            var bootNames = new Dictionary<uint, string>();
            foreach (var d in sim.Devices.Items) bootNames[d.Id] = d.Name;

            // NON-VACUITY 1 — there is something to compare, and BOTH halves of the collision are
            // in it. An empty snapshot would make every assertion below trivially true.
            Assert.That(bootNames.Count, Is.GreaterThan(0), "the wreck booted with no devices at all");
            Assert.That(sim.Devices.Items.Any(d => d.Kind == DeviceKind.CryoPod && d.Name.Length > 0),
                Is.True, "no named CryoPod aboard — the sleeper-identity half of the collision is absent");
            Assert.That(sim.Devices.Items.Any(d => d.Kind != DeviceKind.CryoPod && d.Name.Length > 0 && d.Scriptable),
                Is.True, "no MOSS-registrable named device aboard — the registry-key half is absent");

            // ── the drive: real ISimCommands, the only way input reaches the sim ──────────────
            // A full work grant at RimWorld's alwaysStartActive value (reference §1.5), sent one
            // cell at a time through the sim's own command, so the crew actually work rather than
            // sitting at OD-H's all-off boot grid and making the run a still photograph.
            foreach (var c in sim.Citizens.Items.Where(x => !x.Dead).ToList())
                for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                    sim.EnqueueCommand(new SetWorkPriorityCommand(c.Id, t, 3));

            // ⭐ M3-15 / OD-N — THE SHIP NEEDS A LIVE MOSS SERVER BEFORE IT ANSWERS A DOOR OR A VENT.
            // `SetDoorStateCommand` / `SetDeviceStateCommand` refuse without one, and this run's
            // NON-VACUITY 3b reads the door back off the device — so without this line the run's
            // "device traffic was inert" assertion fires, correctly, and the rename claim below would
            // otherwise have been measured over 3 000 ticks of a ship nobody could command.
            // 0.60 is one bare-handed service (`wear.def:18-20,61`); it moves NOTHING this test asserts
            // — the console still boots un-commissioned, which the precondition below re-checks.
            sim.Devices.Items.First(d => d.Name == MossConsole).Condition = 0.60f;

            var door = sim.Devices.Items.FirstOrDefault(d => d.Kind == DeviceKind.Door && !d.IsLocked);
            Assert.That(door, Is.Not.Null, "the wreck has no unlocked door — the fixture cannot drive one");
            bool doorWasOpen = door.IsOpen;
            sim.EnqueueCommand(new SetDoorStateCommand(door.Id, open: !doorWasOpen));

            var vent = sim.Devices.Items.FirstOrDefault(d => d.Kind == DeviceKind.AirVent);
            Assert.That(vent, Is.Not.Null, "the wreck has no vent — the fixture cannot drive one");

            // ⭐ M3-3's OWED LEG: a REAL thaw, through the real commands, inside the same run.
            // The console boots un-commissioned (that IS the wreck's opening objective), so the
            // module is placed and the shipped CommissionDeviceCommand spends it — the same two
            // gestures the player makes. Then ThawCommand opens the ladder's cheapest capsule.
            var term = sim.Devices.Items.First(d => d.Name == MossConsole);
            Assert.That(term.Scriptable, Is.False,
                "precondition: " + MossConsole + " must boot un-commissioned, or the thaw leg is "
                + "not driving the commissioning path either");
            sim.AddItem(ItemKind.ControllerModule, 1, term.Pos);
            sim.EnqueueCommand(new CommissionDeviceCommand(term.Pos));

            var thawPod = sim.Devices.Items.First(d => d.Name == ThawPod);
            Assert.That(thawPod.IsOpen, Is.False, "precondition: the capsule to thaw must start SHUT");
            string thawPodName = thawPod.Name;
            string sleeper = CryoSystem.SleeperName(thawPodName);

            long tick0 = sim.TickCount;
            bool sawWork = false;
            bool doorObeyed = false;
            for (int t = 0; t < Ticks; t++)
            {
                // One tick after the commission drains, so the console is live when it arrives.
                if (t == 2) sim.EnqueueCommand(new ThawCommand(MossConsole, ThawPod));
                // Mid-run traffic, so the commanded surface is not all spent in the first tick.
                if (t == 1000) sim.EnqueueCommand(new SetDeviceStateCommand(vent.Id, open: !vent.IsOpen));
                if (t == 2000) sim.EnqueueCommand(new SetDoorStateCommand(door.Id, open: doorWasOpen));
                sim.Tick();
                if (t == 0 && door.IsOpen != doorWasOpen) doorObeyed = true;
                if (!sawWork && sim.Citizens.Items.Any(c => !c.Dead && c.JobKind != JobKind.None)) sawWork = true;
            }

            // NON-VACUITY 2 — the sim advanced.
            Assert.That(sim.TickCount - tick0, Is.EqualTo(Ticks), "the sim did not advance " + Ticks + " ticks");
            // NON-VACUITY 3 — the grant LANDED, read back off the sim (printing the spec we sent
            // would read identically whether it was applied or dropped on the floor: §13.26).
            var alive = sim.Citizens.Items.First(c => !c.Dead);
            Assert.That(alive.GetWorkPriority(WorkType.Repair), Is.EqualTo(3),
                "the work grant never landed — this run measured the all-off boot grid, not play");
            // NON-VACUITY 3b — the door command LANDED too, read off the device and not off the
            // fact that we enqueued it: a command silently dropped is a command that drove nothing.
            Assert.That(doorObeyed, Is.True,
                "the door never obeyed SetDoorStateCommand — the run's device traffic was inert");
            // NON-VACUITY 4 — the crew did real work under that grant. Without this the run is
            // 3 000 ticks of an idle ship, which no rename would ever have been triggered by.
            Assert.That(sawWork, Is.True,
                "no crew member held a job at any point in " + Ticks + " ticks — the run is vacuous");
            // NON-VACUITY 5 — ⭐ THE THAW ACTUALLY HAPPENED. A ThawCommand that was refused (an
            // un-commissioned console, an unaffordable rung, a bound headroom term) leaves this
            // run exactly as it was before M3-3 existed — and the owed leg would be owed again,
            // silently. So the capsule must be OPEN and the sleeper must be aboard and alive.
            Assert.That(thawPod.IsOpen, Is.True,
                "the capsule never opened in " + Ticks + " ticks — the thaw leg is inert, and the "
                + "code path most likely to rename a pod was never executed");
            Assert.That(sim.Citizens.Items.Any(c => !c.Dead && c.Name == sleeper), Is.True,
                "'" + sleeper + "' is not aboard after the thaw; names present: "
                + string.Join(", ", sim.Citizens.Items.Select(c => c.Name)));

            // ── the claim, read two ways and asserted ONCE ────────────────────────────────────
            // Per-id drift names WHICH device was renamed and to what; the multiset additionally
            // catches a device added or removed. ⛔ They are ONE assertion on purpose: `Assert`
            // throws (CLAUDE.md's fifth trap), so a two-`Assert` version would report the first
            // reading and leave the second permanently unexercised — a leg nobody can tell apart
            // from a dead one.
            var problems = new List<string>();
            foreach (var kv in bootNames)
                if (sim.Devices.TryGet(kv.Key, out var now) && now.Name != kv.Value)
                    problems.Add("renamed: device " + kv.Key + " '" + kv.Value + "' -> '" + now.Name + "'");

            var before = bootNames.Values.OrderBy(s => s, System.StringComparer.Ordinal).ToList();
            var after = sim.Devices.Items.Select(d => d.Name).OrderBy(s => s, System.StringComparer.Ordinal).ToList();
            if (!before.SequenceEqual(after, System.StringComparer.Ordinal))
                problems.Add("multiset moved: " + before.Count + " names at boot, " + after.Count
                             + " at tick " + Ticks + " (a name was renamed, added or removed)");

            Assert.That(problems, Is.Empty,
                "Device.Name is NOT immutable after boot. Every MOSS program naming that device is "
                + "silently unbound (Simulation.cs:553-555) and, on a pod, the ship forgot who is in "
                + "the box (MECHANICS §13.27; owner batch item 6 = A, a pod is single-use). "
                + string.Join(" | ", problems));
        }
    }
}
