using System;
using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Llm
{
    /// <summary>
    /// Outcome of one conversation turn: the citizen's reply plus the sim effects the
    /// runtime dispatched to the command inbox for this turn. The effects are advisory
    /// at dispatch time — each is still re-validated and clamped at tick start — so
    /// this list is "what was proposed and accepted into the inbox", not "what mutated
    /// state". Callers learn per-effect acceptance from <see cref="CitizenEffectAppliedEvent"/>.
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
    /// The headless conversation runtime (PLAN.md WS-LLM P1) — provider-agnostic, zero
    /// network code. Given a citizen id and player text it:
    ///   1. computes the capability manifest sim-side (<see cref="CapabilityComputer"/>),
    ///   2. assembles a pure-read CitizenContext snapshot (<see cref="CitizenContext"/>),
    ///   3. drives the active <see cref="IChatBackend"/>,
    ///   4. maps each whitelisted <see cref="ProposedEffect"/> back to a concrete sim
    ///      <see cref="CitizenEffect"/> over the manifest's id domains, capping at the
    ///      backend's per-turn <see cref="BackendCapabilities.MaxEffects"/>, and
    ///   5. delivers them to the sim ONLY as <see cref="ApplyCitizenEffectCommand"/> on
    ///      the ordinary <see cref="ISimCommand"/> inbox — re-validated + clamped against
    ///      CURRENT state at tick start (LLM_CITIZENS.md §5, §10).
    ///
    /// The sim never blocks on a backend; a backend never mutates sim state. Fully
    /// deterministic: every input is (persona, sim state, player text) and the only
    /// variation the TemplateBackend introduces is a hash of those — never wall clock,
    /// never Random. Snapshot assembly and manifest computation are pure reads, so
    /// conversing does not perturb the sim's RNG or StateHash trajectory.
    /// </summary>
    public sealed class ConversationService
    {
        private readonly Simulation _sim;
        private readonly MindState _minds;
        private readonly FactRegistry _facts;
        private readonly CapabilityComputer _computer = new CapabilityComputer();
        private readonly CapabilityManifest _manifest = new CapabilityManifest();
        private readonly EffectValidator _validator = new EffectValidator();
        private readonly LlmRequestQueue _queue = new LlmRequestQueue();

        /// <summary>The active backend (template today; a live vendor adapter later). Hot-swappable for degradation (§10).</summary>
        public IChatBackend Backend { get; set; }

        /// <summary>Priority scaffolding for async work (§10): P0 dialogue / P1 summaries / P2 background.</summary>
        public LlmRequestQueue Queue => _queue;

        public ConversationService(Simulation sim, MindState minds, FactRegistry facts, IChatBackend backend)
        {
            _sim = sim ?? throw new ArgumentNullException(nameof(sim));
            _minds = minds ?? throw new ArgumentNullException(nameof(minds));
            _facts = facts ?? throw new ArgumentNullException(nameof(facts));
            Backend = backend ?? throw new ArgumentNullException(nameof(backend));
        }

        /// <summary>
        /// Run one turn synchronously (dialogue, P0): manifest → snapshot → backend →
        /// dispatch. Never throws on player text. The returned effects are already queued
        /// on the sim inbox and apply at the next tick start.
        /// </summary>
        public ConversationTurn Converse(uint citizenId, string playerText)
        {
            _computer.Compute(_sim, _minds, _facts, citizenId, _manifest);
            ConversationRequest request = CitizenContext.Build(_sim, _minds, _facts, _manifest, citizenId);

            ChatResult result = Backend.Respond(request, playerText);

            var dispatched = new List<CitizenEffect>();
            int cap = Backend.Caps.MaxEffects;
            List<ProposedEffect> proposed = result.Effects;
            for (int i = 0; i < proposed.Count; i++)
            {
                if (cap > 0 && dispatched.Count >= cap) break; // §5 defense layer 4: per-turn effect cap
                if (TryTranslate(citizenId, proposed[i], out CitizenEffect effect))
                {
                    _sim.EnqueueCommand(new ApplyCitizenEffectCommand(effect, _minds, _facts, _validator));
                    dispatched.Add(effect);
                }
            }
            return new ConversationTurn(result.ReplyText, dispatched);
        }

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

        /// <summary>
        /// Map a backend's whitelisted <see cref="ProposedEffect"/> onto the concrete sim
        /// <see cref="CitizenEffect"/>, resolving ids through the manifest computed for
        /// THIS turn (the enum domain). Anything outside that domain is dropped here — a
        /// second guard behind the backend's own whitelist obedience; the tick-start
        /// validator is the third. Only the whitelisted record types are constructible:
        /// there is no path to a spawn/set-stat effect.
        /// </summary>
        private bool TryTranslate(uint citizenId, ProposedEffect p, out CitizenEffect effect)
        {
            effect = null;
            if (p == null) return false;
            switch (p.Kind)
            {
                case EffectKind.SetDisposition:
                    // The scalar magnitude is the affinity delta; trust tracks it for the
                    // simple gestures the template produces. Both are clamped at apply time.
                    effect = new SetDisposition(citizenId, p.Magnitude, p.Magnitude, "Spoke with the player.");
                    return true;

                case EffectKind.RevealInfo:
                    if (!ManifestKnowsFact(p.TargetId)) return false;
                    effect = new RevealInfo(citizenId, p.TargetId);
                    return true;

                case EffectKind.AgreeTask:
                    if (p.TargetId >= (uint)_manifest.AssignableDigTargets.Count) return false;
                    effect = new AgreeTask(citizenId, JobKind.Dig, _manifest.AssignableDigTargets[(int)p.TargetId]);
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

        private bool ManifestKnowsFact(uint factId)
        {
            var known = _manifest.KnownFactIds;
            for (int i = 0; i < known.Count; i++)
                if (known[i] == factId) return true;
            return false;
        }
    }
}
