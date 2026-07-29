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
            // Water chain (E0-7). LifeSupport tier deliberately: the melter IS life support on a
            // ship whose only water source is ice, so it must be the LAST thing a brownout sheds,
            // not the first.
            // Draw is 0.4 kW — the Scrubber's figure, and NOT a physically honest one for melting
            // ice. PowerSystem.IsWanting makes every device pay its full draw around the clock
            // (ECONOMY.md §1.2) on a ship generating 12 kW against 19.1 kW of demand, so a draw is
            // really a tax on the brownout sawtooth that is the game's whole industrial throttle —
            // a bug shape, not a knob. MEASURED on HEAD, slice, 3 sim-days, one seed, melter draw
            // 0.0 / 0.4 / 1.0 kW: end-of-run Potato 699 / 696 / 504 and A1 28.146 % / 27.715 % /
            // 39.635 %. At 1.0 kW the melter costs 28 % of the ship's food AND inflates A1 by
            // ~11.9 pp of pure slowdown — the same work taking longer reads as busier crew.
            // Note 0.4 kW reads LOWER than 0.0 kW, which is the tell that the 1.0 figure was
            // slowdown and not work: nobody tuning a number upward lands on the smaller one.
            // Tuning a new device against a bug is still tuning against a bug — revisit upward when
            // the power model is fixed.
            /* IceMelter       */ new(0.4f,  0f,  PowerTier.LifeSupport, false, 0.4f,  0.012f, 0.4f, 0.10f),
            // The wreck start (W3). A cryogenic sleeper capsule. INERT — no system reads this kind
            // except the ones every kind goes through (power, thermal, wear, the glyph table).
            //
            // LifeSupport tier: a pod is life support for the person inside it, so it must be the
            // LAST thing a brownout sheds, not the first. ⚠ THE COST OF THAT CHOICE IS REAL AND IS
            // STATED RATHER THAN HIDDEN: the tier is served ALL-OR-NOTHING (PowerSystem.cs:203-215),
            // so --ship wreck's TWELVE pods put 2.4 kW into the same bucket as the vents and
            // scrubbers (COUNTED off AuthoredShips.WreckPods, not off the roster size — the eight
            // living souls sleep in eight of the twelve, and a wrecked pod draws exactly as much as
            // an intact one because PowerSystem.IsWanting is condition-blind), and a ship
            // whose LifeSupport want exceeds supply now loses its ATMOSPHERE as well as its
            // sleepers. --ship wreck is authored with 18 kW of generation against ~12.6 kW of total
            // demand for exactly this reason; a content pack that adds pods to a marginal ship must
            // re-check its own power budget.
            //
            // draw 0.2 kW / heat 0.15 kW: the smallest non-trivial pair in the table. Deliberately
            // low, and NOT a physical estimate — PowerSystem.IsWanting makes every device pay its
            // full draw around the clock (ECONOMY.md §1.2), so a draw is a tax on the brownout
            // sawtooth rather than a load, and eight of anything multiplies whatever number is put
            // here. The heat is what keeps the wreck's cryo bay above hypothermia_c without a
            // heater (there is no heater device in the game) — MEASURED, not argued: see
            // AuthoredShips.PeriluneWreck's header for the driven day-1/3/10 temperature census.
            //
            // wear 0.001/h is the Terminal/Light/WaterTank figure, the lowest non-zero rate in the
            // table: a dormant pressure vessel is the least demanding thing on a ship. An intact
            // pod takes ~700 operating hours (~29 sim-days) to fall from 1.0 to `maint`, so pods do
            // not compete for the crew's attention in the opening.
            //
            // ⚠️ maint 0 IS THE OPT-OUT AND IT IS THE ONLY MEASURED VALUE IN THIS ROW. A CryoPod is
            // the first kind in the table that is never serviced by the standing rule and can still
            // FAIL (0 / 0.10). MaintenanceSystem skips any device whose Condition is at or above
            // `maint`, and Condition is never negative, so 0 removes pods from the board entirely.
            //
            // THE FIRST DRAFT SET maint 0.30 "mirroring Door and Battery", and DRIVING --ship wreck
            // for one sim-day is what showed why that was wrong: the wreck's opening stock is
            // 1 Parts + 2 Seals, the four wrecked pods are the four LOWEST-Condition devices on the
            // ship, and MaintenanceSystem recruits neediest-first. Measured, unattended, no player
            // input at all: the first Maintain job starts at TICK 201, and by the end of sim-day 1
            // Parts 1 -> 0, Seals 2 -> 0, pod_iqbal 0.03 -> 1.00, pod_vance 0.04 -> 0.90,
            // pod_osei 0.06 -> 0.90. THE ENTIRE CONSUMABLE STOCK OF THE OPENING WAS SPENT ON DEAD
            // SLEEPERS' COFFINS BEFORE THE PLAYER TOUCHED ANYTHING, and three of the four wrecked
            // capsules stopped reading as wrecked inside a day.
            //
            // With maint 0 the same driven day spends the same stock on SHIP PLANT instead —
            // wing_c 0.06 -> 0.99 (the Parts overhaul), battery_2 0.09 -> 0.89 and light_reactor
            // 0.09 -> 0.90 (the two Seals) — and all four capsules hold at 0.04 / 0.07 / 0.03 /
            // 0.06. The fix is not "stop maintaining things"; it is "a coffin is not plant".
            //
            // ⇒ Repairing a pod is a PLAYER act (W5's thaw work), not a standing rule. That is a
            // design statement, so it belongs in the def rather than in a special case inside
            // MaintenanceSystem — and DefsParser had to learn that `maint = 0` is an opt-out rather
            // than a threshold, because its fail<=maint clamp was rewriting this row's fail to 0.
            //
            // fail 0.10 is unchanged: below it a pod is INOPERATIVE and the glyph layer paints it
            // GlyphColor.Broken, which is the whole of how a wrecked capsule reads as dead.
            // The cost of the opt-out, stated: a pod now has NO free-jury-rig band at all, so it
            // has left `WreckThresholdTests`'s narrow-band set. Nothing repairs a pod today.
            /* CryoPod         */ new(0.2f,  0f,  PowerTier.LifeSupport, false, 0.15f, 0.001f, 0f, 0.10f),
        };

        public static MachineDef Of(DeviceKind kind) => Table[(int)kind];
        public static int Count => Table.Length;

        /// <summary>Heat rejection capacity of a powered, operational radiator.</summary>
        public const float RadiatorRejectKW = 5f;
    }
}
