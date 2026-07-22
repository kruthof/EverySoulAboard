using System;
using System.Collections.Generic;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Llm;
// Both namespaces declare an EffectKind (the Sim flags enum and the Llm proposal DTO).
// This file is about the SIM one; alias it so every reference below is unambiguous.
using EffectKind = Perilune.Sim.EffectKind;

namespace Perilune.Tests
{
    /// <summary>
    /// <see cref="EffectKind"/> headroom (ECONOMY-PLAN.md §0, W0-2). The enum was a
    /// <c>byte</c> with six of eight bits spent; it is now a <c>ushort</c>. These tests
    /// do NOT assert the width — <c>sizeof(EffectKind) == 2</c> would be a tautology
    /// that a truncating cast further down the path passes anyway. They drive the two
    /// places a value actually TRAVELS and assert a flag above bit 7 arrives intact:
    ///
    ///   1. the event bus into <see cref="MemorySystem"/>'s rule table
    ///      (<c>CitizenEffectAppliedEvent.Kind</c>), and
    ///   2. the <see cref="CapabilityManifest"/> legal-set into <see cref="TurnPlan"/>
    ///      (the copy the dialogue layer speaks against).
    ///
    /// The two paths fail differently under an 8-bit store, and the values are picked to
    /// match. On the EVENT path the kind is compared with <c>==</c>, so the dangerous
    /// truncation is one that ALIASES a real shipped kind rather than vanishing — hence
    /// <c>1&lt;&lt;8 | AgreeTask</c>, which degrades to exactly AgreeTask and forges a promise.
    /// On the LEGAL-SET path the value is tested with <c>&amp;</c>, where truncation can only
    /// LOSE bits — so the bite there is a granted effect silently disappearing between the
    /// sim and the dialogue layer, hence a lone top bit.
    ///
    /// MUTATION THAT MUST MAKE THESE FAIL (apply it, watch them go red, revert):
    /// in <c>sim/Sim.Core/Effects/CitizenEffects.cs</c>, change
    /// <c>public enum EffectKind : ushort</c> back to <c>: byte</c>. Every headroom
    /// assignment below then truncates on store — 0x0104 becomes 0x04 (AgreeTask) and
    /// 0x8000 becomes 0x00 (None).
    ///
    /// The headroom bits are <c>static readonly int</c>, not consts: a constant cast to a
    /// byte-backed enum is folded at compile time, and the point of the mutation is a
    /// RUNTIME truncation on the same code path the shipped values take.
    /// </summary>
    [TestFixture]
    public sealed class EffectKindWidthTests
    {
        private static readonly string[] OneRoom = { "#####", "#...#", "#####" };

        /// <summary>Bit 8 OR AgreeTask(bit 2): truncating to 8 bits yields exactly AgreeTask.</summary>
        private static readonly int AliasesAgreeTask = (1 << 8) | (int)EffectKind.AgreeTask;

        /// <summary>The top ushort bit, alone: truncating to 8 bits erases the grant entirely.</summary>
        private static readonly int TopFlagBit = 1 << 15;

        // ------------------------------------------------------------------ 1. the event path

        /// <summary>
        /// MemorySystem's promise rule matches <c>e.Kind == EffectKind.AgreeTask</c>. A kind
        /// carrying bit 8 above AgreeTask is NOT AgreeTask and must form no promise memory.
        /// Under a byte-backed enum the event's Kind field truncates on store to exactly
        /// AgreeTask and the crew member spuriously "remembers agreeing" — the test fails.
        /// </summary>
        [Test]
        public void EffectKindAboveBitSeven_ReachesMemorySystemUnaliased_AndFormsNoPromise()
        {
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);
            Citizen control = sim.AddCitizen("Ada", new Int3(1, 1, 0));
            Citizen subject = sim.AddCitizen("Bo", new Int3(2, 1, 0));
            var minds = new MindState();
            minds.Minds.GetOrCreate(control.Id);
            minds.Minds.GetOrCreate(subject.Id);
            var mem = new MemorySystem(minds);

            // Control = the precondition: the promise rule really does fire in this fixture.
            sim.Events.Publish(new CitizenEffectAppliedEvent
            { CitizenId = control.Id, Kind = EffectKind.AgreeTask, Accepted = true });

            // Subject = the headroom value, assigned through the real event field.
            sim.Events.Publish(new CitizenEffectAppliedEvent
            { CitizenId = subject.Id, Kind = (EffectKind)AliasesAgreeTask, Accepted = true });

            sim.Events.SwapBuffers(); // the bus serves the PREVIOUS tick's buffer
            mem.Tick(sim);

            List<MemoryEntry> forControl = Memories(minds, sim, control.Id);
            Assert.That(forControl.Count, Is.EqualTo(1),
                "precondition: the AgreeTask promise rule fired, so this fixture can produce a promise");
            Assert.That(forControl[0].Tag, Is.EqualTo("promise"));

            List<MemoryEntry> forSubject = Memories(minds, sim, subject.Id);
            Assert.That(forSubject.Count, Is.EqualTo(0),
                "a kind above bit 7 must not truncate down onto AgreeTask and forge a promise memory");
        }

        /// <summary>
        /// The same event field, read back off the bus and compared against the exact value
        /// that was written. Asserts delivery first (the span really carried our event), then
        /// the value. Under a byte-backed enum the read-back is 0x04, not 0x0104.
        /// Mutation: <c>EffectKind : ushort</c> → <c>: byte</c>.
        /// </summary>
        [Test]
        public void EffectKindAboveBitSeven_RoundTripsTheEventBusBitForBit()
        {
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);
            Citizen c = sim.AddCitizen("Ada", new Int3(1, 1, 0));

            sim.Events.Publish(new CitizenEffectAppliedEvent
            { CitizenId = c.Id, Kind = (EffectKind)AliasesAgreeTask, Accepted = false });
            sim.Events.SwapBuffers();

            ReadOnlySpan<CitizenEffectAppliedEvent> span = sim.Events.Read<CitizenEffectAppliedEvent>();
            Assert.That(span.Length, Is.EqualTo(1), "precondition: the event reached the readable buffer");
            Assert.That(span[0].CitizenId, Is.EqualTo(c.Id));

            Assert.That((int)span[0].Kind, Is.EqualTo(AliasesAgreeTask),
                "the event's kind field must carry all 16 bits, not the low 8");
            Assert.That(span[0].Kind, Is.Not.EqualTo(EffectKind.AgreeTask),
                "and must not degrade into the flag it aliases in the low byte");
        }

        // ----------------------------------------------------- 2. the manifest / legal-set path

        /// <summary>
        /// <see cref="CapabilityManifest.LegalEffects"/> is the legal-SET the whole dialogue
        /// layer gates on, and <see cref="TurnPlan"/> takes the per-turn copy of it. A future
        /// economy effect occupying the top ushort bit must survive both the manifest store and
        /// the plan copy, side by side with a shipped flag — otherwise the sim grants an effect
        /// and the dialogue layer is never told, which is silent and untraceable.
        /// Mutation: <c>EffectKind : ushort</c> → <c>: byte</c> — the top bit is dropped on
        /// store, the plan reports only SetDisposition, and the grant assertion fails.
        /// </summary>
        [Test]
        public void LegalEffectsSet_CarriesAFlagAboveBitSeven_ThroughTheTurnPlanCopy()
        {
            var manifest = new CapabilityManifest
            {
                CitizenId = 3u,
                LegalEffects = EffectKind.SetDisposition | (EffectKind)TopFlagBit,
            };

            Assert.That((manifest.LegalEffects & EffectKind.SetDisposition), Is.Not.EqualTo(EffectKind.None),
                "precondition: the ordinary shipped flag is in the set the plan will copy");

            var plan = new TurnPlan(manifest.CitizenId, 1L, new ConversationRequest(), manifest);

            Assert.That((plan.LegalEffects & EffectKind.SetDisposition), Is.Not.EqualTo(EffectKind.None),
                "the shipped flag survives the copy");
            Assert.That((int)(plan.LegalEffects & (EffectKind)TopFlagBit), Is.EqualTo(TopFlagBit),
                "so does a legal-set flag in the top ushort bit — that is the headroom W0-2 bought");
            Assert.That((plan.LegalEffects & EffectKind.AgreeTask), Is.EqualTo(EffectKind.None),
                "and no flag the sim never granted appears in the copy");
        }

        /// <summary>
        /// Reuse safety for the widened field: <see cref="CapabilityManifest.Clear"/> (the
        /// manifest is a reused object, cleared per conversation turn) must zero ALL of it, not
        /// just the low byte, or a stale high flag leaks into the next citizen's turn.
        /// Mutation: in <c>CapabilityComputer.cs</c>, delete <c>LegalEffects = EffectKind.None;</c>
        /// from <c>Clear()</c>.
        /// </summary>
        [Test]
        public void ClearZeroesTheWholeWidenedLegalSet_NotJustTheLowByte()
        {
            var manifest = new CapabilityManifest { LegalEffects = (EffectKind)TopFlagBit };
            Assert.That((int)manifest.LegalEffects, Is.EqualTo(TopFlagBit),
                "precondition: the high flag was actually stored before Clear");

            manifest.Clear();

            Assert.That(manifest.LegalEffects, Is.EqualTo(EffectKind.None),
                "a reused manifest must not carry a high legal-effect flag into the next turn");
        }

        private static List<MemoryEntry> Memories(MindState minds, Simulation sim, uint id)
        {
            var into = new List<MemoryEntry>();
            minds.GetTopMemories(id, sim.TickCount, null, into, 64);
            return into;
        }
    }
}
