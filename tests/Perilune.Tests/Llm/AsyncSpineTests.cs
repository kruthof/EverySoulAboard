using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using NUnit.Framework;
using Perilune.Llm;
using Perilune.Sim;
using LlmEffectKind = Perilune.Llm.EffectKind;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Package L1 — the async spine: ChatDelta streaming, SyncChatBackend wrapping, the
    /// PrepareTurn/CompleteTurn split (per-turn TurnPlan, no shared manifest race), the
    /// optional PendingEffectBuffer dispatch path, and cancellation safety. The existing
    /// Llm suite (ConversationRoundTripTests, ConversationDeterminismTests, ...) is the
    /// regression oracle for unchanged sync behaviour; these tests cover the new surface.
    /// </summary>
    [TestFixture]
    public sealed class AsyncSpineTests
    {
        private static async Task<List<ChatDelta>> Collect(
            System.Collections.Generic.IAsyncEnumerable<ChatDelta> stream, CancellationToken ct = default)
        {
            var list = new List<ChatDelta>();
            await foreach (ChatDelta d in stream.WithCancellation(ct)) list.Add(d);
            return list;
        }

        private static ConversationRequest RequestWithSecretCaps()
        {
            var req = new ConversationRequest { CitizenName = "Okafor", Mood = 0f, Traits = new List<string> { "stoic" } };
            req.CapabilitySummary.Add(new EffectOption(LlmEffectKind.RevealInfo, 7u, "the cache in D-7"));
            req.CapabilitySummary.Add(new EffectOption(LlmEffectKind.SetDisposition, 0u, "your standing"));
            return req;
        }

        // ----------------------------------------------------------------------------
        // Wrapped-backend delta sequence
        // ----------------------------------------------------------------------------

        [Test]
        public async Task WrappedTemplateBackend_DeltaSequence_IsTextThenEffectsThenComplete()
        {
            var backend = new TemplateBackend();
            ConversationRequest req = RequestWithSecretCaps();

            ChatResult sync = backend.Respond(req, "do you have any secrets?");
            Assert.That(sync.Effects.Count, Is.GreaterThan(0), "precondition: this turn proposes effects");

            List<ChatDelta> deltas = await Collect(backend.SendAsync(req, "do you have any secrets?", default));

            // Exactly: one TextDelta, then N EffectProposed, then one TurnComplete.
            Assert.That(deltas.Count, Is.EqualTo(2 + sync.Effects.Count));
            Assert.That(deltas[0], Is.InstanceOf<TextDelta>());
            for (int i = 1; i <= sync.Effects.Count; i++)
                Assert.That(deltas[i], Is.InstanceOf<EffectProposed>(), "middle deltas are all EffectProposed");
            Assert.That(deltas[deltas.Count - 1], Is.InstanceOf<TurnComplete>(), "terminal delta is TurnComplete");

            // No error delta on the happy path.
            foreach (ChatDelta d in deltas) Assert.That(d, Is.Not.InstanceOf<BackendError>());

            // Accumulated stream == the synchronous turn, byte-for-byte.
            var text = (TextDelta)deltas[0];
            Assert.That(text.Text, Is.EqualTo(sync.ReplyText));
            for (int i = 0; i < sync.Effects.Count; i++)
            {
                var ep = (EffectProposed)deltas[1 + i];
                Assert.That(ep.Effect.Kind, Is.EqualTo(sync.Effects[i].Kind));
                Assert.That(ep.Effect.TargetId, Is.EqualTo(sync.Effects[i].TargetId));
                Assert.That(ep.Effect.Magnitude, Is.EqualTo(sync.Effects[i].Magnitude));
            }
        }

        [Test]
        public async Task WrappedTemplateBackend_TurnComplete_HasZeroUsageTaggedWithBackendName()
        {
            var backend = new TemplateBackend();
            List<ChatDelta> deltas = await Collect(backend.SendAsync(new ConversationRequest { CitizenName = "X" }, "hello", default));

            var complete = (TurnComplete)deltas[deltas.Count - 1];
            TurnUsage u = complete.Usage;
            Assert.That(u.InputTokens, Is.EqualTo(0));
            Assert.That(u.OutputTokens, Is.EqualTo(0));
            Assert.That(u.CacheReadTokens, Is.EqualTo(0));
            Assert.That(u.CacheWriteTokens, Is.EqualTo(0));
            Assert.That(u.Model, Is.EqualTo("template"), "offline usage is zero but names the backend for the cost meter");
        }

        [Test]
        public async Task SendAsync_NoWhitelistedCaps_YieldsTextThenTurnComplete_NoEffects()
        {
            var backend = new TemplateBackend();
            // No capability summary => nothing legal to propose.
            List<ChatDelta> deltas = await Collect(backend.SendAsync(new ConversationRequest { CitizenName = "X" }, "hello", default));
            Assert.That(deltas.Count, Is.EqualTo(2));
            Assert.That(deltas[0], Is.InstanceOf<TextDelta>());
            Assert.That(deltas[1], Is.InstanceOf<TurnComplete>());
        }

        // ----------------------------------------------------------------------------
        // Sync Converse unchanged; async matches sync
        // ----------------------------------------------------------------------------

        [Test]
        public void Converse_EqualsPrepareRespondComplete_SyncBehaviourUnchanged()
        {
            var fx = ConversationTestScenario.Build(withSecret: true);
            var backend = new TemplateBackend();
            var service = new ConversationService(fx.Sim, fx.Minds, fx.Facts, backend);

            // What the split pair produces...
            TurnPlan plan = service.PrepareTurn(fx.CitizenId, "any secrets?");
            ChatResult direct = backend.Respond(plan.Request, "any secrets?");

            // ...equals what the one-shot Converse produces.
            ConversationTurn turn = service.Converse(fx.CitizenId, "any secrets?");
            Assert.That(turn.ReplyText, Is.EqualTo(direct.ReplyText));
            Assert.That(turn.DispatchedEffects.Count, Is.EqualTo(direct.Effects.Count));
        }

        [Test]
        public async Task ConverseAsync_MatchesSyncConverse_ReplyAndEffects()
        {
            var syncFx = ConversationTestScenario.Build(withSecret: true);
            var syncSvc = new ConversationService(syncFx.Sim, syncFx.Minds, syncFx.Facts, new TemplateBackend());
            ConversationTurn syncTurn = syncSvc.Converse(syncFx.CitizenId, "do you have any secrets?");

            var asyncFx = ConversationTestScenario.Build(withSecret: true);
            var asyncSvc = new ConversationService(asyncFx.Sim, asyncFx.Minds, asyncFx.Facts, new TemplateBackend());
            ConversationTurn asyncTurn = await asyncSvc.ConverseAsync(asyncFx.CitizenId, "do you have any secrets?", default);

            Assert.That(asyncTurn.ReplyText, Is.EqualTo(syncTurn.ReplyText));
            Assert.That(asyncTurn.DispatchedEffects.Count, Is.EqualTo(syncTurn.DispatchedEffects.Count));
            for (int i = 0; i < syncTurn.DispatchedEffects.Count; i++)
                Assert.That(asyncTurn.DispatchedEffects[i].Kind, Is.EqualTo(syncTurn.DispatchedEffects[i].Kind));

            // The async turn actually reached the sim's hashed state after a tick.
            asyncFx.Sim.Tick();
            Assert.That(asyncFx.Facts.TryGet(asyncFx.FactId, out ShipFact fact), Is.True);
            Assert.That(fact.RevealedToCrewPlayer, Is.True, "async reveal applied at the tick boundary");
        }

        // ----------------------------------------------------------------------------
        // PendingEffectBuffer dispatch path
        // ----------------------------------------------------------------------------

        [Test]
        public void Converse_WithBuffer_DispatchesToBuffer_NotInbox()
        {
            var fx = ConversationTestScenario.Build(withSecret: true);
            var buffer = new PendingEffectBuffer();
            var service = new ConversationService(fx.Sim, fx.Minds, fx.Facts, new TemplateBackend(), buffer);

            ConversationTurn turn = service.Converse(fx.CitizenId, "do you have any secrets?");
            Assert.That(turn.DispatchedEffects.Count, Is.GreaterThan(0));

            // The buffer received the effects, tagged with the backend name.
            var drained = new List<CitizenEffect>();
            while (buffer.TryDequeue(out PendingEffect pe))
            {
                drained.Add(pe.Effect);
                Assert.That(pe.SourceTag, Is.EqualTo("template"));
            }
            Assert.That(drained.Count, Is.EqualTo(turn.DispatchedEffects.Count));

            // Nothing went onto the command inbox: a tick applies no dialogue effect.
            fx.Sim.Tick();
            Assert.That(fx.Facts.TryGet(fx.FactId, out ShipFact fact), Is.True);
            Assert.That(fact.RevealedToCrewPlayer, Is.False, "buffer path bypasses ApplyCitizenEffectCommand; no EffectPump registered here");
        }

        // ----------------------------------------------------------------------------
        // Cancellation leaks nothing
        // ----------------------------------------------------------------------------

        [Test]
        public void ConverseAsync_CancelledBeforeEnumeration_ThrowsAndDispatchesNothing()
        {
            var fx = ConversationTestScenario.Build(withSecret: true);
            var buffer = new PendingEffectBuffer();
            var service = new ConversationService(fx.Sim, fx.Minds, fx.Facts, new TemplateBackend(), buffer);

            using var cts = new CancellationTokenSource();
            cts.Cancel();

            Assert.That(async () => await service.ConverseAsync(fx.CitizenId, "any secrets?", cts.Token),
                Throws.InstanceOf<System.OperationCanceledException>());

            Assert.That(buffer.TryDequeue(out _), Is.False, "a cancelled turn dispatches nothing");

            // No dangling state: a subsequent normal turn behaves exactly as if the cancelled
            // one never happened.
            ConversationTurn ok = service.Converse(fx.CitizenId, "do you have any secrets?");
            Assert.That(ok.DispatchedEffects.Count, Is.GreaterThan(0));
        }

        [Test]
        public void ConverseAsync_CancelledMidStream_ThrowsAndDispatchesNothing()
        {
            var fx = ConversationTestScenario.Build(withSecret: true);
            var buffer = new PendingEffectBuffer();
            using var cts = new CancellationTokenSource();
            var service = new ConversationService(fx.Sim, fx.Minds, fx.Facts, new MidCancelBackend(cts), buffer);

            Assert.That(async () => await service.ConverseAsync(fx.CitizenId, "any secrets?", cts.Token),
                Throws.InstanceOf<System.OperationCanceledException>());

            Assert.That(buffer.TryDequeue(out _), Is.False,
                "a turn cancelled after partial text streamed dispatches no effects (partial tool blocks are never trusted)");

            // Service is reusable after the mid-stream cancel: swap in a real backend.
            service.Backend = new TemplateBackend();
            ConversationTurn ok = service.Converse(fx.CitizenId, "do you have any secrets?");
            Assert.That(ok.DispatchedEffects.Count, Is.GreaterThan(0));
        }

        /// <summary>Yields a text delta, then cancels the shared token before the first effect delta.</summary>
        private sealed class MidCancelBackend : IChatBackend
        {
            private readonly CancellationTokenSource _cts;
            public MidCancelBackend(CancellationTokenSource cts) { _cts = cts; }
            public BackendCapabilities Caps => new BackendCapabilities("midcancel", false, false, 4);
            public ChatResult Respond(ConversationRequest request, string playerUtterance)
                => new ChatResult("partial", new List<ProposedEffect>());

            public async System.Collections.Generic.IAsyncEnumerable<ChatDelta> SendAsync(
                ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
            {
                await Task.CompletedTask;
                ct.ThrowIfCancellationRequested();
                yield return new TextDelta("partial reply ");
                _cts.Cancel();                       // cancellation arrives mid-turn
                ct.ThrowIfCancellationRequested();   // ...and is observed before any effect
                yield return new EffectProposed(new ProposedEffect(LlmEffectKind.SetDisposition, 0u, 9f));
                yield return new TurnComplete(new TurnUsage(0, 0, 0, 0, "midcancel"));
            }
        }

        // ----------------------------------------------------------------------------
        // Two concurrent TurnPlans do not share manifest state
        // ----------------------------------------------------------------------------

        [Test]
        public void ConcurrentTurnPlans_CaptureIndependentManifestSnapshots()
        {
            var fx = ConversationTestScenario.Build(withSecret: true, withDig: true);
            var service = new ConversationService(fx.Sim, fx.Minds, fx.Facts, new TemplateBackend());

            TurnPlan planA = service.PrepareTurn(fx.CitizenId, "turn A");
            Assert.That(planA.KnowsFact(fx.FactId), Is.True, "A captured the known secret");
            Assert.That(planA.AssignableDigTargets.Count, Is.GreaterThan(0), "A captured the dig target");
            Assert.That(planA.TurnSeq, Is.EqualTo(1L));

            // The world moves on BETWEEN the two prepares: the fact leaks.
            Assert.That(fx.Facts.TryGet(fx.FactId, out ShipFact fact), Is.True);
            fact.RevealedToCrewPlayer = true;

            TurnPlan planB = service.PrepareTurn(fx.CitizenId, "turn B");
            Assert.That(planB.KnowsFact(fx.FactId), Is.False, "B sees the current world: the fact is already out");
            Assert.That(planB.TurnSeq, Is.EqualTo(2L), "turn sequence advanced");

            // The crux: preparing B (and mutating the sim) did NOT disturb A's snapshot.
            Assert.That(planA.KnowsFact(fx.FactId), Is.True, "A's captured manifest is independent of B and of later sim changes");
            Assert.That(ReferenceEquals(planA.Request, planB.Request), Is.False, "each plan owns its own request");
            Assert.That(ReferenceEquals(planA.KnownFactIds, planB.KnownFactIds), Is.False, "each plan owns its own id lists");
        }

        // ----------------------------------------------------------------------------
        // Async determinism twin-run
        // ----------------------------------------------------------------------------

        [Test]
        public async Task ConverseAsync_TwinRun_IdenticalReplyEffectsAndHashTrajectory()
        {
            (string reply, string sig, ulong hash) a = await RunAsyncScript();
            (string reply, string sig, ulong hash) b = await RunAsyncScript();
            Assert.That(b.reply, Is.EqualTo(a.reply));
            Assert.That(b.sig, Is.EqualTo(a.sig));
            Assert.That(b.hash, Is.EqualTo(a.hash), "StateHash trajectory reproduces across async twin runs");
        }

        private static async Task<(string, string, ulong)> RunAsyncScript()
        {
            var fx = ConversationTestScenario.Build(traits: new[] { "sardonic" }, withSecret: true);
            var service = new ConversationService(fx.Sim, fx.Minds, fx.Facts, new TemplateBackend());
            var sig = new System.Text.StringBuilder();
            string lastReply = "";
            string[] script = { "Hello there.", "Do you have any secrets?", "Thanks for your help." };
            foreach (string line in script)
            {
                ConversationTurn turn = await service.ConverseAsync(fx.CitizenId, line, default);
                lastReply = turn.ReplyText;
                foreach (CitizenEffect e in turn.DispatchedEffects) sig.Append(e.Kind).Append('|');
                sig.Append(';');
                fx.Sim.Tick();
            }
            return (lastReply, sig.ToString(), fx.Sim.StateHash());
        }
    }
}
