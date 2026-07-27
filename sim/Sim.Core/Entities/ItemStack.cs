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
        // 7 = Seals, RESERVED for E0-6 (ECONOMY.md §3.2 stages the new kinds; the integrator
        //     pre-assigned the slot before the two lanes spawned). E0-7 deliberately took 8 and
        //     left the hole rather than renumbering — a byte enum in a hashed save is append-only
        //     and a renumber silently re-labels every stack in every existing save.
        Ice = 8,        // E0-7: hold cargo / comet harvest. Melted to potable water by an IceMelter.
    }

    // ⚠ THE GAP AT 7 IS LOAD-BEARING FOR EVERY MASK OVER THIS ENUM. Bit k of a stockpile accept
    // mask means "kind k", so a mask derived from the enum's member COUNT ((1<<8)-1 = 0xFF) sets
    // bit 7 (which is nothing) and clears bit 8 (which is Ice) — "accept everything" would refuse
    // the one kind this package adds. Every mask must be derived from the enum's VALUES:
    // StockZoneSystem.ComputeAcceptAllMask already was; hosts/tui StockFilterModel and the client's
    // stock-filter-model.js were count-derived and were corrected by E0-7.

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
