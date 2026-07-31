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
    /// <para>⚠️ <b>M3-3 MUST EXTEND THIS TEST WITH A REAL THAW.</b> The charter's mutation row says
    /// "3 000 ticks <i>with a thaw executed</i>"; <c>ThawCommand</c> does not exist on this tree
    /// (it is M3-3's), so the run below drives the richest command activity that ships today — a
    /// full work grant, a door, a vent — and the thaw leg is owed. A thaw is precisely the code
    /// path most likely to want to write a pod's name, so this pin is not complete until it opens
    /// a pod for real.</para>
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

            var door = sim.Devices.Items.FirstOrDefault(d => d.Kind == DeviceKind.Door && !d.IsLocked);
            Assert.That(door, Is.Not.Null, "the wreck has no unlocked door — the fixture cannot drive one");
            bool doorWasOpen = door.IsOpen;
            sim.EnqueueCommand(new SetDoorStateCommand(door.Id, open: !doorWasOpen));

            var vent = sim.Devices.Items.FirstOrDefault(d => d.Kind == DeviceKind.AirVent);
            Assert.That(vent, Is.Not.Null, "the wreck has no vent — the fixture cannot drive one");

            long tick0 = sim.TickCount;
            bool sawWork = false;
            bool doorObeyed = false;
            for (int t = 0; t < Ticks; t++)
            {
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
