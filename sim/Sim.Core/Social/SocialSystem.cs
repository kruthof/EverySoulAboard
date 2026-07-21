using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>One directed opinion: how <see cref="From"/> feels about <see cref="To"/>.</summary>
    public struct OpinionEdge
    {
        public uint From;
        public uint To;
        public float Opinion;
        /// <summary>The classified relationship tier (<see cref="RelationType"/> as byte),
        /// re-derived with hysteresis each pass from <see cref="Opinion"/>. Canonical sim
        /// state (SOCL-folded, SYSS-saved). v1 saves restore this as None and it re-derives
        /// on the next pass.</summary>
        public byte Rel;
    }

    /// <summary>
    /// Social layer (SIMULATION_ARCHITECTURE layer 5; WS-SOCIAL): a sparse directed
    /// opinion graph over citizens. Two living citizens sharing a room familiarize in
    /// both directions each pass; every opinion also relaxes toward 0 each pass, so net
    /// co-location accrual is familiarize − decay and separation slowly cools a
    /// relationship. Conversation effects and social events feed the same edges through
    /// <see cref="Nudge"/>, so talk, proximity and events share one clamp and one save
    /// path. Edges are canonical sim state: SYSS-saved via IStatefulSystem and folded
    /// into StateHash via <see cref="StateChecksum"/>.
    ///
    /// S1 adds, in the same 1 Hz pass: (a) a HYSTERESIS classifier that settles each edge
    /// into a <see cref="RelationType"/> tier (def-tunable enter/exit opinions so types
    /// never flicker), publishing <see cref="RelationshipChangedEvent"/> on transitions;
    /// and (b) deterministic argument/bond generation — each co-located pair rolls once
    /// per pass (gate + rate def-tunable) against a per-system forked <see cref="SimRng"/>,
    /// applying the opinion delta through <see cref="Nudge"/> and publishing
    /// <see cref="ArgumentEvent"/>/<see cref="BondEvent"/>.
    ///
    /// Determinism: edges live in a (From,To)-sorted list and ALL iteration is over
    /// that list; the dictionary is lookup-only (never iterated). Citizen scan is
    /// store-order; pair rolls draw from the forked stream in that same order. Zero
    /// steady-state allocation: an edge allocates only on first contact of a pair, and
    /// the RNG stream is forked exactly once (first pass); the roll/classify passes
    /// allocate nothing.
    /// </summary>
    public sealed class SocialSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Social";
        public int IntervalTicks => 10;      // 1 Hz social pass
        private const float DtSeconds = 1f;  // interval-paired (structural, not a def)

        /// <summary>Fork id for this system's private roll stream (never advances sim.Rng).</summary>
        private const ulong RollStream = 0x50C1A1UL; // "social"

        public ushort StateVersion => 2;     // v2: + OpinionEdge.Rel + forked roll-stream state

        private readonly List<OpinionEdge> _edges = new List<OpinionEdge>(256);
        private readonly Dictionary<ulong, int> _index = new Dictionary<ulong, int>(256);

        /// <summary>Per-system argument/bond roll stream, forked once from sim.Rng on the
        /// first pass so the roll cadence varies per world seed yet never perturbs any
        /// other system's stream. Null until the first pass (and on a v1 restore, where it
        /// re-forks next pass).</summary>
        private SimRng _roll;

        /// <summary>Canonical (From,To)-sorted edge list — for inspectors/prompt builders.</summary>
        public IReadOnlyList<OpinionEdge> Edges => _edges;

        private static ulong Key(uint from, uint to) => ((ulong)from << 32) | to;

        /// <summary>0 for strangers (no edge is ever created by reading).</summary>
        public float GetOpinion(uint from, uint to) =>
            _index.TryGetValue(Key(from, to), out int i) ? _edges[i].Opinion : 0f;

        /// <summary>The classified tier of from→to (None for strangers). Read-only view.</summary>
        public RelationType GetRelation(uint from, uint to) =>
            _index.TryGetValue(Key(from, to), out int i) ? (RelationType)_edges[i].Rel : RelationType.None;

        public void Tick(Simulation sim)
        {
            var defs = sim.Defs.Social;
            float familiarize = defs.FamiliarizePerHour * (DtSeconds / 3600f);
            float decay = defs.DecayPerHour * (DtSeconds / 3600f);

            // Fork the private roll stream exactly once (first pass) — the only allocation
            // this system makes past first contact. Deterministic and seed-varied.
            if (_roll == null) _roll = sim.Rng.Fork(RollStream);

            // 1. Co-location accrual + argument/bond rolls, citizen store order (deterministic).
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var a = citizens[i];
                if (a.Dead) continue;
                ushort roomA = RoomOf(sim, a.Pos);
                if (roomA == 0 || roomA == RoomState.DoorMarker) continue;
                for (int j = i + 1; j < citizens.Count; j++)
                {
                    var b = citizens[j];
                    if (b.Dead || b.Pos.Z != a.Pos.Z) continue;
                    if (RoomOf(sim, b.Pos) != roomA) continue;

                    Nudge(a.Id, b.Id, familiarize, defs);
                    Nudge(b.Id, a.Id, familiarize, defs);
                    RollPair(sim, a, b, defs);
                }
            }

            // 2. Relaxation toward 0, edge list order.
            for (int k = 0; k < _edges.Count; k++)
            {
                var e = _edges[k];
                if (e.Opinion > 0f) e.Opinion = Math.Max(0f, e.Opinion - decay);
                else if (e.Opinion < 0f) e.Opinion = Math.Min(0f, e.Opinion + decay);
                _edges[k] = e;
            }

            // 3. Hysteresis classification, edge list order — publish on transition only.
            for (int k = 0; k < _edges.Count; k++)
            {
                var e = _edges[k];
                byte next = Classify(e.Rel, e.Opinion, defs);
                if (next != e.Rel)
                {
                    sim.Events.Publish(new RelationshipChangedEvent
                    {
                        From = e.From,
                        To = e.To,
                        OldRel = e.Rel,
                        NewRel = next,
                    });
                    e.Rel = next;
                    _edges[k] = e;
                }
            }
        }

        /// <summary>
        /// One deterministic argument/bond roll for a co-located pair. Argument gate:
        /// the pair's lower mood is below the mood threshold AND the from→to opinion is
        /// at/below the argument ceiling (already-strained rivals sniping under stress).
        /// Bond gate: the from→to opinion is at/above the bond floor (a warming pair).
        /// A fire applies the def delta both ways through <see cref="Nudge"/> and
        /// publishes the event. Draws are order-stable: argument first, then bond.
        /// </summary>
        private void RollPair(Simulation sim, Citizen a, Citizen b, SimDefs.SocialDefs defs)
        {
            float opinionAB = GetOpinion(a.Id, b.Id);
            float lowMood = a.Mood < b.Mood ? a.Mood : b.Mood;

            if (lowMood < defs.ArgumentMoodThreshold && opinionAB <= defs.ArgumentOpinionCeiling
                && _roll.NextFloat() < defs.ArgumentChancePerPass)
            {
                Nudge(a.Id, b.Id, defs.ArgumentOpinionDelta, defs);
                Nudge(b.Id, a.Id, defs.ArgumentOpinionDelta, defs);
                sim.Events.Publish(new ArgumentEvent { A = a.Id, B = b.Id, Pos = a.Pos });
            }
            else if (opinionAB >= defs.BondOpinionFloor
                && _roll.NextFloat() < defs.BondChancePerPass)
            {
                Nudge(a.Id, b.Id, defs.BondOpinionDelta, defs);
                Nudge(b.Id, a.Id, defs.BondOpinionDelta, defs);
                sim.Events.Publish(new BondEvent { A = a.Id, B = b.Id, Pos = a.Pos });
            }
        }

        /// <summary>
        /// Map an opinion to a relationship tier with hysteresis: a tier is HELD (down to
        /// its exit opinion) once entered, and only entered at its stricter enter opinion.
        /// Returns the tier to settle into given the current one, resolving multi-tier
        /// jumps in a single call.
        /// </summary>
        private static byte Classify(byte cur, float o, in SimDefs.SocialDefs d)
        {
            // Positive ladder: None -> Friend -> CloseFriend.
            if (o >= d.CloseFriendEnterOpinion) return (byte)RelationType.CloseFriend;
            if (cur == (byte)RelationType.CloseFriend && o >= d.CloseFriendExitOpinion)
                return (byte)RelationType.CloseFriend;                        // hold CloseFriend
            if (o >= d.FriendEnterOpinion) return (byte)RelationType.Friend;
            if ((cur == (byte)RelationType.Friend || cur == (byte)RelationType.CloseFriend)
                && o >= d.FriendExitOpinion)
                return (byte)RelationType.Friend;                             // hold Friend

            // Negative ladder: None -> Rival -> Enemy.
            if (o <= d.EnemyEnterOpinion) return (byte)RelationType.Enemy;
            if (cur == (byte)RelationType.Enemy && o <= d.EnemyExitOpinion)
                return (byte)RelationType.Enemy;                              // hold Enemy
            if (o <= d.RivalEnterOpinion) return (byte)RelationType.Rival;
            if ((cur == (byte)RelationType.Rival || cur == (byte)RelationType.Enemy)
                && o <= d.RivalExitOpinion)
                return (byte)RelationType.Rival;                             // hold Rival

            return (byte)RelationType.None;
        }

        private static ushort RoomOf(Simulation sim, Int3 p)
        {
            var level = sim.World.Levels[p.Z];
            return level.RoomId[level.Index(p.X, p.Y)];
        }

        /// <summary>
        /// Apply a bounded opinion delta (proximity accrual, conversation effects and
        /// social events — one entry point, one clamp). Creates the edge on first contact
        /// via sorted insert so the list order stays canonical; a fresh edge starts at
        /// <see cref="RelationType.None"/> and is classified on the same pass.
        /// </summary>
        public void Nudge(uint from, uint to, float delta, SimDefs.SocialDefs defs)
        {
            ulong key = Key(from, to);
            if (_index.TryGetValue(key, out int idx))
            {
                var e = _edges[idx];
                e.Opinion = Clamp(e.Opinion + delta, defs);
                _edges[idx] = e;
                return;
            }

            int lo = 0, hi = _edges.Count;
            while (lo < hi)
            {
                int mid = (lo + hi) >> 1;
                if (Less(_edges[mid], from, to)) lo = mid + 1; else hi = mid;
            }
            _edges.Insert(lo, new OpinionEdge { From = from, To = to, Opinion = Clamp(delta, defs), Rel = (byte)RelationType.None });
            for (int k = lo; k < _edges.Count; k++)
                _index[Key(_edges[k].From, _edges[k].To)] = k;
        }

        private static bool Less(in OpinionEdge e, uint from, uint to) =>
            e.From != from ? e.From < from : e.To < to;

        private static float Clamp(float v, SimDefs.SocialDefs defs) =>
            v < defs.MinOpinion ? defs.MinOpinion : (v > defs.MaxOpinion ? defs.MaxOpinion : v);

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(_edges.Count);
            for (int i = 0; i < _edges.Count; i++)
            {
                writer.Write(_edges[i].From);
                writer.Write(_edges[i].To);
                writer.Write(_edges[i].Opinion);
                writer.Write(_edges[i].Rel);          // v2
            }

            // v2: the forked roll-stream state (present flag + xoshiro words) so the
            // argument/bond cadence resumes byte-identically across save/load.
            bool hasRoll = _roll != null;
            writer.Write(hasRoll);
            if (hasRoll)
            {
                var (s0, s1, s2, s3) = _roll.State;
                writer.Write(s0);
                writer.Write(s1);
                writer.Write(s2);
                writer.Write(s3);
            }
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version != 1 && version != 2) return;
            _edges.Clear();
            _index.Clear();
            _roll = null;
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                var e = new OpinionEdge
                {
                    From = reader.ReadUInt32(),
                    To = reader.ReadUInt32(),
                    Opinion = reader.ReadSingle(),
                    // v1 predates Rel: restore as None; the next pass re-derives it.
                    Rel = version >= 2 ? reader.ReadByte() : (byte)RelationType.None,
                };
                _edges.Add(e);
                _index[Key(e.From, e.To)] = i;
            }

            if (version >= 2 && reader.ReadBoolean())
            {
                ulong s0 = reader.ReadUInt64(), s1 = reader.ReadUInt64(),
                      s2 = reader.ReadUInt64(), s3 = reader.ReadUInt64();
                _roll = new SimRng(0);
                _roll.Restore(s0, s1, s2, s3);
            }
        }

        public ulong StateChecksum()
        {
            ulong h = 0x534F434CUL; // 'SOCL'
            for (int i = 0; i < _edges.Count; i++)
            {
                h = XxHash64.Combine(h, Key(_edges[i].From, _edges[i].To));
                h = XxHash64.Combine(h, _edges[i].Opinion);
                h = XxHash64.Combine(h, _edges[i].Rel);          // v2
            }

            // Fold the forked roll-stream state (matches CaptureState) so a bad restore of
            // the argument/bond cadence can't hide from the determinism canary.
            if (_roll != null)
            {
                var (s0, s1, s2, s3) = _roll.State;
                h = XxHash64.Combine(h, s0);
                h = XxHash64.Combine(h, s1);
                h = XxHash64.Combine(h, s2);
                h = XxHash64.Combine(h, s3);
            }
            return h;
        }
    }
}
