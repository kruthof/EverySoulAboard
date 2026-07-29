using System.Collections.Generic;
using Perilune.Sim;
using Rect = Perilune.Gen.BandPlanner.Rect;

namespace Perilune.Gen
{
    /// <summary>
    /// Carves one deck as a clean 8-slot compartment grid — a 2×4 arrangement of
    /// uniform compartments around a central horizontal spine corridor. The grid
    /// sibling of <see cref="BandPlanner"/> (which packs job-sized rooms off a
    /// corridor wall); this one lays down a fixed, regular slot lattice that the warm
    /// SVG Overview/Room-Zoom draw directly.
    ///
    /// Every slot is a REAL compartment: floor interior, perimeter walls, and one door
    /// gap into the spine — an EMPTY slot is a bare "hall" (a sealed, unfurnished
    /// compartment the player builds out), never raw void. Each slot gets a
    /// <see cref="RoomSpec"/> anchor at its centre and a <see cref="SlotDescriptor"/>
    /// entry; furnished slots (Type != None) boot with an OPEN door, empty halls with
    /// a CLOSED door (unbuilt/airless until the player opens them) — unless the slot
    /// overrides it with <see cref="SlotAssign.DoorOpen"/>, which is how a compartment
    /// gets to be NAMED and AIRLESS at once. The spine gets its own corridor anchor.
    ///
    /// Pure function of its inputs (no RNG, no Date) — same deck spec, same carve every
    /// run. The <see cref="SlotDescriptor"/>s it appends are authoring/view-only and
    /// move no determinism hash (see <see cref="ShipPlan.SlotGrid"/>).
    ///
    /// Deck geometry (all coords inclusive):
    ///   Width  = 45  (hull walls x0, x44)
    ///   Height = 18  (hull walls y0, y17)
    ///   4 columns of 10-wide interiors on an 11-tile pitch (x0 = 1 + 11·col):
    ///     col0 x1..10  col1 x12..21  col2 x23..32  col3 x34..43
    ///   top row    interior y1..6   (door on its y7 wall, into the spine)
    ///   spine      y8..9  (full interior width — the continuous corridor)
    ///   bottom row interior y11..16 (door on its y10 wall, into the spine)
    /// Slot index is row-major: 0..3 top row (l→r), 4..7 bottom row (l→r).
    /// </summary>
    public static class SlotGridPlanner
    {
        public const int Cols = 4;
        public const int SlotCount = 8;

        public const int InteriorW = 10;
        public const int InteriorH = 6;
        public const int ColPitch = InteriorW + 1;   // one shared wall column between slots

        public const int Width = 1 + Cols * ColPitch;         // 45: left hull + 4 columns + right hull
        public const int TopWallY = InteriorH + 1;            // 7  — wall between top row and spine
        public const int SpineY0 = TopWallY + 1;              // 8
        public const int SpineY1 = SpineY0 + 1;               // 9  — 2-tall spine
        public const int BottomWallY = SpineY1 + 1;           // 10 — wall between spine and bottom row
        public const int Height = BottomWallY + InteriorH + 2; // 18: + bottom interior + bottom hull

        public const int InteriorRightX = Width - 2;          // 43 — last spine floor column
        public const int LadderX = 22;                        // spine centre column for the ladder trunk

        /// <summary>A slot's assignment: a room <see cref="Type"/> (<see cref="RoomType.None"/>
        /// = empty hall) bound to an <see cref="Anchor"/> name (the MOSS/view key).</summary>
        public struct SlotAssign
        {
            public RoomType Type;
            public string Anchor;

            /// <summary>
            /// M1-1 — the boot state of this slot's spine door, or <c>null</c> = "say nothing;
            /// derive it from <see cref="Type"/> the way every slot always has" (typed ⇒ open,
            /// empty hall ⇒ shut).
            ///
            /// <para><b>IT EXISTS FOR EXACTLY ONE COMBINATION THE DERIVED RULE CANNOT EXPRESS: a
            /// compartment that is NAMED but AIRLESS.</b> The wreck's life-support bay is a room
            /// the crew has always known about and cannot yet breathe in — it needs a name so the
            /// Overview opens a Room Zoom on it instead of the ＋ADD ROOM picker, and it needs its
            /// door SHUT so the pressure frontier stays where the ship's design puts it. Under the
            /// derived rule those two are the same switch.</para>
            ///
            /// <para><b>Nullable and not <c>bool</c>, for the same reason as
            /// <see cref="DeviceSpec.Condition"/>:</b> <c>SlotAssign</c> is a struct, so every
            /// existing slot arrives as zeroed memory and a plain <c>bool</c> would read
            /// <c>false</c> — sealing every typed room on every ship at boot. Every call site that
            /// does not pass it leaves this <c>null</c> and emits a byte-identical
            /// <see cref="DeviceSpec"/>, so grid and the procedural ships are untouched.</para>
            /// </summary>
            public bool? DoorOpen;
        }

        /// <summary>The interior tile rect (inclusive) of slot <paramref name="index"/>.</summary>
        public static Rect InteriorRect(int index)
        {
            int col = index % Cols;
            bool top = index < Cols;
            int x0 = 1 + col * ColPitch;
            int x1 = x0 + InteriorW - 1;
            int y0 = top ? 1 : BottomWallY + 1;
            int y1 = y0 + InteriorH - 1;
            return new Rect(x0, y0, x1, y1);
        }

        /// <summary>
        /// Carve <paramref name="slots"/> (exactly 8) into <paramref name="deck"/> (a
        /// solid-'#' canvas), appending doors, room anchors, spine anchor and
        /// <see cref="SlotDescriptor"/>s to <paramref name="plan"/>. Returns anchor →
        /// interior rect for the caller's <see cref="RoomOutfitter"/> pass.
        /// </summary>
        public static Dictionary<string, Rect> Carve(
            GridCanvas deck, ShipPlan plan, int z, SlotAssign[] slots, string spineAnchor)
        {
            if (slots == null || slots.Length != SlotCount)
                throw new System.ArgumentException($"grid deck {z}: need exactly {SlotCount} slots");

            // The continuous spine corridor first — it overrides the column walls at
            // y8..9 so the corridor runs unbroken behind every compartment door.
            deck.FillRect(1, SpineY0, InteriorRightX, SpineY1, '.');

            var rects = new Dictionary<string, Rect>(SlotCount);
            for (int i = 0; i < SlotCount; i++)
            {
                var r = InteriorRect(i);
                deck.FillRect(r.X0, r.Y0, r.X1, r.Y1, '.');

                bool top = i < Cols;
                int doorX = r.CenterX;
                int doorY = top ? TopWallY : BottomWallY;
                deck.Set(doorX, doorY, '.');

                var slot = slots[i];
                bool empty = slot.Type == RoomType.None;

                plan.Devices.Add(new DeviceSpec
                {
                    Kind = DeviceKind.Door,
                    Pos = new Int3(doorX, doorY, z),
                    Name = $"door_d{z}_s{i}",
                    // Furnished slots open; empty halls sealed until built out — unless the author
                    // says otherwise (SlotAssign.DoorOpen: a NAMED but AIRLESS compartment).
                    IsOpen = slot.DoorOpen ?? !empty,
                });

                plan.Rooms.Add(new RoomSpec
                {
                    Anchor = slot.Anchor,
                    Type = slot.Type,
                    Probe = new Int3(r.CenterX, r.CenterY, z),
                });

                // Wall-inclusive compartment window (interior + its 1-tile perimeter),
                // in frame/click space — the Room-Zoom clamp rect.
                plan.SlotGrid.Add(new SlotDescriptor
                {
                    Deck = z,
                    Index = i,
                    X = r.X0 - 1,
                    Y = r.Y0 - 1,
                    W = InteriorW + 2,
                    H = InteriorH + 2,
                    Anchor = slot.Anchor,
                    Type = slot.Type,
                });

                rects[slot.Anchor] = r;
            }

            // The spine is the connective corridor, not a slot — its own anchor, probed
            // at a left-end floor tile clear of the ladder trunk and door aprons.
            plan.Rooms.Add(new RoomSpec
            {
                Anchor = spineAnchor,
                Type = RoomType.Corridor,
                Probe = new Int3(2, SpineY0, z),
            });

            return rects;
        }
    }
}
