using System;
using System.Collections.Generic;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// HASH HONESTY (ECONOMY-PLAN §5.1). The determinism canary is only a canary if every
    /// canonical field it claims to cover actually moves it. These tests drive the REAL
    /// <see cref="Simulation.StateHash"/> over the citizen and item folds: for each field,
    /// two identically-built sims are proven hash-equal FIRST (the precondition — otherwise
    /// a "hash changed" assertion proves nothing), then exactly one field is mutated on one
    /// twin, the mutation is confirmed to have landed by reading the field back, and the
    /// hashes must then differ.
    ///
    /// The three <c>Aliased_</c> tests are the reason this file exists. Until 2026-07-22
    /// (W0-1) both folds packed several fields into one 64-bit word with overlapping bit
    /// ranges, so genuinely DIFFERENT ship states hashed IDENTICALLY:
    ///   * ItemKind bit 7 (kind ≥ 128) landed on ReservedForJob's bit 39;
    ///   * ItemStack.Count was clipped to its low 24 bits;
    ///   * Citizen.JobWorkTicks (bits 16–47) overlapped CarryingItemId (bits 32–63).
    /// Those three tests assert two distinct states hash DIFFERENTLY — they cannot pass
    /// against the old fold, and they are constructed as exact collision pairs under it.
    ///
    /// NAMED MUTATIONS that must make these tests fail (apply, observe, revert):
    ///   * Delete any one <c>XxHash64.Combine</c> line from the citizen or item loop in
    ///     <c>Simulation.StateHash</c> ⇒ the matching row of the table test fails
    ///     ("… is not folded into StateHash").
    ///   * Restore the pre-W0-1 item pack
    ///     (<c>it.Id | ((ulong)it.Kind &lt;&lt; 32) | (it.ReservedForJob ? 1UL &lt;&lt; 39 : 0) | ((ulong)(uint)it.Count &lt;&lt; 40)</c>)
    ///     ⇒ <c>Aliased_ItemKindHighBit_IsNotTheSameBitAsReservedForJob</c> and
    ///     <c>Aliased_ItemCountAbove2Pow24_IsNotClippedToItsLow24Bits</c> fail.
    ///   * Restore the pre-W0-1 citizen pack
    ///     (<c>… | ((ulong)(uint)c.JobWorkTicks &lt;&lt; 16) | ((ulong)c.CarryingItemId &lt;&lt; 32)</c>)
    ///     ⇒ <c>Aliased_JobWorkTicksAbove65535_DoesNotOverlapCarryingItemId</c> fails.
    ///   * Replace the item loop's six chained calls with an order-independent accumulation
    ///     (<c>h ^= XxHash64.Combine(0, …)</c>) ⇒ <c>Fold_IsIdempotent_AndReadsEntityStoreOrder</c> fails.
    ///   * Drop one axis from <c>Simulation.Pack(Int3)</c> ⇒ the three rows for that axis fail
    ///     (measured: dropping <c>Y &lt;&lt; 20</c> reddens exactly <c>Citizen.Pos.Y</c>,
    ///     <c>Citizen.JobTarget.Y</c>, <c>ItemStack.Pos.Y</c>; dropping <c>Z &lt;&lt; 40</c> reddens
    ///     exactly the three <c>.Z</c> rows — 3 of 37 each time, nothing else).
    ///
    /// EVIDENCE (measured 2026-07-22, all four mutations applied and reverted): reverting the
    /// whole W0-1 fold restructure fails **exactly 4 of 37** — the three <c>Aliased_</c> tests
    /// plus the <c>ItemStack.Count (above 2^24)</c> table row. Deleting the
    /// <c>CarryingItemId</c> Combine fails exactly 1 (its table row). The XOR mutation fails
    /// exactly 1 (the order test). Note what the old fold did NOT fail: the plain
    /// <c>ItemStack.Kind (high bit, ≥128)</c> table row still passed, because 4 → 128 shifts
    /// to a *different* bit and is visible one-field-at-a-time. **Single-field mutation cannot
    /// find a bit alias — only a collision PAIR can**, which is why the three <c>Aliased_</c>
    /// tests are constructed as exact collision pairs and not as extra table rows.
    ///
    /// LIMITS, stated honestly. This covers the citizen and item folds ONLY, at tick 0, with
    /// one citizen and one item, and it says nothing about ordering stability across entity
    /// removal. Three things are KNOWN still-aliased and deliberately NOT asserted here,
    /// because W0-1's scope was the two entity packs (all three are written up in
    /// <c>MECHANICS.md</c> "What is hashed"):
    ///   * <c>Pack(Int3)</c> masks none of its three fields — X sits at bits 0–31, Y at
    ///     20–51, Z at 40–63 — so it aliases on any negative coordinate and on any
    ///     coordinate ≥ 2^20 (ECONOMY-PLAN §4.4). The Pos/JobTarget rows below perturb X, Y
    ///     and Z separately so a dropped axis is caught, but they stay inside the legal
    ///     range and therefore do NOT probe the overlap.
    ///   * The room-anchor word is <c>Pack(Probe) | (Type &lt;&lt; 60)</c>, and since Z reaches
    ///     bit 63, <c>Type</c>'s bits 60–63 sit on Z's bits 20–23: <c>anchor(z = 2^20,
    ///     Type = None)</c> and <c>anchor(z = 0, Type = Corridor)</c> are the same word. Safe
    ///     today only because <c>Probe.Z</c> is a deck index. <c>Type</c> also has exactly 4
    ///     usable bits, which <c>RoomType</c>'s 16 members fill exactly — a 17th would fold
    ///     onto <c>None</c>.
    ///   * The device word is audited alias-free (<c>NetworkId</c> is a <c>ushort</c>), but
    ///     no row below drives it.
    ///
    /// AND THE BIGGER LIMIT, because it is the one this file cannot see: a table built FROM
    /// the fold can only test fields the fold already contains. Nine saved fields are absent
    /// from <c>StateHash</c> entirely — <c>Citizen.Name/PrevPos/AutoWander/Path/PathIndex/
    /// MoveCooldown/IdleCooldown</c> (<c>SaveWriter.cs:241-248</c>), <c>ItemStack.Label</c>
    /// (<c>:317</c>), <c>Device.Name</c> (<c>:287</c>) — which contradicts the comment at
    /// <c>Simulation.cs:267</c>. The path triple is live tick state, so two sims at different
    /// path progress hash EQUAL. Closing that is its own package, not this one.
    /// </summary>
    public class StateHashHonestyTests
    {
        private static readonly string[] OneRoom = { "#####", "#...#", "#####" };

        /// <summary>A minimal two-entity sim, never ticked, so the ONLY thing that can move
        /// the hash between twins is the mutation under test.</summary>
        private static Simulation Fixture()
        {
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);
            var c = sim.AddCitizen("Vale", new Int3(1, 1, 0));
            c.JobKind = JobKind.Dig;
            c.JobTarget = new Int3(2, 1, 0);
            c.JobWorkTicks = 40;
            c.CarryingItemId = 0;
            c.ReservedItemId = 0;
            c.Suffocation = 0.1f;
            c.Hunger = 0.2f;
            c.Thirst = 0.3f;
            c.Fatigue = 0.4f;
            c.Mood = 5f;
            c.Health = 0.9f;
            c.Morale = 0.8f;
            var it = sim.AddItem(ItemKind.Scrap, 5, new Int3(2, 1, 0));
            it.ReservedForJob = false;
            it.CarriedBy = 0;
            return sim;
        }

        private static Citizen Cit(Simulation s) => s.Citizens.Items[0];
        private static ItemStack Item(Simulation s) => s.Items.Items[0];

        // ------------------------------------------------------------------ the table

        private static IEnumerable<TestCaseData> Fields()
        {
            // --- Citizen fold ---
            yield return Case("Citizen.Id", s => Cit(s).Id = 4242, s => Cit(s).Id);
            // Pack(Int3) folds three axes into one word, so perturb each axis ALONE — an X-only
            // row would pass even if Y and Z were dropped from the packing entirely. The Z rows
            // put the entity on a deck the fixture world does not have; that is a deliberate
            // fold probe, not a reachable sim state (StateHash never consults World.InBounds).
            yield return Case("Citizen.Pos.X", s => Cit(s).Pos = new Int3(3, 1, 0), s => (ulong)Cit(s).Pos.X);
            yield return Case("Citizen.Pos.Y", s => Cit(s).Pos = new Int3(1, 2, 0), s => (ulong)Cit(s).Pos.Y);
            yield return Case("Citizen.Pos.Z", s => Cit(s).Pos = new Int3(1, 1, 1), s => (ulong)Cit(s).Pos.Z);
            yield return Case("Citizen.Suffocation", s => Cit(s).Suffocation = 0.55f, s => Bits(Cit(s).Suffocation));
            yield return Case("Citizen.Hunger", s => Cit(s).Hunger = 0.55f, s => Bits(Cit(s).Hunger));
            yield return Case("Citizen.Thirst", s => Cit(s).Thirst = 0.55f, s => Bits(Cit(s).Thirst));
            yield return Case("Citizen.Fatigue", s => Cit(s).Fatigue = 0.55f, s => Bits(Cit(s).Fatigue));
            yield return Case("Citizen.Mood", s => Cit(s).Mood = -12f, s => Bits(Cit(s).Mood));
            yield return Case("Citizen.JobKind", s => Cit(s).JobKind = JobKind.Craft, s => (ulong)Cit(s).JobKind);
            yield return Case("Citizen.Dead", s => Cit(s).Dead = true, s => Cit(s).Dead ? 1UL : 0UL);
            yield return Case("Citizen.RevealsFog", s => Cit(s).RevealsFog = false, s => Cit(s).RevealsFog ? 1UL : 0UL);
            yield return Case("Citizen.HoldPosition", s => Cit(s).HoldPosition = true, s => Cit(s).HoldPosition ? 1UL : 0UL);
            yield return Case("Citizen.JobWorkTicks", s => Cit(s).JobWorkTicks = 41, s => (ulong)(uint)Cit(s).JobWorkTicks);
            yield return Case("Citizen.CarryingItemId", s => Cit(s).CarryingItemId = 9, s => Cit(s).CarryingItemId);
            yield return Case("Citizen.JobTarget.X", s => Cit(s).JobTarget = new Int3(3, 1, 0), s => (ulong)Cit(s).JobTarget.X);
            yield return Case("Citizen.JobTarget.Y", s => Cit(s).JobTarget = new Int3(2, 2, 0), s => (ulong)Cit(s).JobTarget.Y);
            yield return Case("Citizen.JobTarget.Z", s => Cit(s).JobTarget = new Int3(2, 1, 1), s => (ulong)Cit(s).JobTarget.Z);
            yield return Case("Citizen.ReservedItemId", s => Cit(s).ReservedItemId = 9, s => Cit(s).ReservedItemId);
            yield return Case("Citizen.Faction", s => Cit(s).Faction = 1, s => Cit(s).Faction);
            yield return Case("Citizen.Archetype", s => Cit(s).Archetype = 3, s => Cit(s).Archetype);
            yield return Case("Citizen.Health", s => Cit(s).Health = 0.5f, s => Bits(Cit(s).Health));
            yield return Case("Citizen.Morale", s => Cit(s).Morale = 0.5f, s => Bits(Cit(s).Morale));

            // --- Item fold ---
            yield return Case("ItemStack.Id", s => Item(s).Id = 4242, s => Item(s).Id);
            yield return Case("ItemStack.Kind", s => Item(s).Kind = ItemKind.Parts, s => (ulong)Item(s).Kind);
            // The two fields the old pack clipped or aliased, exercised at the widths the
            // economy will actually reach (a 128th kind; a stockpile above 16.7M units).
            yield return Case("ItemStack.Kind (high bit, ≥128)", s => Item(s).Kind = (ItemKind)128, s => (ulong)Item(s).Kind);
            yield return Case("ItemStack.ReservedForJob", s => Item(s).ReservedForJob = true, s => Item(s).ReservedForJob ? 1UL : 0UL);
            yield return Case("ItemStack.Count", s => Item(s).Count = 6, s => (ulong)(uint)Item(s).Count);
            yield return Case("ItemStack.Count (above 2^24)", s => Item(s).Count = 5 + (1 << 24), s => (ulong)(uint)Item(s).Count);
            yield return Case("ItemStack.Pos.X", s => Item(s).Pos = new Int3(3, 1, 0), s => (ulong)Item(s).Pos.X);
            yield return Case("ItemStack.Pos.Y", s => Item(s).Pos = new Int3(2, 2, 0), s => (ulong)Item(s).Pos.Y);
            yield return Case("ItemStack.Pos.Z", s => Item(s).Pos = new Int3(2, 1, 1), s => (ulong)Item(s).Pos.Z);
            yield return Case("ItemStack.CarriedBy", s => Item(s).CarriedBy = 7, s => Item(s).CarriedBy);
        }

        private static TestCaseData Case(string name, Action<Simulation> mutate, Func<Simulation, ulong> read) =>
            new TestCaseData(name, mutate, read).SetName("Field_MovesTheStateHash_" + Sanitize(name));

        private static string Sanitize(string s)
        {
            var chars = new char[s.Length];
            for (int i = 0; i < s.Length; i++)
                chars[i] = (s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= '0' && s[i] <= '9')
                    ? s[i] : '_';
            return new string(chars);
        }

        /// <summary>
        /// Every canonical field of the citizen and item folds moves StateHash when it —
        /// and only it — changes. Fails if a Combine call is dropped, or if two fields
        /// share bits (the mutated field's contribution vanishes into a neighbour's).
        /// </summary>
        [TestCaseSource(nameof(Fields))]
        public void Field_MovesTheStateHash(string field, Action<Simulation> mutate, Func<Simulation, ulong> read)
        {
            var a = Fixture();
            var b = Fixture();

            // Precondition 1: the harness really does build identical states.
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()),
                "precondition: twin fixtures must hash equal before any mutation");
            ulong before = read(b);

            mutate(b);

            // Precondition 2: the stimulus landed — this is not a no-op mutation.
            Assert.That(read(b), Is.Not.EqualTo(before), field + ": precondition — the mutation did not change the field");

            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                field + " is not folded into StateHash, or it aliases another field's bits");
        }

        // ------------------------------------------------------------------ the three aliases
        // Each builds an exact COLLISION PAIR under the pre-W0-1 packing: two distinct ship
        // states whose packed words were bit-for-bit equal.

        /// <summary>
        /// Pre-W0-1 the item word was <c>Id | Kind&lt;&lt;32 | Reserved&lt;&lt;39 | Count&lt;&lt;40</c>, so a kind of
        /// 128 set bit 39 — the same bit as ReservedForJob. "128 unreserved" and "kind 0
        /// reserved" were therefore the same hash. Named mutation: restore that expression.
        /// </summary>
        [Test]
        public void Aliased_ItemKindHighBit_IsNotTheSameBitAsReservedForJob()
        {
            var a = Fixture();
            var b = Fixture();
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "precondition: twins hash equal");

            Item(a).Kind = (ItemKind)128;   // old fold: sets bit 39
            Item(a).ReservedForJob = false;
            Item(b).Kind = (ItemKind)0;
            Item(b).ReservedForJob = true;  // old fold: sets bit 39 too

            Assert.That(Item(a).Kind, Is.Not.EqualTo(Item(b).Kind), "precondition: the two states really differ");
            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "ItemKind's high bit collides with ReservedForJob in the item fold");
        }

        /// <summary>
        /// Pre-W0-1 <c>Count</c> was shifted left 40, keeping only its low 24 bits, so
        /// 5 and 5 + 2^24 units hashed identically. Named mutation: restore the item pack.
        /// </summary>
        [Test]
        public void Aliased_ItemCountAbove2Pow24_IsNotClippedToItsLow24Bits()
        {
            var a = Fixture();
            var b = Fixture();
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "precondition: twins hash equal");

            Item(a).Count = 5;
            Item(b).Count = 5 + (1 << 24);

            Assert.That(Item(a).Count, Is.Not.EqualTo(Item(b).Count), "precondition: the two states really differ");
            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "ItemStack.Count is clipped to 24 bits in the item fold");
        }

        /// <summary>
        /// Pre-W0-1 the citizen word put JobWorkTicks at bits 16–47 and CarryingItemId at
        /// bits 32–63 — a 16-bit overlap. With CarryingItemId = 5 (bits 32 and 34 after the
        /// shift), a JobWorkTicks of 65,536 contributed only bit 32, which CarryingItemId
        /// already owned: "109 sim-minutes of work left, carrying stack 5" hashed the same
        /// as "no work left, carrying stack 5". Named mutation: restore the citizen pack.
        /// </summary>
        [Test]
        public void Aliased_JobWorkTicksAbove65535_DoesNotOverlapCarryingItemId()
        {
            var a = Fixture();
            var b = Fixture();
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "precondition: twins hash equal");

            Cit(a).CarryingItemId = 5;
            Cit(a).JobWorkTicks = 65536;   // old fold: 65536 << 16 == bit 32, already set by 5 << 32
            Cit(b).CarryingItemId = 5;
            Cit(b).JobWorkTicks = 0;

            Assert.That(Cit(a).JobWorkTicks, Is.Not.EqualTo(Cit(b).JobWorkTicks), "precondition: the two states really differ");
            Assert.That(Cit(a).CarryingItemId, Is.EqualTo(Cit(b).CarryingItemId), "precondition: only JobWorkTicks differs");
            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "JobWorkTicks above 65,535 is swallowed by CarryingItemId in the citizen fold");
        }

        // ------------------------------------------------------------------ order stability

        /// <summary>
        /// The restructured fold is still a chained, STORE-ORDERED fold: hashing twice in a
        /// row is idempotent, an identically-built twin agrees, and two sims holding the same
        /// two stacks in the opposite insertion order hash DIFFERENTLY. That last clause is
        /// the guard for ECONOMY-PLAN §4.1/§4.3 — entity-store order is the hash order, and
        /// any future "canonicalise the fold order" or set-like accumulation would silently
        /// hide a real state difference.
        /// Named mutation: in the item loop of <c>Simulation.StateHash</c>, replace all six
        /// chained calls with an order-independent accumulation
        /// (<c>h ^= XxHash64.Combine(0, …)</c>) ⇒ the insertion-order clause fails.
        /// LIMIT: it proves the fold is order-SENSITIVE, not that any particular order is the
        /// right one; the pinned scenario/golden hashes are what pin the specific order.
        /// </summary>
        [Test]
        public void Fold_IsIdempotent_AndReadsEntityStoreOrder()
        {
            var a = Fixture();
            ulong first = a.StateHash();
            Assert.That(a.StateHash(), Is.EqualTo(first), "StateHash is not idempotent — the fold mutates state");
            Assert.That(Fixture().StateHash(), Is.EqualTo(first), "same build order must hash equal");

            var forward = Fixture();
            var fParts = forward.AddItem(ItemKind.Parts, 2, new Int3(1, 1, 0));
            var fPotato = forward.AddItem(ItemKind.Potato, 9, new Int3(3, 1, 0));

            var reversed = Fixture();
            var rPotato = reversed.AddItem(ItemKind.Potato, 9, new Int3(3, 1, 0));
            var rParts = reversed.AddItem(ItemKind.Parts, 2, new Int3(1, 1, 0));
            // Ids follow insertion order, so re-pin them: the two sims must now hold the
            // IDENTICAL set of item states and differ ONLY in store position.
            rParts.Id = fParts.Id;
            rPotato.Id = fPotato.Id;

            Assert.That(forward.Items.Count, Is.EqualTo(reversed.Items.Count), "precondition: same multiset of stacks");
            Assert.That(forward.Items.Items[1].Kind, Is.Not.EqualTo(reversed.Items.Items[1].Kind),
                "precondition: the two stores really are in opposite order");
            Assert.That(rParts.Id, Is.EqualTo(fParts.Id), "precondition: the item states themselves are identical");
            Assert.That(reversed.StateHash(), Is.Not.EqualTo(forward.StateHash()),
                "the fold has stopped reading entity-store order");
        }

        private static ulong Bits(float v) => (ulong)(uint)BitConverter.SingleToInt32Bits(v);
    }
}
