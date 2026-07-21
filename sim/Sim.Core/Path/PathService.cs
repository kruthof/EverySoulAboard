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
