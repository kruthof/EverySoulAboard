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
            // STATED RATHER THAN HIDDEN: the tier is served ALL-OR-NOTHING (PowerSystem.cs:253-265),
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
            // M3-10 — THE HEATER. The Radiator's row, sign-flipped, and every column is a decision:
            //
            // heat 0 IS NOT AN OVERSIGHT, it is the same choice the Radiator's row makes. The
            // `heat` column is WASTE heat, emitted unconditionally by ThermalSystem's generic arm
            // and NOT scaled by Device.EffectiveRate. A heater's heat is its PRODUCT, not its
            // waste, so it rides `heater_output_kw` through ThermalSystem's own arm — which is
            // condition-scaled (the M2-12 generation precedent: a worn machine produces less).
            // Putting the output in this column instead would have made a heater at Condition 0.11
            // exactly as strong as one at 1.00, and would have double-counted against the ceiling.
            //
            // ⛔⚠ TIER IS LifeSupport AS A SHIPPED INTERIM, AND THE QUESTION IS OPEN ON THE OWNER.
            // The first version of this row justified LifeSupport with a claim labelled MEASURED
            // that was FALSE, and it is quoted rather than deleted because the way it was wrong is
            // the lesson: "--ship wreck runs 9.78 kW against LifeSupport 6.20 / Defense 0.90 /
            // Industry 6.50 / Comfort 1.20, so Industry and Comfort are ALREADY SHED and still shed
            // on day 10 => an Industry heater would be DEAD ON ARRIVAL".
            //
            // THE DEMAND FIGURES ARE RIGHT AND THE CONCLUSION IS WRONG, because the tier walk does
            // NOT decide against generation. PowerSystem.cs:246-247 sets
            // `supply = generation + batteryKW` where `batteryKW = storedKWh * 3600` — a battery
            // holding ANY charge bridges the whole ship for a pass — so the wreck runs a BROWNOUT
            // SAWTOOTH and a single end-of-run sample of Powered reads whichever phase it landed in.
            // The false claim was that one sample. RE-MEASURED PROPERLY, driven, unattended, ten
            // sim-days, sampling every 10 sim-minutes (1 440 samples):
            //     recycler_1 / machineshop_1 / fabricator_1  (Industry, wired)   36.1 % powered
            //     growbed_1 / growbed_2 / telescope_1 / machineshop_2            NetworkId 0 — never
            //         wired at all, so their 0 % is about the ship's cabling and not about tiers
            //     the eight deck-0 doors (Defense, wired)                       100.0 % powered
            // => AN INDUSTRY-TIER HEATER WOULD RUN AT ROUGHLY 36 % DUTY: WEAK, NOT INERT. That is a
            // different device — a heater that stops every few minutes and lets the compartment
            // drift back down — and whether the player should get the weak-but-safe one or the
            // always-on-but-dangerous one is a DESIGN choice, not an arithmetic result. It is FILED
            // for the owner (docs/MECHANICS.md §13.36) with these numbers. LifeSupport ships as the
            // interim because it is the smallest reversible decision: one word in three rows.
            //
            // THE COST OF LifeSupport, MEASURED BY DRIVING IT rather than computed. The tier is
            // served ALL-OR-NOTHING (PowerSystem.cs:253-265). Three sim-days per arm, 432 samples,
            // N heaters added to a COPY of the wreck's plan, watching the wired deck-0 doors
            // (Defense) and machineshop_1 (Industry):
            //     N=0   doors 100.0 %   machineshop 35.9 %   LifeSupport 95.7 %
            //     N=1   doors 100.0 %   machineshop 15.5 %   LifeSupport 95.8 %
            //     N=2   doors 100.0 %   machineshop 16.4 %   LifeSupport 96.0 %
            //     N=3   doors  84.7 %   machineshop  3.7 %   LifeSupport 96.2 %   <- Defense sheds
            //     N=4   doors  31.0 %   machineshop 21.3 %   LifeSupport 81.1 %   <- LIFE SUPPORT sheds
            // => TWO heaters are free of tier damage; the THIRD starts shedding DEFENSE (the eight
            // deck-0 doors); the FOURTH starts shedding LIFE SUPPORT itself. The earlier note said
            // three were comfortable and the fourth took the vents — it understated the cost by one
            // tier, because it computed the ladder from the demand figures instead of driving it.
            // What every arm DOES pay from N=1 is Industry and Comfort duty (36 % -> ~16 %), which
            // is the honest headline: a heater is bought with the crafting benches' uptime.
            // Repairing the solar wings is what buys the next one. Not a hidden trap: PowerSystem
            // publishes BrownoutChangedEvent when it flips.
            //
            // draw 1.0 kW against 5.0 kW of output is NOT a resistive element and is not claimed
            // to be. It is the sign-flip of the abstraction this table already ships: a Radiator
            // moves 5 kW OUT for 0.2 kW. And per ECONOMY.md §1.2 a `draw` is a tax on the brownout
            // sawtooth charged around the clock (PowerSystem.IsWanting is state-blind, so an idle
            // heater sitting at the ceiling still pays), which makes this column a pacing knob
            // rather than a load. 1.0 kW is what makes the ladder above land where it does.
            //
            // wear 0.006/h + maint 0.40 + fail 0.10 are the Radiator's, unchanged: same class of
            // thermal plant, so a heater joins the standing maintenance rule on the same terms and
            // sits in the free-jury-rig band [wear.wreck_threshold 0.25, 0.40) the same way.
            /* Heater          */ new(1.0f,  0f,  PowerTier.LifeSupport, false, 0f,    0.006f, 0.4f, 0.10f),
        };

        public static MachineDef Of(DeviceKind kind) => Table[(int)kind];
        public static int Count => Table.Length;

        /// <summary>Heat rejection capacity of a powered, operational radiator.</summary>
        public const float RadiatorRejectKW = 5f;

        /// <summary>Heat a powered, operational <see cref="DeviceKind.Heater"/> pushes into its
        /// room, kW, before <see cref="Device.EffectiveRate"/> scaling (M3-10).
        ///
        /// <para>THE MAGNITUDE IS THE RADIATOR'S, DELIBERATELY: the two devices are a matched
        /// pair, so one heater cancels one radiator and a player can reason about a compartment
        /// without arithmetic. It is also DRIVEN rather than guessed. A room's heat capacity is
        /// TileCount × 53 kJ/K, and --ship wreck's compartments measure 40 / 60 / 86 tiles
        /// (2.12 / 3.18 / 4.56 MJ/K). At 5 kW, net of the hull term, one heater lifts the 60-tile
        /// reactor bay out of hypothermia (-14 C → above -10 C) in ~46 sim-minutes and to the
        /// 21 C ceiling in ~7 sim-hours — 28 s and 4 min of wall clock at the web host's 100×,
        /// which is what "in a playable time" has to mean on a ship this size. At the Radiator's
        /// own 0.2 kW-class output it would have been days.</para></summary>
        public const float HeaterOutputKW = 5f;
    }
}
