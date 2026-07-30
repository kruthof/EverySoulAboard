namespace Perilune.Sim
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
        /// <summary>The wreck start (W3): a cryogenic sleeper bay. APPENDED, never inserted — ids
        /// are saved on <see cref="RoomAnchor"/>, so an insertion would silently retype every room
        /// in every existing save.
        ///
        /// It is a LABEL and nothing more: no system branches on it, <see cref="RoomDresser"/> does
        /// not furnish it (a wreck's furniture went with the raiders). ⚠️ It used to say "and it is
        /// deliberately NOT added to <c>GameSession.ParseRoomType</c>'s ＋ADD ROOM whitelist — a
        /// player commissions a mess or a workshop, not a cryo bay". That whitelist, the verb and its
        /// command are all DELETED (M1-L / M1-L-b, OD-K): <b>no player-facing route sets a
        /// <see cref="RoomType"/> at all any more</b>, so every id here is authoring-only, and the
        /// distinction the sentence drew no longer exists. The alternative was to type the bay
        /// <c>Medbay</c> or
        /// leave it <c>None</c>; the first is a lie the owner would read off the screenshot, and the
        /// second makes the Overview print the room's internal anchor id at the player (the exact
        /// defect <c>AuthoredShips.GridOpenWreckAnchor</c>'s header records).
        ///
        /// Client mirrors that must move with it, all pinned by
        /// <c>client/test/warm-tokens.test.js</c>'s enum-parity test: <c>ROOM_TYPE</c> and
        /// <c>ROOM_MATERIAL</c> in <c>client/src/theme/warm-tokens.js</c>, and
        /// <c>ROOM_LABEL_BY_ID</c> in <c>client/src/ui/decks-model.js</c>.</summary>
        Cryo = 16,
    }
}
