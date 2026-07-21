namespace Moonbase.Sim
{
    /// <summary>
    /// M3 food vertical (GDD §4.5 v0): grow beds turn power (LED light) + water +
    /// time into potatoes. A bed advances only while Powered AND its fluid network
    /// covers the water draw; otherwise progress holds (no decay in v0). At full
    /// progress a Potato item drops on the first walkable 4-neighbor of the bed.
    /// Registered after WaterSystem so fluid networks exist before the first draw.
    /// </summary>
    public sealed class HydroponicsSystem : ISimSystem
    {
        public string Name => "Hydroponics";
        public int IntervalTicks => 10; // 1 Hz

        private const float Dt = 1f; // seconds per hydroponics tick (structural, interval-paired)

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
                if (!WaterSystem.TryDrawWater(sim, bed.FluidNetworkId, hydro.GrowBedWaterPerSecond * Dt))
                    continue; // dry network: progress holds
                // ~80% of irrigation transpires and is recaptured as condensate.
                sim.WastewaterLiters += hydro.GrowBedWaterPerSecond * Dt * hydro.TranspirationRecaptureFraction;

                bed.Progress += Dt / hydro.GrowSecondsPerCrop;
                if (bed.Progress < 1f) continue;

                bed.Progress = 0f;
                Harvest(sim, bed);
            }
        }

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
