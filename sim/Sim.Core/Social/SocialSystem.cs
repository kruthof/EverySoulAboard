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
    }

    /// <summary>
    /// Social layer v0 (SIMULATION_ARCHITECTURE layer 5; WS-SOCIAL): a sparse directed
    /// opinion graph over citizens. Two living citizens sharing a room familiarize in
    /// both directions each pass; every opinion also relaxes toward 0 each pass, so net
    /// co-location accrual is familiarize − decay and separation slowly cools a
    /// relationship. Conversation effects and future social events feed the same edges
    /// through <see cref="Nudge"/>, so talk and proximity share one clamp and one save
    /// path. Edges are canonical sim state: SYSS-saved via IStatefulSystem and folded
    /// into StateHash via <see cref="StateChecksum"/>.
    ///
    /// Determinism: edges live in a (From,To)-sorted list and ALL iteration is over
    /// that list; the dictionary is lookup-only (never iterated). Citizen scan is
    /// store-order. Zero steady-state allocation: an edge allocates only on first
    /// contact of a pair (bounded by pair count; capacities pre-sized).
    /// </summary>
    public sealed class SocialSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Social";
        public int IntervalTicks => 10;      // 1 Hz social pass
        private const float DtSeconds = 1f;  // interval-paired (structural, not a def)

        public ushort StateVersion => 1;

        private readonly List<OpinionEdge> _edges = new List<OpinionEdge>(256);
        private readonly Dictionary<ulong, int> _index = new Dictionary<ulong, int>(256);

        /// <summary>Canonical (From,To)-sorted edge list — for inspectors/prompt builders.</summary>
        public IReadOnlyList<OpinionEdge> Edges => _edges;

        private static ulong Key(uint from, uint to) => ((ulong)from << 32) | to;

        /// <summary>0 for strangers (no edge is ever created by reading).</summary>
        public float GetOpinion(uint from, uint to) =>
            _index.TryGetValue(Key(from, to), out int i) ? _edges[i].Opinion : 0f;

        public void Tick(Simulation sim)
        {
            var defs = sim.Defs.Social;
            float familiarize = defs.FamiliarizePerHour * (DtSeconds / 3600f);
            float decay = defs.DecayPerHour * (DtSeconds / 3600f);

            // 1. Co-location accrual, citizen store order (deterministic).
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
        }

        private static ushort RoomOf(Simulation sim, Int3 p)
        {
            var level = sim.World.Levels[p.Z];
            return level.RoomId[level.Index(p.X, p.Y)];
        }

        /// <summary>
        /// Apply a bounded opinion delta (proximity accrual, and later conversation
        /// effects / social events — one entry point, one clamp). Creates the edge on
        /// first contact via sorted insert so the list order stays canonical.
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
            _edges.Insert(lo, new OpinionEdge { From = from, To = to, Opinion = Clamp(delta, defs) });
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
            }
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version != 1) return;
            _edges.Clear();
            _index.Clear();
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                var e = new OpinionEdge
                {
                    From = reader.ReadUInt32(),
                    To = reader.ReadUInt32(),
                    Opinion = reader.ReadSingle(),
                };
                _edges.Add(e);
                _index[Key(e.From, e.To)] = i;
            }
        }

        public ulong StateChecksum()
        {
            ulong h = 0x534F434CUL; // 'SOCL'
            for (int i = 0; i < _edges.Count; i++)
            {
                h = XxHash64.Combine(h, Key(_edges[i].From, _edges[i].To));
                h = XxHash64.Combine(h, _edges[i].Opinion);
            }
            return h;
        }
    }
}
