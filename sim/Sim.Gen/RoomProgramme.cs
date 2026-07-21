using Moonbase.Sim;

namespace Moonbase.Gen
{
    /// <summary>
    /// Per-room-type footprint targets — the size half of the ship designer. A
    /// compartment should be as big as its job and no bigger: a cabin is a bunk
    /// and a chair, not a hangar. <see cref="BandPlanner"/> carves rooms at these
    /// sizes; anything a band doesn't need stays solid hull mass, which is what
    /// makes a ship read dense instead of cavernous.
    /// Width = along the corridor; Depth = away from it (both interior tiles).
    /// </summary>
    public static class RoomProgramme
    {
        public readonly struct Footprint
        {
            public readonly int Width, Depth;
            public Footprint(int width, int depth) { Width = width; Depth = depth; }
        }

        public static Footprint Of(RoomType type) => type switch
        {
            RoomType.Quarters => new Footprint(4, 4),       // bunk, chair, locker, desk, plant
            RoomType.Medbay => new Footprint(8, 4),         // bed row + cabinet + aisle
            RoomType.Command => new Footprint(8, 4),        // planning table + stations
            RoomType.Mess => new Footprint(8, 4),           // two tables, chairs, scrubber
            RoomType.Commons => new Footprint(6, 4),
            RoomType.Workshop => new Footprint(6, 4),
            RoomType.Storage => new Footprint(6, 3),
            RoomType.Reactor => new Footprint(9, 4),        // feeds + battery bank
            RoomType.Engineering => new Footprint(8, 4),    // recycler, machine shop
            RoomType.Fabrication => new Footprint(6, 3),
            RoomType.LifeSupport => new Footprint(8, 4),    // scrubber/vent/tank/reclaimer
            RoomType.Hydro => new Footprint(10, 5),         // grow rows + water loop
            RoomType.Observatory => new Footprint(7, 4),
            _ => new Footprint(7, 4),
        };
    }
}
