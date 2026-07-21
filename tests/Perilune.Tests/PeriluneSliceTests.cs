using System.Collections.Generic;
using System.IO;
using System.Text;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// P2 SH1 — the "Talking Ship" slice's authored crew. Proves the eight-crew ship boots
    /// with full personas (name/role/3 traits/2 values/2 fears/speech/backstory), that every
    /// authored secret is a REAL fact the reveal path can offer (CapabilityComputer), that the
    /// seeded relationship web classifies into the expected tiers after the first social pass,
    /// that personas + secrets + notes survive a MEMS save/load, that twin boots are
    /// bit-identical, and — the hard constraint — that authoring the slice never mutates the
    /// pinned 2-crew Perilune.
    /// </summary>
    public class PeriluneSliceTests
    {
        private static SimHost BootSlice() => SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);

        // ------------------------------------------------------------ crew + personas

        [Test]
        public void Slice_BootsEightCrew_WithFullAuthoredPersonas()
        {
            var host = BootSlice();
            Assert.That(host.Sim.Citizens.Items.Count, Is.EqualTo(8), "the slice crews eight");

            foreach (var c in host.Sim.Citizens.Items)
            {
                Assert.That(host.Minds.Minds.TryGet(c.Id, out var mind), Is.True, $"{c.Name} has a mind");
                var p = mind.Persona;
                Assert.That(p, Is.Not.Null, $"{c.Name} has a persona");
                Assert.That(p.Name, Is.EqualTo(c.Name));
                Assert.That(p.RolePreRaid, Is.Not.Empty, $"{c.Name} pre-raid role");
                Assert.That(p.Traits.Length, Is.EqualTo(3), $"{c.Name} traits");
                Assert.That(p.Values.Length, Is.EqualTo(2), $"{c.Name} values");
                Assert.That(p.Fears.Length, Is.EqualTo(2), $"{c.Name} fears");
                Assert.That(p.SpeechStyle, Is.Not.Empty, $"{c.Name} speech style");
                Assert.That(p.RaidBackstory.Length, Is.GreaterThan(40), $"{c.Name} backstory prose");
                Assert.That(p.Secrets.Length, Is.GreaterThanOrEqualTo(1), $"{c.Name} carries a secret");
            }
        }

        // ------------------------------------------------------------ survivability canary

        [Test]
        public void Slice_SurvivesOneUnattendedDay_Canary()
        {
            // The SH1 canary (the eight-crew mirror of ShipDesignTests' two-crew day-one gate):
            // an untouched slice keeps all eight alive through a full unattended sim-day, with
            // life support holding. The rigorous three-day + stress balance is M2's job.
            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;
            for (long t = 0; t < 864000L; t++) sim.Tick();

            int alive = 0;
            foreach (var c in sim.Citizens.Items) if (!c.Dead) alive++;
            Assert.That(alive, Is.EqualTo(8), "all eight crew survive an unattended day");
            Assert.That(ShipMetrics.Compute(sim).Oxygen, Is.GreaterThan(0.9f), "air held through the day");
        }

        // -------------------------------------------------- secrets are fact-backed + revealable

        [Test]
        public void Slice_EverySecret_IsFactBacked_AndRevealIsOffered()
        {
            var host = BootSlice();
            var cap = new CapabilityComputer();
            var manifest = new CapabilityManifest();

            foreach (var c in host.Sim.Citizens.Items)
            {
                Assert.That(host.Minds.Minds.TryGet(c.Id, out var mind), Is.True);
                foreach (var secret in mind.Persona.Secrets)
                {
                    // 1. The backing fact exists in the registry.
                    Assert.That(host.Facts.TryGet(secret.FactId, out var fact), Is.True,
                        $"{c.Name}'s secret {secret.FactId} has a real ShipFact");
                    Assert.That(fact.Text, Is.Not.Empty);
                    // 2. The mind knows it (the reveal_info enum domain).
                    Assert.That(mind.KnownFactIds, Does.Contain(secret.FactId), $"{c.Name} knows its own secret fact");
                }

                // 3. CapabilityComputer offers RevealInfo, and the fact ids are in the domain.
                cap.Compute(host.Sim, host.Minds, host.Facts, c.Id, manifest);
                Assert.That((manifest.LegalEffects & EffectKind.RevealInfo) != 0, Is.True,
                    $"{c.Name} can legally reveal info");
                foreach (var secret in mind.Persona.Secrets)
                    Assert.That(manifest.KnownFactIds, Does.Contain(secret.FactId),
                        $"{c.Name}'s secret is in the reveal domain");
            }
        }

        // ------------------------------------------------- seeded relationship web

        [Test]
        public void Slice_SeededRelationshipWeb_ClassifiesAfterFirstPass()
        {
            var host = BootSlice();
            Assert.That(host.Social, Is.Not.Null, "the social system is in the stack and captured");

            // Opinions are present at boot (before any pass).
            uint amara = Id(host.Sim, "Amara Okonkwo"), nadia = Id(host.Sim, "Nadia Hassan");
            uint priya = Id(host.Sim, "Priya Raghavan");
            uint dmitri = Id(host.Sim, "Dmitri Volkov"), salif = Id(host.Sim, "Salif Camara");
            uint tomas = Id(host.Sim, "Tomas Ferreira");

            Assert.That(host.Social.GetOpinion(amara, nadia), Is.GreaterThan(60f), "seeded opinion present at boot");

            // Run a few 1 Hz social passes so the hysteresis classifier settles the tiers.
            for (int i = 0; i < 30; i++) host.Sim.Tick();

            // Close friends (65) → CloseFriend both ways.
            Assert.That(host.Social.GetRelation(amara, nadia), Is.EqualTo(RelationType.CloseFriend));
            Assert.That(host.Social.GetRelation(nadia, amara), Is.EqualTo(RelationType.CloseFriend));

            // Mentorship asymmetry: apprentice looks up more than the mentor leans down.
            Assert.That(host.Social.GetRelation(priya, amara), Is.EqualTo(RelationType.CloseFriend), "Priya adores her mentor (60)");
            Assert.That(host.Social.GetRelation(amara, priya), Is.EqualTo(RelationType.Friend), "Amara's fondness for her apprentice (55)");

            // The one rivalry (−40) → Rival both ways.
            Assert.That(host.Social.GetRelation(dmitri, salif), Is.EqualTo(RelationType.Rival));
            Assert.That(host.Social.GetRelation(salif, dmitri), Is.EqualTo(RelationType.Rival));

            // A plain friendship (40) → Friend.
            Assert.That(host.Social.GetRelation(tomas, dmitri), Is.EqualTo(RelationType.Friend));
        }

        // ------------------------------------------------- persona MEMS round-trip

        [Test]
        public void Slice_Personas_RoundTripThroughMems()
        {
            var host = BootSlice();
            var mem = new MemorySystem(host.Minds, host.Facts);

            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, Encoding.UTF8, leaveOpen: true)) mem.CaptureState(w);
            ms.Position = 0;

            var freshMinds = new MindState();
            var freshFacts = new FactRegistry();
            var freshMem = new MemorySystem(freshMinds, freshFacts);
            using (var r = new BinaryReader(ms, Encoding.UTF8, leaveOpen: true)) freshMem.RestoreState(r, mem.StateVersion);

            Assert.That(freshMinds.Minds.Count, Is.EqualTo(8), "eight minds round-trip");
            Assert.That(freshFacts.Count, Is.EqualTo(host.Facts.Count), "all backing facts round-trip");

            foreach (var original in host.Minds.Minds.Items)
            {
                Assert.That(freshMinds.Minds.TryGet(original.CitizenId, out var loaded), Is.True);
                Assert.That(loaded.Persona, Is.Not.Null);
                Assert.That(loaded.Persona.Name, Is.EqualTo(original.Persona.Name));
                Assert.That(loaded.Persona.Traits, Is.EqualTo(original.Persona.Traits));
                Assert.That(loaded.Persona.Secrets.Length, Is.EqualTo(original.Persona.Secrets.Length));
                Assert.That(loaded.Persona.Secrets[0].FactId, Is.EqualTo(original.Persona.Secrets[0].FactId));
                Assert.That(loaded.Persona.Secrets[0].Text, Is.EqualTo(original.Persona.Secrets[0].Text));
                Assert.That(loaded.Persona.RelationshipNotes.Count, Is.EqualTo(original.Persona.RelationshipNotes.Count));
            }
        }

        // ------------------------------------------------- determinism + the hard constraint

        [Test]
        public void Slice_TwinBoot_IsBitIdentical()
        {
            var a = BootSlice();
            var b = BootSlice();
            Assert.That(a.Sim.StateHash(), Is.EqualTo(b.Sim.StateHash()), "twin slice boots hash-equal at tick 0");
            for (int i = 0; i < 3000; i++) { a.Sim.Tick(); b.Sim.Tick(); }
            Assert.That(a.Sim.StateHash(), Is.EqualTo(b.Sim.StateHash()), "twin slice runs stay bit-identical");
        }

        [Test]
        public void Slice_DoesNotMutate_The2CrewPerilune()
        {
            // Perilune() is a factory (fresh plan each call); building the slice from a copy must
            // never perturb it. Snapshot the reference plan, build the slice, snapshot again.
            var before = Signature(AuthoredShips.Perilune());
            _ = AuthoredShips.PeriluneSlice();
            var after = Signature(AuthoredShips.Perilune());
            Assert.That(after, Is.EqualTo(before), "authoring the slice left the pinned Perilune untouched");

            var perilune = AuthoredShips.Perilune();
            Assert.That(perilune.Citizens.Count, Is.EqualTo(2), "Perilune still crews two");
            Assert.That(perilune.Name, Is.EqualTo("MSV Perilune"));
        }

        // ------------------------------------------------------------ helpers

        private static uint Id(Simulation sim, string name)
        {
            foreach (var c in sim.Citizens.Items) if (c.Name == name) return c.Id;
            Assert.Fail($"citizen '{name}' not found");
            return 0;
        }

        private static string Signature(ShipPlan plan)
        {
            var sb = new StringBuilder();
            sb.Append(plan.Name).Append('|').Append(plan.Seed).Append('|');
            sb.Append("dev=").Append(plan.Devices.Count).Append('|');
            sb.Append("cit=").Append(plan.Citizens.Count).Append('|');
            sb.Append("item=").Append(plan.Items.Count).Append('|');
            sb.Append("press=").Append(plan.PressurizedAnchors.Count).Append('|');
            foreach (var c in plan.Citizens) sb.Append(c.Name).Append('@').Append(c.Pos).Append(';');
            return sb.ToString();
        }
    }
}
