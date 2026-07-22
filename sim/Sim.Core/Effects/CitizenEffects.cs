using System;
using System.Collections.Concurrent;
using System.Collections.Generic;

// C# 9 records emit init-only setters whose marker type is missing from
// netstandard2.1, and Sim.Core compiles with noEngineReferences (no Unity-side
// shim). Internal, so it never leaks outside this assembly.
namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit { }
}

namespace Perilune.Sim
{
    /// <summary>
    /// The v0 whitelisted effect vocabulary (LLM_CITIZENS.md §5, §12) — the ONLY
    /// way any dialogue backend (Anthropic / Ollama / template) can touch sim
    /// state. There is no spawn_item / set_stat / free-form effect: anything not
    /// representable here is unrepresentable, not merely discouraged.
    ///
    /// Deviations from the doc, driven by the current codebase:
    /// - CitizenId is the sim's uint entity id, not a GUID string.
    /// - AgreeTask carries a JobKind + target tile (jobs are systemic, not id'd);
    ///   the v0 whitelist is Dig only.
    /// - v1 effects (not in v0): RefuseTask, GiveItem, MakePromise,
    ///   ChangeRelationship, JoinFaction.
    /// </summary>
    public abstract record CitizenEffect(uint CitizenId)
    {
        public abstract EffectKind Kind { get; }
    }

    public sealed record SetDisposition(uint CitizenId, float DeltaAffinity, float DeltaTrust, string Reason)
        : CitizenEffect(CitizenId)
    {
        public override EffectKind Kind => EffectKind.SetDisposition;
    }

    public sealed record SetEmotionalState(uint CitizenId, string Emotion, int DurationTicks)
        : CitizenEffect(CitizenId)
    {
        public override EffectKind Kind => EffectKind.SetEmotionalState;
    }

    /// <summary>v0: the citizen agrees to dig out a designated debris tile. Job must be Dig.</summary>
    public sealed record AgreeTask(uint CitizenId, JobKind Job, Int3 Target)
        : CitizenEffect(CitizenId)
    {
        public override EffectKind Kind => EffectKind.AgreeTask;
    }

    public sealed record RevealInfo(uint CitizenId, uint FactId)
        : CitizenEffect(CitizenId)
    {
        public override EffectKind Kind => EffectKind.RevealInfo;
    }

    public sealed record FollowPlayer(uint CitizenId, bool Follow)
        : CitizenEffect(CitizenId)
    {
        public override EffectKind Kind => EffectKind.FollowPlayer;
    }

    public sealed record EndConversation(uint CitizenId, string Mood)
        : CitizenEffect(CitizenId)
    {
        public override EffectKind Kind => EffectKind.EndConversation;
    }

    /// <summary>
    /// Effect discriminator. Flags so <see cref="CapabilityManifest.LegalEffects"/>
    /// can express a legal-set; single values identify one effect in events.
    ///
    /// WIDTH — <c>ushort</c>, deliberately (ECONOMY-PLAN.md §0 W0-2). Six of the eight
    /// bits a <c>byte</c> offers were already spent, so the economy's first two effects
    /// would have filled it; widening later would have been a cross-lane refactor. The
    /// widening is behaviour-free and pin-neutral: <see cref="EffectKind"/> is not
    /// written to any save chapter, not folded into any <c>StateChecksum</c>, and not
    /// carried numerically on the wire (the web skin sends an already-rendered effect
    /// NOTE string — <c>WireFormat.ChatEffect</c>), and the provider tool schemas bound
    /// the enum by NAME, not ordinal. Nothing may narrow it back on the way through:
    /// there is no <c>(byte)</c> cast of an EffectKind anywhere in the tree, and
    /// <c>EffectKindWidthTests</c> pins that flags above bit 7 survive every path that
    /// actually carries the value — BOTH producers of <c>CitizenEffectAppliedEvent.Kind</c>
    /// (<see cref="EffectPump"/> below and <c>ApplyCitizenEffectCommand</c>), the consuming
    /// MemorySystem rule table, and the CapabilityManifest legal-set into TurnPlan. A
    /// <c>(byte)</c> cast reintroduced at either producer is invisible to consumer-side
    /// tests, so do not "simplify" those two away.
    ///
    /// Rows stay append-only and stay powers of two; the next free bit is 1 &lt;&lt; 6.
    /// </summary>
    [Flags]
    public enum EffectKind : ushort
    {
        None = 0,
        SetDisposition = 1 << 0,
        SetEmotionalState = 1 << 1,
        AgreeTask = 1 << 2,
        RevealInfo = 1 << 3,
        FollowPlayer = 1 << 4,
        EndConversation = 1 << 5,
    }

    /// <summary>
    /// A sim-authoritative piece of knowledge a citizen can reveal (LLM_CITIZENS.md
    /// §2: secrets are sim facts first — the LLM can only reveal facts that exist).
    /// MarkerPos, when set, points at a real world tile (e.g. a hidden cache).
    /// </summary>
    public sealed class ShipFact
    {
        public uint Id;
        public string Text = "";
        public Int3? MarkerPos;
        public bool RevealedToCrewPlayer;
    }

    /// <summary>
    /// Deterministic, list-based fact store owned by the effect spine. Constructed
    /// by the host (Bootstrap / test harness) and passed to the generator,
    /// validator and capability computer — the Simulation object is not modified.
    /// TODO(persistence): serialize via a dedicated save chapter alongside minds.
    /// </summary>
    public sealed class FactRegistry
    {
        public readonly List<ShipFact> Facts = new List<ShipFact>(); // insertion order = creation order
        private readonly Dictionary<uint, ShipFact> _byId = new Dictionary<uint, ShipFact>();
        private uint _nextId = 1;

        public int Count => Facts.Count;

        public ShipFact Add(string text, Int3? markerPos = null)
        {
            var fact = new ShipFact { Id = _nextId++, Text = text ?? "", MarkerPos = markerPos };
            Facts.Add(fact);
            _byId.Add(fact.Id, fact);
            return fact;
        }

        public bool TryGet(uint id, out ShipFact fact) => _byId.TryGetValue(id, out fact);
    }

    /// <summary>An effect waiting for the next tick boundary, with its producer tag ("anthropic", "template", "test").</summary>
    public readonly struct PendingEffect
    {
        public readonly CitizenEffect Effect;
        public readonly string SourceTag;

        public PendingEffect(CitizenEffect effect, string sourceTag)
        {
            Effect = effect;
            SourceTag = sourceTag;
        }
    }

    /// <summary>
    /// Thread-safe inbox for validated-later effects (LLM_CITIZENS.md §10): any
    /// backend thread enqueues; the sim drains at tick start via
    /// <see cref="EffectPump"/>, re-validating against CURRENT state. Effects
    /// never mutate the sim directly and the sim never blocks on the LLM.
    /// </summary>
    public sealed class PendingEffectBuffer
    {
        private readonly ConcurrentQueue<PendingEffect> _queue = new ConcurrentQueue<PendingEffect>();

        public void Enqueue(CitizenEffect effect, string sourceTag)
        {
            if (effect == null) return;
            _queue.Enqueue(new PendingEffect(effect, sourceTag ?? ""));
        }

        public bool TryDequeue(out PendingEffect pending) => _queue.TryDequeue(out pending);
    }

    /// <summary>
    /// Published for every drained effect, accepted or (silently) rejected —
    /// the dialogue layer turns rejections into in-character tool_result errors.
    /// Lives here (not SimEvents.cs) because it is owned by the effect spine.
    /// </summary>
    public struct CitizenEffectAppliedEvent : ISimEvent
    {
        public uint CitizenId;
        public EffectKind Kind;
        public bool Accepted;
    }

    /// <summary>
    /// Drains the <see cref="PendingEffectBuffer"/> at the start of every tick,
    /// in arrival order, validating each effect against current state via
    /// <see cref="EffectValidator"/>. MUST be registered FIRST in any system
    /// stack that uses it (the host adds it; SystemStack is untouched in v0),
    /// so effects apply before movement/jobs read citizen state this tick.
    /// Steady state (empty buffer) does not allocate.
    /// </summary>
    public sealed class EffectPump : ISimSystem
    {
        public string Name => "EffectPump";
        public int IntervalTicks => 1;

        /// <summary>Rate cap (doc §5 defense layer 4): overflow stays queued for the next tick.</summary>
        public const int MaxEffectsPerTick = 64;

        private readonly PendingEffectBuffer _buffer;
        private readonly MindState _minds;
        private readonly FactRegistry _facts;
        private readonly EffectValidator _validator = new EffectValidator();

        public EffectPump(PendingEffectBuffer buffer, MindState minds, FactRegistry facts)
        {
            _buffer = buffer ?? throw new ArgumentNullException(nameof(buffer));
            _minds = minds ?? throw new ArgumentNullException(nameof(minds));
            _facts = facts ?? throw new ArgumentNullException(nameof(facts));
        }

        public void Tick(Simulation sim)
        {
            int drained = 0;
            while (drained < MaxEffectsPerTick && _buffer.TryDequeue(out var pending))
            {
                drained++;
                bool accepted = _validator.TryApply(sim, _minds, _facts, pending.Effect);
                sim.Events.Publish(new CitizenEffectAppliedEvent
                {
                    CitizenId = pending.Effect.CitizenId,
                    Kind = pending.Effect.Kind,
                    Accepted = accepted,
                });
            }
        }
    }
}
