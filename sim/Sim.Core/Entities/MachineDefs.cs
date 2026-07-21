namespace Perilune.Sim
{
    /// <summary>
    /// Data definition for a machine kind (SIMULATION_ARCHITECTURE: "everything data
    /// driven"). One row per DeviceKind: power, tier, movement, waste heat, wear.
    /// </summary>
    public readonly struct MachineDef
    {
        public readonly float DrawKW;            // consumption while wanting power
        public readonly float GenerationKW;      // production
        public readonly PowerTier Tier;
        public readonly bool Blocks;             // occupies its tile (side-view world: machines
                                                 // are passable — the crew steps around them in
                                                 // the abstracted beam axis; doors stay dynamic)
        public readonly float HeatKW;            // waste heat into the room while operating
        public readonly float WearPerHour;       // condition loss per operating hour at nominal temp
        public readonly float MaintainBelow;     // wants a maintenance job below this condition
        public readonly float FailBelow;         // inoperative below this condition

        public MachineDef(float drawKW, float generationKW, PowerTier tier, bool blocks,
                          float heatKW, float wearPerHour, float maintainBelow, float failBelow)
        {
            DrawKW = drawKW; GenerationKW = generationKW; Tier = tier; Blocks = blocks;
            HeatKW = heatKW; WearPerHour = wearPerHour; MaintainBelow = maintainBelow; FailBelow = failBelow;
        }
    }

    public static class MachineDefs
    {
        // Index = (int)DeviceKind, keep in enum order. This table is only the DEFAULT
        // source that SimDefs.CreateDefault copies verbatim (overridable via
        // StreamingAssets/SimDefs/machines.def). Determinism consumers read
        // sim.Defs.Machines — do NOT add new sim reads here; the static table survives
        // solely for the frozen Game.View display path (Device.DrawKW).
        private static readonly MachineDef[] Table =
        {
            //                         draw   gen  tier                   blocks heat  wear/h maint  fail
            /* Door            */ new(0.1f,  0f,  PowerTier.Defense,     false, 0.05f, 0.002f, 0.3f, 0.05f),
            /* AirVent         */ new(0.5f,  0f,  PowerTier.LifeSupport, false, 0.2f,  0.010f, 0.4f, 0.10f),
            /* Scrubber        */ new(0.4f,  0f,  PowerTier.LifeSupport, false,  0.4f,  0.012f, 0.4f, 0.10f),
            /* Ladder          */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* Terminal        */ new(0.1f,  0f,  PowerTier.Defense,     false,  0.1f,  0.001f, 0.2f, 0.02f),
            /* SolarWing       */ new(0f,    6f,  PowerTier.Comfort,     false,  0f,    0.004f, 0.4f, 0.10f),
            /* Battery         */ new(0f,    0f,  PowerTier.Comfort,     false,  0.1f,  0.002f, 0.3f, 0.05f),
            /* Conduit         */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* Light           */ new(0.15f, 0f,  PowerTier.Comfort,     false, 0.15f, 0.001f, 0.2f, 0.02f),
            /* GrowBed         */ new(0.6f,  0f,  PowerTier.Industry,    false,  0.5f,  0.008f, 0.4f, 0.10f),
            /* WaterTank       */ new(0f,    0f,  PowerTier.Comfort,     false,  0f,    0.001f, 0.2f, 0.02f),
            /* Pipe            */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* Reclaimer       */ new(0.8f,  0f,  PowerTier.LifeSupport, false,  0.6f,  0.012f, 0.4f, 0.10f),
            /* Fabricator      */ new(3f,    0f,  PowerTier.Industry,    false,  2.5f,  0.020f, 0.4f, 0.10f),
            /* MachineShop     */ new(2f,    0f,  PowerTier.Industry,    false,  1.6f,  0.020f, 0.4f, 0.10f),
            /* SalvageRecycler */ new(1.5f,  0f,  PowerTier.Industry,    false,  1.2f,  0.018f, 0.4f, 0.10f),
            /* Radiator        */ new(0.2f,  0f,  PowerTier.LifeSupport, false,  0f,    0.006f, 0.4f, 0.10f),
            // Furniture: inert rows (no draw/heat/wear), like Ladder.
            /* Bed             */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* Table           */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* Chair           */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* MedBed          */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* MedCabinet      */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* Locker          */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* Desk            */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* PlantPot        */ new(0f,    0f,  PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
            /* Telescope       */ new(0.4f,  0f,  PowerTier.Industry,    false, 0.2f,  0.004f, 0.4f, 0.10f),
        };

        public static MachineDef Of(DeviceKind kind) => Table[(int)kind];
        public static int Count => Table.Length;

        /// <summary>Heat rejection capacity of a powered, operational radiator.</summary>
        public const float RadiatorRejectKW = 5f;
    }
}
