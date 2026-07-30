namespace Perilune.Sim
{
    /// <summary>Open/close/lock/unlock a door (from UI, MOSS, or LLM effects).</summary>
    public sealed class SetDoorStateCommand : ISimCommand
    {
        private readonly uint _deviceId;
        private readonly bool? _open;
        private readonly bool? _locked;

        public SetDoorStateCommand(uint deviceId, bool? open = null, bool? locked = null)
        {
            _deviceId = deviceId; _open = open; _locked = locked;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.Devices.TryGet(_deviceId, out var device) || device.Kind != DeviceKind.Door) return;
            if (_locked.HasValue) device.IsLocked = _locked.Value;
            if (_open.HasValue)
            {
                bool target = _open.Value && !device.IsLocked;
                if (device.IsOpen != target)
                {
                    device.IsOpen = target;
                    sim.Events.Publish(new DoorStateChangedEvent { DeviceId = device.Id, IsOpen = device.IsOpen });
                }
            }
        }
    }

    /// <summary>Toggle a vent/scrubber-style device or set its rate.</summary>
    public sealed class SetDeviceStateCommand : ISimCommand
    {
        private readonly uint _deviceId;
        private readonly bool? _open;
        private readonly float? _rate;

        public SetDeviceStateCommand(uint deviceId, bool? open = null, float? rate = null)
        {
            _deviceId = deviceId; _open = open; _rate = rate;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.Devices.TryGet(_deviceId, out var device)) return;
            if (_open.HasValue) device.IsOpen = _open.Value;
            if (_rate.HasValue) device.Rate = _rate.Value < 0f ? 0f : _rate.Value > 1f ? 1f : _rate.Value;
        }
    }

    /// <summary>
    /// Direct move order (lone-survivor phase): path the citizen to the target tile.
    /// Disables auto-wander — from the first order on, the citizen only moves on command
    /// (until the M2 job system takes over idle behavior).
    /// </summary>
    public sealed class MoveCitizenCommand : ISimCommand
    {
        private readonly uint _citizenId;
        private readonly Int3 _target;

        public MoveCitizenCommand(uint citizenId, Int3 target)
        {
            _citizenId = citizenId; _target = target;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.Citizens.TryGet(_citizenId, out var citizen) || citizen.Dead) return;
            // A direct order overrides any job — cancel it cleanly (drop cargo where
            // they stand, release reservations) so nothing stays locked mid-redirect.
            sim.CancelJob(citizen);
            citizen.AutoWander = false;
            citizen.ClearPath();
            // E0-3: the order OWNS the citizen until it completes — no auto-work may hijack it
            // mid-walk (see Citizen.IsRecruitableForWork). Set only on a route that actually
            // exists: an unreachable target leaves the citizen plainly idle and recruitable, not
            // silently locked out of work by an order that never started.
            citizen.OrderedMove = sim.Paths.FindPath(sim, citizen.Pos, _target, citizen.Path);
            if (citizen.OrderedMove)
                citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
        }
    }

    /// <summary>
    /// Store a terminal's MOSS source as sim state via the command log (the DSL
    /// runtime compiles it separately; sources are canonical, programs are derived).
    /// </summary>
    public sealed class SetScriptCommand : ISimCommand
    {
        private readonly string _terminalId;
        private readonly string _source;

        public SetScriptCommand(string terminalId, string source)
        {
            _terminalId = terminalId; _source = source;
        }

        /// <summary>
        /// E0-6 — refuses on a terminal that is not <see cref="Device.Scriptable"/>: installing a
        /// program IS scripting the device, so the two doors into MOSS agree. Silent, like every
        /// other command's rejection.
        ///
        /// <b>A terminal id with no device behind it is still allowed</b>, and deliberately: the
        /// id is a free-text key (<c>hosts/scenario</c> and several tests drive `term_main` with no
        /// device at all), and refusing those would turn "no device" into "no automation" for
        /// callers that never had a device to commission. The gate bites exactly where there IS a
        /// device to fit a module to.
        /// </summary>
        public void Execute(Simulation sim)
        {
            if (TryFindNamedDevice(sim, _terminalId, out var terminal) && !terminal.Scriptable) return;
            sim.SetScript(_terminalId, _source);
        }

        /// <summary>The device whose <see cref="Device.Name"/> is <paramref name="name"/> (device
        /// store order, first match — the same identity MOSS resolves adapters by). Ordinal
        /// comparison: MOSS lowercases identifiers, device names are authored lowercase, and a
        /// culture-sensitive compare on a de-DE machine is exactly the bug class this repo keeps
        /// finding.</summary>
        internal static bool TryFindNamedDevice(Simulation sim, string name, out Device device)
        {
            if (!string.IsNullOrEmpty(name))
            {
                var devices = sim.Devices.Items;
                for (int i = 0; i < devices.Count; i++)
                {
                    if (!string.Equals(devices[i].Name, name, System.StringComparison.Ordinal)) continue;
                    device = devices[i];
                    return true;
                }
            }
            device = null;
            return false;
        }
    }

    /// <summary>Mark/unmark a rock tile for digging.</summary>
    public sealed class DesignateDigCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly bool _on;

        public DesignateDigCommand(Int3 pos, bool on)
        {
            _pos = pos; _on = on;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;
            // Only rock walls are diggable.
            if (_on && sim.World.GetWall(_pos) != TileDefs.Debris) return;
            sim.World.SetFlag(_pos, TileFlags.Designated, _on);
            sim.JobsDirty |= JobBoardDirty.Tiles; // a dig designation is a tile-board change
            sim.Events.Publish(new TileChangedEvent { Pos = _pos });
        }
    }

    /// <summary>Mark/unmark a floor tile as stockpile zone (haul destination).</summary>
    public sealed class DesignateStockpileCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly bool _on;

        public DesignateStockpileCommand(Int3 pos, bool on)
        {
            _pos = pos; _on = on;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;
            if (_on && (sim.World.GetFlags(_pos) & TileFlags.Walkable) == 0) return;
            sim.World.SetFlag(_pos, TileFlags.Stockpile, _on);
            // E0-4 (hazard 3): clearing the presence bit clears any E0-4 filter on the same tile,
            // so a de-designated stockpile never orphans a filter entry accumulating in the ZONE
            // hash. Optional-system-guarded — a stack without a StockZoneSystem is a no-op, and a
            // tile that never carried a filter is ClearFilter's own no-op.
            if (!_on) sim.StockZones?.ClearFilter(sim, _pos);
            sim.JobsDirty |= JobBoardDirty.Tiles; // a stockpile zone is a tile-board change
            sim.Events.Publish(new TileChangedEvent { Pos = _pos });
        }
    }

    /// <summary>
    /// Set the E0-4 accept-filter mask on a stockpile tile: bit <c>k</c> set ⇒ accept
    /// <see cref="ItemKind"/> <c>k</c>. Optional-system walk to <see cref="StockZoneSystem.SetFilter"/>
    /// (the <see cref="DesignateDeconstructCommand"/> contract) — a sim without a
    /// <see cref="StockZoneSystem"/> silently ignores it.
    ///
    /// PRECONDITION-LIGHT ON PURPOSE. There is no tile-legality check here: a mask on a
    /// non-stockpile tile is inert (the haul board only ever consults <see cref="StockZoneSystem.Accepts"/>
    /// where a <see cref="TileFlags.Stockpile"/> presence bit already exists), and the OFF path of
    /// <see cref="DesignateStockpileCommand"/> clears any stray entry. So a client may enqueue a
    /// filter click blind and an illegal tile is the same silent no-op every other designate is.
    /// An ABSENT entry (never set, or cleared) = accept-all; a <c>mask == 0</c> entry accepts nothing.
    /// </summary>
    public sealed class SetStockpileFilterCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly ulong _mask;

        public SetStockpileFilterCommand(Int3 pos, ulong mask)
        {
            _pos = pos; _mask = mask;
        }

        public void Execute(Simulation sim) => sim.StockZones?.SetFilter(sim, _pos, _mask);
    }

    /// <summary>
    /// Designate (or cancel) a build at a tile (P2 build/refit v0). Finds the stack's
    /// BuildSystem and calls its deterministic public API; a sim without a BuildSystem
    /// ignores the command (pre-M1 behavior preserved).
    /// </summary>
    public sealed class DesignateBuildCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly BuildKind _kind;
        private readonly bool _on;
        private readonly byte _material;

        public DesignateBuildCommand(Int3 pos, BuildKind kind, bool on = true, byte material = 0)
        {
            _pos = pos; _kind = kind; _on = on; _material = material;
        }

        public void Execute(Simulation sim)
        {
            foreach (var s in sim.Systems)
                if (s is BuildSystem b)
                {
                    if (_on) b.Designate(sim, _pos, _kind, _material);
                    else b.Cancel(sim, _pos);
                    return;
                }
        }
    }

    /// <summary>
    /// Designate (or cancel) a DECONSTRUCT at a tile (E0-5, build's inverse). Finds the stack's
    /// <see cref="DeconstructSystem"/> and calls its deterministic public API; a sim without one
    /// ignores the command (the <see cref="DesignateBuildCommand"/> optional-system walk), so a
    /// reduced stack keeps its pre-E0-5 behaviour.
    ///
    /// The <c>on</c> flag is EXPLICIT rather than a host-side read of world state (E0-3's
    /// decision): a sweep is then idempotent and the host can never race the sim. Every
    /// precondition — bounds, hull, wall-ness, device kind, the staging cap — is enforced sim-side
    /// at the tick boundary, so a client may enqueue a click blind and an illegal order is a
    /// silent no-op.
    ///
    /// THE COMMAND CARRIES A TILE, NEVER AN ENTITY ID (E0-5 WP-2 removed the <c>targetId</c>
    /// parameter WP-1 shipped). A device site's <see cref="PendingDeconstruct.TargetId"/> is
    /// resolved sim-side inside <see cref="DeconstructSystem.Designate"/>: the player clicks a
    /// tile, entity ids are sim-internal, and a client-supplied id would be a second unvalidated
    /// identity for the same object.
    /// </summary>
    public sealed class DesignateDeconstructCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly DeconstructKind _kind;
        private readonly bool _on;

        public DesignateDeconstructCommand(Int3 pos, DeconstructKind kind = DeconstructKind.Wall,
                                           bool on = true)
        {
            _pos = pos; _kind = kind; _on = on;
        }

        public void Execute(Simulation sim)
        {
            foreach (var s in sim.Systems)
                if (s is DeconstructSystem d)
                {
                    if (_on) d.Designate(sim, _pos, _kind);
                    else d.Cancel(sim, _pos);
                    return;
                }
        }
    }

    /// <summary>
    /// Place a piece of functional furniture at a floor tile (Room Zoom decorate palette).
    /// Furniture is inert — no power/heat/wear — so placement rides the existing hashed Device
    /// state (Kind/Pos/Name fold in <see cref="Simulation.StateHash"/>); it adds no new saved
    /// field. Validation is deterministic (no RNG/Date): the kind must be a placeable furniture
    /// kind, and the tile must be in bounds, a walkable non-wall floor, and empty of a device
    /// (one device per tile). An illegal request is a silent no-op — the client only promises the
    /// attempt and shows the item once the sim confirms it in the next frame.
    ///
    /// <para><b>IT COSTS MATTER (E0-5 WP-3).</b> Placing consumes
    /// <c>defs.Build.DevicePlaceCost</c> units of <see cref="Currency"/> from loose ground
    /// stacks. Before this, placement was FREE while <c>DeconstructSystem</c> paid
    /// <c>floor(device_parts × Condition)</c> Parts to strip the same object — measured by WP-2's
    /// independent review as an unbounded matter faucet: place → strip → repeat minted 1 Part per
    /// 476 ticks with zero matter input, against 15 000 ticks + 1 Regolith for the same Part
    /// through the shipped <c>recipes.def</c> ladder, feeding <c>MaintenanceSystem</c> — the one
    /// sink that never ends. Nothing bounded it: not material (free), not <c>max_staged</c> (a
    /// queue-depth cap, not a rate cap), not tiles (re-placeable instantly), not kind.</para>
    ///
    /// <para><b>THE CURRENCY IS THE ONE STRIP REFUNDS</b>, not the one BuildSystem charges for a
    /// wall. A Regolith cost against a Parts yield would be material-neutral and STILL an exploit:
    /// 2 Regolith → 2 Parts in 900 ticks bypasses the ~30 000 ticks of crafting the ladder charges
    /// for that conversion (Regolith →<i>600t</i>→ Scrap ×2 →<i>900t per 2</i>→ Parts). Charging
    /// Parts closes the loop in one move and leaves <see cref="Device.Condition"/> as the loss
    /// term. Structurally pinned: <see cref="Currency"/> == <c>DeconstructSystem.DeviceSalvage</c>
    /// is asserted by <c>DeconstructSystemTests</c>.</para>
    ///
    /// <para><b>HONESTLY STATED LIMIT — THE MATERIAL TELEPORTS.</b> Payment is taken from any free
    /// ground stack anywhere aboard, in item-store order, with no haul job, no reservation, and no
    /// distance term. Nobody carries the Parts to the tile. That is a deliberate simplification, not
    /// an oversight: a real staged-haul placement is <see cref="BuildSystem"/>'s shape
    /// (designate → <c>JobKind.HaulToBuild</c> → build) and belongs to E0-6, which owns the
    /// placement-as-a-build-site rework. Until then this is <c>MECHANICS §13</c> material: the COST
    /// is real and conserved, the LOGISTICS are not modelled.</para>
    ///
    /// <para><b>ALL OR NOTHING.</b> A ship that cannot pay in full places nothing and consumes
    /// nothing — partial consumption would be a matter leak (Parts destroyed, no device). The cost
    /// is charged LAST, after every legality check, so an illegal tile never spends. A refusal is
    /// the same silent no-op every other rejection is, so the web host
    /// (<c>GameSession.HandlePlace</c>) neither throws nor desyncs: it enqueues blind and the next
    /// frame simply does not contain the furniture.</para>
    /// </summary>
    public sealed class PlaceDeviceCommand : ISimCommand
    {
        private readonly DeviceKind _kind;
        private readonly Int3 _pos;

        /// <summary>What placing furniture is paid in. MUST equal
        /// <c>DeconstructSystem.DeviceSalvage</c> — the round trip is only provably lossy if the
        /// charge and the refund are the same currency (see the class doc).</summary>
        public const ItemKind Currency = ItemKind.Parts;

        public PlaceDeviceCommand(DeviceKind kind, Int3 pos)
        {
            _kind = kind; _pos = pos;
        }

        /// <summary>The furniture whitelist: crew/decor pieces the player may place or remove at
        /// runtime. Deliberately excludes doors, life-support, power, crafting, sensors and every
        /// other functional machine — those ship at authoring only.</summary>
        public static bool IsPlaceableFurniture(DeviceKind kind)
        {
            switch (kind)
            {
                case DeviceKind.Bed:
                case DeviceKind.Desk:
                case DeviceKind.Chair:
                case DeviceKind.Locker:
                case DeviceKind.PlantPot:
                case DeviceKind.Light:
                case DeviceKind.GrowBed:
                case DeviceKind.MedBed:
                case DeviceKind.Table:
                    return true;
                default:
                    return false;
            }
        }

        public void Execute(Simulation sim)
        {
            if (!IsPlaceableFurniture(_kind)) return;
            if (!sim.World.InBounds(_pos)) return;
            // A walkable non-wall floor tile, empty of any device (one-per-tile rule).
            if ((sim.World.GetFlags(_pos) & TileFlags.Walkable) == 0) return;
            if (sim.World.GetWall(_pos) != TileDefs.Void) return;
            if ((sim.World.GetFlags(_pos) & TileFlags.HasDevice) != 0) return;
            if (sim.TryGetDeviceAt(_pos, out _)) return;
            // CHARGED LAST, so an illegal request never spends: every rejection above leaves the
            // ship's matter untouched, and this one leaves it untouched too when it cannot pay.
            if (!TryPay(sim, sim.Defs.Build.DevicePlaceCost)) return;
            // Deterministic name (kind + tile) — no counters, no RNG; InvariantCulture ints.
            string name = System.FormattableString.Invariant(
                $"{_kind.ToString().ToLowerInvariant()}_{_pos.X}_{_pos.Y}_{_pos.Z}");
            var placed = sim.AddDevice(_kind, _pos, name); // marks rooms + power dirty
            // E0-6 — what the PLAYER bolts on is not commissioned. The device works physically the
            // instant it is placed; what it does not have is a controller module, so MOSS cannot
            // see it (MossBindings.RegisterAdapters skips it) until a CommissionDeviceCommand
            // spends one. Authored and generated devices keep Device.Scriptable's true default, so
            // no shipped ship, program or rule changes.
            placed.Scriptable = false;
        }

        /// <summary>
        /// Free <see cref="Currency"/> units lying loose aboard: on the ground
        /// (<c>CarriedBy == 0</c>) and unclaimed (<c>ReservedBy == 0</c>). Carried and reserved
        /// stacks are somebody else's — a builder's haul, a station's staged input, a
        /// maintainer's overhaul Part — and taking them would strand the job that claimed them
        /// (the B-1 bug class).
        /// </summary>
        public static int Affordable(Simulation sim) => LooseMatter.Affordable(sim, Currency);

        /// <summary>
        /// Consume exactly <paramref name="cost"/> units of <see cref="Currency"/>, or NOTHING.
        /// Two passes on purpose: pass one counts, and only if the whole price is affordable does
        /// pass two spend. A single greedy pass that ran out halfway would destroy matter and
        /// place nothing — the leak this command exists to close, inverted.
        ///
        /// DETERMINISTIC: stacks are drained in ITEM-STORE ORDER (insertion order, the sim's
        /// canonical entity order — the same order <c>Simulation.StateHash</c> folds them in), so
        /// two identical sims spend the same stacks. No distance term, no nearest-first tie-break,
        /// no RNG, no Dictionary iteration, and no allocation: emptied stacks are removed in place
        /// and the cursor simply does not advance over the shift
        /// (<see cref="EntityStore{T}.Remove"/> is an order-preserving <c>List.Remove</c>).
        ///
        /// A zero or negative cost is free and consumes nothing, so a content pack that unsets
        /// the price gets the pre-E0-5 behaviour rather than an exception.
        /// </summary>
        private static bool TryPay(Simulation sim, int cost) =>
            LooseMatter.TryPay(sim, Currency, cost);
    }

    /// <summary>
    /// The ship's loose matter, and the ONE way a command spends it (E0-6 extracted this from
    /// <see cref="PlaceDeviceCommand"/>; the semantics below are that command's, verbatim, because
    /// a second copy of an all-or-nothing spend is a second chance to write a matter leak).
    ///
    /// "Loose" means on the ground (<c>CarriedBy == 0</c>) and unclaimed (<c>ReservedBy == 0</c>).
    /// Carried and reserved stacks belong to somebody — a builder's haul, a station's staged input,
    /// a maintainer's overhaul Part — and taking them strands the job that claimed them (the B-1
    /// bug class).
    /// </summary>
    internal static class LooseMatter
    {
        /// <summary>Free units of <paramref name="kind"/> lying loose aboard.</summary>
        public static int Affordable(Simulation sim, ItemKind kind)
        {
            int units = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (it.Kind != kind || it.CarriedBy != 0 || it.ReservedBy != 0) continue;
                units += it.Count;
            }
            return units;
        }

        /// <summary>
        /// Consume exactly <paramref name="cost"/> units of <paramref name="kind"/>, or NOTHING.
        /// Two passes on purpose: pass one counts, and only if the whole price is affordable does
        /// pass two spend. A single greedy pass that ran out halfway would destroy matter and
        /// deliver nothing.
        ///
        /// DETERMINISTIC: stacks are drained in ITEM-STORE ORDER (insertion order, the sim's
        /// canonical entity order — the same order <c>Simulation.StateHash</c> folds them in), so
        /// two identical sims spend the same stacks. No distance term, no nearest-first tie-break,
        /// no RNG, no Dictionary iteration, and no allocation: emptied stacks are removed in place
        /// and the cursor simply does not advance over the shift
        /// (<see cref="EntityStore{T}.Remove"/> is an order-preserving <c>List.Remove</c>).
        ///
        /// A zero or negative cost is free and consumes nothing, so a content pack that unsets a
        /// price gets the un-priced behaviour rather than an exception.
        /// </summary>
        public static bool TryPay(Simulation sim, ItemKind kind, int cost)
        {
            if (cost <= 0) return true;
            if (Affordable(sim, kind) < cost) return false; // all or nothing — never a partial spend

            int remaining = cost;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count && remaining > 0; )
            {
                var it = items[i];
                if (it.Kind != kind || it.CarriedBy != 0 || it.ReservedBy != 0 || it.Count <= 0)
                {
                    i++;
                    continue;
                }
                int take = it.Count < remaining ? it.Count : remaining;
                it.Count -= take;
                remaining -= take;
                if (it.Count == 0) sim.Items.Remove(it.Id); // shifts left: hold the cursor
                else i++;
            }
            sim.JobsDirty |= JobBoardDirty.Items; // ground stacks were spent — the haul board shrinks
            return true;
        }
    }

    /// <summary>
    /// Fit a <see cref="ItemKind.ControllerModule"/> to the device on a tile, making it
    /// MOSS-scriptable (E0-6). <b>This is the only consumer of ControllerModule in the game</b>,
    /// and giving it one is the whole point of the package: until E0-6 every scrap of finite matter
    /// aboard converted up the ladder into modules that nothing could spend, so the economy
    /// terminated permanently at ~sim-hour 28 (MECHANICS §13.15) with 31 of them stacked on one
    /// tile. ECONOMY.md §11 fixes the scope of the fix in one sentence: "No second job for
    /// ControllerModule. It gates MOSS scriptability. One job."
    ///
    /// <para><b>ALL OR NOTHING, and charged LAST</b> — <see cref="PlaceDeviceCommand"/>'s contract,
    /// through the same <see cref="LooseMatter"/> spend. A tile with no device, a device already
    /// commissioned, or a ship that cannot pay: nothing changes and nothing is consumed. Refusal is
    /// the same silent no-op every other designate/place command uses, so a host can enqueue blind.</para>
    ///
    /// <para><b>It bumps <c>DeviceTopologyVersion</c>.</b> The MOSS <c>DeviceRegistry</c> is HOST
    /// state, not sim state, and is populated by <c>MossBindings.RegisterAdapters</c> — so a device
    /// that becomes scriptable mid-game needs the host to re-derive its adapters, and the topology
    /// counter is the signal hosts already watch. Nothing in the deterministic sim depends on it.</para>
    ///
    /// <para><b>Not reversible, on purpose.</b> There is no un-commission: the module is fitted, and
    /// the only way to get it back is E0-5's strip, which destroys the device (and un-registers its
    /// adapter — "you can break your own automation by selling a valve", ECONOMY.md §9.3). Placing a
    /// fresh device and commissioning it again costs another module, which is what makes this a
    /// SINK rather than a toggle.</para>
    /// </summary>
    public sealed class CommissionDeviceCommand : ISimCommand
    {
        private readonly Int3 _pos;

        /// <summary>What commissioning is paid in. One kind, one job (ECONOMY.md §11).</summary>
        public const ItemKind Currency = ItemKind.ControllerModule;

        public CommissionDeviceCommand(Int3 pos)
        {
            _pos = pos;
        }

        /// <summary>
        /// ⚠️ TWO OF THE FOUR GUARDS BELOW ARE UNTESTED, AND THAT IS RECORDED RATHER THAN HIDDEN
        /// (the same disclosure <c>MaintenanceSystem.RestoredCondition</c>'s unreachable arm gets).
        /// <c>InBounds</c> and the nameless-device check are DEFENSIVE: the host clamps every
        /// coordinate before enqueueing (<c>GameSession.HandleCommission</c>), and every device
        /// <c>Simulation.AddDevice</c> creates through a player path is given a deterministic name,
        /// so neither guard is reachable from any surface that exists today. No mutation in the
        /// package's harness turns them red, because no mutation can. They are kept because a
        /// future authoring path could produce either shape and a module spent on a nameless device
        /// would buy the player nothing — but nobody should read them as covered.
        /// </summary>
        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;                  // UNTESTED — see above
            if (!sim.TryGetDeviceAt(_pos, out var device)) return;
            if (device.Scriptable) return;            // already fitted — never charge twice
            if (string.IsNullOrEmpty(device.Name)) return;          // UNTESTED — see above
            // CHARGED LAST, so every rejection above leaves the ship's matter untouched.
            if (!LooseMatter.TryPay(sim, Currency, sim.Defs.Build.CommissionCost)) return;
            device.Scriptable = true;
            sim.DeviceTopologyVersion++; // hosts re-derive MOSS adapters off this
        }

        /// <summary>Free <see cref="Currency"/> units aboard — what a host needs to grey out the
        /// affordance rather than let the player click into a silent refusal.</summary>
        public static int Affordable(Simulation sim) => LooseMatter.Affordable(sim, Currency);
    }

    /// <summary>
    /// Remove a placed furniture device from a tile (Room Zoom demolish). Only the furniture
    /// whitelist (<see cref="PlaceDeviceCommand.IsPlaceableFurniture"/>) is removable — doors,
    /// life-support, power, crafting and sensors are never deleted this way. Deterministic no-op
    /// when the tile holds no removable furniture.
    /// </summary>
    public sealed class RemoveDeviceCommand : ISimCommand
    {
        private readonly Int3 _pos;

        public RemoveDeviceCommand(Int3 pos)
        {
            _pos = pos;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;
            if (!sim.TryGetDeviceAt(_pos, out var device)) return;
            if (!PlaceDeviceCommand.IsPlaceableFurniture(device.Kind)) return;
            sim.RemoveDevice(device.Id); // marks rooms + power dirty
        }
    }

    /// <summary>
    /// ALLOCATE an empty hall — the Overview's ＋ADD ROOM affordance. <b>NAMING IS FREE; AIR IS
    /// EARNED.</b> An empty hall (grid ship, wreck ship) is an ALREADY-CARVED compartment: floor
    /// interior, perimeter walls, and one SEALED door, its interior vacuum. Allocating it gives that
    /// compartment a TYPE and nothing else. Nothing is carved, no door moves, and no gas appears.
    ///
    /// <para><b>W4b (2026-07-28) TOOK TWO THIRDS OF THIS COMMAND AWAY — owner decision, binding.</b>
    /// It used to also (2) force every bordering <see cref="DeviceKind.Door"/> open AND unlocked, and
    /// (3) call <see cref="RoomState.Pressurize"/> — 101.3 kPa of 21 % O₂ conjured from nothing,
    /// instantly, for free. Both are DELETED. Air now comes from a working, powered, repaired vent
    /// moving gas over time through a door the player opened, which is what turns the pressure
    /// frontier from a formality into the core loop. Deleting step 2 is also the root fix for the
    /// owner's live-play report *"doors are only drawn in front of empty rooms; as soon as I allocate
    /// them, they become overwritten"* — an allocated compartment now keeps its doors SHUT, so they
    /// keep drawing (<c>docs/HANDOVER.md</c>, "OWNER REPORT FROM LIVE PLAY").</para>
    ///
    /// <para><b>Lowers ENTIRELY to one existing hashed operation — adds NO new saved field / chapter /
    /// World structure.</b> Its single effect is the room <see cref="RoomAnchor"/>'s <c>Type</c>
    /// (saved ROOM v3, folded into <see cref="Simulation.StateHash"/>). It is exactly a SetAnchor, in
    /// one atomic tick-boundary step.</para>
    ///
    /// <para><b>Slot geometry is PASSED IN, never stored in the sim.</b> The host resolves the
    /// target slot's centre PROBE tile and its existing ANCHOR name from its view-only, unhashed
    /// <c>SlotGrid</c> and hands them here, so the deterministic sim needs no slot-grid knowledge.</para>
    ///
    /// <para><b>The anchor is REUSED, not duplicated.</b> An empty hall already carries its own
    /// anchor (<c>hall_dZ_sN</c>, <see cref="RoomType.None"/>); there is no remove-anchor primitive,
    /// so re-typing that same anchor keeps exactly ONE anchor on the room — the room's identity was
    /// always the slot's; only its TYPE is new.</para>
    ///
    /// <para><b>⚠️ THE REJECTION PREDICATE IS THE LOAD-BEARING PART OF W4b, not the deletions.</b> The
    /// old double-commission guard was <c>room.TotalMoles &gt; 0</c> — *"already a live (pressurised)
    /// room"* — which worked only while "named" and "has air" were the same event. They are not any
    /// more: a named-but-AIRLESS room is now the normal state of every freshly allocated compartment,
    /// and a furnished room that has been vented (hull breach, an opened door onto vacuum) is airless
    /// too. On the gas predicate a player could re-type an allocated room forever, and re-type a
    /// FURNISHED one that happens to be in vacuum. ⇒ <b>the guard asks the ANCHOR, not the gas:</b>
    /// allocation is refused when any anchor whose probe resolves to this same room already carries a
    /// <see cref="RoomType"/> other than <see cref="RoomType.None"/>.</para>
    ///
    /// <para><b>⚠️ A SECOND GUARD WAS WRITTEN HERE AND THEN REMOVED, BY MEASUREMENT.</b> This lane first
    /// added <c>if (_type == RoomType.None) return;</c> — "the un-allocate that would otherwise reopen
    /// the hole" — with a test for it. The mutation harness deleted that line and <b>the whole suite
    /// stayed GREEN (21/21)</b>: the anchor predicate above already refuses the only case the guard
    /// claimed to cover, because an allocated room's anchor is typed and is therefore caught one
    /// statement earlier. A guard whose named mutation cannot bite, plus a test that passes either way,
    /// is the single most common review defect in this repo — so both were deleted rather than shipped.
    /// The residual it leaves is unreachable and harmless: <c>type: None</c> on a compartment with NO
    /// anchor at all would add an untyped one, and the host's picker cannot send <c>None</c>
    /// (<c>GameSession.ParseRoomType</c> whitelists the player-facing kinds and returns false
    /// otherwise).</para>
    ///
    /// <para>Deterministic (no RNG, no Date). Validation is a silent no-op on reject, like the other
    /// designate/place commands: the probe must land in a real, sealed compartment (a non-vacuum-sink
    /// room) that no typed anchor already owns. A probe in open vacuum (room 0) is rejected, so
    /// double-allocating or targeting a furnished room does nothing.</para>
    ///
    /// <para>⛔ <b>THIS COMMAND IS DORMANT — DELIBERATELY, AND NOT BECAUSE ANYONE FORGOT IT. M1-L,
    /// 2026-07-29.</b> The owner deleted the verb that drove it: <i>"we do not need 'add room' that
    /// makes no sense on a ship where rooms are already existing."</i> Every route to it is gone —
    /// the client's <c>Cmd.addRoom</c> sender, <c>GameSession</c>'s <c>"addroom"</c> parse case, its
    /// <c>CmdKind.AddRoom</c> dispatch route and its <c>HandleAddRoom</c>/<c>ParseRoomType</c> pair.
    /// A compartment is now a room because its WALLS make it one (RimWorld analogue:
    /// <c>docs/design/rimworld-reference.md</c> §10, <i>"Rooms are derived, not authored … the player
    /// never names or allocates one"</i>), so nothing needs to allocate one.
    ///
    /// <para><b>It survives here on purpose.</b> Deleting it means deleting the <c>CmdKind.AddRoom</c>
    /// enum member beside it, which RENUMBERS its siblings — a spine change, out of scope for a
    /// package whose whole claim is pin-neutrality. Filed as its own package: see
    /// <c>docs/design/perilune-roadmap-q3.packages.md</c>, <b>M1-L-b</b>, which names the renumbering
    /// hazard. Its tests in <c>tests/Perilune.Tests/AddRoomCommandTests.cs</c> are kept and still
    /// drive it directly, so the dormant code is not also UNGUARDED code.</para>
    ///
    /// <para>⚠️ <b>"Nothing calls this" is a statement about a TREE, and a merge changes a tree.</b>
    /// That is the eighth trap shape (<c>CLAUDE.md</c>): two lanes each censused a file honestly and
    /// both were stale, because each could only see its own half. Re-derive the dormancy on the
    /// MERGED tree before acting on it.</para>
    ///
    /// <para>⚠️ One sentence above is now stale in its REASON and kept for the argument it records:
    /// the residual-<c>None</c> note says the host's picker cannot send <c>None</c> because
    /// <c>ParseRoomType</c> whitelists the player-facing kinds. <c>ParseRoomType</c> no longer exists;
    /// the residual is unreachable for the stronger reason that NO host path constructs this command
    /// at all.</para></para>
    /// </summary>
    public sealed class AddRoomCommand : ISimCommand
    {
        private readonly int _deck;
        private readonly int _slotIndex;
        private readonly RoomType _type;
        private readonly Int3 _probe;
        private readonly string _anchorName;

        public AddRoomCommand(int deck, int slotIndex, RoomType type, Int3 probe, string anchorName)
        {
            _deck = deck; _slotIndex = slotIndex; _type = type; _probe = probe; _anchorName = anchorName;
        }

        public void Execute(Simulation sim)
        {
            if (string.IsNullOrEmpty(_anchorName)) return;
            if (!sim.World.InBounds(_probe) || _probe.Z != _deck) return;

            // Resolve the compartment on a CURRENT RoomId plane — a build finishing earlier in this
            // same command drain could have left it dirty (RecomputeIfDirty is a no-op when clean).
            var rooms = sim.Rooms;
            rooms.RecomputeIfDirty(sim);

            var room = rooms.RoomAt(sim.World, _probe);
            if (ReferenceEquals(room, rooms.Rooms[0])) return; // probe in open vacuum — not a sealed hall

            // ALREADY ALLOCATED? Ask the ANCHOR, never the gas (see the class remarks). RoomAt has
            // already ruled out room 0 and the DoorMarker, so roomId is a real room index here; an
            // anchor sitting on a door tile reads DoorMarker and can never match it. Room ids are
            // GLOBAL across decks (RoomState floods every level into one list), so no deck filter is
            // needed — and a hall MERGED into a furnished room by a stripped bulkhead is correctly
            // refused, because the merged room carries the furnished room's typed anchor.
            ushort roomId = rooms.RoomIdAt(sim.World, _probe);
            var anchors = rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
            {
                if (anchors[i].Type == RoomType.None) continue;   // an un-allocated hall's own anchor
                if (rooms.RoomIdAt(sim.World, anchors[i].Probe) == roomId) return;
            }

            // The ONE remaining effect: name + type the room (reuse the hall's own anchor — one
            // anchor per room). Air is the vent's job now, and the door is the player's.
            rooms.SetAnchor(_anchorName, _probe, _type);
        }
    }

    /// <summary>Edit terrain (M1: used by tests and the debug UI; designations arrive in M2).</summary>
    public sealed class SetTileCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly ushort? _floor;
        private readonly ushort? _wall;

        public SetTileCommand(Int3 pos, ushort? floor = null, ushort? wall = null)
        {
            _pos = pos; _floor = floor; _wall = wall;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;
            if (_floor.HasValue) sim.World.SetFloor(_pos, _floor.Value);
            if (_wall.HasValue) sim.World.SetWall(_pos, _wall.Value);
            sim.Rooms.MarkDirty();
            sim.Events.Publish(new TileChangedEvent { Pos = _pos });
        }
    }
}
