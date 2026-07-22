namespace Perilune.Sim
{
    /// <summary>
    /// M3 food vertical (GDD §4.5 v0), 1 Hz: grow beds turn power (LED light) + water +
    /// time into potatoes. A bed advances only while Powered AND operational AND its
    /// fluid network covers the water draw; otherwise progress HOLDS — there is no
    /// decay, no wilting and no crop loss in v0, so an unpowered bed is merely paused.
    /// At full progress a Potato item drops on the first walkable 4-neighbor of the bed.
    ///
    /// Units and tuning (`content/core/SimDefs/hydro.def` [hydro]):
    /// `grow_bed_water_per_second` L/s drawn per bed, `grow_seconds_per_crop` seconds of
    /// POWERED-AND-WATERED time per potato (600 s — an explicit dev rate, not a plausible
    /// agricultural one), `transpiration_recapture_fraction` of that draw returned to the
    /// greywater pool. The bed's electrical draw and tier are `machines.def` GrowBed
    /// (Industry tier — sheds before life support, so a strained ship starves before it
    /// suffocates). Dt is structural, not tunable.
    ///
    /// Water bookkeeping: every litre drawn leaves the tanks, and the recaptured
    /// fraction returns to <see cref="Simulation.WastewaterLiters"/> for the reclaimer
    /// to re-purify at `water.def reclaim_efficiency`. With shipped values the round
    /// trip returns 0.8 × 0.93 ≈ 0.74 of each irrigated litre. Drinking leaks too (it
    /// returns the full volume to the pool, then loses the reclaimer's 7%), but
    /// irrigation loses roughly a quarter per cycle against drinking's fourteenth — so
    /// growing food, not drinking, is what runs a closed ship dry.
    ///
    /// Ordering: registered AFTER <see cref="WaterSystem"/> so
    /// <see cref="Device.FluidNetworkId"/> is fresh before the first draw, and after
    /// <see cref="PowerSystem"/> so Powered reflects this tick's brownout.
    ///
    /// Determinism/allocation: device store order, no RNG. The growth path allocates
    /// nothing, but a completed cycle does — <see cref="Harvest"/> goes through
    /// <see cref="Simulation.AddItem"/>, which news up an ItemStack; that is once per
    /// `grow_seconds_per_crop` (600 s) of powered-and-watered time per bed, not per
    /// tick. State lives on the Device (<see cref="Device.Progress"/>, saved DEVC v2 and
    /// hashed by Simulation) plus the tank litres WaterSystem owns, so this is NOT an
    /// <see cref="IStatefulSystem"/>.
    /// </summary>
    public sealed class HydroponicsSystem : ISimSystem
    {
        public string Name => "Hydroponics";
        public int IntervalTicks => 10; // 1 Hz

        /// <summary>Seconds per pass; structural, paired with <see cref="IntervalTicks"/>.</summary>
        private const float Dt = 1f;

        // GrowBedWaterPerSecond (0.02 L/s), GrowSecondsPerCrop (600 s DEV RATE — not the
        // GDD's 12-day cycle) and the transpiration-recapture fraction (0.8) now live in
        // sim.Defs.Hydro (SimDefs.Default reproduces the former consts). Tick reads them
        // each pass so parallel sims with different defs never cross-talk.

        public void Tick(Simulation sim)
        {
            var hydro = sim.Defs.Hydro;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var bed = devices[i];
                if (bed.Kind != DeviceKind.GrowBed) continue;
                if (!bed.Powered || !bed.IsOperational(sim.Defs)) continue; // dark/broken bed: progress holds
                // All-or-nothing draw: a bed on a network that cannot cover the full
                // second takes nothing and grows nothing, rather than sipping. Beds
                // therefore starve in store order — the first bed on a nearly-dry
                // network keeps growing while later ones stall.
                if (!WaterSystem.TryDrawWater(sim, bed.FluidNetworkId, hydro.GrowBedWaterPerSecond * Dt))
                    continue; // dry network: progress holds
                // ~80% of irrigation transpires and is recaptured as condensate.
                sim.WastewaterLiters += hydro.GrowBedWaterPerSecond * Dt * hydro.TranspirationRecaptureFraction;

                // Progress is 0..1 fraction-of-a-crop, not seconds — so retuning
                // GrowSecondsPerCrop mid-run rescales what a saved bed has left rather
                // than invalidating it.
                bed.Progress += Dt / hydro.GrowSecondsPerCrop;
                if (bed.Progress < 1f) continue;

                bed.Progress = 0f; // overshoot is discarded; a bed yields exactly one crop per cycle
                Harvest(sim, bed);
            }
        }

        /// <summary>
        /// Drop one Potato beside the bed. <see cref="Simulation.AddItem"/> does NOT
        /// merge — every harvest is a fresh single-count stack, so a long-running bed
        /// leaves many co-located stacks on one tile, each separately reservable by a
        /// hauler or an eater. AddItem sets JobsDirty, so JobSystem re-derives the haul
        /// board and sees the crop on the next pass. <see cref="SustenanceSystem"/> needs
        /// no such signal — it never reads JobsDirty (JobSystem is the flag's only
        /// reader) and rescans the item store from scratch on every 1 Hz pass.
        /// </summary>
        private static void Harvest(Simulation sim, Device bed)
        {
            // First walkable 4-neighbor in canonical order; if none, drop on the
            // bed's own tile — items on blocked tiles are legal, hauling handles
            // reachability. Harvest is a Notice, not an alarm: no event in v0.
            var dropPos = bed.Pos;
            for (int n = 0; n < 4; n++)
            {
                var q = Int3.Neighbor4(bed.Pos, n);
                if (sim.World.InBounds(q) && sim.IsWalkable(q))
                {
                    dropPos = q;
                    break;
                }
            }
            sim.AddItem(ItemKind.Potato, 1, dropPos);
        }
    }
}
