using System;
using System.Collections.Generic;

namespace Moonbase.Sim
{
    /// <summary>
    /// M3 water vertical (GDD §4.4): fluid networks + reclaimer refill at 2 Hz.
    /// A network is a connected component of Pipe tiles; any device on or 4-adjacent
    /// to a component's pipe belongs to it (exactly mirroring PowerSystem's conduit
    /// rule, including deterministic store-order flood). Reclaimers top up the
    /// least-full tank on their network; consumers (grow beds, later crafting) draw
    /// via <see cref="TryDrawWater"/>. Citizens drink at a specific tank in person
    /// (SustenanceSystem) — that path does not go through network membership.
    /// </summary>
    public sealed class WaterSystem : ISimSystem
    {
        public string Name => "Water";
        public int IntervalTicks => 5; // 2 Hz (TDD)

        private const float Dt = 0.5f; // seconds per water tick (structural, interval-paired)

        // TankCapacityLiters / ReclaimerLitersPerSecond / ReclaimEfficiency now live in
        // sim.Defs.Water (SimDefs.Default reproduces the former consts: 500, 0.05, 0.93).
        // ShipMetrics and Sim.Glyph's water-fill band read sim.Defs.Water.TankCapacityLiters
        // directly (B4), so parallel sims with different defs never cross-talk.

        /// <summary>Slack for float accumulation when checking network availability.</summary>
        private const float DrawEpsilon = 1e-4f;

        // Rebuild condition: the device count changed since the last rebuild.
        // Devices never mutate Pos, and every add/remove goes through
        // Simulation.AddDevice/RemoveDevice, so a count change is a sufficient dirty
        // proxy. (PowerDirty belongs to PowerSystem — consuming it here would couple
        // correctness to system registration order.) Known v0 limitation: a
        // remove + add pair landing between two water ticks leaves the count
        // unchanged and the fluid topology stale until the count next changes.
        private int _lastTopologyVersion = -1;

        private readonly Dictionary<Int3, ushort> _pipeNetwork = new Dictionary<Int3, ushort>();
        private readonly Dictionary<Int3, byte> _overlayAt = new Dictionary<Int3, byte>(); // lookup only
        private readonly Queue<Int3> _floodQueue = new Queue<Int3>(64);
        private ushort _networkCount;

        public void Tick(Simulation sim)
        {
            if (sim.DeviceTopologyVersion != _lastTopologyVersion)
            {
                _lastTopologyVersion = sim.DeviceTopologyVersion;
                RebuildNetworks(sim);
            }
            RunReclaimers(sim);
        }

        private void RebuildNetworks(Simulation sim)
        {
            _pipeNetwork.Clear();
            _networkCount = 0;

            var devices = sim.Devices.Items;
            // Overlay utilities are NOT in the tile grid (they share tiles with
            // machines) — index their positions first, then flood over that index.
            _overlayAt.Clear();
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.Pipe) _overlayAt[devices[i].Pos] = 0;

            // Flood pipe components in deterministic store order.
            for (int i = 0; i < devices.Count; i++)
            {
                var device = devices[i];
                if (device.Kind != DeviceKind.Pipe || _pipeNetwork.ContainsKey(device.Pos)) continue;

                ushort id = ++_networkCount;
                _floodQueue.Clear();
                _floodQueue.Enqueue(device.Pos);
                _pipeNetwork[device.Pos] = id;
                while (_floodQueue.Count > 0)
                {
                    var p = _floodQueue.Dequeue();
                    for (int n = 0; n < 6; n++) // 4 lateral + vertical risers (deck-to-deck trays)
                    {
                        var q = n < 4 ? Int3.Neighbor4(p, n)
                                      : new Int3(p.X, p.Y, p.Z + (n == 4 ? 1 : -1));
                        if (_pipeNetwork.ContainsKey(q)) continue;
                        if (_overlayAt.ContainsKey(q))
                        {
                            _pipeNetwork[q] = id;
                            _floodQueue.Enqueue(q);
                        }
                    }
                }
            }

            // Attach every device to the network of a pipe on/adjacent to its tile.
            for (int i = 0; i < devices.Count; i++)
            {
                var device = devices[i];
                if (device.Kind == DeviceKind.Pipe)
                {
                    device.FluidNetworkId = _pipeNetwork[device.Pos];
                    continue;
                }
                device.FluidNetworkId = 0;
                if (_pipeNetwork.TryGetValue(device.Pos, out ushort onTile)) { device.FluidNetworkId = onTile; continue; }
                for (int n = 0; n < 6; n++)
                {
                    if (_pipeNetwork.TryGetValue((n < 4 ? Int3.Neighbor4(device.Pos, n) : new Int3(device.Pos.X, device.Pos.Y, device.Pos.Z + (n == 4 ? 1 : -1))), out ushort adj))
                    {
                        device.FluidNetworkId = adj;
                        break;
                    }
                }
            }
        }

        /// <summary>
        /// Each powered reclaimer adds recovered water to the least-full tank on its
        /// network (strict '&lt;' keeps the first tank in store order on ties), capped
        /// at tank capacity. v0 recovers from an abstract wastewater pool; the 93%
        /// loop with per-citizen use arrives with the melter/ice chain (GDD §4.4 v1+).
        /// </summary>
        private static void RunReclaimers(Simulation sim)
        {
            var water = sim.Defs.Water;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var reclaimer = devices[i];
                if (reclaimer.Kind != DeviceKind.Reclaimer || !reclaimer.Powered || !reclaimer.IsOperational(sim.Defs) ||
                    reclaimer.FluidNetworkId == 0)
                    continue;

                Device target = null;
                for (int j = 0; j < devices.Count; j++)
                {
                    var tank = devices[j];
                    if (tank.Kind != DeviceKind.WaterTank ||
                        tank.FluidNetworkId != reclaimer.FluidNetworkId)
                        continue;
                    if (target == null || tank.StoredLiters < target.StoredLiters) target = tank;
                }
                if (target == null) continue;

                // Conservation: reclaimed water comes from the greywater pool (drinking,
                // transpiration condensate) at ReclaimEfficiency — never from nothing.
                float capacityRoom = water.TankCapacityLiters - target.StoredLiters;
                float wantOut = Math.Min(water.ReclaimerLitersPerSecond * Dt * reclaimer.EffectiveRate, capacityRoom);
                float drawIn = Math.Min(wantOut / water.ReclaimEfficiency, sim.WastewaterLiters);
                if (drawIn <= 0f) continue;
                sim.WastewaterLiters -= drawIn;
                target.StoredLiters += drawIn * water.ReclaimEfficiency; // the ~7% is lost (GDD 93% closure)
            }
        }

        /// <summary>
        /// Draw <paramref name="liters"/> from the tanks of a fluid network, in device
        /// store order (partial draws across tanks). All-or-nothing: if the network
        /// cannot cover the full amount, nothing is drawn and false is returned.
        /// </summary>
        public static bool TryDrawWater(Simulation sim, ushort fluidNetworkId, float liters)
        {
            if (fluidNetworkId == 0) return false;
            if (liters <= 0f) return true;

            var devices = sim.Devices.Items;
            float available = 0f;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind == DeviceKind.WaterTank && d.FluidNetworkId == fluidNetworkId)
                    available += d.StoredLiters;
            }
            if (available + DrawEpsilon < liters) return false;

            float remaining = liters;
            for (int i = 0; i < devices.Count && remaining > 0f; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.WaterTank || d.FluidNetworkId != fluidNetworkId) continue;
                float take = remaining < d.StoredLiters ? remaining : d.StoredLiters;
                d.StoredLiters -= take;
                remaining -= take;
            }
            return true;
        }
    }
}
