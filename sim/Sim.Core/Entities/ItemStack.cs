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
        Ice = 8,        // E0-7: hold cargo / comet harvest. Melted to potable water by an IceMelter.
                        // The integrator pre-assigned 7 to E0-6 and 8 to E0-7 before the two lanes
                        // spawned; E0-7 developed against a tree where 7 was reserved-but-absent and
                        // deliberately left the hole rather than renumbering, because a byte enum in
                        // a hashed save is append-only and a renumber silently re-labels every stack
                        // in every existing save. The wave merge closed the hole: 0..8 contiguous.
        Swarf = 9,      // The recovery economy (wreck start, owner decision 3): what a machine too
                        // far gone for Parts pays when it is STRIPPED. ECONOMY.md §3.2 row 9 names it
                        // "maintenance and machining residue"; here it is the shredded remains of a
                        // shot-up machine, and it is the ONLY thing the dead half of a raided ship
                        // yields.
                        //
                        // ⚠️ IT IS A TERMINAL CURRENCY BY CONSTRUCTION, AND THAT IS THE CONSERVATION
                        // PROOF. Swarf has exactly ONE source (DeconstructSystem's wreck yield) and
                        // exactly ONE sink (MaintenanceSystem's bottom rung). No production node, no
                        // recipe and no command converts it into Parts, Scrap or Regolith, so the
                        // place->strip round trip stays priced entirely in Parts — 3 out
                        // (build.device_place_cost), at most 2 back — exactly as E0-5 WP-3 left it.
                        // See production.def for why the bench bill that WOULD convert it (E1's
                        // `recycle_swarf`) cannot ship yet: CraftingSystem runs ORDINAL 0 only, and
                        // all three benches already have a bill.
    }

    // ⚠ EVERY MASK OVER THIS ENUM MUST BE DERIVED FROM ITS VALUES, NEVER FROM ITS MEMBER COUNT.
    // Bit k of a stockpile accept mask means "kind k". While the wave was in flight the enum had a
    // hole at 7 (E0-6 unlanded), and a count-derived "accept everything" ((1<<8)-1 = 0xFF) set bit 7
    // (nothing) and cleared bit 8 (Ice) — every stockpile would have silently refused Ice. E0-7
    // measured that and corrected it to OR the declared values. All four independent derivations in
    // the tree are value-derived and were verified so on the merged tree:
    //   sim/Sim.Core/Stock/StockZoneSystem.cs   ComputeAcceptAllMask  (already was)
    //   hosts/web/GameSession.cs                ComputeAcceptAllMask  (corrected by E0-7)
    //   hosts/tui/Ui/StockFilterModel.cs        BuildAcceptAllMask    (corrected by E0-7)
    //   client/src/ui/stock-filter-model.js     ACCEPT_ALL            (corrected by E0-7)
    // (client/src/ui/zone-model.js has no derivation of its own — it imports ACCEPT_ALL.)
    // The merge made the enum contiguous, so a count-derived mask now works BY ACCIDENT — the defect
    // is invisible rather than fixed, and the next appended kind that leaves a hole (a deprecated
    // slot, another two-lane wave) resurrects it. Keep them value-derived.

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
