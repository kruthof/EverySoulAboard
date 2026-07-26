using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// Grid A*, 4-directional plus ladder z-links. Synchronous and preallocated —
    /// M1 scale (few citizens, small maps) doesn't need the threaded region-graph
    /// version yet (TDD §3.9); the API is shaped so that can slot in later.
    /// Walkability: tile Walkable flag; door tiles walkable only when open+unlocked.
    /// </summary>
    public sealed class PathService
    {
        private int _capacity;
        private int[] _cameFrom;
        private float[] _gScore;
        private int[] _visitVersion;
        private int _version;

        // Binary min-heap of (f, index).
        private int[] _heapIndices;
        private float[] _heapCosts;
        private int _heapCount;

        private World _world; // set per query
        private Simulation _sim;

        /// <summary>Find a path (excluding start, including goal). Returns false if unreachable.</summary>
        public bool FindPath(Simulation sim, Int3 start, Int3 goal, List<Int3> outPath)
        {
            outPath.Clear();
            _sim = sim;
            _world = sim.World;
            if (!_world.InBounds(start) || !_world.InBounds(goal)) return false;
            if (!IsWalkable(goal)) return false;
            if (start == goal) return true;

            EnsureCapacity(_world.Width * _world.Height * _world.Depth);
            _version++;
            _heapCount = 0;

            int startIdx = Pack(start), goalIdx = Pack(goal);
            Visit(startIdx);
            _gScore[startIdx] = 0;
            _cameFrom[startIdx] = -1;
            HeapPush(startIdx, Heuristic(start, goal));

            Span<Int3> neighbors = stackalloc Int3[6];
            while (_heapCount > 0)
            {
                int current = HeapPop();
                if (current == goalIdx)
                {
                    Reconstruct(goalIdx, outPath);
                    return true;
                }

                var p = Unpack(current);
                int count = GetNeighbors(p, neighbors);
                for (int i = 0; i < count; i++)
                {
                    var n = neighbors[i];
                    if (!_world.InBounds(n) || !IsWalkable(n)) continue;
                    int ni = Pack(n);
                    float tentative = _gScore[current] + 1f;
                    if (_visitVersion[ni] == _version && tentative >= _gScore[ni]) continue;
                    Visit(ni);
                    _gScore[ni] = tentative;
                    _cameFrom[ni] = current;
                    HeapPush(ni, tentative + Heuristic(n, Unpack(goalIdx)));
                }
            }
            return false;
        }

        /// <summary>Path (excluding start, including goal) to the NEAREST reachable tile whose room
        /// is breathable (<see cref="AtmosphereSafety.IsBreathable"/>). Uniform-cost search over the
        /// same walkability/neighbour rule as <see cref="FindPath"/> — the first popped breathable
        /// tile is the closest by step count, so ties resolve deterministically by the heap's fixed
        /// insertion order. Returns false when no breathable tile is reachable (a doomed pocket).
        /// Used by <see cref="SafetySystem"/> so a crew member in lethal air flees toward safety
        /// through exactly the tiles it could walk to work. No RNG, no allocation once warm.</summary>
        public bool FindNearestBreathable(Simulation sim, Int3 start, SimDefs.NeedsDefs needs, List<Int3> outPath)
        {
            outPath.Clear();
            _sim = sim;
            _world = sim.World;
            if (!_world.InBounds(start)) return false;

            EnsureCapacity(_world.Width * _world.Height * _world.Depth);
            _version++;
            _heapCount = 0;

            int startIdx = Pack(start);
            Visit(startIdx);
            _gScore[startIdx] = 0;
            _cameFrom[startIdx] = -1;
            HeapPush(startIdx, 0f); // uniform cost: f == gScore (no heuristic, no fixed goal)

            Span<Int3> neighbors = stackalloc Int3[6];
            while (_heapCount > 0)
            {
                int current = HeapPop();
                var cp = Unpack(current);
                // The start tile is (by definition) unbreathable when we are called; only a tile we
                // can actually stand and breathe in ends the search.
                if (current != startIdx && AtmosphereSafety.IsBreathable(sim.Rooms.RoomAt(_world, cp), needs))
                {
                    Reconstruct(current, outPath);
                    return true;
                }

                int count = GetNeighbors(cp, neighbors);
                for (int i = 0; i < count; i++)
                {
                    var n = neighbors[i];
                    if (!_world.InBounds(n) || !IsWalkable(n)) continue;
                    int ni = Pack(n);
                    float tentative = _gScore[current] + 1f;
                    if (_visitVersion[ni] == _version && tentative >= _gScore[ni]) continue;
                    Visit(ni);
                    _gScore[ni] = tentative;
                    _cameFrom[ni] = current;
                    HeapPush(ni, tentative);
                }
            }
            return false;
        }

        /// <summary>Pick a random reachable walkable tile (best effort, up to 10 samples).</summary>
        public bool TryRandomWalkableTile(Simulation sim, SimRng rng, out Int3 result)
        {
            var world = sim.World;
            _sim = sim;
            _world = world;
            for (int attempt = 0; attempt < 10; attempt++)
            {
                var p = new Int3(rng.NextInt(world.Width), rng.NextInt(world.Height), rng.NextInt(world.Depth));
                if (IsWalkable(p)) { result = p; return true; }
            }
            result = default;
            return false;
        }

        /// <summary>Pick a random reachable walkable tile within a Chebyshev radius of
        /// <paramref name="origin"/> (best effort, up to 10 samples). The radius bounds an idle
        /// citizen's wander LOCALLY (E0-1, <c>CitizenDefs.WanderRadiusTiles</c>).
        ///
        /// Chebyshev (a clamped box) rather than Manhattan: a box sample needs no per-draw
        /// distance rejection — every draw is in range by construction — so the draw count per
        /// attempt stays a fixed 3 (as in <see cref="TryRandomWalkableTile"/>) and the method is
        /// bounded and zero-alloc. Manhattan would either reject out-of-range draws (variable draw
        /// count, RNG-stream-fragile) or need a triangular remap; the corners a box admits and a
        /// diamond would not are harmless for local dispersal. A <paramref name="radius"/> ≥ the
        /// ship's X/Y extent saturates the box to the whole DECK — never more; see the Z rule below.
        ///
        /// ⚠️ <b>Z IS NOT BOUNDED BY THE RADIUS — it is pinned to <c>origin.Z</c>.</b> The draw is
        /// two-dimensional: an idle wander never changes deck. This is a RULE, not a tunable, which
        /// is why it is a literal and not a def field — idle crew do not climb ladders for nothing.
        /// Before 2026-07-25 Z was boxed by <paramref name="radius"/> like X and Y, and because the
        /// default <c>wander_radius_tiles</c> (8) is ≥ the grid ship's depth (8) the box saturated
        /// every deck: ONE idle draw could land a crew member on any of the six decks that boot
        /// airless but walkable from the ladder trunk. Measured on the grid ship over one sim-day
        /// with that box and <c>AutoWander=true</c>: survivable (8/8 alive) but <b>4.46 % of all
        /// crew-ticks went to <c>JobKind.Flee</c></b> — crew walking out of vacuum for nothing.
        /// With Z pinned that is <b>0.00 %</b>, and productive work is unchanged (24.990 %).
        /// The X/Y box is deliberately untouched: local dispersal, the fixed 3-draw shape and the
        /// corner behaviour above are all unchanged. Deliberate consequence: the sampler can no
        /// longer reproduce <see cref="TryRandomWalkableTile"/>'s global wander at any radius.
        /// Pinned by <c>DeckConfinedWanderTests</c> (driven against the real grid ship, with a
        /// non-vacuity control that replays the old Z box and shows it did leave the deck).</summary>
        public bool TryRandomWalkableTileNear(Simulation sim, SimRng rng, Int3 origin, int radius, out Int3 result)
        {
            var world = sim.World;
            _sim = sim;
            _world = world;

            int xLo = origin.X - radius; if (xLo < 0) xLo = 0;
            int xHi = origin.X + radius; if (xHi >= world.Width)  xHi = world.Width  - 1;
            int yLo = origin.Y - radius; if (yLo < 0) yLo = 0;
            int yHi = origin.Y + radius; if (yHi >= world.Height) yHi = world.Height - 1;
            // Z is NOT boxed by the radius: an idle wander stays on the origin's own deck.
            int zLo = origin.Z, zHi = origin.Z;

            for (int attempt = 0; attempt < 10; attempt++)
            {
                // ⚠️ THE THIRD DRAW IS NOW ALWAYS NextInt(1) == 0, AND IT MUST STAY. It looks like
                // dead code and it is not: this method's contract is a FIXED THREE DRAWS PER ATTEMPT
                // (see the doc comment), and the RNG here is the shared sim stream. Deleting the Z
                // draw would re-shape that stream, shifting every subsequent consumer's values and
                // moving the slice tick-3000 golden — and the ONLY thing that catches it is that
                // golden, as a bare hash mismatch indistinguishable from an unrelated draw-order
                // change. Keep the draw; the deck confinement lives in zLo/zHi above.
                var p = new Int3(xLo + rng.NextInt(xHi - xLo + 1),
                                 yLo + rng.NextInt(yHi - yLo + 1),
                                 zLo + rng.NextInt(zHi - zLo + 1));
                if (IsWalkable(p)) { result = p; return true; }
            }
            result = default;
            return false;
        }

        private bool IsWalkable(Int3 p) => _sim.IsWalkable(p); // single shared rule

        private int GetNeighbors(Int3 p, Span<Int3> buffer)
        {
            int n = 0;
            buffer[n++] = new Int3(p.X + 1, p.Y, p.Z);
            buffer[n++] = new Int3(p.X - 1, p.Y, p.Z);
            buffer[n++] = new Int3(p.X, p.Y + 1, p.Z);
            buffer[n++] = new Int3(p.X, p.Y - 1, p.Z);
            // Ladder at this tile links up; ladder on the tile below links down.
            if (_sim.TryGetDeviceAt(p, out var here) && here.Kind == DeviceKind.Ladder && p.Z + 1 < _world.Depth)
                buffer[n++] = new Int3(p.X, p.Y, p.Z + 1);
            if (p.Z > 0 && _sim.TryGetDeviceAt(new Int3(p.X, p.Y, p.Z - 1), out var below) && below.Kind == DeviceKind.Ladder)
                buffer[n++] = new Int3(p.X, p.Y, p.Z - 1);
            return n;
        }

        private static float Heuristic(Int3 a, Int3 b) =>
            Math.Abs(a.X - b.X) + Math.Abs(a.Y - b.Y) + Math.Abs(a.Z - b.Z) * 2;

        private void Reconstruct(int goalIdx, List<Int3> outPath)
        {
            int cur = goalIdx;
            while (cur != -1 && _cameFrom[cur] != -1)
            {
                outPath.Add(Unpack(cur));
                cur = _cameFrom[cur];
            }
            outPath.Reverse();
        }

        private int Pack(Int3 p) => (p.Z * _world.Height + p.Y) * _world.Width + p.X;

        private Int3 Unpack(int idx)
        {
            int x = idx % _world.Width;
            int rest = idx / _world.Width;
            int y = rest % _world.Height;
            int z = rest / _world.Height;
            return new Int3(x, y, z);
        }

        private void Visit(int idx) => _visitVersion[idx] = _version;

        private void EnsureCapacity(int capacity)
        {
            if (capacity <= _capacity) return;
            _capacity = capacity;
            _cameFrom = new int[capacity];
            _gScore = new float[capacity];
            _visitVersion = new int[capacity];
            _heapIndices = new int[capacity];
            _heapCosts = new float[capacity];
            _version = 0;
        }

        private void HeapPush(int index, float cost)
        {
            int i = _heapCount++;
            _heapIndices[i] = index;
            _heapCosts[i] = cost;
            while (i > 0)
            {
                int parent = (i - 1) / 2;
                if (_heapCosts[parent] <= _heapCosts[i]) break;
                Swap(i, parent);
                i = parent;
            }
        }

        private int HeapPop()
        {
            int result = _heapIndices[0];
            _heapCount--;
            _heapIndices[0] = _heapIndices[_heapCount];
            _heapCosts[0] = _heapCosts[_heapCount];
            int i = 0;
            while (true)
            {
                int left = i * 2 + 1, right = left + 1, smallest = i;
                if (left < _heapCount && _heapCosts[left] < _heapCosts[smallest]) smallest = left;
                if (right < _heapCount && _heapCosts[right] < _heapCosts[smallest]) smallest = right;
                if (smallest == i) break;
                Swap(i, smallest);
                i = smallest;
            }
            return result;
        }

        private void Swap(int a, int b)
        {
            (_heapIndices[a], _heapIndices[b]) = (_heapIndices[b], _heapIndices[a]);
            (_heapCosts[a], _heapCosts[b]) = (_heapCosts[b], _heapCosts[a]);
        }
    }
}
