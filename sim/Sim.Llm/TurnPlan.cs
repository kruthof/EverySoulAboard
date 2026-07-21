using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Llm
{
    /// <summary>
    /// An immutable snapshot of everything one conversation turn needs, produced by
    /// <see cref="ConversationService.PrepareTurn"/> and consumed by
    /// <see cref="ConversationService.CompleteTurn"/>. It exists to make the turn safe to
    /// run asynchronously: the pre-async service translated proposed effects through a
    /// single reused <see cref="CapabilityManifest"/> field, so two overlapping turns would
    /// clobber each other's id domains. A TurnPlan instead OWNS a private, copied manifest
    /// captured at prepare time, so translation at complete time is a pure function of this
    /// plan — never of shared mutable service state.
    ///
    /// Everything here is a snapshot: the <see cref="Request"/> is the pure CitizenContext
    /// read (persona, memories, capability summary), the manifest is a deep copy of the
    /// sim-computed legal id domains, and <see cref="TurnSeq"/> is a monotonic id for
    /// logging/ordering. Two plans never share list instances.
    /// </summary>
    public sealed class TurnPlan
    {
        /// <summary>The citizen this turn speaks as.</summary>
        public uint CitizenId { get; }

        /// <summary>Monotonic per-service turn number (prepare order); for logs/ordering only.</summary>
        public long TurnSeq { get; }

        /// <summary>The pure per-turn snapshot the backend speaks against.</summary>
        public ConversationRequest Request { get; }

        // Private copies of the manifest's legal id domains — the ONLY state translation
        // reads. Copied out of the sim-computed manifest at prepare time so no two plans,
        // and no concurrent PrepareTurn, ever share them.
        private readonly Perilune.Sim.EffectKind _legalEffects;
        private readonly List<uint> _knownFactIds;
        private readonly List<Int3> _assignableDigTargets;

        internal TurnPlan(uint citizenId, long turnSeq, ConversationRequest request, CapabilityManifest source)
        {
            CitizenId = citizenId;
            TurnSeq = turnSeq;
            Request = request;

            // Deep-copy the manifest's id domains. source is the service's throwaway
            // manifest; after this ctor the plan shares nothing with it.
            _legalEffects = source != null ? source.LegalEffects : Perilune.Sim.EffectKind.None;
            _knownFactIds = new List<uint>(source != null ? source.KnownFactIds.Count : 0);
            _assignableDigTargets = new List<Int3>(source != null ? source.AssignableDigTargets.Count : 0);
            if (source != null)
            {
                for (int i = 0; i < source.KnownFactIds.Count; i++) _knownFactIds.Add(source.KnownFactIds[i]);
                for (int i = 0; i < source.AssignableDigTargets.Count; i++) _assignableDigTargets.Add(source.AssignableDigTargets[i]);
            }
        }

        /// <summary>The legal-effect flag set captured for this turn (the sim-side flags enum).</summary>
        public Perilune.Sim.EffectKind LegalEffects => _legalEffects;

        /// <summary>This turn's reveal_info id domain (facts known and not yet out). Read-only copy.</summary>
        public IReadOnlyList<uint> KnownFactIds => _knownFactIds;

        /// <summary>This turn's agree_task target domain (dig tiles), indexed by TargetId. Read-only copy.</summary>
        public IReadOnlyList<Int3> AssignableDigTargets => _assignableDigTargets;

        /// <summary>True iff the given fact id is in this turn's reveal domain.</summary>
        public bool KnowsFact(uint factId)
        {
            for (int i = 0; i < _knownFactIds.Count; i++)
                if (_knownFactIds[i] == factId) return true;
            return false;
        }
    }
}
