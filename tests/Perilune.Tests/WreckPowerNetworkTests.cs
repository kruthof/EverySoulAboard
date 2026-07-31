using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// M2-11 — THE OFF-NETWORK AUTHORING DEFECT. `--ship wreck` was authored believing that laying
    /// no conduit tray on deck 1 left deck 1 off the grid. It never did:
    /// <c>PowerSystem.RebuildNetworks</c> attaches a device to the first conduit in
    /// <c>+x,-x,+y,-y,+z,-z</c> order, so every deck-1 machine claimed the deck-0 trunk straight
    /// down through the deck plate. Measured on the pre-fix tree: <b>0 of 626 devices off-network,
    /// 20.40 kW of demand against 18.00 kW of generation, and the whole ship dark from sim-hour
    /// 7</b>. The player's ledger and the player's ship disagreed.
    ///
    /// ⚠️ EVERY NUMBER BELOW IS DRIVEN, NEVER SCANNED. The eighth trap (a merged file's truth is a
    /// number neither lane could compute) says a census is a statement about a TREE: these tests
    /// build the plan, run the real system stack, and count what the sim actually holds. A source
    /// scan of the authoring would pass on a tree where <c>PowerSystem</c> had changed underneath
    /// it, which is precisely the class of bug this package closes.
    ///
    /// ⚠️ AND THE LITERALS ARE WRITTEN OUT BY HAND, never read back from <see cref="AuthoredShips"/>
    /// — same rule as <see cref="WreckShipTests"/>. They ARE the pin.
    ///
    /// ⚠️ EVERY LOOP ACCUMULATES OFFENDERS AND ASSERTS ONCE (the fifth trap shape: <c>Assert</c>
    /// throws, so a per-iteration assertion hides every offender after the first).
    /// </summary>
    public class WreckPowerNetworkTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static Simulation Boot()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
            for (int i = 0; i < 20; i++) sim.Tick();   // two balance passes: topology + Powered
            return sim;
        }

        // ------------------------------------------------------------- the hand-written pins

        /// <summary>Devices in the store at boot. It MOVED with this package (626 -> 611): the cut
        /// deletes the 23 deck-0 tray tiles under deck 1's devices — 8 of them the doorway tiles,
        /// replaced by 8 bulkhead runs beside the doorways — net −15.
        /// ⚠️ AN EARLIER DRAFT OF THIS LINE SAID "deletes the 15 … tiles and adds 8", WHICH IS THE
        /// NET PRESENTED AS THE DELETION COUNT — 626 − 15 + 8 is 619, not 611. Independent review
        /// caught it: the exact defect class this package deletes from AuthoredShips.cs, relocated
        /// into the test that pins it. Re-measured on THIS tree, driven off the plan: deck-0 tray
        /// 554 tiles before, 531 with the taps removed and nothing added, 539 shipped; all 23
        /// deck-1 devices stood over a trayed tile (0 did not); the 8 bulkhead runs stand on hull,
        /// none on a floor tile.</summary>
        private const int TotalDevices = 611;
        /// <summary>Every device standing on deck 1 — 8 hall doors, 1 ladder and 14 pieces of
        /// ruined machinery. All of them, and nothing else, must be off the grid.</summary>
        private const int Deck1Devices = 23;
        /// <summary>kW the ship actually books at boot, driven. 20.40 before this package.</summary>
        private const float FlatDemandKW = 14.30f;
        /// <summary>Three SolarWings at machines.def `gen` = 6 kW — the ship's NAMEPLATE generation,
        /// i.e. the wired generating hardware aboard.
        /// ⚠️ SINCE M2-12 THIS IS NO LONGER WHAT THE SHIP RUNS ON. `PowerSystem.Balance` scales
        /// generation by <c>Device.EffectiveRate</c>, so the wreck's three damaged wings feed it
        /// 10.65 kW, not 18.00. That figure is pinned AT THE SEAM (`PowerSystem.LastGenerationKW`)
        /// by <c>GenerationWearTests</c>, which is its only home — this constant stays because it
        /// pins something that file does not: that the hardware is still three wired 6 kW wings.
        /// Do NOT compare it with a demand figure; they are different currencies now.</summary>
        private const float NameplateGenerationKW = 18.00f;
        private const int Lamps = 16;
        private const int LampsOnDeck0 = 8;

        // ------------------------------------------------------------------- 1. the census

        /// <summary>
        /// THE OUTCOME TEST. Deck 1 is off the grid, deck 0 is on it, and the two sets are exactly
        /// the two decks — asserted device by device so a partial cut (the shape the naive fix
        /// produces) cannot pass by count alone.
        /// </summary>
        [Test]
        public void Deck1IsGenuinelyOffNetwork_AndNothingOnDeck0Is()
        {
            var sim = Boot();
            var devices = sim.Devices.Items;
            var offenders = new List<string>();
            int off = 0, deck1 = 0;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.NetworkId == 0) off++;
                if (d.Pos.Z == 1) deck1++;
                bool shouldBeOff = d.Pos.Z == 1;
                bool isOff = d.NetworkId == 0;
                if (isOff != shouldBeOff)
                    offenders.Add($"{d.Name} ({d.Kind}) at {d.Pos.X},{d.Pos.Y},{d.Pos.Z} has NetworkId " +
                                  $"{d.NetworkId} — expected {(shouldBeOff ? "0 (deck 1 is dead)" : "non-zero (deck 0 is the live trunk)")}");
            }

            // ⚠️ ONE ASSERT, EVERY LEG IN IT. `Assert` throws, so a per-leg assertion would let the
            // device-by-device list hide the three counts (and vice versa) — the fifth trap shape.
            if (deck1 != Deck1Devices)
                offenders.Add($"deck 1 holds {deck1} devices, not {Deck1Devices} — re-measure the census AND the demand before editing that literal");
            if (off != Deck1Devices)
                offenders.Add($"{off} devices are off-network, not {Deck1Devices}");
            if (devices.Count != TotalDevices)
                offenders.Add($"the device store holds {devices.Count}, not {TotalDevices} — every census in AuthoredShips' header is quoted against this number");
            Assert.That(offenders, Is.Empty,
                "the authoring's belief and the sim's behaviour disagree again:\n  " + string.Join("\n  ", offenders));
        }

        // -------------------------------------------------------------------- 2. the ledger

        /// <summary>
        /// THE LEDGER THE PLAYER READS IS THE LEDGER THE SHIP HAS. Two halves, and the second one
        /// is the point: the flat demand is measured off the running sim, and then the figure
        /// WRITTEN IN THE AUTHORING COMMENT is parsed out of the source and required to match it.
        /// A comment that states a false measurement is exactly the defect M2-11 was chartered
        /// against — this makes the next stale one a build failure instead of a discovery.
        /// </summary>
        [Test]
        public void TheFlatDemand_AndTheFigureTheAuthoringCommentClaims_Agree()
        {
            var sim = Boot();
            var devices = sim.Devices.Items;
            var machines = sim.Defs.Machines;
            float demand = 0f, generation = 0f;
            int off = 0;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.NetworkId == 0) { off++; continue; }   // off-grid: contributes nothing either way
                var def = machines[(int)d.Kind];
                generation += def.GenerationKW;
                bool wanting = d.Kind != DeviceKind.AirVent || d.IsOpen;   // PowerSystem.IsWanting
                if (def.DrawKW > 0f && wanting) demand += def.DrawKW;
            }

            // ⚠️ ONE ASSERT, EVERY LEG IN IT (the fifth trap shape). If the hand-written literals
            // threw first, MUTATION 3 — move the demand, leave the comment stale — would report as
            // "14.30 expected, 15.10 measured" and the comment-vs-code leg, the one this test
            // exists for, would never run at all.
            var offenders = new List<string>();
            var inv = CultureInfo.InvariantCulture;
            if (Math.Abs(demand - FlatDemandKW) > 0.001f)
                offenders.Add($"the ship books {demand.ToString("F2", inv)} kW of demand; this file pins {FlatDemandKW.ToString("F2", inv)}");
            if (Math.Abs(generation - NameplateGenerationKW) > 0.001f)
                offenders.Add($"the ship carries {generation.ToString("F2", inv)} kW of wired generating " +
                              $"NAMEPLATE; this file pins {NameplateGenerationKW.ToString("F2", inv)}. " +
                              "(What it actually RUNS on is condition-scaled since M2-12 and is pinned " +
                              "in GenerationWearTests, at the seam.)");

            // ⚠️ AND THE HELPER MUST NOT ASSERT EITHER — review found that it did, and an Assert
            // inside it unwound straight out of this method and DISCARDED the two offenders
            // accumulated above. A test whose header claims "one assert, every leg" while a callee
            // throws mid-collection has the fifth trap shape with extra steps. The helper now
            // RETURNS null and files its own offender instead.
            var claim = TheAuthoringsOwnClaim(offenders);
            if (claim.HasValue)
            {
                var (statedDemand, statedOff, statedTotal) = claim.Value;
                if (Math.Abs(statedDemand - demand) > 0.001f)
                    offenders.Add($"AuthoredShips' WRECK POWER PIN says {statedDemand.ToString("F2", inv)} kW " +
                                  $"of demand; the running ship books {demand.ToString("F2", inv)} kW");
                if (statedOff != off)
                    offenders.Add($"it says {statedOff} devices off-network; the running ship has {off}");
                if (statedTotal != devices.Count)
                    offenders.Add($"it says {statedTotal} devices aboard; the running ship has {devices.Count}");
            }
            Assert.That(offenders, Is.Empty,
                "the ship's power comment states a measurement the ship does not make:\n  " +
                string.Join("\n  ", offenders));
        }

        /// <summary>
        /// Pull the three figures out of the one machine-readable line in the wreck's POWER block.
        /// ⚠️ AN INCLUSION TEST, NOT A SCAN FOR ABSENCE (the fourth trap shape): the marker must
        /// match EXACTLY ONCE, so deleting or rewording it fails rather than silently
        /// vacuum-passing. Parsed with InvariantCulture — the dev machine is de-DE and
        /// <c>float.Parse("14.30")</c> under de-DE is 1430.
        /// ⚠️ IT DOES NOT ASSERT. It files onto the CALLER'S offender list and returns null, so a
        /// missing marker is one line in the caller's single end-of-test assert alongside every
        /// other offender — never a throw that unwinds past legs already collected.
        /// </summary>
        private static (float DemandKW, int OffNetwork, int Total)? TheAuthoringsOwnClaim(List<string> offenders)
        {
            string root = RepoRoot();
            if (root == null)
            {
                offenders.Add("the repo root was not discoverable by walking up from " + AppContext.BaseDirectory +
                              ", so the ship's power comment could not be read at all");
                return null;
            }
            string path = Path.Combine(root, "sim", "Sim.Gen", "AuthoredShips.cs");
            if (!File.Exists(path))
            {
                offenders.Add(path + " does not exist, so the ship's power comment could not be read at all");
                return null;
            }
            var matches = Regex.Matches(
                File.ReadAllText(path),
                @"WRECK POWER PIN \(measured, driven\): flat demand ([0-9]+\.[0-9]+) kW; off-network ([0-9]+) of ([0-9]+)");
            if (matches.Count != 1)
            {
                offenders.Add(
                    "AuthoredShips.cs must carry EXACTLY ONE 'WRECK POWER PIN (measured, driven): flat " +
                    "demand <x.xx> kW; off-network <n> of <total>' line — it is what ties the ship's " +
                    "power comment to the ship. Found " + matches.Count + ".");
                return null;
            }
            var m = matches[0];
            return (float.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture),
                    int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture),
                    int.Parse(m.Groups[3].Value, CultureInfo.InvariantCulture));
        }

        // ------------------------------------------------------- 3. deck 0 survived the cut

        /// <summary>
        /// ⭐ THE GUARD ON THE OBVIOUS WRONG FIX, AND IT IS NOT HYPOTHETICAL — IT WAS MEASURED IN
        /// THIS LANE. Deleting the deck-0 tray under EVERY deck-1 device, doors included, cuts the
        /// eight doorway tiles that are the only trayed link between each deck-0 compartment and
        /// the spine: deck 0 breaks into NINE networks and the cryo bay's lamp, scrubber, radiator
        /// and MOSS terminal plus all three benches read UNPOWERED at tick 0. The ship's whole
        /// opening dies silently. Hence the bulkhead runs in <c>WreckCutDeck1Risers</c>, and hence
        /// this test.
        /// </summary>
        [Test]
        public void TheCutDidNotShatterDeck0_OneNetwork_AndTheSurvivableCoreIsStillLit()
        {
            var sim = Boot();
            var devices = sim.Devices.Items;
            var networks = new HashSet<ushort>();
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].NetworkId != 0) networks.Add(devices[i].NetworkId);

            // The survivable core plus the matter ladder, by name. If any of these is dark at boot
            // the opening is over before the player has done anything.
            var mustBeLive = new[]
            {
                "light_cryo", "scrubber_cryo", "radiator_cryo", "term_moss",
                "light_reactor", "scrubber_reactor", "scrubber_spine", "light_spine_0",
                "recycler_1", "machineshop_1", "fabricator_1",
            };
            var offenders = new List<string>();
            foreach (var name in mustBeLive)
            {
                Device found = null;
                for (int i = 0; i < devices.Count; i++) if (devices[i].Name == name) { found = devices[i]; break; }
                if (found == null) { offenders.Add(name + " is not on the ship at all"); continue; }
                if (found.NetworkId == 0) { offenders.Add(name + " is OFF-NETWORK"); continue; }
                if (!found.Powered) offenders.Add($"{name} is on network {found.NetworkId} but UNPOWERED");
            }
            // One assert, both legs (fifth trap shape) — the network count is the CAUSE and the
            // dark core is the CONSEQUENCE, and a reader needs to see both at once.
            if (networks.Count != 1)
                offenders.Add($"deck 0 is on {networks.Count} conduit networks, not 1 — a tray tile that " +
                              "was a cut vertex has been removed and part of the ship is on an unsupplied bus");
            Assert.That(offenders, Is.Empty,
                "the cut took the survivable core or the matter ladder with it:\n  " + string.Join("\n  ", offenders));
        }

        // ------------------------------------------------------------ 4. what a player sees

        /// <summary>
        /// ⭐ THE PLAYER-VISIBLE OUTCOME, DRIVEN FOR SEVEN SIM-HOURS. Before M2-11 the wreck booted
        /// 16/16 lamps lit with 15.00 kWh in the bank, ran a 2.40 kW deficit against its own
        /// mis-authored demand, and went to 0/16 lit and 0.00 kWh at h7 — permanently, with no
        /// message anywhere. Deck 1's eight lamps must stay dark BECAUSE THEY ARE OFF THE GRID,
        /// which is the fiction the authoring comment always claimed, and deck 0 must not be dead.
        ///
        /// <para>⚠️ <b>M2-12 REWROTE THE DECK-0 HALF OF THIS TEST AND THE OLD FORM WAS RIGHT TO GO
        /// RED.</b> It asserted "8/8 lit at h7 and the bank above 15.00 kWh", which was true only
        /// while generation was condition-BLIND (a flat 18.00 kW against 14.30 of demand).
        /// Generation now rides <c>Device.EffectiveRate</c>, so the wreck's three damaged wings feed
        /// it 10.65 kW, the 15.00 kWh bank is spent by sim-hour 5 and Industry and Comfort shed
        /// from there — <b>by design: that is the deficit the player repairs their way out of</b>,
        /// and life support and the doors stay served throughout (measured hour by hour in
        /// <c>GenerationWearTests.Winnability_LifeSupportIsServedEveryHourOfTheFirstDay</c>). What
        /// this file still owns is M2-11's claim: deck 1 is off the grid, and deck 0 is not.</para>
        ///
        /// <para>⚠️ <b>AND IT IS ASSERTED OVER A WINDOW OF 120 BALANCE PASSES, NOT AT AN INSTANT.</b>
        /// A ship in persistent deficit with a flat bank does not settle dark, it FLICKERS at
        /// 0.5 Hz: a battery bursts its whole charge inside one balance second
        /// (<c>batteryKW = charge * 3600</c>), so the surplus a shed tier leaves behind re-charges
        /// it and buys back one lit second. Measured, from h6: lit, dark, lit, dark, indefinitely.
        /// A single-instant lamp count is therefore a coin toss on the sampling phase — this test
        /// asks the two questions that are phase-independent: deck 1 NEVER lights, and deck 0 is
        /// not permanently dark.</para>
        /// </summary>
        [Test]
        public void TheShipNoLongerGoesDarkAtHourSeven_AndDeck1StaysDark()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
            const int SevenHours = 7 * 36_000;   // 10 Hz
            for (int t = 0; t < SevenHours; t++) sim.Tick();

            const int Window = 120;              // balance passes; PowerSystem runs at 1 Hz
            int lamps = 0, deck0Lamps = 0;
            int passesWithDeck0Lit = 0, passesWithDeck0Dark = 0, deck1LitEver = 0;
            var offenders = new List<string>();
            var deck1Offenders = new HashSet<string>();

            for (int s = 0; s < Window; s++)
            {
                for (int t = 0; t < 10; t++) sim.Tick();
                var devices = sim.Devices.Items;
                int lit0 = 0;
                lamps = 0; deck0Lamps = 0;
                for (int i = 0; i < devices.Count; i++)
                {
                    var d = devices[i];
                    if (d.Kind != DeviceKind.Light) continue;
                    lamps++;
                    if (d.Pos.Z == 0) { deck0Lamps++; if (d.Powered) lit0++; }
                    else if (d.Powered) { deck1LitEver++; deck1Offenders.Add(d.Name); }
                }
                if (lit0 == deck0Lamps) passesWithDeck0Lit++;
                if (lit0 == 0) passesWithDeck0Dark++;
            }

            // One assert, every leg (fifth trap shape).
            foreach (var name in deck1Offenders)
                offenders.Add($"{name} is a deck-1 lamp and it was LIT at h7 — the risers are not cut");
            if (lamps != Lamps) offenders.Add($"the ship carries {lamps} lamps, not {Lamps}");
            if (deck0Lamps != LampsOnDeck0)
                offenders.Add($"deck 0 carries {deck0Lamps} lamps, not {LampsOnDeck0}");
            if (passesWithDeck0Lit == 0)
                offenders.Add($"deck 0's {LampsOnDeck0} lamps were dark in ALL {Window} balance seconds at h7 — " +
                              "the ship is permanently dark again, which is the blackout M2-11 closed");
            // ⚠️ THE NON-VACUITY HALF, and it is an INCLUSION test (trap 4, fourth shape): "the
            // lamps came on at least once" is also satisfied by a ship with no deficit at all, in
            // which case this test would silently stop being about a brownout. On the authored
            // wings the ship MUST also be dark sometimes.
            if (passesWithDeck0Dark == 0)
                offenders.Add($"deck 0's lamps were lit in all {Window} balance seconds at h7 on the AUTHORED " +
                              "wings — the wreck's power deficit has been removed, and with it the whole " +
                              "point of repairing a wing (M2-12)");

            Assert.That(offenders, Is.Empty,
                $"seven sim-hours in ({passesWithDeck0Lit} of {Window} passes fully lit, " +
                $"{passesWithDeck0Dark} fully dark, deck 1 lit in {deck1LitEver}):\n  " +
                string.Join("\n  ", offenders));
        }

        /// <summary>The house repo-root probe (two landmarks, so a stray ci.sh cannot
        /// false-positive) — the same shape as ArchitectureBoundaryTests / SurfaceBoundaryTests,
        /// with ONE deliberate difference: it returns null rather than calling
        /// <c>Assert.Fail</c>. Nothing on this test's collection path may throw, or an
        /// environment failure would discard the offenders already gathered.</summary>
        private static string RepoRoot()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                if (File.Exists(Path.Combine(dir.FullName, "ci.sh")) &&
                    Directory.Exists(Path.Combine(dir.FullName, "sim", "Sim.Core")))
                    return dir.FullName;
                dir = dir.Parent;
            }
            return null;
        }
    }
}
