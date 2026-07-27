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
    /// and a starting buffer authored on the slice.
    ///
    /// There are TWO runtime water sources, and exactly one of them is ever live on a given ship
    /// (E0-7 — this sentence used to say "the ONE runtime source is RunMakeup", which is now false
    /// twice over):
    ///   * <see cref="RunMakeup"/> — B-2's self-throttling floor, which tops the greywater pool up
    ///     only when it would otherwise fall below <c>MakeupFloorLiters</c>. It CREATES water, and
    ///     it is a stand-in: it runs only on a ship with no <see cref="DeviceKind.IceMelter"/>.
    ///     Before it, a ship whose pool ran dry had reclaimers that spun and produced nothing,
    ///     stalling every grow bed on the network forever.
    ///   * <see cref="RunMelters"/> — the real chain. It creates NO water: it moves litres the crew
    ///     already paid for out of a melter's buffer, where they arrived by consuming a unit of
    ///     <see cref="ItemKind.Ice"/> a crew member hauled. On an ice ship the water ledger closes
    ///     against the hold.
    ///
    /// ⚠ OPEN DEFECT, NOT A LIMIT — <see cref="Simulation.WastewaterLiters"/> HAS NO CAP, and on an
    /// ice ship that turns hauled hold cargo into an inert abstract stock. MEASURED on HEAD (slice,
    /// one seed): the pool holds 4,049 L at day 3 and 12,363 L at day 10, a slope of ~1,188 L/day
    /// against a melt rate of ~1,782 L/day — so roughly TWO THIRDS of everything the crew melt is
    /// surplus that the loop never needed. Matter is conserved (every litre is melted ice; nothing
    /// is created), but the hold's runway is therefore a property of what bounds the pool, which is
    /// nothing, and NOT of the ice economy.
    ///
    /// Reclaim-first ordering (see <see cref="RunMelters"/>) is a partial fix and was worth ~a third
    /// of the ice: before it the surplus was ~78 % in steady state. The rest needs the melter's
    /// backpressure to see loop saturation rather than only tank headroom, which is a new def field
    /// and a design decision — and E1's per-crop irrigation retune (ECONOMY.md §10) changes the
    /// whole balance it would be tuned against, so it is deliberately not guessed at here.
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
            RunReclaimers(sim);  // FREE recycled greywater claims tank headroom first...
            RunMelters(sim);     // ...and FINITE hauled ice only fills what is left (see below)
        }

        /// <summary>
        /// E0-7. Drain each melter's meltwater buffer (<see cref="Device.StoredLiters"/>) into the
        /// least-full tank on its fluid network, exactly mirroring <see cref="RunReclaimers"/>'s
        /// selection (device store order, strict '&lt;' so ties keep the earlier tank) — the two
        /// passes are deliberately the same shape so they cannot drift apart.
        ///
        /// A melter is NOT a reclaimer, and the difference is the point: reclaimed water is
        /// recovered greywater and pays <c>ReclaimEfficiency</c>; meltwater is clean and pays
        /// nothing. A melter is also not throttled by a rate — the rate is the crew: how fast they
        /// haul and melt ice is what sets the ship's water income.
        ///
        /// ⚠ ORDERING IS A PRIORITY DECISION, not a plumbing detail, and E0-7 got it wrong once.
        /// This pass runs AFTER <see cref="RunReclaimers"/>, so free recycled greywater claims tank
        /// headroom before finite hauled ice does. The first draft ran melters first ("land
        /// meltwater before the tanks are drawn from"), which reads harmless and is a priority
        /// inversion between a resource the crew carry up a ladder and one the ship gets for
        /// nothing: the melter kept topping tanks the reclaimer would have filled anyway, the
        /// reclaimer then found no headroom, and the displaced greywater piled up in the uncapped
        /// pool. MEASURED on the slice, 3 sim-days, one seed, melter-first vs reclaim-first:
        /// ice consumed 335 → 224 units (−33 %), greywater pool 7 051 → 4 049 L (−43 %), and the
        /// hold's runway at 1 600 units 14.3 → 21.4 sim-days — with end-of-run Potato IDENTICAL at
        /// 696 and both tanks still full. Nothing was traded for it.
        ///
        /// UNPOWERED/BROKEN/UNPLUMBED melters do not drain. A melter with no fluid network keeps
        /// its buffer, fills it, and then (by <see cref="HasMeltHeadroom"/>) stops recruiting
        /// workers — an unplumbed melter wastes labour once and then stands idle rather than
        /// silently boiling the hold away. The stalled buffer is the only symptom; nothing on any
        /// surface says "this melter is not plumbed" (an honest limit, and the same shape as
        /// MECHANICS §13.17's unreachable stockpile).
        ///
        /// Determinism/allocation: device store order, no RNG, no allocation.
        /// </summary>
        private static void RunMelters(Simulation sim)
        {
            var water = sim.Defs.Water;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var melter = devices[i];
                if (melter.Kind != DeviceKind.IceMelter || melter.StoredLiters <= 0f ||
                    !melter.Powered || !melter.IsOperational(sim.Defs) || melter.FluidNetworkId == 0)
                    continue;

                Device target = null;
                for (int j = 0; j < devices.Count; j++)
                {
                    var tank = devices[j];
                    if (tank.Kind != DeviceKind.WaterTank || tank.FluidNetworkId != melter.FluidNetworkId)
                        continue;
                    if (target == null || tank.StoredLiters < target.StoredLiters) target = tank;
                }
                if (target == null) continue;

                float room = water.TankCapacityLiters - target.StoredLiters;
                if (room <= 0f) continue;                       // network full: hold it in the buffer
                float move = melter.StoredLiters < room ? melter.StoredLiters : room;
                melter.StoredLiters -= move;
                target.StoredLiters += move;                    // no efficiency term: meltwater is clean
            }
        }

        /// <summary>
        /// E0-7. Could this melter accept one more batch's worth of meltwater? Read by
        /// <see cref="CraftingSystem"/> before it recruits a worker to a melter, so a ship whose
        /// tanks and buffer are both full stops burning ice instead of boiling it away.
        ///
        /// Deliberately a buffer-only test and NOT a network survey: <see cref="RunMelters"/> runs
        /// at 2 Hz, so the buffer is only still full when the network is full, absent, unpowered or
        /// broken. That keeps the gate O(1) on the 1 Hz crafting pass and keeps it honest at every
        /// one of those four causes at once.
        ///
        /// Returns true for anything that is not a melter, so CraftingSystem's call site is a
        /// no-op for every other station — Fabricator, MachineShop and SalvageRecycler behave
        /// bit-identically to before E0-7.
        /// </summary>
        public static bool HasMeltHeadroom(Simulation sim, Device station, in ProductionBill bill)
        {
            if (station.Kind != DeviceKind.IceMelter) return true;
            int units = IceUnitsIn(bill);
            if (units <= 0) return true;   // a melter whose bill consumes no Ice makes no water
            var water = sim.Defs.Water;
            return station.StoredLiters + water.IceLitersPerUnit * units <= water.MelterBufferLiters;
        }

        /// <summary>
        /// Units of <see cref="ItemKind.Ice"/> one batch of <paramref name="bill"/> consumes. THE
        /// ONE reader of the bill's ice ports, so <see cref="HasMeltHeadroom"/> and
        /// <see cref="OnBatchComplete"/> cannot disagree about what a batch is worth.
        ///
        /// They did disagree in E0-7's first draft: the gate tested ONE unit's yield while the
        /// completion added <c>IceLitersPerUnit × units</c>. The two agreed only because the shipped
        /// bill is <c>Ice:1</c> — and the very doc comment promising that retuning to <c>Ice:4</c>
        /// "scales the yield without touching code" was the thing that made them disagree, because
        /// at <c>Ice:4</c> the gate admits a batch whose 100 L the buffer cannot hold and 75 L of
        /// hauled ice is silently clamped away. Found in review, closed here.
        /// </summary>
        private static int IceUnitsIn(in ProductionBill bill)
        {
            int units = 0;
            for (int i = 0; i < bill.InputPortCount; i++)
            {
                var port = bill.Input(i);
                if (port.Kind == ItemKind.Ice) units += port.Count;
            }
            return units;
        }

        /// <summary>
        /// E0-7. A crafting batch just completed at <paramref name="station"/>: if it is a melter,
        /// turn the units of <see cref="ItemKind.Ice"/> the bill consumed into litres in the
        /// melter's own buffer.
        ///
        /// This lives in WaterSystem and not in CraftingSystem because water is this system's
        /// business, and it is a no-op for every other station kind — the entire cost to the
        /// crafting path is one call whose first line returns.
        ///
        /// The litres are read off the BILL, not off a constant, so retuning `melt_ice` to
        /// <c>Ice:4</c> scales the yield without touching code — and, since review,
        /// <see cref="HasMeltHeadroom"/> scales with it through the same
        /// <see cref="IceUnitsIn"/> reader, so the gate cannot admit a batch the buffer could not
        /// hold. The buffer still clamps at <c>MelterBufferLiters</c>, but only for a batch already
        /// IN FLIGHT when the network fills, and those litres are LOST. That is the one place the
        /// ice chain destroys matter, it is bounded by one batch per melter, and it is deliberate —
        /// the alternative is un-consuming an input, which the crafting system has no concept of.
        /// </summary>
        public static void OnBatchComplete(Simulation sim, Device station, in ProductionBill bill)
        {
            if (station.Kind != DeviceKind.IceMelter) return;
            int units = IceUnitsIn(bill);   // the SAME reader HasMeltHeadroom gates on
            if (units <= 0) return;

            var water = sim.Defs.Water;
            float filled = station.StoredLiters + water.IceLitersPerUnit * units;
            station.StoredLiters = filled < water.MelterBufferLiters ? filled : water.MelterBufferLiters;
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
        /// Conservation note: this WAS the ONE place water is created at runtime (air is not
        /// conserved; water otherwise is). B-2 called it "an abstract shipwide condensate/ice
        /// makeup, the litres a real closed loop tops up", and that phrasing was a promissory
        /// note: the real thing is the melter/ice chain, which E0-7 built.
        ///
        /// ─── THE B-2 DECISION (E0-7) ────────────────────────────────────────────────────────
        /// A ship that owns an <see cref="DeviceKind.IceMelter"/> gets NO makeup at all. The
        /// stand-in and the real chain must never both run: leaving both is a double faucet, in
        /// which the ice chain is decorative because the floor already guarantees the water, and
        /// no measurement of the chain would mean anything. Deleting the floor outright is the
        /// other wrong answer — the grid ship (the one standard play ship), the 2-crew reference
        /// and every procedural ship have no melter and no ice, and B-2 exists because without
        /// makeup their hydro loop dies for good on day 1.2.
        ///
        /// So the rule is per-ship and automatic rather than a global constant: the abstraction
        /// steps aside exactly where the concrete mechanism exists. Note what this makes the
        /// melter — not a bonus, but the assumption of a supply the ship was already living on.
        /// Build one and the ship's water is your crew's problem from that moment.
        ///
        /// The scan is over the device store (deterministic order, no allocation) and is O(devices)
        /// at 2 Hz. It deliberately does NOT test Powered/Operational/plumbed: an unpowered melter
        /// must not silently re-arm the stand-in, or a brownout would quietly refill the tanks and
        /// the player would never learn that the melter is what feeds them.
        ///
        /// A player can NEVER build a melter today (it is not in PlaceDeviceCommand's furniture
        /// whitelist), so this branch is reachable only on a ship that authors one — the slice.
        /// Every other ship's water behaviour is byte-identical to before E0-7.
        /// </summary>
        private static void RunMakeup(Simulation sim)
        {
            var water = sim.Defs.Water;
            if (sim.WastewaterLiters >= water.MakeupFloorLiters) return;
            if (HasIceChain(sim)) return;
            sim.WastewaterLiters = water.MakeupFloorLiters;
        }

        /// <summary>Does this ship own an ice melter at all? (Existence, not readiness — see
        /// <see cref="RunMakeup"/> for why a broken or unpowered melter still counts.)</summary>
        private static bool HasIceChain(Simulation sim)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.IceMelter) return true;
            return false;
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
