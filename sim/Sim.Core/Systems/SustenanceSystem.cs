using System;

namespace Moonbase.Sim
{
    /// <summary>
    /// M3 self-serve needs (GDD §4.8): idle citizens seek water tanks and ground
    /// potatoes when Thirst/Hunger cross 0.5. Registered AFTER JobSystem — working
    /// citizens are never stolen mid-job (they eat when they next go idle), and
    /// JobSystem's switch ignores Eat/Drink so this system alone owns them.
    /// Non-wandering citizens (AutoWander=false) still self-serve while idle, but
    /// HoldPosition citizens never do — under strict player control the player owns
    /// survival (order them to food/water). Thirst outranks hunger.
    ///
    /// Determinism: citizens/devices/items iterated in store order, nearest-by-
    /// Manhattan with strict '&lt;' (ties resolve to store order), generation-stamped
    /// candidate passes as in JobSystem, no RNG, no LINQ. Steady state (no needy
    /// citizens) does not allocate.
    /// </summary>
    public sealed class SustenanceSystem : ISimSystem
    {
        public string Name => "Sustenance";
        public int IntervalTicks => 10; // 1 Hz

        // DrinkLiters (0.5 L), PotatoHungerValue (0.36 = 800/2,200 kcal, GDD §5) and
        // NeedThreshold (0.5 self-serve trigger) now live in sim.Defs.Sustenance
        // (SimDefs.Default reproduces the former consts). Every serve path reads them
        // each pass so parallel sims with different defs never cross-talk.

        // "Tried and failed during the current selection pass" stamps (JobSystem
        // pattern): one slot per store entry, generation counter instead of clears.
        private long[] _deviceTried = new long[64];
        private long[] _itemTried = new long[64];
        private long _gen;

        public void Tick(Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                if (citizen.Dead) continue;

                switch (citizen.JobKind)
                {
                    case JobKind.None:
                        if (citizen.IsIdleForWork) TryStartNeed(sim, citizen);
                        else if (citizen.HoldPosition && !citizen.Dead && !citizen.HasPath)
                            TryServeInPlace(sim, citizen);
                        break;
                    case JobKind.Drink:
                        ProgressDrink(sim, citizen);
                        break;
                    case JobKind.Eat:
                        ProgressEat(sim, citizen);
                        break;
                }
            }
        }

        // ------------------------------------------------------------- assignment

        private void TryStartNeed(Simulation sim, Citizen citizen)
        {
            float needThreshold = sim.Defs.Sustenance.NeedThreshold;
            // Thirst first; if no tank can serve, still try to eat — a citizen who
            // cannot drink should not also starve waiting for water.
            if (citizen.Thirst >= needThreshold && TryStartDrink(sim, citizen)) return;
            if (citizen.Hunger >= needThreshold) TryStartEat(sim, citizen);
        }

        /// <summary>
        /// Nearest stocked WaterTank (Manhattan; ties: store order) with a reachable
        /// walkable 4-neighbor. Unreachable candidates are stamped and the
        /// next-nearest tried, so the loop always terminates.
        /// </summary>
        private bool TryStartDrink(Simulation sim, Citizen citizen)
        {
            float drinkLiters = sim.Defs.Sustenance.DrinkLiters;
            var devices = sim.Devices.Items;
            EnsureSize(ref _deviceTried, devices.Count);
            _gen++;

            while (true)
            {
                int best = -1, bestDist = int.MaxValue;
                for (int i = 0; i < devices.Count; i++)
                {
                    if (_deviceTried[i] == _gen) continue;
                    var d = devices[i];
                    if (d.Kind != DeviceKind.WaterTank || d.StoredLiters < drinkLiters)
                    {
                        _deviceTried[i] = _gen;
                        continue;
                    }
                    int dist = Int3.Manhattan(citizen.Pos, d.Pos);
                    if (dist < bestDist)
                    {
                        bestDist = dist;
                        best = i;
                    }
                }
                if (best < 0)
                {
                    citizen.ClearPath(); // normalize after any failed FindPath attempts
                    return false;
                }

                var tank = devices[best];
                if (TryPathToAdjacent(sim, citizen, tank.Pos))
                {
                    citizen.JobKind = JobKind.Drink;
                    citizen.JobTarget = tank.Pos;
                    return true;
                }
                _deviceTried[best] = _gen; // unreachable from here — try next-nearest
            }
        }

        /// <summary>
        /// Nearest loose ground potato (unreserved, reachable). Reserves it so
        /// haulers and other eaters cannot take it mid-walk.
        /// </summary>
        private void TryStartEat(Simulation sim, Citizen citizen)
        {
            var items = sim.Items.Items;
            EnsureSize(ref _itemTried, items.Count);
            _gen++;

            while (true)
            {
                int best = -1, bestDist = int.MaxValue;
                for (int i = 0; i < items.Count; i++)
                {
                    if (_itemTried[i] == _gen) continue;
                    var item = items[i];
                    if (item.Kind != ItemKind.Potato || item.CarriedBy != 0 || item.ReservedForJob)
                    {
                        _itemTried[i] = _gen;
                        continue;
                    }
                    int dist = Int3.Manhattan(citizen.Pos, item.Pos);
                    if (dist < bestDist)
                    {
                        bestDist = dist;
                        best = i;
                    }
                }
                if (best < 0)
                {
                    citizen.ClearPath();
                    return;
                }

                var potato = items[best];
                if (sim.Paths.FindPath(sim, citizen.Pos, potato.Pos, citizen.Path))
                {
                    citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                    citizen.JobKind = JobKind.Eat;
                    citizen.JobTarget = potato.Pos;
                    potato.ReservedForJob = true; // released by us or Simulation.CancelJob
                    citizen.ReservedItemId = potato.Id; // identity for the release/consume path
                    return;
                }
                _itemTried[best] = _gen;
            }
        }

        /// <summary>
        /// HoldPosition citizens never travel for needs, but they DO consume what is
        /// at hand: an adjacent stocked water tank, or an unreserved ground potato on
        /// their own or an adjacent tile. The player walks them to supplies; the sim
        /// closes the loop. Deterministic (store order, first match), one serving per
        /// 1 Hz pass, no allocation.
        /// </summary>
        private static void TryServeInPlace(Simulation sim, Citizen citizen)
        {
            var sus = sim.Defs.Sustenance;
            if (citizen.Thirst >= sus.NeedThreshold)
            {
                var devices = sim.Devices.Items;
                for (int i = 0; i < devices.Count; i++)
                {
                    var d = devices[i];
                    if (d.Kind != DeviceKind.WaterTank || d.StoredLiters < sus.DrinkLiters) continue;
                    if (!Int3.IsAdjacent4(citizen.Pos, d.Pos)) continue;
                    d.StoredLiters -= sus.DrinkLiters;
                    citizen.Thirst = 0f;
                    sim.WastewaterLiters += sus.DrinkLiters; // conservation, as in ProgressDrink
                    return;
                }
            }
            if (citizen.Hunger >= sus.NeedThreshold)
            {
                var items = sim.Items.Items;
                for (int i = 0; i < items.Count; i++)
                {
                    var item = items[i];
                    if (item.Kind != ItemKind.Potato || item.CarriedBy != 0 || item.ReservedForJob) continue;
                    if (item.Pos != citizen.Pos && !Int3.IsAdjacent4(citizen.Pos, item.Pos)) continue;
                    item.Count--;
                    if (item.Count <= 0) sim.Items.Remove(item.Id);
                    citizen.Hunger = Math.Max(0f, citizen.Hunger - sus.PotatoHungerValue);
                    sim.JobsDirty = true; // ground items changed; haul board must re-derive
                    return;
                }
            }
        }

        // --------------------------------------------------------------- progress

        private static void ProgressDrink(Simulation sim, Citizen citizen)
        {
            if (citizen.HasPath) return; // CitizenSystem is walking us there

            if (!Int3.IsAdjacent4(citizen.Pos, citizen.JobTarget))
            {
                citizen.JobKind = JobKind.None; // path lost mid-way; re-seek while thirsty
                return;
            }

            // Drink from THAT tank — a specific device was targeted, not the network.
            // (The tank tile itself is unwalkable; we stand on a 4-neighbor.)
            float drinkLiters = sim.Defs.Sustenance.DrinkLiters;
            if (sim.TryGetDeviceAt(citizen.JobTarget, out var tank) &&
                tank.Kind == DeviceKind.WaterTank && tank.StoredLiters >= drinkLiters)
            {
                tank.StoredLiters -= drinkLiters;
                citizen.Thirst = 0f;
                sim.WastewaterLiters += drinkLiters; // conservation: drunk water re-enters the cycle
            }
            // Tank gone/empty: nothing drunk; the next idle pass re-evaluates.
            citizen.JobKind = JobKind.None;
        }

        private static void ProgressEat(Simulation sim, Citizen citizen)
        {
            if (citizen.HasPath) return;

            if (citizen.Pos != citizen.JobTarget)
            {
                // Path was cleared/blocked before arrival — release exactly our stack.
                if (citizen.ReservedItemId != 0 &&
                    sim.Items.TryGet(citizen.ReservedItemId, out var reserved) && reserved.CarriedBy == 0)
                    reserved.ReservedForJob = false;
                citizen.ReservedItemId = 0;
                citizen.JobKind = JobKind.None;
                return;
            }

            ItemStack item = null;
            if (citizen.ReservedItemId != 0) sim.Items.TryGet(citizen.ReservedItemId, out item);
            citizen.ReservedItemId = 0;
            if (item == null || item.CarriedBy != 0 || item.Pos != citizen.JobTarget || item.Kind != ItemKind.Potato)
            {
                citizen.JobKind = JobKind.None; // item gone — nothing left to unreserve
                return;
            }

            item.Count--;
            if (item.Count <= 0) sim.Items.Remove(item.Id);
            else item.ReservedForJob = false; // remaining stack returns to the pool
            citizen.Hunger = Math.Max(0f, citizen.Hunger - sim.Defs.Sustenance.PotatoHungerValue);
            citizen.JobKind = JobKind.None;
            sim.JobsDirty = true; // ground items changed; haul board must re-derive
        }

        // ------------------------------------------------------------------ misc

        /// <summary>Path to a walkable 4-neighbor of the target, tried in +x,-x,+y,-y order (JobSystem's rule).</summary>
        private static bool TryPathToAdjacent(Simulation sim, Citizen citizen, Int3 target)
        {
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(target, i);
                if (!sim.World.InBounds(n)) continue;
                if (!sim.IsWalkable(n)) continue; // door-aware: shared rule with pathing
                if (sim.Paths.FindPath(sim, citizen.Pos, n, citizen.Path))
                {
                    citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                    return true;
                }
            }
            return false;
        }

        private static ItemStack FindReservedGroundPotatoAt(Simulation sim, Int3 pos)
        {
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.Kind == ItemKind.Potato && item.CarriedBy == 0 &&
                    item.ReservedForJob && item.Pos == pos)
                    return item;
            }
            return null;
        }



        private static void EnsureSize(ref long[] array, int needed)
        {
            if (array.Length >= needed) return;
            int size = array.Length * 2;
            if (size < needed) size = needed;
            array = new long[size]; // fresh zeros can never equal the current _gen (>= 1)
        }
    }
}
