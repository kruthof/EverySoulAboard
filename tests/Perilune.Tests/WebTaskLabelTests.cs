using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;   // GameSession, WireFormat

namespace Perilune.Tests
{
    /// <summary>
    /// The roster's `task` label — "make the work legible". The old label was a five-word
    /// vocabulary ("digging", "hauling", "servicing a machine") with a catch-all that reported
    /// "walking" for every job-less crew member, which in the playtest was 99.9% of all labels:
    /// it never named the machine, the cargo or the tile, and it made doing NOTHING look like
    /// doing something.
    ///
    /// These tests pin the new contract per <see cref="JobKind"/>: the label NAMES the object,
    /// and the three job-less states (walking with no job / holding position / idle) are told
    /// apart. They also pin the leading verb of each label, because the client's on-map work
    /// marker classifies on exactly that first word (`taskTag` in console-model.js) — the two
    /// vocabularies must not drift apart.
    ///
    /// No sim behaviour is exercised: the tests set job state on a citizen directly and read the
    /// rendered roster channel, so no golden or state hash is in play.
    /// </summary>
    public class WebTaskLabelTests
    {
        private static (GameSession gs, SimHost host) Boot()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            var gs = new GameSession(host, _ => { }); // NOT started ⇒ no sim thread
            return (gs, host);
        }

        /// <summary>Render once and pull this citizen's `task` out of the roster channel.</summary>
        private static string TaskOf(GameSession gs, uint cid)
        {
            gs.RenderForTest();
            string roster = gs.Snapshot().First(s => s.Contains("\"type\":\"roster\"", StringComparison.Ordinal));
            string key = "\"cid\":" + cid.ToString(CultureInfo.InvariantCulture) + ",";
            int i = roster.IndexOf(key, StringComparison.Ordinal);
            Assert.That(i, Is.GreaterThanOrEqualTo(0), "the roster carries cid " + cid);
            int t = roster.IndexOf("\"task\":\"", i, StringComparison.Ordinal);
            Assert.That(t, Is.GreaterThanOrEqualTo(0), "the row has a task field");
            t += "\"task\":\"".Length;
            int end = roster.IndexOf('"', t);
            return roster.Substring(t, end - t);
        }

        private static Citizen AnyLiving(SimHost host) => host.Sim.Citizens.Items.First(c => !c.Dead);

        /// <summary>Park a citizen with no job and no path — the baseline for each case.</summary>
        private static Citizen Parked(SimHost host)
        {
            var c = AnyLiving(host);
            c.ClearPath();
            c.JobKind = JobKind.None;
            c.HoldPosition = false;
            c.CarryingItemId = 0;
            c.ReservedItemId = 0;
            return c;
        }

        // ------------------------------------------------------------------ the job-less states

        [Test]
        public void NoJob_Tells_Idle_Holding_And_Aimless_Walking_Apart()
        {
            var (gs, host) = Boot();
            var c = Parked(host);

            Assert.AreEqual("Idle", TaskOf(gs, c.Id), "parked with no job reads Idle, not 'walking'");

            c.HoldPosition = true;
            Assert.AreEqual("Holding position", TaskOf(gs, c.Id));

            // Walking with no job assigned: the label names the destination AND says the quiet
            // part out loud — this is the fix for the permanent, meaningless "walking".
            c.HoldPosition = false;
            c.Path.Add(new Int3(c.Pos.X, c.Pos.Y, c.Pos.Z));
            c.Path.Add(new Int3(7, 11, c.Pos.Z));
            c.PathIndex = 0;
            Assert.AreEqual("Walking to 7,11 (no task)", TaskOf(gs, c.Id));
        }

        // ------------------------------------------------------------------ named objects

        /// <summary>A device that the SIM's own tile lookup resolves back to (a tile can carry a
        /// machine and a conduit at once — the label must name whichever the sim would service).</summary>
        private static Device SelfResolving(SimHost host, DeviceKind kind)
            => host.Sim.Devices.Items.FirstOrDefault(d =>
                d.Kind == kind && !string.IsNullOrEmpty(d.Name) &&
                host.Sim.TryGetDeviceAt(d.Pos, out var r) && r.Id == d.Id);

        [Test]
        public void Maintain_Names_The_Machine_It_Is_Servicing()
        {
            var (gs, host) = Boot();
            var device = SelfResolving(host, DeviceKind.Scrubber);
            Assert.IsNotNull(device, "the reference ship has a named scrubber the sim resolves by tile");
            var c = Parked(host);
            c.JobKind = JobKind.Maintain;
            c.JobTarget = device.Pos;

            Assert.AreEqual("Servicing " + device.Name, TaskOf(gs, c.Id),
                "the label names the machine, not 'servicing a machine'");
        }

        [Test]
        public void Craft_And_Drink_Name_Their_Device_With_A_Safe_Fallback()
        {
            var (gs, host) = Boot();
            var c = Parked(host);

            var tank = SelfResolving(host, DeviceKind.WaterTank);
            if (tank != null)
            {
                c.JobKind = JobKind.Drink;
                c.JobTarget = tank.Pos;
                Assert.AreEqual("Drinking at " + tank.Name, TaskOf(gs, c.Id));
            }

            // A target with no device on it must not produce a hole in the sentence.
            var empty = new Int3(0, 0, 0);
            Assert.IsFalse(host.Sim.TryGetDeviceAt(empty, out _), "0,0,0 carries no device on the reference ship");
            c.JobKind = JobKind.Craft;
            c.JobTarget = empty;
            Assert.AreEqual("Crafting at a workstation", TaskOf(gs, c.Id));
        }

        [Test]
        public void Dig_Names_The_Tile_And_Marks_A_CrossDeck_Target()
        {
            var (gs, host) = Boot();
            var c = Parked(host);
            c.JobKind = JobKind.Dig;
            c.JobTarget = new Int3(12, 5, c.Pos.Z);
            Assert.AreEqual("Digging out 12,5", TaskOf(gs, c.Id));

            c.JobTarget = new Int3(12, 5, c.Pos.Z == 0 ? 1 : 0);
            Assert.AreEqual("Digging out 12,5 on deck " + (c.Pos.Z == 0 ? 1 : 0), TaskOf(gs, c.Id),
                "an off-deck target says which deck");
        }

        [Test]
        public void Hauling_Names_The_Cargo_And_Where_It_Is_Going()
        {
            var (gs, host) = Boot();
            var c = Parked(host);

            var stack = host.Sim.AddItem(ItemKind.Regolith, 3, new Int3(4, 4, c.Pos.Z));
            c.JobKind = JobKind.HaulPickup;
            c.ReservedItemId = stack.Id;
            c.JobTarget = stack.Pos;
            Assert.AreEqual("Fetching regolith at 4,4", TaskOf(gs, c.Id));

            c.JobKind = JobKind.HaulDeliver;
            c.ReservedItemId = 0;
            c.CarryingItemId = stack.Id;
            c.JobTarget = new Int3(9, 2, c.Pos.Z);
            Assert.AreEqual("Hauling regolith to 9,2", TaskOf(gs, c.Id));

            // An id that no longer resolves degrades to a truthful generic, never an empty hole.
            c.CarryingItemId = 999999u;
            Assert.AreEqual("Hauling cargo to 9,2", TaskOf(gs, c.Id));
        }

        [Test]
        public void Eat_Names_The_Food_Tile_Only_While_Travelling()
        {
            var (gs, host) = Boot();
            var c = Parked(host);
            c.JobKind = JobKind.Eat;
            c.JobTarget = new Int3(c.Pos.X + 3, c.Pos.Y, c.Pos.Z);
            Assert.AreEqual("Eating - food at " + (c.Pos.X + 3).ToString(CultureInfo.InvariantCulture) + "," +
                            c.Pos.Y.ToString(CultureInfo.InvariantCulture), TaskOf(gs, c.Id));

            c.JobTarget = c.Pos;   // standing on it: they are simply eating
            Assert.AreEqual("Eating", TaskOf(gs, c.Id));
        }

        [Test]
        public void Build_Jobs_Name_The_Site_And_Its_Material_Ledger()
        {
            var (gs, host) = Boot();
            var build = host.BuildSys;
            Assert.IsNotNull(build, "the shipping stack registers a BuildSystem");

            Int3? site = null;
            for (int y = 0; y < host.Sim.World.Height && site == null; y++)
                for (int x = 0; x < host.Sim.World.Width; x++)
                {
                    var p = new Int3(x, y, 0);
                    if (build.CanDesignate(host.Sim, p, BuildKind.Wall)) { site = p; break; }
                }
            Assert.IsNotNull(site, "the boot ship has a designatable tile");

            host.Sim.EnqueueCommand(new DesignateBuildCommand(site.Value, BuildKind.Wall));
            host.Sim.Tick();
            Assert.IsTrue(build.TryGet(site.Value, out var pending));

            var c = Parked(host);
            c.Pos = new Int3(c.Pos.X, c.Pos.Y, 0);   // same deck as the site, so no deck suffix
            c.JobKind = JobKind.HaulToBuild;
            c.JobTarget = site.Value;
            string tile = site.Value.X.ToString(CultureInfo.InvariantCulture) + "," +
                          site.Value.Y.ToString(CultureInfo.InvariantCulture);
            Assert.AreEqual("Hauling regolith to wall " + tile + " (" +
                            pending.Delivered.ToString(CultureInfo.InvariantCulture) + "/" +
                            pending.Required.ToString(CultureInfo.InvariantCulture) + ")",
                            TaskOf(gs, c.Id), "the hauler's label carries the site's material ledger");

            c.JobKind = JobKind.Build;
            Assert.AreEqual("Building wall " + tile, TaskOf(gs, c.Id));

            // The designation resolving out from under the job must not produce a lie. (Ticking
            // re-runs the job board, so the job state is re-applied afterwards.)
            host.Sim.EnqueueCommand(new DesignateBuildCommand(site.Value, BuildKind.Wall, on: false));
            host.Sim.Tick();
            c.ClearPath();
            c.JobKind = JobKind.Build;
            c.JobTarget = site.Value;
            c.Pos = new Int3(c.Pos.X, c.Pos.Y, 0);
            Assert.AreEqual("Building the site " + tile, TaskOf(gs, c.Id));
        }

        // ------------------------------------------------------------------ the shared vocabulary

        /// <summary>
        /// Every label opens with one of the verbs the client's `taskTag` classifier knows. If a
        /// new JobKind lands with a new verb, this test fails until the client map learns it too —
        /// which is exactly the coupling that keeps the on-map work marker honest.
        /// </summary>
        [Test]
        public void Every_JobKind_Label_Opens_With_A_Known_Verb()
        {
            var (gs, host) = Boot();
            var known = new HashSet<string>(StringComparer.Ordinal)
            {
                "Digging", "Fetching", "Hauling", "Eating", "Drinking", "Crafting",
                "Servicing", "Building", "Walking", "Holding", "Idle",
            };
            var c = Parked(host);
            foreach (JobKind kind in Enum.GetValues(typeof(JobKind)))
            {
                c.JobKind = kind;
                c.JobTarget = new Int3(3, 3, c.Pos.Z);
                string label = TaskOf(gs, c.Id);
                Assert.IsNotEmpty(label, kind + " must produce a label");
                string verb = label.Split(' ')[0];
                Assert.IsTrue(known.Contains(verb), kind + " produced unknown leading verb '" + verb +
                    "' — teach console-model.js `taskTag` about it, then add it here");
            }
        }

        [Test]
        public void Label_Is_InvariantCulture()
        {
            var (gs, host) = Boot();
            var c = Parked(host);
            c.JobKind = JobKind.Dig;
            c.JobTarget = new Int3(1234, 5, c.Pos.Z);

            var prev = System.Threading.Thread.CurrentThread.CurrentCulture;
            try
            {
                System.Threading.Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                Assert.AreEqual("Digging out 1234,5", TaskOf(gs, c.Id), "no locale thousands separator");
            }
            finally { System.Threading.Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ------------------------------------------------------------------ starved-build feedback

        [Test]
        public void Designating_Reports_The_Ships_Material_Stock()
        {
            var (gs, host) = Boot();
            gs.ApplyForTest(new WebCommand(CmdKind.Build, 3, 3, name: "wall"));
            gs.RenderForTest();
            string status = gs.Snapshot().First(s => s.Contains("\"type\":\"status\"", StringComparison.Ordinal));

            int loose = host.Sim.Items.Items
                .Where(i => i.Kind == BuildSystem.Material && i.CarriedBy == 0).Sum(i => i.Count);
            StringAssert.Contains("designate wall - " + loose.ToString(CultureInfo.InvariantCulture) + " regolith aboard",
                status, "the status line says whether there is anything to build WITH");
        }
    }
}
