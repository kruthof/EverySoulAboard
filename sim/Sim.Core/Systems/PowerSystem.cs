using System.Collections.Generic;

namespace Moonbase.Sim
{
    /// <summary>
    /// Power networks + priority-tier brownouts (TDD §3.7). A network is a connected
    /// component of Conduit tiles; any device on or 4-adjacent to a network's conduit
    /// belongs to it. Balance at 1 Hz: generation vs. demand by tier (LifeSupport last
    /// to shed), batteries bridge deficits. Devices not on any network are unpowered.
    /// </summary>
    public sealed class PowerSystem : ISimSystem
    {
        public string Name => "Power";
        public int IntervalTicks => 10; // 1 Hz

        private const float BalanceDt = 1f; // seconds per balance pass

        private readonly Dictionary<Int3, ushort> _conduitNetwork = new Dictionary<Int3, ushort>();
        private readonly Dictionary<Int3, byte> _overlayAt = new Dictionary<Int3, byte>(); // lookup only
        private readonly Queue<Int3> _floodQueue = new Queue<Int3>(64);
        private ushort _networkCount;

        // Per-network scratch, reused (index = network id, 0 unused).
        private readonly List<float> _generation = new List<float>();
        private readonly List<float> _batteryCharge = new List<float>();
        private readonly List<float> _demandByTier = new List<float>(); // networkId * 4 + tier
        private readonly List<bool> _wasBrownout = new List<bool>();

        public void Tick(Simulation sim)
        {
            if (sim.PowerDirty)
            {
                sim.PowerDirty = false;
                RebuildNetworks(sim);
            }
            Balance(sim);
        }

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

            // Sum generation, battery reserve, and demand per tier.
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.NetworkId == 0) continue;
                var def = machines[(int)d.Kind];
                _generation[d.NetworkId] += def.GenerationKW;
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

                // Battery bookkeeping: discharge to cover deficit, else charge from surplus.
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
                    d.Powered = d.NetworkId != 0 || d.Kind == DeviceKind.SolarWing;
                    continue;
                }
                d.Powered = d.NetworkId != 0 && GetTierServed(d.NetworkId, (int)def.Tier);
            }
        }

        // Consumers draw when relevant: open vents, running scrubbers, everything else always.
        private static bool IsWanting(Device d) => d.Kind switch
        {
            DeviceKind.AirVent => d.IsOpen,
            _ => true,
        };

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

        // Tier-served bitfield per network, stored in a reused list.
        private readonly List<byte> _tierServed = new List<byte>();
        private void SetTierServed(ushort net, int tier, bool served)
        {
            if (served) _tierServed[net] |= (byte)(1 << tier);
            else _tierServed[net] &= (byte)~(1 << tier);
        }
        private bool GetTierServed(ushort net, int tier) => (_tierServed[net] & (1 << tier)) != 0;

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
