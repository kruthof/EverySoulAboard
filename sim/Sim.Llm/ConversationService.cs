using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Perilune.Sim;

namespace Perilune.Llm
{
    /// <summary>
    /// Outcome of one conversation turn: the citizen's reply plus the sim effects the
    /// runtime dispatched for this turn. The effects are advisory at dispatch time — each
    /// is still re-validated and clamped at tick start — so this list is "what was proposed
    /// and accepted for dispatch", not "what mutated state". Callers learn per-effect
    /// acceptance from <see cref="CitizenEffectAppliedEvent"/>.
    /// </summary>
    public sealed class ConversationTurn
    {
        public string ReplyText { get; }
        public IReadOnlyList<CitizenEffect> DispatchedEffects { get; }

        public ConversationTurn(string replyText, IReadOnlyList<CitizenEffect> effects)
        {
            ReplyText = replyText ?? string.Empty;
            DispatchedEffects = effects ?? (IReadOnlyList<CitizenEffect>)Array.Empty<CitizenEffect>();
        }
    }

    /// <summary>
    /// The headless conversation runtime (PLAN.md WS-LLM) — provider-agnostic, zero
    /// network code. A turn is split into two pure-ish halves so it is safe to run the
    /// backend asynchronously between them:
    ///
    ///   1. <see cref="PrepareTurn"/> — compute the capability manifest sim-side
    ///      (<see cref="CapabilityComputer"/>), assemble the pure-read
    ///      <see cref="CitizenContext"/> snapshot, and capture BOTH into an immutable
    ///      <see cref="TurnPlan"/> (its own copied manifest — no shared mutable field).
    ///   2. run the backend (<see cref="IChatBackend.Respond"/> synchronously, or
    ///      <see cref="IChatBackend.SendAsync"/> streamed).
    ///   3. <see cref="CompleteTurn"/> — map each whitelisted <see cref="ProposedEffect"/>
    ///      back to a concrete <see cref="CitizenEffect"/> over THIS plan's id domains,
    ///      capping at the backend's <see cref="BackendCapabilities.MaxEffects"/>, and
    ///      dispatch it — to a configured <see cref="PendingEffectBuffer"/> if one was
    ///      supplied, else as an <see cref="ApplyCitizenEffectCommand"/> on the ordinary
    ///      <see cref="ISimCommand"/> inbox. Either way the effect is re-validated and
    ///      clamped against CURRENT state at tick start (LLM_CITIZENS.md §5, §10).
    ///
    /// The sim never blocks on a backend; a backend never mutates sim state. Because each
    /// turn carries its own <see cref="TurnPlan"/>, two turns may be prepared and completed
    /// concurrently without sharing manifest state — the data race the single reused
    /// manifest field used to have is gone. Snapshot assembly and manifest computation are
    /// pure reads, so conversing does not perturb the sim's RNG or StateHash trajectory.
    /// </summary>
    public sealed class ConversationService
    {
        private readonly Simulation _sim;
        private readonly MindState _minds;
        private readonly FactRegistry _facts;
        private readonly CapabilityComputer _computer = new CapabilityComputer();
        private readonly EffectValidator _validator = new EffectValidator();
        private readonly LlmRequestQueue _queue = new LlmRequestQueue();
        private long _turnSeq;

        /// <summary>The active backend (template today; a live vendor adapter later). Hot-swappable for degradation (§10).</summary>
        public IChatBackend Backend { get; set; }

        /// <summary>
        /// Optional thread-safe outbox (§10). When set, dispatched effects are enqueued here
        /// for the sim's <see cref="EffectPump"/> to drain at tick start (the async-safe path).
        /// When null, effects go on the ordinary command inbox via
        /// <see cref="ApplyCitizenEffectCommand"/> — the v0 default, unchanged.
        /// </summary>
        public PendingEffectBuffer Buffer { get; set; }

        /// <summary>Priority scaffolding for async work (§10): P0 dialogue / P1 summaries / P2 background.</summary>
        public LlmRequestQueue Queue => _queue;

        public ConversationService(Simulation sim, MindState minds, FactRegistry facts, IChatBackend backend,
            PendingEffectBuffer buffer = null)
        {
            _sim = sim ?? throw new ArgumentNullException(nameof(sim));
            _minds = minds ?? throw new ArgumentNullException(nameof(minds));
            _facts = facts ?? throw new ArgumentNullException(nameof(facts));
            Backend = backend ?? throw new ArgumentNullException(nameof(backend));
            Buffer = buffer;
        }

        // ------------------------------------------------------------------
        // The prepare / complete pair
        // ------------------------------------------------------------------

        /// <summary>
        /// Snapshot the sim for one turn: compute a FRESH capability manifest, build the
        /// pure <see cref="ConversationRequest"/>, and capture both into an immutable
        /// <see cref="TurnPlan"/>. Allocates its own manifest per call, so concurrent
        /// PrepareTurn calls never share state. Pure read — mutates nothing, never throws
        /// on an unknown citizen (yields an empty-capability plan). <paramref name="playerText"/>
        /// is accepted for API symmetry and future utterance-conditioned preparation; the v0
        /// manifest does not depend on it.
        /// </summary>
        public TurnPlan PrepareTurn(uint citizenId, string playerText)
        {
            var manifest = new CapabilityManifest();
            _computer.Compute(_sim, _minds, _facts, citizenId, manifest);
            ConversationRequest request = CitizenContext.Build(_sim, _minds, _facts, manifest, citizenId);
            long seq = Interlocked.Increment(ref _turnSeq);
            return new TurnPlan(citizenId, seq, request, manifest);
        }

        /// <summary>
        /// Translate the turn's accumulated proposed effects through the plan's captured
        /// manifest and dispatch the accepted ones (capped at the backend's per-turn effect
        /// cap). Returns the dispatched <see cref="CitizenEffect"/>s in order. Reads only the
        /// plan — never a shared service field — so it is safe to interleave with other turns.
        /// </summary>
        public IReadOnlyList<CitizenEffect> CompleteTurn(TurnPlan plan, IReadOnlyList<ProposedEffect> effects)
        {
            var dispatched = new List<CitizenEffect>();
            if (plan == null || effects == null) return dispatched;

            int cap = Backend.Caps.MaxEffects;
            for (int i = 0; i < effects.Count; i++)
            {
                if (cap > 0 && dispatched.Count >= cap) break; // §5 defense layer 4: per-turn effect cap
                if (TryTranslate(plan, effects[i], out CitizenEffect effect))
                {
                    Dispatch(effect);
                    dispatched.Add(effect);
                }
            }
            return dispatched;
        }

        // ------------------------------------------------------------------
        // Sync + async turn drivers, both expressed over the pair
        // ------------------------------------------------------------------

        /// <summary>
        /// Run one turn synchronously (dialogue, P0): prepare → backend → complete. Never
        /// throws on player text. The returned effects are already dispatched (buffer or
        /// inbox) and apply at the next tick start. Behaviour is byte-identical to the
        /// pre-split runtime.
        /// </summary>
        public ConversationTurn Converse(uint citizenId, string playerText)
        {
            TurnPlan plan = PrepareTurn(citizenId, playerText);
            ChatResult result = Backend.Respond(plan.Request, playerText);
            IReadOnlyList<CitizenEffect> dispatched = CompleteTurn(plan, result.Effects);
            return new ConversationTurn(result.ReplyText, dispatched);
        }

        /// <summary>
        /// Run one turn over the streaming backend (§8, §10): prepare → drain
        /// <see cref="IChatBackend.SendAsync"/>, accumulating reply text and proposed
        /// effects → complete. Nothing is dispatched until the stream reaches
        /// <see cref="TurnComplete"/>, so a cancelled or faulted stream leaves the sim and
        /// this service untouched (the plan is a local; no partial state is retained).
        /// On <see cref="BackendError"/> the turn ends with whatever text streamed and no
        /// effects. Cancellation propagates as <see cref="OperationCanceledException"/>.
        /// </summary>
        public async Task<ConversationTurn> ConverseAsync(uint citizenId, string playerText, CancellationToken ct)
        {
            TurnPlan plan = PrepareTurn(citizenId, playerText);

            var text = new StringBuilder();
            var proposed = new List<ProposedEffect>();
            bool errored = false;

            await foreach (ChatDelta delta in Backend.SendAsync(plan.Request, playerText, ct).WithCancellation(ct))
            {
                switch (delta)
                {
                    case TextDelta td:
                        text.Append(td.Text);
                        break;
                    case EffectProposed ep:
                        if (ep.Effect != null) proposed.Add(ep.Effect);
                        break;
                    case BackendError _:
                        errored = true;
                        break;
                    case TurnComplete _:
                        break;
                }
            }

            // A faulted turn dispatches nothing (defense in depth: partial tool blocks
            // are never trusted). A clean turn translates + dispatches exactly once.
            IReadOnlyList<CitizenEffect> dispatched = errored
                ? Array.Empty<CitizenEffect>()
                : CompleteTurn(plan, proposed);
            return new ConversationTurn(text.ToString(), dispatched);
        }

        // ------------------------------------------------------------------
        // Priority-queue scaffolding (unchanged surface)
        // ------------------------------------------------------------------

        /// <summary>Enqueue a turn for later draining (priority scaffolding, §10).</summary>
        public void Enqueue(uint citizenId, string playerText, LlmPriority priority)
            => _queue.Enqueue(new LlmRequest(citizenId, playerText, priority));

        /// <summary>
        /// Drain and run the single highest-priority queued turn, if any — the per-step
        /// action a future async dispatcher performs. Returns false when the queue is empty.
        /// </summary>
        public bool PumpOnce(out ConversationTurn turn)
        {
            if (_queue.TryDequeue(out LlmRequest req))
            {
                turn = Converse(req.CitizenId, req.PlayerText);
                return true;
            }
            turn = null;
            return false;
        }

        // ------------------------------------------------------------------
        // Dispatch + translation
        // ------------------------------------------------------------------

        private void Dispatch(CitizenEffect effect)
        {
            if (Buffer != null)
                Buffer.Enqueue(effect, Backend.Caps.Name);
            else
                _sim.EnqueueCommand(new ApplyCitizenEffectCommand(effect, _minds, _facts, _validator));
        }

        /// <summary>
        /// Map a backend's whitelisted <see cref="ProposedEffect"/> onto the concrete sim
        /// <see cref="CitizenEffect"/>, resolving ids through the manifest captured on THIS
        /// turn's <see cref="TurnPlan"/> (the enum domain). Anything outside that domain is
        /// dropped here — a second guard behind the backend's own whitelist obedience; the
        /// tick-start validator is the third. Only the whitelisted record types are
        /// constructible: there is no path to a spawn/set-stat effect.
        /// </summary>
        private bool TryTranslate(TurnPlan plan, ProposedEffect p, out CitizenEffect effect)
        {
            effect = null;
            if (p == null) return false;
            uint citizenId = plan.CitizenId;
            switch (p.Kind)
            {
                case EffectKind.SetDisposition:
                    // The scalar magnitude is the affinity delta; trust tracks it for the
                    // simple gestures the template produces. Both are clamped at apply time.
                    effect = new SetDisposition(citizenId, p.Magnitude, p.Magnitude, "Spoke with the player.");
                    return true;

                case EffectKind.RevealInfo:
                    if (!plan.KnowsFact(p.TargetId)) return false;
                    effect = new RevealInfo(citizenId, p.TargetId);
                    return true;

                case EffectKind.AgreeTask:
                    if (p.TargetId >= (uint)plan.AssignableDigTargets.Count) return false;
                    effect = new AgreeTask(citizenId, JobKind.Dig, plan.AssignableDigTargets[(int)p.TargetId]);
                    return true;

                case EffectKind.FollowPlayer:
                    effect = new FollowPlayer(citizenId, p.Magnitude > 0f);
                    return true;

                case EffectKind.EndConversation:
                    effect = new EndConversation(citizenId, "neutral");
                    return true;

                default:
                    return false;
            }
        }
    }
}
