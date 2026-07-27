namespace Perilune.Sim
{
    public enum ItemKind : byte
    {
        Regolith = 0,   // legacy name: debris spoil from cleared sections
        MetalOre = 1,
        Corpse = 2,
        Potato = 3,     // raw food, ~800 kcal per stack unit
        Scrap = 4,      // salvage input (from debris via SalvageRecycler)
        Parts = 5,      // Fabricator output, MachineShop input
        ControllerModule = 6, // makes one device MOSS-scriptable (GDD §6 ladder step 4)
        Seals = 7,      // E0-6: the cheap, high-turnover maintenance tier (ECONOMY.md §3.2 row 7 —
                        // "filters and gaskets"). Produced by the Fabricator beside Parts; consumed
                        // by MaintenanceSystem as the rung between a Parts overhaul and a jury-rig.
    }

    /// <summary>An item stack lying on a tile (or carried — then Pos mirrors the carrier).</summary>
    public sealed class ItemStack : IEntity
    {
        public uint Id { get; set; }
        public ItemKind Kind;
        public int Count = 1;
        public Int3 Pos;
        public uint CarriedBy;      // 0 = on the ground
        public uint ReservedBy;     // 0 = free; else the entity id (citizen or crafting station)
                                    // that claimed this stack. Owner-scoped so a release can never
                                    // clear another claimant's hold on a co-located tile (B-1).
        public string Label = "";   // identity for corpses ("Okafor"), flavor for salvage
    }
}
