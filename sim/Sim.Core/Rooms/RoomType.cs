namespace Moonbase.Sim
{
    /// <summary>
    /// Semantic room classification, carried on <see cref="RoomAnchor"/> (saved,
    /// ROOM v3). The vocabulary the view (room templates), the generator (device
    /// kits) and the access/raider systems all key on. Ids are stable and saved;
    /// never reorder.
    /// </summary>
    public enum RoomType : byte
    {
        None = 0,
        Corridor = 1,
        Bridge = 2,
        Command = 3,
        Medbay = 4,
        Quarters = 5,
        Observatory = 6,
        Hydro = 7,
        Mess = 8,
        Workshop = 9,
        Commons = 10,
        Reactor = 11,
        Engineering = 12,
        Fabrication = 13,
        Storage = 14,
        LifeSupport = 15,
    }
}
