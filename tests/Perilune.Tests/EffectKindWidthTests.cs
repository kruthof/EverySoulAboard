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
    /// do NOT assert the width — <c>sizeof(EffectKind) == 2</c> would be a tautology that
    /// a truncating cast further down the path passes anyway. They drive the places a
    /// value actually TRAVELS and assert a flag above bit 7 arrives intact, on BOTH sides
    /// of the applied-effect event:
    ///
    ///   1. PRODUCER — the only two shipped writers of <c>CitizenEffectAppliedEvent.Kind</c>:
    ///      <see cref="EffectPump"/> (<c>Effects/CitizenEffects.cs</c>) and
    ///      <see cref="ApplyCitizenEffectCommand"/>. Both copy <c>effect.Kind</c> into the
    ///      event, and a <c>(byte)</c> cast reintroduced at either is exactly the defect
    ///      W0-2 exists to prevent — so these two are driven end to end through a real
    ///      <see cref="PendingEffectBuffer"/> / real <c>ISimCommand</c> inbox, never by
    ///      publishing onto the bus by hand.
    ///   2. CONSUMER — the event bus into <see cref="MemorySystem"/>'s promise rule.
    ///   3. LEGAL-SET — the <see cref="CapabilityManifest"/> into <see cref="TurnPlan"/>
    ///      (the per-turn copy the dialogue layer speaks against).
    ///
    /// The paths fail differently under an 8-bit store, and the values are picked to match.
    /// Where the kind is compared with <c>==</c> (producer round-trip, MemorySystem rule)
    /// the dangerous truncation is one that ALIASES a real shipped kind rather than
    /// vanishing — hence <c>1&lt;&lt;8 | AgreeTask</c>, which degrades to exactly AgreeTask and
    /// forges a promise. Where it is tested with <c>&amp;</c> (the legal-set) truncation can
    /// only LOSE bits, so the bite is a granted effect silently disappearing between the
    /// sim and the dialogue layer — hence a lone top bit.
    ///
    /// TWO MUTATIONS MUST MAKE THESE FAIL (both applied, observed red, reverted):
    ///   M1 — in <c>sim/Sim.Core/Effects/CitizenEffects.cs</c>, change
    ///        <c>public enum EffectKind : ushort</c> back to <c>: byte</c>.
    ///   M2 — the narrowing defect itself: write <c>Kind = (EffectKind)(byte)…Kind</c> in
    ///        <see cref="EffectPump"/>'s publish and in <c>ApplyCitizenEffectCommand.Execute</c>.
    ///        M2 leaves the enum wide and only the producers lossy, which is the failure a
    ///        consumer-side test cannot see.
    ///
    /// The headroom values are <c>static readonly int</c>, not <c>const int</c>, because a
    /// const would turn M1 into five hard BUILD errors (CS0221, "Constant value '260'
    /// cannot be converted to a 'EffectKind'") instead of a test failure. Both are red, but
    /// a red test names the broken behaviour and a red build only names a line; and only
    /// the runtime form exercises the same silent-truncation-on-store that M2 models.
    /// </summary>
    [TestFixture]
    public sealed class EffectKindWidthTests
    {
        private static readonly string[] OneRoom = { "#####", "#...#", "#####" };

        /// <summary>Bit 8 OR AgreeTask(bit 2): truncating to 8 bits yields exactly AgreeTask.</summary>
        private static readonly int AliasesAgreeTask = (1 << 8) | (int)EffectKind.AgreeTask;

        /// <summary>The top ushort bit, alone: truncating to 8 bits erases the grant entirely.</summary>
        private static readonly int TopFlagBit = 1 << 15;

        /// <summary>
        /// A test-only <see cref="CitizenEffect"/> that reports a kind above bit 7 — the stand-in
        /// for the economy effects W0-2 bought room for. It exists so the two PRODUCERS can be
        /// driven with a value a byte cannot hold; the shipped vocabulary is untouched and no
        /// member is added to the shipped enum.
        ///
        /// It is deliberately payload-clean (one <c>uint</c> ctor parameter) so
        /// <c>EffectWhitelistTests.EffectPayloads_CarryOnlyBoundedValueTypes</c> still applies to
        /// it in full. <c>ConcreteCitizenEffectRecords_AreExactlyTheWhitelist</c> skips the
        /// <c>Perilune.Tests</c> namespace (the .csproj compiles Sim.Core into this assembly, so
        /// reflection over "the effect assembly" sees test types); its guard over shipped
        /// <c>Perilune.Sim</c> effect types is unchanged.
        ///
        /// <see cref="EffectValidator"/> has no case for it, so it takes the
        /// <c>default: return false</c> arm — Accepted=false, which is what a real unknown
        /// effect would do and is asserted below.
        /// </summary>
        private sealed record WideKindProbeEffect(uint CitizenId) : CitizenEffect(CitizenId)
        {
            public override EffectKind Kind => (EffectKind)AliasesAgreeTask;
        }

        // ------------------------------------------------- 1. the producers of the applied event

        /// <summary>
        /// <see cref="EffectPump"/> is one of the two shipped writers of
        /// <c>CitizenEffectAppliedEvent.Kind</c>. Driven for real: a probe effect goes into a real
        /// <see cref="PendingEffectBuffer"/>, the pump drains and validates it, and the published
        /// event must carry all 16 bits of the kind it was handed.
        /// Mutations: M1 (enum back to <c>byte</c>) or M2 (<c>Kind = (EffectKind)(byte)pending.Effect.Kind</c>
        /// at the pump's publish) — the event then reads 0x04, i.e. AgreeTask.
        /// </summary>
        [Test]
        public void EffectPump_CopiesAKindAboveBitSevenIntoTheEventWithoutNarrowing()
        {
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);
            Citizen c = sim.AddCitizen("Ada", new Int3(1, 1, 0));
            var minds = new MindState();
            minds.Minds.GetOrCreate(c.Id);
            var facts = new FactRegistry();

            var buffer = new PendingEffectBuffer();
            buffer.Enqueue(new FollowPlayer(c.Id, true), "test");   // control: a real shipped effect
            buffer.Enqueue(new WideKindProbeEffect(c.Id), "test");  // subject: the wide kind

            new EffectPump(buffer, minds, facts).Tick(sim);
            sim.Events.SwapBuffers(); // the bus serves the PREVIOUS tick's buffer

            ReadOnlySpan<CitizenEffectAppliedEvent> span = sim.Events.Read<CitizenEffectAppliedEvent>();
            Assert.That(span.Length, Is.EqualTo(2),
                "precondition: the pump drained BOTH queued effects and published an event for each");
            Assert.That(span[0].Kind, Is.EqualTo(EffectKind.FollowPlayer),
                "precondition: the control effect went through the pump unmangled");
            Assert.That(span[0].Accepted, Is.True,
                "precondition: the validator really ran and accepted the control effect");

            Assert.That((int)span[1].Kind, Is.EqualTo(AliasesAgreeTask),
                "the pump must copy all 16 bits of the effect's kind into the event, not the low 8");
            Assert.That(span[1].Kind, Is.Not.EqualTo(EffectKind.AgreeTask),
                "and must not degrade it into the shipped kind it aliases in the low byte");
            Assert.That(span[1].Accepted, Is.False,
                "the probe has no validator case, so it is rejected — the kind still had to survive");
        }

        /// <summary>
        /// <see cref="ApplyCitizenEffectCommand"/> is the other shipped writer of
        /// <c>CitizenEffectAppliedEvent.Kind</c> — the path the conversation runtime uses when no
        /// buffer is supplied. Driven through the real <c>ISimCommand</c> inbox and a real
        /// <c>sim.Tick()</c>.
        /// Mutations: M1, or M2 at <c>ApplyCitizenEffectCommand.Execute</c>'s publish — the event
        /// then reads 0x04, i.e. AgreeTask.
        /// </summary>
        [Test]
        public void ApplyCitizenEffectCommand_CopiesAKindAboveBitSevenIntoTheEventWithoutNarrowing()
        {
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);
            Citizen c = sim.AddCitizen("Ada", new Int3(1, 1, 0));
            var minds = new MindState();
            minds.Minds.GetOrCreate(c.Id);
            var facts = new FactRegistry();

            sim.EnqueueCommand(new ApplyCitizenEffectCommand(new FollowPlayer(c.Id, true), minds, facts));
            sim.EnqueueCommand(new ApplyCitizenEffectCommand(new WideKindProbeEffect(c.Id), minds, facts));
            sim.Tick(); // executes the inbox, then swaps the event buffers

            ReadOnlySpan<CitizenEffectAppliedEvent> span = sim.Events.Read<CitizenEffectAppliedEvent>();
            Assert.That(span.Length, Is.EqualTo(2),
                "precondition: both commands executed and published");
            Assert.That(span[0].Kind, Is.EqualTo(EffectKind.FollowPlayer));
            Assert.That(span[0].Accepted, Is.True,
                "precondition: the validator really ran and accepted the control effect");

            Assert.That((int)span[1].Kind, Is.EqualTo(AliasesAgreeTask),
                "the command must copy all 16 bits of the effect's kind into the event, not the low 8");
            Assert.That(span[1].Kind, Is.Not.EqualTo(EffectKind.AgreeTask),
                "and must not degrade it into the shipped kind it aliases in the low byte");
        }

        // ------------------------------------------------------------------ 2. the consumer path

        /// <summary>
        /// MemorySystem's promise rule matches <c>e.Kind == EffectKind.AgreeTask</c>. A kind
        /// carrying bit 8 above AgreeTask is NOT AgreeTask and must form no promise memory.
        /// Under M1 the event's Kind field truncates on store to exactly AgreeTask and the crew
        /// member spuriously "remembers agreeing" — a forged promise, and the test fails.
        ///
        /// This one publishes onto the bus BY HAND on purpose: it isolates the consumer rule
        /// table from the producers, which are pinned separately by the two tests above. It is
        /// therefore blind to M2 by construction, which is exactly why those two exist.
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

        // ----------------------------------------------------- 3. the manifest / legal-set path

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
        /// NOT a width test, despite living in this file — say so plainly (§5.2.4).
        /// <see cref="CapabilityManifest.Clear"/> assigns the CONSTANT <c>EffectKind.None</c>, so
        /// no width-dependent code is on this path and neither M1 nor M2 can ever break it; it is
        /// pinned with ordinary shipped flags for that reason. What it does prove is worth
        /// keeping on its own terms: the manifest is a REUSED object cleared per conversation
        /// turn (`CapabilityComputer.Compute` calls `Clear` first), so a missed reset leaks one
        /// citizen's grants into the next citizen's turn — and <c>LegalEffects</c> is the field
        /// that decides what a crew member may legally do.
        /// Mutation: in <c>sim/Sim.Core/Effects/CapabilityComputer.cs</c>, delete
        /// <c>LegalEffects = EffectKind.None;</c> from <c>Clear()</c>.
        /// </summary>
        [Test]
        public void ManifestClear_ResetsLegalEffects_SoAReusedManifestLeaksNoGrant()
        {
            var manifest = new CapabilityManifest
            {
                LegalEffects = EffectKind.SetDisposition | EffectKind.RevealInfo,
            };
            Assert.That(manifest.LegalEffects, Is.Not.EqualTo(EffectKind.None),
                "precondition: grants were actually stored before Clear");

            manifest.Clear();

            Assert.That(manifest.LegalEffects, Is.EqualTo(EffectKind.None),
                "a reused manifest must not carry a legal-effect grant into the next citizen's turn");
        }

        private static List<MemoryEntry> Memories(MindState minds, Simulation sim, uint id)
        {
            var into = new List<MemoryEntry>();
            minds.GetTopMemories(id, sim.TickCount, null, into, 64);
            return into;
        }
    }
}
