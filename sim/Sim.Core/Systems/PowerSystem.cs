using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// Power networks + priority-tier brownouts (TDD §3.7), balanced at 1 Hz. Two
    /// separable jobs:
    ///
    /// TOPOLOGY (<see cref="RebuildNetworks"/>, only when <see cref="Simulation.PowerDirty"/>):
    /// a network is a connected component of Conduit DEVICES — conduits are overlay
    /// utilities that share a tile with whatever else stands there, so they are not in
    /// the tile grid and the flood runs over a position index built fresh each rebuild.
    /// Connectivity is 6-way: the four lateral neighbours plus straight up and down, so
    /// a conduit stack acts as a deck-to-deck riser. Every other device then claims the
    /// network of a conduit on its own tile, or failing that the first conduit found in
    /// +x,-x,+y,-y,+z,-z order — so a device touching two networks joins exactly one,
    /// deterministically, and never bridges them.
    ///
    /// BALANCE (every pass): sum generation and stored energy per network, sum demand
    /// per tier, then serve tiers strictly highest-first. Units are kW throughout for
    /// power and kWh for storage; both come from `content/core/SimDefs/machines.def`
    /// (the `gen`, `draw` and `tier` columns), read through sim.Defs.Machines. Battery
    /// capacity is the compiled <see cref="Device.BatteryCapacityKWh"/> (40 kWh), NOT a
    /// def field. Shed order is <see cref="PowerTier"/>: Comfort sheds first,
    /// LifeSupport last, and shedding is contagious downward — once any tier is unmet
    /// every lower tier is cut too, so a surplus never trickles past a browned-out tier
    /// to light the lamps while the scrubbers are dark.
    ///
    /// What it mutates: only <see cref="Device.NetworkId"/>, <see cref="Device.Powered"/>
    /// and <see cref="Device.StoredKWh"/> — all three saved in the DEVC chapter and
    /// folded into <see cref="Simulation.StateHash"/> by Simulation. Everything else
    /// here is scratch. Powered is the flag half the ship reads: AtmosphereSystem's
    /// vents and scrubbers, HydroponicsSystem's beds, WaterSystem's reclaimers,
    /// ThermalSystem's radiators and NavSystem's telescopes all gate on it. This system
    /// therefore sits second in the stack, and NavSystem is registered immediately
    /// after it so telescope Powered flags are fresh within the tick (SystemStack).
    ///
    /// NOT <see cref="IStatefulSystem"/>: the network map and the brownout memory are
    /// derived, not canonical, and are rebuilt from the (saved) device positions. One
    /// consequence worth knowing — <see cref="_wasBrownout"/> starts false on load, so
    /// a save taken mid-brownout re-publishes <see cref="BrownoutChangedEvent"/> after
    /// the restore. That is a duplicate notification, not a state divergence; nothing
    /// hashed moves.
    ///
    /// Determinism/allocation: the device store is walked in order everywhere, ids are
    /// handed out by first-encounter in that same order, no RNG. All scratch is
    /// grow-once (<see cref="EnsureScratch"/>) and the dictionaries/queue are cleared
    /// rather than reallocated, so a steady ship allocates nothing per pass.
    /// </summary>
    public sealed class PowerSystem : ISimSystem
    {
        public string Name => "Power";
        public int IntervalTicks => 10; // 1 Hz

        /// <summary>Seconds per balance pass; structural, paired with
        /// <see cref="IntervalTicks"/>. Only used to convert a kW deficit into the kWh
        /// drawn from batteries.</summary>
        private const float BalanceDt = 1f;

        // Conduit tile -> network id, and the conduit position index the flood runs
        // over. Both are cleared (never reallocated) on rebuild.
        private readonly Dictionary<Int3, ushort> _conduitNetwork = new Dictionary<Int3, ushort>();
        private readonly Dictionary<Int3, byte> _overlayAt = new Dictionary<Int3, byte>(); // lookup only
        private readonly Queue<Int3> _floodQueue = new Queue<Int3>(64);
        private ushort _networkCount;

        // Per-network scratch, reused (index = network id, 0 unused).
        private readonly List<float> _generation = new List<float>();   // kW produced
        private readonly List<float> _batteryCharge = new List<float>();// kWh stored
        private readonly List<float> _demandByTier = new List<float>(); // kW; networkId * 4 + tier
        private readonly List<bool> _wasBrownout = new List<bool>();    // edge detection for the event

        /// <summary>
        /// The kW this system tallied for <paramref name="networkId"/> on its last balance pass —
        /// the figure the tier walk was actually decided against, condition-scaling included.
        /// <para>⚠️ IT EXISTS SO A TEST CAN PIN THE LEDGER AT THE SEAM. A test that re-sums
        /// <c>machines.def</c> itself is a SECOND implementation of this loop: it agrees with
        /// whatever it was written against and cannot see a change made here — a constant factor
        /// slipped into the line below would leave every such assertion green (CLAUDE.md trap 4,
        /// and the seventh shape: a ratio suite cannot see a scale error). Pinned by
        /// <c>GenerationWearTests</c>.</para>
        /// Read-only view of grow-once scratch: no allocation, nothing saved, nothing hashed.
        /// Reads 0 for a network id that has never existed.
        /// </summary>
        public float LastGenerationKW(ushort networkId) =>
            networkId < _generation.Count ? _generation[networkId] : 0f;

        /// <summary>The kW of demand this system booked for one network and tier on its last
        /// balance pass — the other half of the same ledger, published for the same reason
        /// (see <see cref="LastGenerationKW"/>). It is the FLAT machines.def <c>draw</c> by
        /// design: a worn machine pays full price for reduced output (M2-12, constraint 8c),
        /// and that asymmetry is only pinnable if both sides can be read.</summary>
        public float LastDemandKW(ushort networkId, PowerTier tier) =>
            (networkId * 4 + (int)tier) < _demandByTier.Count ? _demandByTier[networkId * 4 + (int)tier] : 0f;

        /// <summary>Topology on demand, balance always — a ship whose devices never move
        /// pays only the balance pass.</summary>
        public void Tick(Simulation sim)
        {
            if (sim.PowerDirty)
            {
                sim.PowerDirty = false;
                RebuildNetworks(sim);
            }
            Balance(sim);
        }

        /// <summary>
        /// Re-derive every network id from scratch. Ids are NOT stable across rebuilds —
        /// adding one conduit can renumber the whole ship — so nothing may cache a
        /// network id across a topology change, and the brownout memory is reset below.
        /// </summary>
        private void RebuildNetworks(Simulation sim)
        {
            _conduitNetwork.Clear();
            _networkCount = 0;
            // Network ids are reassigned from scratch — stale brownout memory keyed by
            // old ids would suppress (or fake) transition events on the new topology.
            for (int i = 0; i < _wasBrownout.Count; i++) _wasBrownout[i] = false;

            var devices = sim.Devices.Items;
            // Overlay utilities are NOT in the tile grid (they share tiles with
            // machines) — index their positions first, then flood over that index.
            _overlayAt.Clear();
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.Conduit) _overlayAt[devices[i].Pos] = 0;

            // Flood conduit components in deterministic store order.
            for (int i = 0; i < devices.Count; i++)
            {
                var device = devices[i];
                if (device.Kind != DeviceKind.Conduit || _conduitNetwork.ContainsKey(device.Pos)) continue;

                ushort id = ++_networkCount;
                _floodQueue.Clear();
                _floodQueue.Enqueue(device.Pos);
                _conduitNetwork[device.Pos] = id;
                while (_floodQueue.Count > 0)
                {
                    var p = _floodQueue.Dequeue();
                    for (int n = 0; n < 6; n++) // 4 lateral + vertical risers (deck-to-deck trays)
                    {
                        var q = n < 4 ? Int3.Neighbor4(p, n)
                                      : new Int3(p.X, p.Y, p.Z + (n == 4 ? 1 : -1));
                        if (_conduitNetwork.ContainsKey(q)) continue;
                        if (_overlayAt.ContainsKey(q))
                        {
                            _conduitNetwork[q] = id;
                            _floodQueue.Enqueue(q);
                        }
                    }
                }
            }

            // Attach every device to the network of a conduit on/adjacent to its tile.
            // 0 means "not on any network" — such a device draws nothing, generates
            // nothing and (with one exception, see the Powered sweep) reads unpowered.
            for (int i = 0; i < devices.Count; i++)
            {
                var device = devices[i];
                if (device.Kind == DeviceKind.Conduit)
                {
                    device.NetworkId = _conduitNetwork[device.Pos];
                    continue;
                }
                device.NetworkId = 0;
                if (_conduitNetwork.TryGetValue(device.Pos, out ushort onTile)) { device.NetworkId = onTile; continue; }
                for (int n = 0; n < 6; n++)
                {
                    if (_conduitNetwork.TryGetValue((n < 4 ? Int3.Neighbor4(device.Pos, n) : new Int3(device.Pos.X, device.Pos.Y, device.Pos.Z + (n == 4 ? 1 : -1))), out ushort adj))
                    {
                        device.NetworkId = adj;
                        break;
                    }
                }
            }
        }

        /// <summary>
        /// One second of supply-vs-demand per network: tally, decide which tiers are
        /// served, settle the batteries, then stamp <see cref="Device.Powered"/>.
        /// Runs even when the topology did not change, because charge and demand do.
        /// </summary>
        private void Balance(Simulation sim)
        {
            EnsureScratch(_networkCount + 1);
            for (int i = 0; i <= _networkCount; i++)
            {
                _generation[i] = 0f;
                _batteryCharge[i] = 0f;
            }
            for (int i = 0; i < (_networkCount + 1) * 4; i++) _demandByTier[i] = 0f;

            var devices = sim.Devices.Items;
            var machines = sim.Defs.Machines;

            // Sum generation, battery reserve, and demand per tier. THE TWO SIDES ARE
            // DELIBERATELY ASYMMETRIC (M2-12):
            //
            // GENERATION IS CONDITION-SCALED. A generator's output IS power, so the
            // power ledger is the only place its wear can be expressed — every other
            // EffectiveRate consumer (scrubber, vent, radiator, reclaimer) is a device
            // that spends power in order to do something else, and a SolarWing has no
            // such downstream system. So `gen` rides <see cref="Device.EffectiveRate"/>
            // exactly as those do: a wing at Condition 0.06 supplies 0.53 of its
            // machines.def kW, one at 1.00 supplies all of it, and repairing a wing
            // steps the ship's generation. (Before M2-12 this line was the flat `gen`
            // and this comment said "a wrecked SolarWing still supplies its full kW" —
            // it did, which is why repairing one changed nothing a player could see.)
            //
            // NO IsOperational GATE, AND THAT IS A RULING, NOT AN OVERSIGHT (M2-12,
            // constraint 8b). EffectiveRate's floor is 0.5 at Condition 0, so a wrecked
            // wing keeps contributing a HALF share and repair is a gradient the player
            // can climb one job at a time. Gating on IsOperational instead would drop a
            // wing below its machines.def `fail` to exactly zero — a cliff, and on the
            // wreck it takes boot generation from 10.65 kW to 7.47 kW with `wing_c`
            // (0.06) worth literally nothing.
            //
            // DEMAND STAYS FLAT (constraint 8c): a worn scrubber pays full price for
            // reduced output. Scaling `draw` too would reward a wrecked ship with a
            // smaller bill.
            //
            // ⚠️ ONE CONSEQUENCE WORTH KNOWING: EffectiveRate carries Device.Rate, and
            // Rate is a PLAYER/MOSS lever (SetDeviceCommand clamps it to 0..1,
            // Commands.cs:47). So throttling a SolarWing to Rate = 0 now zeroes its
            // output, where before it was inert on a generator. That is the same
            // semantics every other EffectiveRate consumer already has, and it is a
            // capability, not a leak — but it is new, and nothing else in the sim
            // writes Rate.
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.NetworkId == 0) continue; // off-grid: contributes nothing either way
                var def = machines[(int)d.Kind];
                _generation[d.NetworkId] += def.GenerationKW * d.EffectiveRate;
                if (d.Kind == DeviceKind.Battery) _batteryCharge[d.NetworkId] += d.StoredKWh;
                float draw = def.DrawKW;
                if (draw > 0f && IsWanting(d)) _demandByTier[d.NetworkId * 4 + (int)def.Tier] += draw;
            }

            // Decide per network which tiers are served (highest tier first).
            for (ushort net = 1; net <= _networkCount; net++)
            {
                // A battery can burst its whole stored energy within one balance second
                // (1 kWh over 1 s = 3600 kW) — i.e. batteries bridge any load until empty.
                float batteryKW = _batteryCharge[net] * 3600f;
                float supply = _generation[net] + batteryKW;

                // Strict priority: once any tier is shed, every lower tier sheds too —
                // leftovers never trickle past a browned-out higher tier (TDD §3.7).
                float served = 0f;
                bool shedAny = false;
                for (int tier = 3; tier >= 0; tier--)
                {
                    float want = _demandByTier[net * 4 + tier];
                    if (want <= 0f) { SetTierServed(net, tier, !shedAny); continue; }
                    if (!shedAny && served + want <= supply + 1e-4f)
                    {
                        served += want;
                        SetTierServed(net, tier, true);
                    }
                    else
                    {
                        shedAny = true;
                        SetTierServed(net, tier, false);
                    }
                }

                // Battery bookkeeping: discharge to cover deficit, else charge from
                // surplus. `served` counts only demand that was actually met, so a shed
                // tier's draw never shows up as a deficit and never drains a battery.
                // Surplus charging is unthrottled — a network's whole spare kW pours in,
                // limited only by BatteryCapacityKWh; there is no charge-rate model.
                float deficit = served - _generation[net];
                float energyDeltaKWh = -deficit * BalanceDt / 3600f; // negative = discharge
                DistributeBatteryDelta(sim, net, energyDeltaKWh);

                if (_wasBrownout[net] != shedAny)
                {
                    _wasBrownout[net] = shedAny;
                    sim.Events.Publish(new BrownoutChangedEvent { NetworkId = net, InBrownout = shedAny });
                }
            }

            // Apply Powered to every device.
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                var def = machines[(int)d.Kind];
                if (def.DrawKW <= 0f)
                {
                    // Passive kit (conduits, pipes, tanks, batteries, all furniture)
                    // simply reports whether it is wired up. SolarWing is the one
                    // hard-coded exception: an unwired wing still reads Powered, even
                    // though the tally above skipped it and its kW reached no network.
                    // So Powered on a SolarWing says nothing about whether it is
                    // contributing — only NetworkId != 0 does.
                    d.Powered = d.NetworkId != 0 || d.Kind == DeviceKind.SolarWing;
                    continue;
                }
                d.Powered = d.NetworkId != 0 && GetTierServed(d.NetworkId, (int)def.Tier);
            }
        }

        /// <summary>
        /// Whether a device books its draw this pass. A closed vent is the only device
        /// that idles: everything else — doors, lights, terminals, fabricators — pays
        /// its full machines.def `draw` continuously, whether or not it is in use.
        /// (Consequence: a browned-out network is browned out around the clock, not
        /// only when the crew is working.)
        /// </summary>
        private static bool IsWanting(Device d) => d.Kind switch
        {
            DeviceKind.AirVent => d.IsOpen,
            _ => true,
        };

        /// <summary>
        /// Spread a charge (positive) or discharge (negative) across a network's
        /// batteries in store order, spilling the remainder into the next battery when
        /// one hits 0 or <see cref="Device.BatteryCapacityKWh"/>. Not balanced across
        /// the bank: the first battery in store order does all the work until it is
        /// full or flat. Any leftover when the loop runs out of batteries is silently
        /// dropped — energy is not conserved at the edges of the bank.
        /// </summary>
        private void DistributeBatteryDelta(Simulation sim, ushort net, float deltaKWh)
        {
            if (deltaKWh == 0f) return;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count && deltaKWh != 0f; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Battery || d.NetworkId != net) continue;
                float updated = d.StoredKWh + deltaKWh;
                if (updated < 0f) { deltaKWh = updated; d.StoredKWh = 0f; }
                else if (updated > Device.BatteryCapacityKWh) { deltaKWh = updated - Device.BatteryCapacityKWh; d.StoredKWh = Device.BatteryCapacityKWh; }
                else { d.StoredKWh = updated; deltaKWh = 0f; }
            }
        }

        // Tier-served bitfield per network, stored in a reused list. One byte per
        // network, bit index = PowerTier value; rewritten every Balance pass, so no
        // clear is needed and nothing carries over between passes.
        private readonly List<byte> _tierServed = new List<byte>();
        private void SetTierServed(ushort net, int tier, bool served)
        {
            if (served) _tierServed[net] |= (byte)(1 << tier);
            else _tierServed[net] &= (byte)~(1 << tier);
        }
        private bool GetTierServed(ushort net, int tier) => (_tierServed[net] & (1 << tier)) != 0;

        /// <summary>Grow-only scratch sizing; index 0 is the reserved "no network" slot —
        /// nothing ever accumulates into it (off-grid devices are skipped) and nothing
        /// reads it (the balance loop starts at 1, and the Powered write short-circuits
        /// on NetworkId != 0). Lists are never shrunk, so a ship that once had many
        /// networks keeps the capacity and later passes stay allocation-free.</summary>
        private void EnsureScratch(int count)
        {
            while (_generation.Count < count) _generation.Add(0f);
            while (_batteryCharge.Count < count) _batteryCharge.Add(0f);
            while (_tierServed.Count < count) _tierServed.Add(0);
            while (_wasBrownout.Count < count) _wasBrownout.Add(false);
            while (_demandByTier.Count < count * 4) _demandByTier.Add(0f);
        }

    }
}
