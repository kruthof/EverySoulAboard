using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// M3 water vertical (GDD §4.4): fluid networks + reclaimer refill at 2 Hz.
    /// A network is a connected component of Pipe tiles; any device on or 4-adjacent
    /// to a component's pipe belongs to it (exactly mirroring PowerSystem's conduit
    /// rule, including deterministic store-order flood). Reclaimers top up the
    /// least-full tank on their network; consumers (grow beds, later crafting) draw
    /// via <see cref="TryDrawWater"/>. Citizens drink at a specific tank in person
    /// (SustenanceSystem) — that path does not go through network membership.
    ///
    /// Units are LITRES throughout (tank contents, reclaimer output, the greywater
    /// pool); the only rate is `reclaimer_liters_per_second`. Tuning lives in
    /// `content/core/SimDefs/water.def` [water]: `tank_capacity_liters` (500 L, the cap
    /// this system enforces and the denominator the HUD and the water lens use),
    /// `reclaimer_liters_per_second`, `reclaim_efficiency` (0.93 — the ISS-class closure
    /// figure). The reclaimer's electrical draw and tier come from `machines.def`
    /// (Reclaimer: LifeSupport tier). <see cref="Dt"/> and <see cref="DrawEpsilon"/> are
    /// structural.
    ///
    /// Conservation: unlike air, water is *nearly* conserved. The reclaimer moves litres
    /// out of <see cref="Simulation.WastewaterLiters"/> (a single abstract shipwide
    /// greywater pool, saved and hashed) into a tank, losing the inefficiency; the pool is
    /// filled by drinking (SustenanceSystem), grow-bed transpiration (HydroponicsSystem)
    /// and a starting buffer authored on the slice. The ONE runtime source is
    /// <see cref="RunMakeup"/> — a self-throttling floor that tops the pool up only when it
    /// would otherwise fall below <c>MakeupFloorLiters</c>, replacing exactly the water the
    /// lossy loop destroys and nothing more (B-2 fix; see that method). Before it, a ship
    /// whose pool ran dry had reclaimers that spun and produced nothing, stalling every
    /// grow bed on the network forever.
    ///
    /// What it mutates: <see cref="Device.FluidNetworkId"/> and
    /// <see cref="Device.StoredLiters"/> (both DEVC v2, saved and hashed by Simulation)
    /// plus the greywater pool. NOT an <see cref="IStatefulSystem"/> — the pipe map is
    /// derived and rebuilt from saved device positions.
    ///
    /// Ordering: HydroponicsSystem is registered after this one (an explicit SystemStack
    /// rule) so fluid networks and tank levels are current before the first grow-bed
    /// draw. SustenanceSystem's drinking does not depend on that ordering — it consumes
    /// a named tank device, not a network.
    ///
    /// Determinism/allocation: device store order everywhere (network ids by
    /// first-encounter, tank selection by strict '&lt;' so ties keep the earlier tank),
    /// no RNG; dictionaries and the flood queue are cleared rather than reallocated, so
    /// a settled ship allocates nothing per pass.
    /// </summary>
    public sealed class WaterSystem : ISimSystem
    {
        public string Name => "Water";
        public int IntervalTicks => 5; // 2 Hz (TDD)

        /// <summary>Seconds per pass; structural, paired with <see cref="IntervalTicks"/>
        /// at the 10 Hz base rate (5 ticks = 0.5 s).</summary>
        private const float Dt = 0.5f;

        // TankCapacityLiters / ReclaimerLitersPerSecond / ReclaimEfficiency now live in
        // sim.Defs.Water (SimDefs.Default reproduces the former consts: 500, 0.05, 0.93).
        // ShipMetrics and Sim.Glyph's water-fill band read sim.Defs.Water.TankCapacityLiters
        // directly (B4), so parallel sims with different defs never cross-talk.

        /// <summary>Slack for float accumulation when checking network availability.
        /// Without it a tank summing to 0.019999 L refuses a 0.02 L draw forever and a
        /// grow bed stalls on rounding. The cost: a draw can be reported satisfied while
        /// up to this much less was actually removed (tanks clamp at 0, they never go
        /// negative), so at most 0.1 mL per call is conjured. Harmless at these scales.</summary>
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
            RunMakeup(sim);      // floor the pool BEFORE reclaimers read it, same pass
            RunReclaimers(sim);
        }

        /// <summary>
        /// Self-throttling makeup source (B-2 fix). The shipped loop is lossy by design —
        /// irrigation destroys ~0.256 L per litre cycled (0.8 transpiration recapture ×
        /// 0.93 reclaim), drinking loses the reclaimer's 7% — so with no runtime source the
        /// greywater pool is strictly monotone-decreasing and the self-contained hydro bay
        /// (its own tank + reclaimer on one fluid network) drank the shared pool dry ~day 1.2,
        /// after which <see cref="RunReclaimers"/> found nothing to cycle and every grow bed
        /// stalled forever while the food HUD still read full.
        ///
        /// The floor tops the pool up to <c>MakeupFloorLiters</c> ONLY when it would otherwise
        /// fall below it, and conjures NOTHING when the loop is healthy or tanks are capped
        /// (a healthy loop keeps the pool above the floor on its own). So the amount created
        /// self-limits to exactly the ~0.0154 L/s the loop destroys — the greywater number
        /// can never inflate without bound, unlike a constant drip. It injects into the pool,
        /// not a tank, so recaptured transpiration still routes through <c>reclaimer_hydro</c>.
        ///
        /// Conservation note: this is the ONE place water is created at runtime (air is not
        /// conserved; water otherwise is). It is deliberate and bounded — read it as an
        /// abstract shipwide condensate/ice makeup, the litres a real closed loop tops up.
        /// </summary>
        private static void RunMakeup(Simulation sim)
        {
            var water = sim.Defs.Water;
            if (sim.WastewaterLiters < water.MakeupFloorLiters)
                sim.WastewaterLiters = water.MakeupFloorLiters;
        }

        /// <summary>
        /// Re-derive fluid network ids from scratch, mirroring <c>PowerSystem</c>'s
        /// conduit flood exactly (overlay position index, 6-way flood including vertical
        /// risers, then per-device attachment on-tile-then-+x,-x,+y,-y,+z,-z). Ids are
        /// not stable across rebuilds, so nothing may cache a
        /// <see cref="Device.FluidNetworkId"/> across a topology change.
        /// </summary>
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
                // Read the three lines below as: want this much OUT (rate × pass ×
                // condition, capped by tank headroom), so pull this much IN (grossed up
                // by the efficiency, capped by what the pool holds) — then deliver the
                // efficiency-scaled result. A nearly-empty pool therefore throttles the
                // reclaimer smoothly instead of stopping it dead.
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
        ///
        /// Static and sim-argument-taking on purpose: consumers (HydroponicsSystem
        /// today) call it directly rather than holding a WaterSystem reference, so
        /// nothing depends on finding this system in the stack. Two passes over the
        /// device store — availability, then withdrawal — so a failed draw leaves every
        /// tank untouched and a caller can safely retry next pass. A zero/negative
        /// request succeeds trivially; network 0 (unplumbed) always fails.
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
