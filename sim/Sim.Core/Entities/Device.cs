namespace Perilune.Sim
{
    public enum DeviceKind : byte
    {
        Door = 0,
        AirVent = 1,     // injects breathable mix into its room while open (M1: from an infinite reserve)
        Scrubber = 2,    // removes CO2 from its room while powered
        Ladder = 3,      // links its tile to the tile directly above for pathfinding
        Terminal = 4,    // hosts MOSS programs
        SolarWing = 5,   // power producer (surface solar line; abstracted until surface exists)
        Battery = 6,     // stores energy, bridges deficits
        Conduit = 7,     // power line tile; networks are connected components of conduits
        Light = 8,       // room luminaire; Powered drives the visual state (full/emergency)
        GrowBed = 9,     // hydroponics: grows crops while powered + watered
        WaterTank = 10,  // stores potable water (liters)
        Pipe = 11,       // water line tile; networks are connected components of pipes
        Reclaimer = 12,  // recycles wastewater back into the tank network (ISS-class 93%)
        Fabricator = 13, // crafting: scrap -> parts
        MachineShop = 14,// crafting: parts -> devices / controller modules
        SalvageRecycler = 15, // crafting: debris salvage -> scrap
        Radiator = 16,   // rejects room heat to space while powered (ThermalSystem)
        // Furniture (inert: no power/heat/wear; placed by the Sim.Gen RoomDresser).
        Bed = 17,        // crew bunk (rest anchor; behavior lands with the needs pass)
        Table = 18,      // mess/commons table
        Chair = 19,      // seat, paired to tables by the dresser
        MedBed = 20,     // clinical bed (medbay)
        MedCabinet = 21, // medical supply cabinet (medbay)
        Locker = 22,     // personal wardrobe (cabins)
        Desk = 23,       // personal desk (cabins)
        PlantPot = 24,   // decorative plant (cabins, commons, observatory)
        // Sensors (space layer, WS-NAV).
        Telescope = 25,  // resolves space contacts by SNR while powered (NavSystem)
        // Water chain (E0-7). Appended at the END of the enum, never inserted.
        IceMelter = 26,  // crafting station: consumes ItemKind.Ice, buffers the meltwater in
                         // StoredLiters, and WaterSystem pushes that buffer onto its fluid network
        // The wreck start (W3). Appended at the END of the enum, never inserted.
        CryoPod = 27,    // a cryogenic sleeper capsule. NO LONGER INERT since M3-2: `CryoSystem`
                         // (Systems/CryoSystem.cs) cycles a pod — Progress counts down, the pod
                         // opens, and a named person is added as a live Citizen. What still does
                         // NOT exist is a PLAYER VERB: no ThawCommand (M3-3), no MOSS thaw op
                         // (M3-3), no countdown badge (M3-4), no emergency thaw (M3-5). Nothing on
                         // the shipping ship starts a cycle, so a pod that will not open is still
                         // correct in play today — but it is now a mechanic with no driver rather
                         // than furniture.
                         //
                         // State lives on fields Device already hashes and saves — `IsOpen` (open
                         // vs occupied, and a pod is SINGLE-USE so an open one is done forever),
                         // `Name` (who is inside), `Condition` (how badly the raid treated it),
                         // `Progress` (the cycle). NO new Device field — see docs/MECHANICS.md
                         // §13.27 (identity) and §13.29 (the cycle).
    }

    /// <summary>Brownout shed order: lowest tier is shed first (TDD §3.7).</summary>
    public enum PowerTier : byte
    {
        Comfort = 0,     // lights
        Industry = 1,    // (workshops, M3)
        Defense = 2,     // doors (motorized assist; doors still work by hand)
        LifeSupport = 3, // vents, scrubbers
    }

    /// <summary>
    /// Doors, vents, scrubbers, ladders, terminals, turrets — every interactive
    /// machine is a Device with a kind and a small shared state surface.
    /// `Name` is the player-facing (and MOSS-addressable) identifier.
    /// </summary>
    public sealed class Device : IEntity
    {
        public uint Id { get; set; }
        public DeviceKind Kind;
        public Int3 Pos;
        public string Name = "";
        public bool IsOpen;    // doors, vents
        public bool IsLocked;  // doors

        /// <summary>Who holds the lock: 0 = player/crew, 1 = the Lien. A non-zero owner
        /// makes the lock refuse player/MOSS commands until the zone is captured
        /// (AccessSystem, raider milestone; saved DEVC v4).</summary>
        public byte LockOwner;
        public bool Powered = true; // owned by PowerSystem once the device is on a network
        public float Rate = 1f; // generic throughput multiplier (0..1)
        public float StoredKWh;    // batteries
        public float StoredLiters; // water tanks; ALSO an IceMelter's meltwater buffer (E0-7 —
                                   // reusing this already-saved, already-hashed field is why the
                                   // whole ice chain adds no new hashed state)
        public float Progress;     // generic work/growth progress 0..1 (grow beds, crafting)
        public float Condition = 1f; // machine wear state 1=pristine..0=wrecked (MachineDefs thresholds)
        public ushort NetworkId;   // 0 = not on any power network
        public ushort FluidNetworkId; // 0 = not on any water network

        /// <summary>
        /// E0-6 — has a <see cref="ItemKind.ControllerModule"/> been fitted to this device?
        /// <c>MossBindings.RegisterAdapters</c> registers a MOSS adapter ONLY for a scriptable
        /// device, and <see cref="SetScriptCommand"/> refuses to install a program on a terminal
        /// that is not one. Saved DEVC v5, hashed (bit 11 of the device state word).
        ///
        /// <b>DEFAULTS TRUE, and that is a decision rather than an oversight.</b> Every device the
        /// ship was AUTHORED or GENERATED with came commissioned — the fiction is that the ship
        /// left the yard with its own automation fitted — so `--ship grid`, `--ship slice`,
        /// `--ship perilune`, every procedural ship, every existing MOSS program, every designer
        /// rule and every pre-E0-6 save behave exactly as they did. What is NOT commissioned is
        /// what the PLAYER bolts on: <see cref="PlaceDeviceCommand"/> clears this flag, so a
        /// growbed the player places is a working growbed that MOSS cannot see until a
        /// <see cref="CommissionDeviceCommand"/> spends a module on it. That is the whole sink,
        /// and it is why the default cannot be false: a false default would silently unbind every
        /// adapter on every ship in the repo and read as a catastrophic regression.
        ///
        /// A pre-v5 save reads TRUE for the same reason (SaveReader): those devices were all
        /// addressable when the save was written, and restoring them un-addressable would delete
        /// the player's automation on load with no error anywhere.
        /// </summary>
        public bool Scriptable = true;

        public const float BatteryCapacityKWh = 40f;

        /// <summary>Below the fail threshold a machine is inoperative until maintained.
        /// Reads the machine table from the sim's tuning graph (B3: consumers read
        /// <c>sim.Defs</c>, never the static default table).</summary>
        public bool IsOperational(SimDefs defs) => Condition >= defs.Machines[(int)Kind].FailBelow;

        /// <summary>Condition-scaled throughput: a worn machine works, but poorly.</summary>
        public float EffectiveRate => Rate * (0.5f + 0.5f * Condition);

        /// <summary>Consumption draw in kW by kind (0 = passive). Reads the compiled
        /// DEFAULT table — retained only for Game.View's frozen display code
        /// (Iso/LensSampler), which has no <c>SimDefs</c> in scope. Determinism systems
        /// read <c>sim.Defs.Machines[(int)kind].DrawKW</c> directly.</summary>
        public static float DrawKW(DeviceKind kind) => MachineDefs.Of(kind).DrawKW;
    }
}
