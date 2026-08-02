using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// M2-1 — THE WORK-PRIORITY GRID, WHICH IS STORAGE AND NOTHING ELSE.
    ///
    /// This package adds four saved, hashed fields to <see cref="Citizen"/> — the six-slot work
    /// priority grid, the <c>WorkIncapable</c> mask, and two reserved fields (<c>Skill</c> for
    /// M3-7, <c>HeldByOrder</c> for M2-19) — and it adds NO reader for any of them. Everything
    /// below therefore guards one of exactly three claims:
    ///
    ///   1. THE SHAPE IS RIGHT — six work types ranked in OD-J's order by an explicit
    ///      <c>NaturalPriority</c> constant (the equal-priority TIE-BREAK, so the ranking is
    ///      gameplay and the column order is derived from it), 1..4 with 1 highest, blank = will not
    ///      do it, and "the person cannot" representable separately from "the player switched it
    ///      off".
    ///   2. IT SURVIVES A SAVE AND MOVES THE HASH — the <c>CLAUDE.md</c> invariant, per field and
    ///      per slot, because a fold that drops five of six slots passes any test written against
    ///      the array as a whole.
    ///   3. NOTHING READS IT — the package's own headline claim, mechanised rather than asserted.
    ///      ⚠️ TRUE OF M2-1's TREE ONLY: M2-2 landed the veto (see the enrolment ledger below, which
    ///      records that correction), and M2-19 gave <c>HeldByOrder</c> a reader too
    ///      (<c>Citizen.IsRecruitableIgnoringJob</c> — the sticky claim). What survives is the
    ///      MECHANISM: a ledger that only grows. <c>Skill</c> is the last field here with no reader.
    ///      The three <c>HeldByOrder</c> legs in this file are still M2-19's save/hash pins — it
    ///      deliberately adds no fourth spelling of them.
    ///
    /// ⚠️ THE DEFAULT IS OFF, A DELIBERATE DIVERGENCE FROM RIMWORLD — and a smaller one than it is
    /// usually stated. RimWorld's <c>EnableAndInitialize</c> also starts from a ZEROED grid and then
    /// enables a SKILL-SHAPED subset at priority 3 (<c>docs/design/rimworld-reference.md</c> §1.4);
    /// what OD-H (2026-07-29, re-confirmed) declines is the auto-enable, so that the pawn boots
    /// waiting and the player's first act is an order (OD-G). Exactly ONE test below pins that
    /// value, so flipping <see cref="WorkPriority.Default"/> moves one test deliberately instead of
    /// reddening five by surprise. It will also move determinism pins P1/P2/P3 — the byte is hashed.
    /// </summary>
    public class WorkPriorityStateTests
    {
        private static readonly string[] OneRoom = { "#####", "#...#", "#####" };

        private static Simulation Fixture() =>
            new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);

        /// <summary>The enum's members in DECLARATION ORDER — which is what <c>Enum.GetValues</c>
        /// returns for a byte-backed enum with contiguous ascending values, and that premise is
        /// itself pinned by <see cref="WorkTypeValues_AreContiguousFromZero"/>.</summary>
        private static readonly WorkType[] All = (WorkType[])Enum.GetValues(typeof(WorkType));

        private static Simulation SaveAndLoad(Simulation sim)
        {
            var blob = new MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;
            return SaveReader.Read(blob, new ISimSystem[0], sim.Defs);
        }

        /// <summary>A citizen with EVERY new field set away from its default, so a round-trip leg
        /// that asserts only its own field still travels beside realistic neighbours. Positional
        /// formats being what they are, a mutation to one field disturbs the ones after it — the
        /// blinding here buys a failure that NAMES the field, not isolation from its neighbours.
        /// That limit is stated rather than papered over.</summary>
        private static Citizen SeededCrew(Simulation sim)
        {
            var c = sim.AddCitizen("Vale", new Int3(1, 1, 0));
            c.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            c.SetWorkPriority(WorkType.Construct, 2);
            c.SetWorkPriority(WorkType.Craft, 3);
            c.SetWorkPriority(WorkType.Deconstruct, WorkPriority.Lowest);
            c.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);
            c.SetWorkPriority(WorkType.Haul, WorkPriority.Off);   // off AND incapable — see below
            c.SetIncapableOf(WorkType.Haul, true);
            // ⭐ M3-7 — the skill array, seeded with a DIFFERENT level per work type. A uniform seed
            // would round-trip through a save (or a fold) that only ever wrote slot 0 six times.
            for (int t = 0; t < All.Length; t++) c.SetSkill(All[t], (byte)(5 + t));
            c.HeldByOrder = true;
            return c;
        }

        // ================================================================ 1. the shape

        /// <summary>
        /// ⭐ THE ONE TEST THAT PINS THE SHIPPED DEFAULT. A crew member boots with every work type
        /// OFF, and the assertion is made BY NAME (<see cref="Citizen.IsWorkEnabled"/> is false)
        /// rather than against the encoded byte, because "0" and "off" are the same byte and
        /// different claims — a later packing change that shifts the encoding must redden this.
        ///
        /// It deliberately does NOT assert <c>GetWorkPriority(t) == WorkPriority.Default</c>. That
        /// would be self-derivation: the constant is the initialiser's only reader, so both sides
        /// would move together and flipping the default would leave this green. The claim under
        /// test is "the shipped default is OFF", not "the default is the default".
        ///
        /// NON-VACUITY, and it is mandatory rather than decorative: "every type reads off" is also
        /// satisfied by an <see cref="Citizen.IsWorkEnabled"/> that can never return true, and by
        /// an enum with no members. Both are closed below — the control turns one type ON and
        /// requires it to read on while its five neighbours stay off, and the member count is
        /// asserted before the loop.
        ///
        /// NAMED MUTATIONS (applied, observed, reverted):
        ///   * <c>WorkPriority.Default = 3</c> (RimWorld's own default) ⇒ this test fails, and the
        ///     re-pinned P1/P2/P3 fail with it.
        ///   * make <c>IsWorkEnabled</c> return <c>false</c> unconditionally ⇒ the control fails.
        /// </summary>
        [Test]
        public void Default_IsOff_ForEveryWorkType_AndOnIsReachable()
        {
            Assert.That(All.Length, Is.EqualTo(WorkPriority.WorkTypeCount),
                "precondition: the enum must actually have members, or 'every type is off' is vacuous");
            Assert.That(All.Length, Is.GreaterThan(0), "precondition: a non-empty work-type list");

            var sim = Fixture();
            var crew = sim.AddCitizen("Vale", new Int3(1, 1, 0));

            foreach (var t in All)
                Assert.That(crew.IsWorkEnabled(t), Is.False,
                    "OD-H: a new crew member does NO work type until the player switches it on — " +
                    t + " is enabled at boot. (RimWorld also starts from a zeroed grid and then " +
                    "auto-enables a SKILL-SHAPED subset at priority 3, reference §1.4; declining " +
                    "that auto-enable is the deliberate divergence — see WorkPriority.Default.)");

            // CONTROL — the predicate can say YES. Without this leg, an IsWorkEnabled that always
            // returns false satisfies every assertion above.
            crew.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);
            Assert.That(crew.IsWorkEnabled(WorkType.Haul), Is.True,
                "CONTROL: IsWorkEnabled can never report ON — the 'all off' legs above are vacuous");
            foreach (var t in All)
                if (t != WorkType.Haul)
                    Assert.That(crew.IsWorkEnabled(t), Is.False,
                        "CONTROL: switching Haul on switched " + t + " on too — the slots alias");
        }

        /// <summary>
        /// ⭐ THE TIE-BREAK IS <c>NaturalPriority</c>, AND THE COLUMN ORDER IS DERIVED FROM IT — not
        /// the other way round. <c>docs/design/rimworld-reference.md</c> §1.3 measures RimWorld's
        /// actual sort key as <c>naturalPriority + (4 − playerPriority) × 100000</c>, descending, and
        /// records that the tab is *displayed* in <c>naturalPriority</c> order too, which is why the
        /// wiki's "tasks on the left go first" is a correct prediction of a wrong mechanism. A lane
        /// that pins declaration order as the RULE has pinned the display.
        ///
        /// <para></para>
        /// THREE CLAIMS, THREE TESTS — deliberately not three legs of one test. <c>assert</c>
        /// throws, so only the first failing leg of a multi-leg test reports, and a leg that can
        /// never fire is indistinguishable from one that can (§13.3). Split, each of the three is
        /// shown firing on its own by its own named mutation.
        /// </summary>
        [Test]
        public void NaturalPriority_RanksOdJsOrder()
        {
            var expected = new[] { "Repair", "Construct", "Craft", "Deconstruct", "Mine", "Haul" };
            var ranked = new string[WorkPriority.RankedOrder.Count];
            for (int i = 0; i < ranked.Length; i++) ranked[i] = WorkPriority.RankedOrder[i].ToString();

            Assert.That(ranked, Is.EqualTo(expected),
                "THE WORK-TYPE ARBITRATION ORDER MOVED. Equal player priorities are broken by " +
                "WorkPriority.NaturalPriority, highest first (RimWorld's rule, reference §1.3), and " +
                "OD-J fixes it as Repair · Construct · Craft · Deconstruct · Mine · Haul — repair " +
                "first because it is the wreck's premise, haul last as in RimWorld. If the owner " +
                "re-ranked them, move this list in the same commit and say so.");
        }

        /// <summary>
        /// The ranks are all DISTINCT and inside RimWorld's own 0..10000 constraint. Distinctness
        /// matters more than it looks: with a tie the order falls through to the stable sort's
        /// declaration order — i.e. silently back to "the display IS the rule", the exact conflation
        /// this table exists to prevent. Reference §1.3 flags as ⚠️ UNVERIFIED whether vanilla
        /// RimWorld ever has such a tie, so this game simply does not create one.
        ///
        /// NAMED MUTATION: give <c>Mine</c> and <c>Haul</c> the same value ⇒ this fails, and
        /// <see cref="NaturalPriority_RanksOdJsOrder"/> stays GREEN (the stable sort still yields
        /// OD-J's order) — which is precisely why it needs its own test.
        /// </summary>
        [Test]
        public void NaturalPriority_ValuesAreDistinct_AndInRimWorldsRange()
        {
            var seen = new HashSet<int>();
            foreach (var t in All)
            {
                int n = WorkPriority.NaturalPriority(t);
                Assert.That(seen.Add(n), Is.True,
                    "two work types share natural priority " + n + " (" + t + "), so their " +
                    "arbitration order falls back to declaration order — the display becoming the " +
                    "rule again, by accident");
                Assert.That(n, Is.InRange(0, 10000),
                    "RimWorld constrains naturalPriority to 0..10000 (reference §1.3); staying " +
                    "inside that range keeps the analogy honest when M2-5 implements the sort key");
            }
        }

        /// <summary>
        /// The DISPLAY (enum declaration) order currently AGREES with the ranking. This is a DERIVED
        /// fact, not a definition — the column order comes from the ranking and is allowed to
        /// diverge, but only deliberately.
        ///
        /// NAMED MUTATION: swap <c>Mine</c>'s and <c>Haul</c>'s enum VALUES ⇒ this fails while
        /// <see cref="NaturalPriority_RanksOdJsOrder"/> stays GREEN — the proof that arbitration did
        /// NOT silently move with the columns, which is the whole point of splitting them.
        /// </summary>
        [Test]
        public void WorkTypeDeclarationOrder_AgreesWithTheRanking()
        {
            var ranked = new string[WorkPriority.RankedOrder.Count];
            for (int i = 0; i < ranked.Length; i++) ranked[i] = WorkPriority.RankedOrder[i].ToString();
            var declared = new string[All.Length];
            for (int i = 0; i < All.Length; i++) declared[i] = All[i].ToString();

            Assert.That(declared, Is.EqualTo(ranked),
                "the WorkType DECLARATION order no longer matches the NaturalPriority ranking. " +
                "That is PERMITTED — the column order is derived from the ranking, not the other " +
                "way round — but it means the work tab would read in a different order from the " +
                "one crew actually arbitrate in. If that is intended, move this test in the same " +
                "commit; if it is not, you reordered the enum and left the ranking behind.");
        }

        /// <summary>
        /// The values are contiguous from zero, because they are used two ways that both assume it:
        /// as an INDEX into the six-slot grid, and as a BIT INDEX into the 8-bit incapability mask.
        /// A gap leaves a slot no work type addresses; a re-based value walks off the end.
        /// </summary>
        [Test]
        public void WorkTypeValues_AreContiguousFromZero()
        {
            for (int i = 0; i < All.Length; i++)
                Assert.That((byte)All[i], Is.EqualTo((byte)i),
                    "WorkType." + All[i] + " must be " + i + ": the value is both the grid index " +
                    "and the incapability bit index");

            Assert.That(WorkPriority.WorkTypeCount, Is.EqualTo(All.Length),
                "WorkPriority.WorkTypeCount is stale — it sizes the saved, hashed grid, so a " +
                "seventh WorkType with a five-slot array silently drops a column");

            var crew = Fixture().AddCitizen("Vale", new Int3(1, 1, 0));
            Assert.That(crew.WorkPrioritiesRaw.Length, Is.EqualTo(All.Length),
                "the grid must have exactly one slot per work type");
        }

        /// <summary>
        /// ⚠️ 1 IS THE HIGHEST PRIORITY AND 4 THE LOWEST — RimWorld's convention, and it reads
        /// backwards against the intuition that a bigger number is more important. Pinned so that a
        /// later "surely 4 means most urgent" tidy-up is a red test rather than a silent inversion
        /// of every future band loop. The range refusal is the live half: the byte is HASHED state,
        /// so a value outside the domain would survive a save and break any later packing.
        /// </summary>
        [Test]
        public void PriorityDomain_OneIsHighest_FourIsLowest_AndOutOfRangeIsRefused()
        {
            Assert.That(WorkPriority.Off, Is.EqualTo(0),
                "OFF must be the array's natural zero — that is what makes 'default off' free");
            Assert.That(WorkPriority.Highest, Is.LessThan(WorkPriority.Lowest),
                "1 is the HIGHEST manual priority and 4 the LOWEST (RimWorld). If this ever reads " +
                "the other way, every band loop written against it inverts.");
            Assert.That(WorkPriority.Highest, Is.EqualTo(1));
            Assert.That(WorkPriority.Lowest, Is.EqualTo(4));
            Assert.That(WorkPriority.SimpleModeEnabled,
                Is.InRange(WorkPriority.Highest, WorkPriority.Lowest),
                "a ticked checkbox in simple mode must be worth a legal manual priority — that is " +
                "the whole reason simple mode needs no second field");

            var crew = Fixture().AddCitizen("Vale", new Int3(1, 1, 0));
            Assert.DoesNotThrow(() => crew.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest),
                "the lowest legal priority must be settable");
            // ⭐ THE SETTER REFUSES; THE SAVE READER DOES NOT — and the asymmetry is deliberate on
            // both sides (SaveReader.cs, the ACCEPTED LIMITS note). Worth recording that this is a
            // divergence from RimWorld running the OPPOSITE way: reference §1.2 has `SetPriority`
            // LOG and then STORE an out-of-range value, i.e. RimWorld is permissive at the setter
            // and strict nowhere; this game is strict at the setter and permissive at the reader,
            // because a reader must not throw on a byte another build wrote.
            Assert.Throws<ArgumentOutOfRangeException>(
                () => crew.SetWorkPriority(WorkType.Haul, (byte)(WorkPriority.Lowest + 1)),
                "a priority outside 0..4 must be refused — it is hashed state, and it would " +
                "survive a save round-trip as a value nothing can interpret");
        }

        /// <summary>
        /// ⭐ INCAPABLE IS NOT DISABLED. In RimWorld a backstory or trait can render a work type
        /// struck through, and the player CANNOT enable it — a fact about the PERSON, not an order
        /// from the player. The two states are not interchangeable and the storage must hold both,
        /// because the capability SOURCE is a later package and it must not have to migrate a
        /// hashed, saved field to say so.
        ///
        /// Three states are distinguished here, on one crew member at once:
        ///   * <c>Mine</c>   — capable, player switched it ON.
        ///   * <c>Craft</c>  — capable, player switched it OFF (or never on).
        ///   * <c>Haul</c>   — INCAPABLE, and therefore also not enabled.
        /// A storage that collapsed incapability into "priority 0" could not tell the last two
        /// apart, which is the failure this test exists for.
        /// </summary>
        [Test]
        public void Incapable_IsDistinctFromPlayerDisabled()
        {
            var crew = Fixture().AddCitizen("Vale", new Int3(1, 1, 0));

            Assert.That(crew.WorkIncapable, Is.EqualTo(0),
                "a person with no backstory and no traits is capable of everything — the mask " +
                "stores INCAPABILITY precisely so that the uninitialised state is 'capable'");

            // Explicit, not default-derived — see SaveRoundTrip_PreservesEachWorkTypeIndependently.
            foreach (var t in All) crew.SetWorkPriority(t, WorkPriority.Off);
            crew.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);
            crew.SetIncapableOf(WorkType.Haul, true);

            Assert.That(crew.IsWorkEnabled(WorkType.Mine), Is.True);
            Assert.That(crew.IsIncapableOf(WorkType.Mine), Is.False);

            Assert.That(crew.IsWorkEnabled(WorkType.Craft), Is.False, "switched off by the player");
            Assert.That(crew.IsIncapableOf(WorkType.Craft), Is.False,
                "…but the PERSON can do it — 'off' and 'cannot' must not be the same state");

            Assert.That(crew.IsIncapableOf(WorkType.Haul), Is.True, "a fact about the person");
            Assert.That(crew.IsWorkEnabled(WorkType.Haul), Is.False);

            // Clearing is symmetric, and clearing one bit must not clear its neighbours.
            crew.SetIncapableOf(WorkType.Mine, true);
            crew.SetIncapableOf(WorkType.Haul, false);
            Assert.That(crew.IsIncapableOf(WorkType.Haul), Is.False);
            Assert.That(crew.IsIncapableOf(WorkType.Mine), Is.True,
                "clearing Haul's bit cleared Mine's — the mask aliases");
        }

        /// <summary>
        /// ⚠️ THE WIDTH ARITHMETIC, WRITTEN DOWN RATHER THAN DONE IN SOMEONE'S HEAD — this is the
        /// <c>RoomType.Cryo = 16</c> shape, and that alias shipped on a live ship after a comment
        /// had predicted it in prose four days earlier (<c>StateHashHonestyTests.cs</c> header).
        ///
        /// <c>WorkIncapable</c> is ONE BYTE = 8 bits, one per work type, so it holds work types
        /// 0..7. Six are declared. A NINTH would shift to <c>1 &lt;&lt; 8</c>, which is 0 in a byte:
        /// it would silently mark nothing, hash identically to "capable", and look exactly like a
        /// passing guard. Widen the field to a ushort in the same commit that adds the ninth type —
        /// and note that widening it is a SAVE FORMAT and HASH change, i.e. a pin move.
        ///
        /// The priority GRID has no equivalent ceiling: it is one whole byte per slot in a
        /// fixed-length array, and <c>WorkPriority.WorkTypeCount</c> sizes it, so a seventh type
        /// costs a slot rather than an alias. That asymmetry is why only the mask is checked here.
        /// </summary>
        [Test]
        public void WorkIncapableMask_IsWideEnoughForEveryWorkType()
        {
            // DERIVED from the field's declared type, never hard-coded: widening WorkIncapable to a
            // ushort must RELAX this test in the same commit, automatically. A literal 8 here would
            // leave the guard over-strict after a legitimate widening, and an over-strict guard gets
            // deleted rather than corrected.
            var field = typeof(Citizen).GetField(nameof(Citizen.WorkIncapable));
            Assert.That(field, Is.Not.Null, "precondition: Citizen.WorkIncapable must exist to size");
            int MaskBits = Marshal.SizeOf(field.FieldType) * 8;
            Assert.That(MaskBits, Is.GreaterThan(0), "precondition: the mask has a measurable width");

            Assert.That(All.Length, Is.LessThanOrEqualTo(MaskBits),
                All.Length + " work types × 1 bit each do not fit in Citizen.WorkIncapable's " +
                MaskBits + " bits. Work type #" + MaskBits + " would shift off the top of the byte " +
                "and mark NOTHING — the RoomType.Cryo = 16 alias in a new coat. Widen the field " +
                "(and the save + the fold, in the same commit: it is a pin move).");

            // And the top declared bit really is reachable — a ceiling test that never touches the
            // ceiling proves nothing about it.
            var crew = Fixture().AddCitizen("Vale", new Int3(1, 1, 0));
            var top = All[All.Length - 1];
            crew.SetIncapableOf(top, true);
            Assert.That(crew.IsIncapableOf(top), Is.True,
                "the highest-numbered work type's bit does not survive being set — the mask is " +
                "already too narrow for the types that exist");
            Assert.That(crew.WorkIncapable, Is.Not.EqualTo(0),
                "setting the top bit left the mask at zero — it shifted off the end");
        }

        // ================================================================ 2. save + hash

        /// <summary>
        /// EACH SLOT SURVIVES A SAVE INDEPENDENTLY — six blinded legs, one per work type, each
        /// setting exactly ONE type and requiring the loaded citizen to have exactly that one.
        ///
        /// ⚠️ WHY IT IS POSITIONAL AND NOT "DISTINCT VALUES PER TYPE", which is what the charter's
        /// mutation 7 asks for: the domain is 0..4, five values, and there are SIX work types, so
        /// no assignment gives all six distinct values and a slot swap between the two that share a
        /// value would be invisible. Isolating one slot per leg distinguishes every slot from every
        /// other regardless of the domain's size. The hash side of the same question is covered by
        /// the exhaustive collision pairs in <see cref="StateHashHonestyTests"/>' sibling test
        /// below (<see cref="StateHash_DistinguishesEveryPairOfWorkTypeSlots"/>).
        ///
        /// NAMED MUTATIONS: drop the priority loop from <c>WriteCitizens</c>, or from
        /// <c>ReadCitizens</c> ⇒ these fail.
        /// </summary>
        [TestCaseSource(nameof(EveryWorkType))]
        public void SaveRoundTrip_PreservesEachWorkTypeIndependently(WorkType only)
        {
            var sim = Fixture();
            var crew = sim.AddCitizen("Vale", new Int3(1, 1, 0));
            // Set the whole grid EXPLICITLY rather than leaning on the boot default: this test is
            // about the save, not about OD-H, and exactly one test in this file may move when
            // WorkPriority.Default is flipped.
            foreach (var t in All) crew.SetWorkPriority(t, WorkPriority.Off);
            crew.SetWorkPriority(only, WorkPriority.Highest);

            var loaded = SaveAndLoad(sim).Citizens.Items[0];

            Assert.That(loaded.GetWorkPriority(only), Is.EqualTo(WorkPriority.Highest),
                only + "'s priority did not survive the save");
            foreach (var t in All)
                if (t != only)
                    Assert.That(loaded.GetWorkPriority(t), Is.EqualTo(WorkPriority.Off),
                        t + " came back enabled, but only " + only + " was set — the slots are " +
                        "written or read at the wrong offsets");
        }

        private static IEnumerable<TestCaseData> EveryWorkType()
        {
            foreach (WorkType t in Enum.GetValues(typeof(WorkType)))
                yield return new TestCaseData(t).SetName("SaveRoundTrip_PreservesWorkType_" + t);
        }

        /// <summary>The whole grid, with a fingerprint pattern, plus the load-time hash equality
        /// that <c>CLAUDE.md</c>'s invariant is really about: a saved field that is not hashed, or
        /// hashed but not restored, shows up here as a hash mismatch at the save tick.</summary>
        [Test]
        public void SaveRoundTrip_PreservesTheWholeGrid_AndTheLoadHashesEqual()
        {
            var sim = Fixture();
            var crew = SeededCrew(sim);
            var loadedSim = SaveAndLoad(sim);
            var loaded = loadedSim.Citizens.Items[0];

            foreach (var t in All)
                Assert.That(loaded.GetWorkPriority(t), Is.EqualTo(crew.GetWorkPriority(t)),
                    t + "'s priority did not survive the save");

            Assert.That(loadedSim.StateHash(), Is.EqualTo(sim.StateHash()),
                "save → load is not hash-equal: a v8 field is saved but not folded, or folded but " +
                "not restored");
        }

        /// <summary>Blinded leg for the incapability mask — it asserts ONLY its own field, so the
        /// failure names the mask rather than whatever happens to sit after it in the stream.</summary>
        [Test]
        public void SaveRoundTrip_PreservesWorkIncapable()
        {
            var sim = Fixture();
            var crew = SeededCrew(sim);
            Assert.That(crew.WorkIncapable, Is.Not.EqualTo(0), "precondition: a non-default mask");

            Assert.That(SaveAndLoad(sim).Citizens.Items[0].WorkIncapable,
                Is.EqualTo(crew.WorkIncapable), "Citizen.WorkIncapable did not survive the save");
        }

        /// <summary>
        /// ⭐ M3-7 — the skill ARRAY survives a save, SLOT BY SLOT. ⚠️ It is asserted against values
        /// SEEDED HERE, never against a default: "written as 0" and "never written at all" are
        /// indistinguishable if the only assertion is <c>Is.EqualTo(0)</c>. That is the seventh trap
        /// shape, and it is exactly how a reserved field fails to be pinned.
        ///
        /// <para>⚠️ AND THE SEED IS PER-SLOT DISTINCT, which is the leg the widening added: this test
        /// existed for M2-1's single byte and a save path that wrote <c>SkillsRaw[0]</c> six times
        /// would have passed its old form word for word. The whole point of OD-M item 8A is that two
        /// pawns may now differ in SHAPE, so the pin has to be able to see a shape.</para>
        /// </summary>
        [Test]
        public void SaveRoundTrip_PreservesEverySkillSlotIndependently()
        {
            var sim = Fixture();
            var crew = SeededCrew(sim);
            for (int t = 0; t < All.Length; t++)
                Assert.That(crew.GetSkill(All[t]), Is.Not.EqualTo(0),
                    "precondition: every slot must be seeded NON-ZERO, or this leg cannot tell " +
                    "'written as 0' from 'not written' (" + All[t] + ")");
            Assert.That(crew.GetSkill(All[0]), Is.Not.EqualTo(crew.GetSkill(All[1])),
                "precondition: the seed must DIFFER between slots, or a writer that stored slot 0 " +
                "six times would pass");

            var loaded = SaveAndLoad(sim).Citizens.Items[0];
            for (int t = 0; t < All.Length; t++)
                Assert.That(loaded.GetSkill(All[t]), Is.EqualTo(crew.GetSkill(All[t])),
                    "the " + All[t] + " skill did not survive the save — CITZ v9 stores one level " +
                    "per work type and every one of them is hashed");
        }

        /// <summary>Blinded leg for the RESERVED sticky-claim bool (M2-19's), seeded TRUE for the
        /// same reason the skill byte is seeded non-zero: an always-false bool is indistinguishable
        /// from a bool that is never written.</summary>
        [Test]
        public void SaveRoundTrip_PreservesTheReservedHeldByOrderBool()
        {
            var sim = Fixture();
            var crew = SeededCrew(sim);
            Assert.That(crew.HeldByOrder, Is.True, "precondition: seeded true, not left false");

            Assert.That(SaveAndLoad(sim).Citizens.Items[0].HeldByOrder, Is.True,
                "the reserved HeldByOrder bool did not survive the save");
        }

        /// <summary>
        /// A v8 payload whose grid is a DIFFERENT WIDTH from this build's stays in sync, in BOTH
        /// directions. The stream carries its own count and the reader trusts it, so a seventh work
        /// type changes what a v8 payload CONTAINS without changing how it PARSES — and every field
        /// after the grid is still read at the right offset.
        ///
        ///   * <b>+2 (a WIDER writer)</b> — the extra columns must be DRAINED, not mis-assigned.
        ///   * <b>−2 (a NARROWER writer)</b> — the missing columns must be left at the constructor
        ///     default and must NOT swallow <c>WorkIncapable</c>/<c>Skill</c>/<c>HeldByOrder</c>.
        /// The backward leg is the one an earlier draft omitted: forward compatibility is the case
        /// everyone thinks of, and a count-prefixed format is defeated by either direction equally.
        /// </summary>
        [TestCase(2, TestName = "ForwardCompatibility_AWiderGridIsDrainedNotMisread")]
        [TestCase(-2, TestName = "BackwardCompatibility_ANarrowerGridLeavesTheRestAtDefault")]
        public void GridWidthMismatch_KeepsTheStreamInSync(int widthDelta)
        {
            int written = WorkPriority.WorkTypeCount + widthDelta;
            Assert.That(written, Is.GreaterThan(0), "precondition: a meaningful column count");

            var payload = new MemoryStream();
            using (var w = new BinaryWriter(payload, SaveFormat.Utf8, leaveOpen: true))
            {
                WriteOneCitizenV8Header(w, out _);
                w.Write((byte)written);
                for (int t = 0; t < written; t++)
                    // Columns this build HAS get Highest; columns beyond it get a value this build
                    // could never store, so a mis-assignment is loud rather than plausible.
                    w.Write(t < WorkPriority.WorkTypeCount ? WorkPriority.Highest : (byte)9);
                w.Write((byte)0x21); // WorkIncapable
                w.Write((byte)7);    // Skill
                w.Write(true);       // HeldByOrder
            }

            payload.Position = 0;
            var sim = Fixture();
            using (var r = new BinaryReader(payload, SaveFormat.Utf8, leaveOpen: true))
                SaveReader.ReadCitizens(sim, r, 8);

            var fresh = Fixture().AddCitizen("fresh", new Int3(1, 1, 0));
            var c = sim.Citizens.Items[0];
            for (int t = 0; t < All.Length; t++)
            {
                var expected = t < written ? WorkPriority.Highest : fresh.GetWorkPriority(All[t]);
                Assert.That(c.GetWorkPriority(All[t]), Is.EqualTo(expected),
                    All[t] + " (slot " + t + ") is wrong for a grid of " + written + " written " +
                    "columns — a width mismatch desynchronised the stream");
            }
            Assert.That(c.WorkIncapable, Is.EqualTo(0x21),
                "WorkIncapable was read at the wrong offset — the width mismatch was not absorbed");
            // ⭐ M3-7 — this stream is a v8 one, so it also drives the v8→v9 SKILL MIGRATION, and the
            // choice recorded in SaveReader is REPLICATE: v8's one aptitude byte becomes the same
            // level in every slot ("equally apt at everything", which is exactly what one byte meant).
            // ⚠️ Asserted on EVERY slot, not just the first: a migration that wrote only slot 0 would
            // pass a single-slot assertion and silently drop five sixths of the state.
            foreach (var t in All)
                Assert.That(c.GetSkill(t), Is.EqualTo(7),
                    "the v8 aptitude byte must be REPLICATED into " + t + " — either it was read at " +
                    "the wrong offset, or the migration only filled part of the array");
            Assert.That(c.HeldByOrder, Is.True, "HeldByOrder was read at the wrong offset");
            Assert.That(payload.Position, Is.EqualTo(payload.Length),
                "the reader did not consume the whole payload — the layouts disagree");
        }

        /// <summary>
        /// ⭐ A PRE-v8 SAVE LOADS WITH EVERY WORK TYPE OFF, and this test exists to make that
        /// DECISION visible rather than incidental.
        ///
        /// The behaviour-preserving read — the one <c>SaveReader</c> uses next door for
        /// <c>Device.Scriptable</c> ("every device in a pre-v5 save WAS addressable, so read true")
        /// — would be "every work type enabled", because a pre-v8 pawn did every kind of work. It is
        /// not taken: OD-H/OD-I are binding and phrased as ONE RULE with no authored exception, and
        /// there is nothing to preserve — save/load has NO caller outside this test suite (verified
        /// by grep across <c>sim/</c>, <c>hosts/</c> and <c>client/</c>), so no pre-v8 save exists
        /// anywhere to be read. If that ever stops being true, this is the branch to revisit.
        ///
        /// ALIGNMENT CONTROL, because a hand-built legacy stream that is subtly mis-laid would leave
        /// the defaults in place and pass this test for the wrong reason: the v7 tail fields are
        /// seeded NON-default and must come back exactly, and the reader must consume the whole
        /// payload and nothing more.
        /// </summary>
        [Test]
        public void LegacyPreV8Save_LoadsWithTheSameGridAsAFreshCitizen()
        {
            var payload = new MemoryStream();
            using (var w = new BinaryWriter(payload, SaveFormat.Utf8, leaveOpen: true))
                WriteOneCitizenV8Header(w, out _);   // v1..v7 fields only — no v8 tail

            payload.Position = 0;
            var sim = Fixture();
            using (var r = new BinaryReader(payload, SaveFormat.Utf8, leaveOpen: true))
                SaveReader.ReadCitizens(sim, r, 7);

            var c = sim.Citizens.Items[0];

            // ALIGNMENT CONTROL first: the late v7 fields prove the hand-built layout matched.
            Assert.That(c.HoldPosition, Is.True, "CONTROL: the v6 field is misaligned — this " +
                "fixture is not a valid v7 citizen and the defaults below prove nothing");
            Assert.That(c.OrderedMove, Is.True, "CONTROL: the v7 field is misaligned");
            Assert.That(c.Morale, Is.EqualTo(0.25f), "CONTROL: the v5 field is misaligned");
            Assert.That(payload.Position, Is.EqualTo(payload.Length),
                "CONTROL: the reader did not consume exactly the v7 payload");

            // THE CLAIM: the legacy path applies the SAME rule a fresh citizen gets — it invents no
            // second default. Stated against a fresh citizen rather than against "off" so that
            // flipping WorkPriority.Default moves exactly ONE test in this file (the one that pins
            // the default) and not this one, which is about the READ.
            var fresh = Fixture().AddCitizen("fresh", new Int3(1, 1, 0));
            foreach (var t in All)
                Assert.That(c.GetWorkPriority(t), Is.EqualTo(fresh.GetWorkPriority(t)),
                    "a pre-v8 save must load " + t + " exactly as a newly-spawned crew member gets " +
                    "it — OD-H/OD-I are ONE RULE, and a load-time default of 'all on' (the " +
                    "behaviour-preserving read, which Device.Scriptable takes next door) would be a " +
                    "second one");
            Assert.That(c.WorkIncapable, Is.EqualTo(fresh.WorkIncapable), "…and capable of everything");
            foreach (var t in All)
                Assert.That(c.GetSkill(t), Is.EqualTo(fresh.GetSkill(t)),
                    "…and untrained at " + t + ", exactly as a newly-spawned crew member is");
            Assert.That(c.HeldByOrder, Is.EqualTo(fresh.HeldByOrder));
        }

        /// <summary>The v1..v7 CITZ field sequence for exactly one citizen, mirroring
        /// <c>SaveWriter.WriteCitizens</c>. Late fields are seeded non-default so a misalignment is
        /// caught by the callers' controls rather than hidden by zeroes.</summary>
        private static void WriteOneCitizenV8Header(BinaryWriter w, out uint id)
        {
            id = 1;
            w.Write(1);                 // count
            w.Write(id);                // Id
            w.Write("Vale");            // Name
            WriteInt3(w, new Int3(1, 1, 0));   // Pos
            WriteInt3(w, new Int3(1, 1, 0));   // PrevPos
            w.Write(true);              // AutoWander
            w.Write(1);                 // Path.Count
            WriteInt3(w, new Int3(2, 1, 0));   // Path[0]
            w.Write(0);                 // PathIndex
            w.Write(3);                 // MoveCooldown
            w.Write(7);                 // IdleCooldown
            w.Write(0.1f);              // Suffocation
            w.Write(0.2f);              // Hunger
            w.Write(0.4f);              // Fatigue
            w.Write(5f);                // Mood
            w.Write(false);             // Dead
            w.Write((byte)JobKind.Dig); // JobKind
            WriteInt3(w, new Int3(2, 1, 0));   // JobTarget
            w.Write(0u);                // CarryingItemId
            w.Write(40);                // JobWorkTicks
            w.Write(0.3f);              // Thirst          (v2)
            w.Write(0u);                // ReservedItemId  (v3)
            w.Write(true);              // RevealsFog      (v4)
            w.Write((byte)0);           // Faction         (v5)
            w.Write(0.9f);              // Health          (v5)
            w.Write(0.25f);             // Morale          (v5) — an ALIGNMENT CONTROL value
            w.Write((byte)0);           // Archetype       (v5)
            w.Write(true);              // HoldPosition    (v6) — an ALIGNMENT CONTROL value
            w.Write(true);              // OrderedMove     (v7) — an ALIGNMENT CONTROL value
        }

        private static void WriteInt3(BinaryWriter w, Int3 p)
        {
            w.Write(p.X);
            w.Write(p.Y);
            w.Write(p.Z);
        }

        /// <summary>
        /// ⚠️ THE ALIASING GUARD, AND IT IS A COLLISION PAIR BECAUSE NOTHING ELSE CAN FIND AN ALIAS.
        /// Every ordered pair of work types is driven: state A has ONLY slot i set, state B has
        /// ONLY slot j set, same value. If any two slots shared bits — or if the fold folded the
        /// array as a set, or as a sum, or through one packed word with a bad shift — the two states
        /// would hash EQUAL. Single-field rows in <c>StateHashHonestyTests</c> cannot see this:
        /// each moves the hash on its own even when two of them move it identically. That is W0-1's
        /// own lesson, restated for the grid.
        ///
        /// 6 work types × a 5-value domain means no assignment makes all six values distinct, so
        /// the pair drives POSITION rather than value: same value, different slot, 15 unordered
        /// pairs.
        ///
        /// NAMED MUTATION, applied and measured: fold the grid as an order-independent SUM
        /// (<c>sum += work[t]</c>, one Combine) ⇒ <b>all 15 pairs here go RED while all 6 single-slot
        /// equivalence rows in <c>StateHashHonestyTests</c> stay GREEN</b>. That is W0-1's lesson
        /// reproduced exactly: single-field mutation cannot find an alias, only a pair can.
        /// </summary>
        [TestCaseSource(nameof(EveryPairOfWorkTypes))]
        public void StateHash_DistinguishesEveryPairOfWorkTypeSlots(WorkType a, WorkType b)
        {
            var simA = Fixture();
            var simB = Fixture();
            var crewA = simA.AddCitizen("Vale", new Int3(1, 1, 0));
            var crewB = simB.AddCitizen("Vale", new Int3(1, 1, 0));

            Assert.That(simB.StateHash(), Is.EqualTo(simA.StateHash()),
                "precondition: the twins must hash equal before the slots are set");

            crewA.SetWorkPriority(a, WorkPriority.Highest);
            crewB.SetWorkPriority(b, WorkPriority.Highest);

            Assert.That(crewA.GetWorkPriority(a), Is.EqualTo(crewB.GetWorkPriority(b)),
                "precondition: the pair differs ONLY in which slot holds the value");
            Assert.That(simB.StateHash(), Is.Not.EqualTo(simA.StateHash()),
                "priority " + WorkPriority.Highest + " on " + a + " hashes identically to the same " +
                "priority on " + b + " — the two slots share bits in Simulation.StateHash");
        }

        /// <summary>
        /// The 15 unordered pairs, named per CONSUMER. ⚠️ The prefix is a parameter and not a
        /// constant because a single shared source gave BOTH pair tests the same display names —
        /// 30 test cases under 15 names, so a red could not be attributed to the grid or to the
        /// mask. Found by counting: a run reported 39 failures under 24 distinct names.
        /// </summary>
        private static IEnumerable<TestCaseData> Pairs(string prefix)
        {
            var all = (WorkType[])Enum.GetValues(typeof(WorkType));
            for (int i = 0; i < all.Length; i++)
                for (int j = i + 1; j < all.Length; j++)
                    yield return new TestCaseData(all[i], all[j])
                        .SetName(prefix + all[i] + "_vs_" + all[j]);
        }

        private static IEnumerable<TestCaseData> EveryPairOfWorkTypes() =>
            Pairs("StateHash_PrioritySlotsDoNotAlias_");

        private static IEnumerable<TestCaseData> EveryPairOfIncapabilityBits() =>
            Pairs("StateHash_IncapabilityBitsDoNotAlias_");

        /// <summary>The incapability mask's bits do not alias each other either — the same
        /// collision-pair argument applied to the byte that packs six flags into one word, which is
        /// the one place in this package where a shift COULD go wrong.</summary>
        [TestCaseSource(nameof(EveryPairOfIncapabilityBits))]
        public void StateHash_DistinguishesEveryPairOfIncapabilityBits(WorkType a, WorkType b)
        {
            var simA = Fixture();
            var simB = Fixture();
            simA.AddCitizen("Vale", new Int3(1, 1, 0)).SetIncapableOf(a, true);
            simB.AddCitizen("Vale", new Int3(1, 1, 0)).SetIncapableOf(b, true);

            Assert.That(simB.StateHash(), Is.Not.EqualTo(simA.StateHash()),
                "'cannot do " + a + "' hashes identically to 'cannot do " + b + "' — the " +
                "WorkIncapable bits alias");
        }

        // ================================================================ 3. nothing reads it

        /// <summary>
        /// ⭐ THE ENROLMENT LEDGER — every file in <c>sim/</c> permitted to name the work grid, with
        /// the reason it may. Repo-relative, forward-slashed.
        ///
        /// ⛔ <b>THIS LIST ONLY GROWS, AND THE TEST BELOW IS NEVER DELETED.</b> A package that needs
        /// to read the grid enrols its files here, by name, in its own commit, with a reason — the
        /// <c>KNOWN_GAPS</c> shape. M2-2 is the first expected enroller (its veto gates), then M2-5,
        /// M2-8 and M2-19. Enrolling is one line; deleting the guard is also one line and takes the
        /// record with it.
        /// </summary>
        private static readonly string[] OnlyTheseFilesMayReadTheWorkGrid =
        {
            "sim/Sim.Core/Entities/Citizen.cs",   // M2-1 — declares the state and its accessors
            "sim/Sim.Core/Save/SaveWriter.cs",    // M2-1 — CITZ v8 write
            "sim/Sim.Core/Save/SaveReader.cs",    // M2-1 — CITZ v8 read
            "sim/Sim.Core/Simulation.cs",         // M2-1 — the StateHash fold
            // ⭐ M2-4 — THE FIRST ENROLMENT, and it is a WRITER rather than a reader: the player's
            // work-priority order (`SetWorkPriorityCommand`). M2-1's headline claim was that nothing
            // reads the grid so its pin move was fold-only; this file does not change that — the
            // command is inert until something SENDS it, and nothing in this tree does (the WORK tab
            // is M2-3). What it does end is "no code outside the save path names the grid at all".
            // The dispatcher still does not consult it: the veto is M2-2's, at five gates.
            "sim/Sim.Core/Commands/Commands.cs",

            // ⭐ M2-2 — THE VETO. Six files, and the count is the point: a work type set to off is
            // refused at FIVE gates plus the one table they all read. Enrolling them is what ends
            // M2-1's "nothing reads the grid" claim on purpose and in the open — from this commit
            // the grid is BEHAVIOUR, and the P1/P3 pin move in the same commit is a behaviour
            // change, not a fold.
            "sim/Sim.Core/Entities/WorkTypeMap.cs",       // the ONE JobKind → WorkType table
            "sim/Sim.Core/Jobs/JobSystem.cs",             // G1 — the dispatcher, covering all four IJobSources
            "sim/Sim.Core/Systems/CraftingSystem.cs",     // G2 — the push recruiter that bypasses the dispatcher
            "sim/Sim.Core/Systems/MachineWearSystem.cs",  // G3 — the other one (MaintenanceSystem lives here)
            "sim/Sim.Core/Effects/EffectValidator.cs",    // G4 — the LLM GRANT, bounded by the grid
            "sim/Sim.Core/Effects/CapabilityComputer.cs", // G5 — the LLM OFFER; without it crew agree to forbidden work

            // ⭐ M2-5 — CROSS-FAMILY RANKING. ONE new file, and it is the arbitration itself: the
            // grid stops being a yes/no veto and becomes an ORDER (band 1..4, ties by
            // WorkPriority.NaturalPriority). It reads the grid at the five arbitration sites the
            // other enrolled files already own, so this is the only addition. P1/P2/P3 move in the
            // same commit and that is the point — see PIN M2-g.
            "sim/Sim.Core/Jobs/WorkArbiter.cs",           // the arbitration: band, then natural priority

            // ⭐ M3-14 — THE VACUUM-WORK LADDER. TWO new files, and BOTH read exactly ONE identifier
            // off this list — `HeldByOrder`, M2-19's hold, which IS the player's order (§2.2 keeps
            // the forced flag on `curJob`). Neither touches the work GRID proper: the grid decides
            // whether a crew member takes a job, and these two decide whether the job she was
            // ORDERED onto may cross the pressure frontier (rimworld-reference.md §8.4 rungs 2
            // and 4). ⚠️ PIN-NEUTRAL, and by construction rather than by luck: every pinned run is
            // unattended, no command is ever enqueued, so no job is ever held and both branches are
            // untaken — verified by a P1 twin run, and by a driven non-vacuity control that DOES
            // issue a held order into vacuum (VacuumOrderLadderTests).
            "sim/Sim.Core/Jobs/JobContext.cs",            // rung 2 — the job board's staging seam asks with the hold
            "sim/Sim.Core/Systems/SafetySystem.cs",       // rung 4 — a held pawn does not flee; she may die

            // ⭐⭐ M3-7 — SKILL REACHES WORK. FOUR new files, and every one of them enrols for the
            // SAME narrow reason: it names the <see cref="WorkType"/> ENUM to tell `WorkRates` WHICH
            // CURVE to price a job at. ⛔ NOT ONE OF THEM READS THE GRID. No priority, no mask, no
            // `GetWorkPriority`, no `CanTakeWorkType` — the enum member is an argument, not a
            // lookup, and the seam it is handed to takes a whole `Citizen` precisely so that no
            // consumer ever holds a skill or a priority (ArchitectureBoundaryTests' `Skill` row
            // forbids economy files from naming one, and all four of these ARE economy files).
            //
            // ⚠️ THE LEDGER'S OWN QUESTION, ANSWERED RATHER THAN WAVED PAST: it warns that a new
            // reader is "a BEHAVIOUR change on every pinned ship — measure P1/P2/P3 and say so".
            // MEASURED. P1/P2/P3 all moved in this commit (PIN M3-b) and the move is provably
            // FOLD-ONLY: with these four readers live and only the CITZ fold reverted to its old
            // one-byte shape, all three read their OLD values. The rate term itself is invisible to
            // every pin — no pinned fixture does any work at all under OD-H — which is stated in
            // `ci.sh`, `CLAUDE.md` and MECHANICS §13.37 rather than left to be discovered.
            "sim/Sim.Core/Entities/WorkRates.cs",              // THE SEAM — the curve, and the only file that reads a level
            "sim/Sim.Core/Jobs/Sources/DigJobSource.cs",       // names WorkType.Mine to price a dig
            "sim/Sim.Core/Jobs/Sources/BuildJobSource.cs",     // names WorkType.Construct to price a build
            "sim/Sim.Core/Jobs/Sources/DeconstructJobSource.cs", // names WorkType.Deconstruct to price a strip
        };

        private static readonly string[] WorkGridIdentifiers =
        {
            "WorkType", "WorkPriority", "WorkPrioritiesRaw", "WorkIncapable", "HeldByOrder",
            "GetWorkPriority", "SetWorkPriority", "IsWorkEnabled", "IsIncapableOf", "SetIncapableOf",
        };

        /// <summary>
        /// ⭐ THE ENROLMENT LEDGER, MECHANISED: <b>only a named file in <c>sim/</c> may read the
        /// work grid.</b>
        ///
        /// ⚠️ <b>M2-2 CHANGED WHAT THIS TEST MEANS, AND THE OLD SENTENCE IS KEPT HERE RATHER THAN
        /// SILENTLY REPLACED.</b> It read: <i>"THE PACKAGE'S HEADLINE CLAIM: nothing in sim/ reads
        /// the work grid. M2-1 is storage; the veto is M2-2's, at five gates. If this state could
        /// change a dispatch decision, every 'pin move is fold-only' claim in the commit message
        /// would be false."</i> That was true of M2-1's tree and is <b>false of this one</b>: the
        /// veto landed, six files are enrolled below, the grid IS a dispatch decision, and M2-2's
        /// own pin move (P1, P3) is a BEHAVIOUR change stated as one. What survives unchanged is the
        /// mechanism — an enrolment ledger that only grows, so every later crossing (M2-5's band
        /// loop, M2-8's pre-emption, M2-19's sticky claim) stays a decision instead of a diff nobody
        /// read.
        ///
        /// It scans CODE ONLY, through the shipped <c>SurfaceBoundaryTests.CodeOnly</c> stripper,
        /// because a doc comment naming a downstream consumer is documentation, not a dependency —
        /// and because a guard that fires on prose teaches people to delete explanatory comments.
        ///
        /// NON-VACUITY BY INCLUSION (§13.4), not by population count: a planted violation is
        /// required to be CAUGHT, and a planted COMMENT is required NOT to be — with a LATER REAL
        /// COMMENT after it, because a fixture whose only block comment is unterminated passes
        /// whether the stripper works or not.
        ///
        /// ⛔ THIS TEST IS A LEDGER THAT ONLY ENROLS. IT IS NOT TO BE DELETED.
        /// <b>M2-2 ADDS its gate files to <see cref="OnlyTheseFilesMayReadTheWorkGrid"/>, BY NAME, in
        /// its own commit, with a one-line reason per file</b> — the shape
        /// <c>surface-boundary.test.js</c>'s <c>KNOWN_GAPS</c> already uses here. An earlier draft of
        /// this message said "delete or narrow this test", which is the same instruction with a
        /// deadline-shaped escape hatch in it: under pressure everyone deletes, and the guard is then
        /// permanently gone for M2-5, M2-8 and M2-19 — the packages that need it most, because by
        /// then several systems read the grid and "one more reader" stops being visible. Enrolling
        /// costs one line and keeps every later crossing a decision instead of a diff nobody read.
        /// </summary>
        [Test]
        public void OnlyEnrolledFilesReadTheWorkGrid()
        {
            var offenders = new List<string>();
            foreach (var path in SimCsFiles())
            {
                string rel = Rel(path);
                if (Array.IndexOf(OnlyTheseFilesMayReadTheWorkGrid, rel) >= 0) continue;
                string code = SurfaceBoundaryTests.CodeOnly(File.ReadAllText(path));
                foreach (var id in WorkGridIdentifiers)
                    if (code.Contains(id, StringComparison.Ordinal))
                        offenders.Add(rel + ": '" + id + "'");
            }

            Assert.That(offenders, Is.Empty,
                "A FILE THAT IS NOT ENROLLED NOW READS THE WORK GRID:\n  " +
                string.Join("\n  ", offenders) + "\n" +
                "⇒ IF THAT IS DELIBERATE (you are M2-2's veto, M2-5's band loop, M2-8's pre-emption " +
                "or M2-19's sticky claim): ADD each file to OnlyTheseFilesMayReadTheWorkGrid in " +
                "THIS file, by name, in YOUR commit, with a one-line reason. That is the whole " +
                "procedure. ⛔ DO NOT DELETE THIS TEST — it is a ledger that only enrols, like " +
                "KNOWN_GAPS. Deleting it costs the same one line today and costs every later " +
                "package its only record of who may read a crew member's work assignment.\n" +
                "⇒ IF IT IS NOT DELIBERATE: this grid decides whether a crew member takes a job at " +
                "all (M2-2's veto, five gates), and under OD-H it boots OFF for every work type on " +
                "every ship. A new reader is therefore a BEHAVIOUR change on every pinned ship — " +
                "measure P1/P2/P3 and say so in the commit, or take the read back out.");

            // --- NON-VACUITY, BY INCLUSION. A real sim file plus a planted call must be caught.
            //
            // ⚠️ ⭐ THE DONOR MUST BE A REAL SIM FILE WHOSE OWN CODE NAMES NO GRID IDENTIFIER, AND
            // THAT IS ASSERTED RATHER THAN ASSUMED. It was JobSystem.cs, which was clean — until
            // M2-5's band loop read `GetWorkPriority` in it. Both controls below rot silently at
            // that moment and in OPPOSITE directions: `Does.Contain` starts passing on the donor's
            // own text (so a scanner that saw nothing planted would still be called non-vacuous),
            // and `Does.Not.Contain` can never pass at all (a FALSE RED, and the one that was
            // actually observed). A fixture whose subject is "the scanner can see a plant" must
            // start from a page with nothing on it.
            string donor = File.ReadAllText(Path.Combine(RepoRoot(),
                "sim", "Sim.Core", "Jobs", "PushRecruitBackoff.cs"));
            string donorCode = SurfaceBoundaryTests.CodeOnly(donor);
            var dirty = new List<string>();
            foreach (var id in WorkGridIdentifiers)
                if (donorCode.Contains(id, StringComparison.Ordinal)) dirty.Add(id);
            Assert.That(dirty, Is.Empty,
                "the negative-control DONOR now names a work-grid identifier in its own code (" +
                string.Join(", ", dirty) + "), which makes both controls below meaningless. Pick " +
                "another real sim/ file that names none — do not delete the controls.");

            string planted = donor + "\n// tail\nclass M21Plant { void F(Citizen c) " +
                             "{ c.GetWorkPriority(WorkType.Haul); } }\n";
            Assert.That(SurfaceBoundaryTests.CodeOnly(planted),
                Does.Contain("GetWorkPriority"),
                "NON-VACUITY: the scanner cannot see a planted read of the grid, so its empty " +
                "result above means nothing");

            // --- AND THE CONVERSE: a COMMENTED-OUT read must NOT be reported, or the guard fires
            // on prose. The fixture carries a LATER REAL COMMENT (both spellings) so that a
            // stripper blinded by the first one would visibly fail to remove the second.
            string commented = donor +
                "\n// c.GetWorkPriority(WorkType.Haul);\n" +
                "/* and IsWorkEnabled(WorkType.Mine) too */\n" +
                "// M21_TAIL_SENTINEL\n";
            string strippedComments = SurfaceBoundaryTests.CodeOnly(commented);
            Assert.That(strippedComments, Does.Not.Contain("GetWorkPriority"),
                "a COMMENTED-OUT read of the grid trips the guard — the stripper is not being used, " +
                "and this test would tax explanatory comments");
            Assert.That(strippedComments, Does.Not.Contain("M21_TAIL_SENTINEL"),
                "the LATER REAL COMMENT survived the stripper, so the negative control above is " +
                "vacuous: the stripper was blinded and 'no match' means 'nothing was scanned'");
        }

        private static List<string> SimCsFiles()
        {
            var found = new List<string>();
            foreach (var path in Directory.GetFiles(Path.Combine(RepoRoot(), "sim"), "*.cs",
                                                    SearchOption.AllDirectories))
            {
                if (path.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar) ||
                    path.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar))
                    continue;
                found.Add(path);
            }
            found.Sort(StringComparer.Ordinal);
            Assert.That(found, Is.Not.Empty, "sim/ must contain .cs files to scan");
            return found;
        }

        /// <summary>The house repo-root probe (two landmarks, so a stray ci.sh cannot
        /// false-positive) — the same shape as ArchitectureBoundaryTests / SurfaceBoundaryTests.</summary>
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
            Assert.Fail("the repo root must be discoverable by walking up from " + AppContext.BaseDirectory);
            return null;
        }

        private static string Rel(string absolute) =>
            absolute.Substring(RepoRoot().Length).TrimStart('/', '\\').Replace('\\', '/');
    }
}
