using System;

namespace Perilune.Sim
{
    /// <summary>
    /// Lumped per-room gas simulation at 5 Hz (TDD §3.6). Every <see cref="Room"/> is
    /// one well-mixed node holding O2/CO2/N2 in MOLES; pressure is never stored, it is
    /// derived as P = nRT/V (<see cref="Room.PressureKPa"/>, kPa) from a volume of
    /// 2.5 m³ per tile. Room 0 is the infinite vacuum sink: gas pushed into it is
    /// destroyed, and its moles are re-zeroed at the end of every pass.
    ///
    /// One pass = a single loop over the device store handling doors (flow), vents
    /// (inject) and scrubbers (remove) INTERLEAVED in store order, then citizen
    /// breathing, then the vacuum re-zero. Determinism comes from walking the store in a
    /// FIXED order, not from the interleaving — splitting this into three phases would be
    /// exactly as deterministic. What the interleaving decides is WHICH deterministic
    /// answer you get: a vent that precedes a door in the store injects against the
    /// pre-flow pressure and vice versa, so a refactor into phases would move the
    /// numbers (and the golden hashes) without making anything less reproducible.
    ///
    /// Open doors are the only transport edge, and that is sufficient: two areas
    /// joined by open floor are already ONE room (RoomState floods across every tile
    /// that does not block gas, with two exceptions — <see cref="TileDefs.Void"/> floors,
    /// whose regions are marked vacuum-connected and collapse into room 0, and door
    /// tiles, which get <see cref="RoomState.DoorMarker"/> instead of a room id), and a
    /// wall removal equalizes INSTANTLY on the next room recompute —
    /// <see cref="RoomState"/>'s gas remap SUMS each old room's moles scaled by
    /// (overlapping tiles / that old room's tile count), a conservative proportional
    /// transfer that conserves moles exactly on a clean merge; only
    /// <see cref="Room.TemperatureK"/> is a share-weighted average. No flow involved.
    ///
    /// Deliberate v0 simplifications: a vent injects from an INFINITE reserve (air is
    /// created from nothing — unlike water, which is conserved through
    /// <see cref="Simulation.WastewaterLiters"/>), and a scrubber DESTROYS CO2 (no
    /// filter saturation, no captured-CO2 stock). Both run open-loop: a scrubber is
    /// never gated on a CO2 reading, so it burns its LifeSupport draw at 500 ppm and
    /// at 50,000 ppm alike. See <see cref="NeedsSystem"/> for the other half of that
    /// story — CO2 is a damage input with no responder anywhere in the sim.
    ///
    /// Tuning: `content/core/SimDefs/atmosphere.def` [atmosphere] — `flow_coefficient`
    /// (mol/(kPa·s) per open door), `o2_per_person_per_second` /
    /// `co2_per_person_per_second` (mol/s per living citizen), `vent_mol_per_second`,
    /// `scrubber_mol_per_second` (mol/s), `nominal_pressure_kpa` (the vent's top-up
    /// ceiling, kPa). The 0.21/0.79 injected mix and <see cref="Dt"/> are structural
    /// and not tunable. Device draws/tiers are `machines.def` (AirVent, Scrubber:
    /// both LifeSupport tier, so they are the LAST thing PowerSystem sheds).
    ///
    /// Determinism/allocation: defs are read fresh each pass and never cached, so
    /// parallel sims with different tunings cannot cross-talk; device and citizen
    /// stores are walked in store order; no RNG; nothing is allocated in steady state
    /// (the door's neighbour probe is a stackalloc, and the per-species diffusion
    /// accumulators are grown geometrically then Array.Clear'd, never reallocated).
    /// NOT <see cref="IStatefulSystem"/> — every value it moves lives on
    /// <see cref="Room"/>, which the ROOM save chapter persists and
    /// <see cref="Simulation.StateHash"/> folds in; the diffusion scratch carries
    /// nothing across a tick, so this class is still entirely stateless between ticks.
    ///
    /// Non-obvious couplings: ThermalSystem owns <see cref="Room.TemperatureK"/> and
    /// pressure is nRT/V, so a room's pressure moves when it heats or cools with no
    /// gas going anywhere. Vents and scrubbers need Powered (PowerSystem) AND
    /// <see cref="Device.IsOperational"/> (Condition above the machines.def `fail`
    /// threshold, driven by MachineWearSystem). Wear therefore bites twice: between
    /// pristine and `fail` the output tapers with <see cref="Device.EffectiveRate"/>,
    /// and below `fail` the machine stops dead.
    /// </summary>
    public sealed class AtmosphereSystem : ISimSystem
    {
        public string Name => "Atmosphere";
        public int IntervalTicks => 2;

        /// <summary>Seconds of simulated time per pass. Structural: paired with
        /// <see cref="IntervalTicks"/> at the 10 Hz base rate (2 ticks = 0.2 s), so it
        /// is NOT def-tunable — changing one without the other silently rescales every
        /// mol/s rate below.</summary>
        private const double Dt = 0.2;

        // FlowCoefficient / O2/CO2PerPersonPerSecond / Vent/ScrubberMolPerSecond and the
        // vent's NominalPressureKPa target now live in sim.Defs.Atmosphere (SimDefs.Default
        // reproduces the former consts: 0.5, 3.04e-4, 2.73e-4, 30, 0.001, 101.3). Tick reads
        // them each pass; nothing here caches the graph so parallel sims stay isolated.

        /// <summary>Gas constant, J/(mol·K) — the same 8.314 <see cref="Room.PressureKPa"/>
        /// uses. A partial pressure is <c>moles · R · T / V / 1000</c> kPa.</summary>
        private const double GasConstant = 8.314;

        // Per-room, per-species diffusion accumulators, index = room id. Mirror
        // ThermalSystem._deltaJ exactly: grown geometrically and Array.Clear'd at the top of
        // every diffusion pass, so all reads see start-of-pass moles and within-pass door
        // order can never bias which way a species moves. Cleared every pass ⇒ they carry
        // NOTHING between ticks, add no saved/hashed field, and keep this system stateless
        // (NOT IStatefulSystem), exactly as the thermal scratch does.
        private double[] _dO2 = new double[16];
        private double[] _dCO2 = new double[16];
        private double[] _dN2 = new double[16];

        /// <summary>
        /// One 0.2 s gas pass. Devices first (doors/vents/scrubbers interleaved in
        /// store order), then breathing, then the vacuum re-zero — deaths from the
        /// resulting atmosphere are NeedsSystem's job, later in the stack.
        /// </summary>
        public void Tick(Simulation sim)
        {
            // Redundant in the shipping path — Simulation.Tick refloods as an owned
            // phase before any system runs — but kept so this system is correct when
            // driven directly, and so nothing here reads a stale room list.
            sim.Rooms.RecomputeIfDirty(sim);
            var rooms = sim.Rooms.Rooms;
            var world = sim.World;
            var atmo = sim.Defs.Atmosphere;

            // 1. One store-order walk over every device: doors move gas, vents add it,
            //    scrubbers remove CO2. Deliberately one loop, not three phases.
            var devices = sim.Devices.Items;
            for (int d = 0; d < devices.Count; d++)
            {
                var device = devices[d];
                switch (device.Kind)
                {
                    case DeviceKind.Door when device.IsOpen:
                        FlowAcrossDoor(sim, device.Pos, atmo);
                        break;

                    case DeviceKind.AirVent when device.IsOpen && device.Powered && device.IsOperational(sim.Defs):
                    {
                        // Top-up TOWARD the nominal ceiling — but it does overshoot, so
                        // this is not a "never overpressure" guarantee. The gate is
                        // tested BEFORE a whole pass is injected, so a room a hair under
                        // 101.3 kPa still takes the full vent_mol_per_second ×
                        // EffectiveRate × Dt (up to 30 × 1 × 0.2 = 6 mol), which in a
                        // 1-tile room (2.5 m³ at 293 K) lands ~5.85 kPa PAST nominal.
                        // The overshoot scales as 1/volume, so it is negligible in a real
                        // compartment and only bites in tiny ones. A second vent in the
                        // same room re-reads live moles and skips, so per pass the
                        // overshoot is bounded by one vent's injection. Below the ceiling
                        // the vent adds dry Earth mix (21% O2 / 79% N2, no CO2) from an
                        // unmodelled reserve. Venting into room 0 is refused outright —
                        // the vacuum sink would swallow it and the ship would pump air
                        // into space forever.
                        var room = sim.Rooms.RoomAt(world, device.Pos);
                        if (room != rooms[0] && room.PressureKPa < atmo.NominalPressureKPa)
                        {
                            double moles = atmo.VentMolPerSecond * device.EffectiveRate * Dt;
                            room.O2Moles += moles * 0.21;
                            room.N2Moles += moles * 0.79;
                        }
                        break;
                    }

                    // Unconditional while powered AND operational (the guard below is
                    // both): no CO2 setpoint, no duty cycle, no IsOpen gate (unlike the
                    // vent). Clamped at zero so a big scrubber in a clean room cannot
                    // drive CO2 negative.
                    case DeviceKind.Scrubber when device.Powered && device.IsOperational(sim.Defs):
                    {
                        var room = sim.Rooms.RoomAt(world, device.Pos);
                        if (room != rooms[0])
                            room.CO2Moles = Math.Max(0, room.CO2Moles - atmo.ScrubberMolPerSecond * device.EffectiveRate * Dt);
                        break;
                    }
                }
            }

            // 1b. Partial-pressure diffusion across open doors — the per-species analogue of
            //     ThermalSystem's door conduction, and the fix for B-3. FlowAcrossDoor above
            //     equalises TOTAL pressure but carries the SOURCE room's whole mix, so two
            //     rooms joined by an open door that already sit at equal pressure never trade
            //     composition: a crew room climbs to ~17 kppm CO2 while the room-local scrubber
            //     next door scrubs its OWN air to ~0. This closes that gap so a scrubber can
            //     reach the compartment the crew stand in. One pass, after the device walk (so
            //     it reads the post-flow/post-scrub state) and before breathing.
            DiffuseAcrossDoors(sim, atmo);

            // 2. Citizens breathe into their room. O2 draw is clamped to what the room
            //    actually holds, but CO2 output is NOT — a crew suffocating in a sealed
            //    box keeps exhaling, which is what drives the room toward the narcosis
            //    thresholds NeedsSystem reads. Citizens standing on a door tile
            //    (DoorMarker) or in vacuum (room 0) breathe into nothing.
            var citizens = sim.Citizens.Items;
            for (int c = 0; c < citizens.Count; c++)
            {
                if (citizens[c].Dead) continue;
                ushort roomId = sim.Rooms.RoomIdAt(world, citizens[c].Pos);
                if (roomId == 0 || roomId == RoomState.DoorMarker || roomId >= rooms.Count) continue;
                var room = rooms[roomId];
                double o2Take = Math.Min(room.O2Moles, atmo.O2PerPersonPerSecond * Dt);
                room.O2Moles -= o2Take;
                room.CO2Moles += atmo.CO2PerPersonPerSecond * Dt;
            }

            // 3. Vacuum room stays empty. This is the sink that makes a hull breach
            //    lethal: whatever flowed or was exhaled into room 0 this pass is gone,
            //    so its pressure is pinned at 0 kPa no matter how much air arrives.
            rooms[0].O2Moles = 0; rooms[0].CO2Moles = 0; rooms[0].N2Moles = 0;
        }

        /// <summary>
        /// Move gas across ONE open door for one pass. The transfer is
        /// <c>FlowCoefficient · |Δp| · Dt</c> moles (mol/(kPa·s) × kPa × s), capped at
        /// what the high side actually holds, and split by the SOURCE room's
        /// composition — so air crossing a door carries its CO2 with it rather than
        /// diffusing per species. Pressure-driven only: two rooms at equal pressure but
        /// wildly different mixes never exchange anything (a known v0 simplification —
        /// there is no partial-pressure diffusion term).
        ///
        /// When the low side is room 0 the moles are removed from the source and simply
        /// dropped: an open door onto vacuum is a one-way drain, not a transfer.
        /// </summary>
        private static void FlowAcrossDoor(Simulation sim, Int3 doorPos, SimDefs.AtmosphereDefs atmo)
        {
            var world = sim.World;
            var level = world.Levels[doorPos.Z];
            var rooms = sim.Rooms.Rooms;

            // Find the two distinct room ids among the door's 4 neighbors. DoorMarker
            // doubles as the "not found yet" sentinel here (a real room id can be 0 —
            // that is vacuum, a legitimate flow partner). Scan order is +x,-x,+y,-y and
            // it stops at the FIRST second distinct id: a door wedged between three
            // different rooms (a corner) only ever links two of them.
            ushort a = RoomState.DoorMarker, b = RoomState.DoorMarker;
            Span<Int3> neighbors = stackalloc Int3[4]
            {
                new Int3(doorPos.X + 1, doorPos.Y, doorPos.Z), new Int3(doorPos.X - 1, doorPos.Y, doorPos.Z),
                new Int3(doorPos.X, doorPos.Y + 1, doorPos.Z), new Int3(doorPos.X, doorPos.Y - 1, doorPos.Z),
            };
            foreach (var n in neighbors)
            {
                ushort id;
                if (!world.InBounds(n)) id = 0; // out of bounds = vacuum
                else
                {
                    int ni = level.Index(n.X, n.Y);
                    if ((level.Flags[ni] & (byte)TileFlags.BlocksGas) != 0) continue; // wall/debris: no edge
                    id = level.RoomId[ni];
                    if (id == RoomState.DoorMarker) continue; // door-to-door: neither side is a node
                    // Guard against an id with no Room behind it. As written the three
                    // conjuncts cannot all hold (rooms.Count is >= 1 once rooms have been
                    // flooded, so `id == 0 && id >= rooms.Count` is unsatisfiable), so
                    // this never fires; the out-of-range case is caught below instead,
                    // where a too-large id falls back to rooms[0].
                    if (id == 0 && level.Floor[ni] != TileDefs.Void && id >= rooms.Count) continue;
                }
                if (a == RoomState.DoorMarker) a = id;
                else if (id != a) { b = id; break; }
            }
            if (a == RoomState.DoorMarker || b == RoomState.DoorMarker || a == b) return;

            // Any id past the end of the room list resolves to vacuum — a stale RoomId
            // must never index out of bounds mid-tick.
            var roomA = a < rooms.Count ? rooms[a] : rooms[0];
            var roomB = b < rooms.Count ? rooms[b] : rooms[0];
            double pa = roomA.PressureKPa, pb = roomB.PressureKPa;
            // 1e-6 kPa deadband: below it the transfer is rounding noise. Settled rooms
            // therefore stop moving moles entirely instead of trading dust each pass.
            if (Math.Abs(pa - pb) < 1e-6) return;

            var (src, dst) = pa > pb ? (roomA, roomB) : (roomB, roomA);
            double dn = atmo.FlowCoefficient * Math.Abs(pa - pb) * Dt;
            double total = src.TotalMoles;
            if (total <= 0) return;
            dn = Math.Min(dn, total);

            // Composition-proportional: the parcel leaving carries the source's mix.
            double fO2 = src.O2Moles / total, fCO2 = src.CO2Moles / total, fN2 = src.N2Moles / total;
            src.O2Moles -= dn * fO2; src.CO2Moles -= dn * fCO2; src.N2Moles -= dn * fN2;
            // Reference identity, not id: RoomAt/the fallback above both hand back the
            // rooms[0] instance for vacuum. Gas that reaches it is simply not credited.
            bool dstIsVacuum = dst == rooms[0];
            if (!dstIsVacuum)
            {
                dst.O2Moles += dn * fO2; dst.CO2Moles += dn * fCO2; dst.N2Moles += dn * fN2;
            }
        }

        /// <summary>
        /// Diffuse each species across every OPEN door by its PARTIAL-pressure gradient — the
        /// term <see cref="FlowAcrossDoor"/> deliberately lacks. Signed conservative flux, per
        /// door, per species: <c>f = D · (pp_s(a) − pp_s(b)) · Dt</c> moles, then
        /// <c>_dS[a] −= f; _dS[b] += f</c> — one <c>f</c> added as <c>−f/+f</c>, so the paired
        /// change sums to exactly zero and no gas is conjured. Accumulate into scratch (all
        /// reads see start-of-pass moles), then apply once — door order can never bias
        /// direction. A door onto vacuum (room 0 / out of bounds) drains the non-zero side
        /// one-sidedly and never credits room 0, exactly as ThermalSystem.ConductAcrossDoor and
        /// FlowAcrossDoor do into vacuum.
        ///
        /// Gate on <see cref="Device.IsOpen"/> ONLY — a sealed door must block gas (unlike
        /// thermal, where a closed door still conducts a fraction). <see cref="D"/> is chosen
        /// (atmosphere.def `diffusion_coefficient`) small enough that a pass never overshoots
        /// equilibrium, so the <c>Max(0,…)</c> clamp below — the scrubber's safety net — never
        /// fires in normal operation and mole conservation holds to float tolerance.
        /// </summary>
        private void DiffuseAcrossDoors(Simulation sim, SimDefs.AtmosphereDefs atmo)
        {
            double diffusion = atmo.DiffusionCoefficient;
            if (diffusion <= 0) return; // disabled: keep the pure-bulk-flow behaviour

            var rooms = sim.Rooms.Rooms;
            if (_dO2.Length < rooms.Count)
            {
                int grown = _dO2.Length;
                while (grown < rooms.Count) grown *= 2;
                _dO2 = new double[grown];
                _dCO2 = new double[grown];
                _dN2 = new double[grown];
            }
            Array.Clear(_dO2, 0, rooms.Count);
            Array.Clear(_dCO2, 0, rooms.Count);
            Array.Clear(_dN2, 0, rooms.Count);

            // One store-order walk over every open door (same deterministic order the device
            // loop and FlowAcrossDoor use). Accumulate signed flux per species.
            var devices = sim.Devices.Items;
            for (int d = 0; d < devices.Count; d++)
            {
                var device = devices[d];
                if (device.Kind == DeviceKind.Door && device.IsOpen)
                    DiffuseOneDoor(sim, device.Pos, diffusion);
            }

            // Apply. Room 0 (vacuum) is never credited — the loop starts at 1, and the flux
            // above never writes _dS[0]. Max(0,…) mirrors the scrubber clamp (:141); kept in
            // the non-overshoot regime it never actually fires.
            for (int r = 1; r < rooms.Count; r++)
            {
                var room = rooms[r];
                room.O2Moles = Math.Max(0, room.O2Moles + _dO2[r]);
                room.CO2Moles = Math.Max(0, room.CO2Moles + _dCO2[r]);
                room.N2Moles = Math.Max(0, room.N2Moles + _dN2[r]);
            }
        }

        /// <summary>Accumulate one open door's per-species diffusive flux into the scratch
        /// buffers. Same 4-neighbour room-resolution scan as
        /// <see cref="ThermalSystem.ConductAcrossDoor"/> (canonical +x,−x,+y,−y order).</summary>
        private void DiffuseOneDoor(Simulation sim, Int3 doorPos, double diffusion)
        {
            var world = sim.World;
            var level = world.Levels[doorPos.Z];
            var rooms = sim.Rooms.Rooms;

            ushort a = RoomState.DoorMarker, b = RoomState.DoorMarker;
            for (int n = 0; n < 4; n++)
            {
                var p = Int3.Neighbor4(doorPos, n);
                ushort id;
                if (!world.InBounds(p)) id = 0; // out of bounds = vacuum
                else
                {
                    int pi = level.Index(p.X, p.Y);
                    if ((level.Flags[pi] & (byte)TileFlags.BlocksGas) != 0) continue; // wall: no edge
                    id = level.RoomId[pi];
                    if (id == RoomState.DoorMarker) continue; // adjacent door tile: neither side is a node
                    if (id >= rooms.Count) id = 0; // stale id: treat as vacuum, like RoomAt
                }
                if (a == RoomState.DoorMarker) a = id;
                else if (id != a) { b = id; break; }
            }
            if (a == RoomState.DoorMarker || b == RoomState.DoorMarker || a == b) return;

            var roomA = rooms[a];
            var roomB = rooms[b];
            // f = D · Δ(partial pressure) · Dt, one value per species. Room 0 reads pp 0 (its
            // moles are pinned to zero), so a door onto vacuum drains the live side.
            double fO2 = diffusion * (PartialKPa(roomA, roomA.O2Moles) - PartialKPa(roomB, roomB.O2Moles)) * Dt;
            double fCO2 = diffusion * (PartialKPa(roomA, roomA.CO2Moles) - PartialKPa(roomB, roomB.CO2Moles)) * Dt;
            double fN2 = diffusion * (PartialKPa(roomA, roomA.N2Moles) - PartialKPa(roomB, roomB.N2Moles)) * Dt;

            if (a != 0) { _dO2[a] -= fO2; _dCO2[a] -= fCO2; _dN2[a] -= fN2; }
            if (b != 0) { _dO2[b] += fO2; _dCO2[b] += fCO2; _dN2[b] += fN2; }
        }

        /// <summary>Partial pressure of one species' mole count in a room, kPa — the same
        /// ideal-gas expression as <see cref="Room.PressureKPa"/> applied to one pool. A
        /// zero-volume room (or room 0 with no tiles) reads 0 rather than dividing by zero.</summary>
        private static double PartialKPa(Room room, double speciesMoles)
        {
            double v = room.VolumeM3;
            return v <= 0 ? 0 : speciesMoles * GasConstant * room.TemperatureK / v / 1000.0;
        }
    }
}
