using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;

namespace Perilune.Sim
{
    /// <summary>
    /// Reconstructs a <see cref="Simulation"/> from a chaptered MBSV save
    /// (see <see cref="SaveFormat"/> for the exact layout; field order mirrors
    /// <see cref="SaveWriter"/> 1:1). Unknown chapter ids are skipped via their
    /// length prefix; known chapters with an unknown version throw (no migrations
    /// registry yet — TDD §6 allows save breaks pre-M3).
    ///
    /// Derived state after load, by design:
    /// - ZLevel.RegionId: not saved, left zeroed (derived, currently unused).
    /// - RoomState.Dirty: constructor default (true) — the first atmosphere tick
    ///   recomputes rooms. The recompute is a pure, deterministic function of the
    ///   loaded tiles + devices + saved rooms/RoomId arrays, so two loads of the
    ///   same save stay bitwise identical.
    /// - PowerDirty forced true / JobsDirty forced to JobBoardDirty.All — networks and every
    ///   job sub-board rebuild on the first tick (the fresh system instances hold no per-sim caches).
    /// - Tile Flags (incl. HasDevice/Designated) are restored verbatim from the
    ///   TILE chapter, never re-derived.
    /// </summary>
    public static class SaveReader
    {
        /// <summary>
        /// Read one save and return a fully reconstructed Simulation.
        /// <paramref name="systems"/> is the same system array a fresh sim would get
        /// (fresh instances — systems hold per-sim derived caches). Does NOT close
        /// the stream.
        ///
        /// <paramref name="defs"/> is the tuning graph the reconstructed sim runs with
        /// (defaults to <see cref="SimDefs.Default"/>). If the save carries a DEFS
        /// chapter whose checksum differs from <paramref name="defs"/>, a warning is
        /// appended to <paramref name="warnings"/> (when non-null) and the load
        /// proceeds anyway — the active defs always win, the save's fingerprint is
        /// advisory. Old saves without a DEFS chapter load silently.
        /// </summary>
        public static Simulation Read(Stream stream, ISimSystem[] systems,
                                      SimDefs defs = null, List<string> warnings = null)
        {
            if (stream == null) throw new ArgumentNullException(nameof(stream));

            // Decompress fully first: chapter iteration needs Length/Position, and
            // GZipStream is neither seekable nor end-detectable without reading.
            var payload = new MemoryStream();
            using (var gzip = new GZipStream(stream, CompressionMode.Decompress, leaveOpen: true))
            {
                gzip.CopyTo(payload);
            }
            payload.Position = 0;
            return ReadPayload(payload, systems, defs, warnings);
        }

        /// <summary>Read an uncompressed payload (must be seekable). Internal for tests.</summary>
        internal static Simulation ReadPayload(Stream payload, ISimSystem[] systems,
                                               SimDefs defs = null, List<string> warnings = null)
        {
            var reader = new BinaryReader(payload, SaveFormat.Utf8, leaveOpen: true);

            // --- Header (mirrors SaveWriter.WriteHeader) ---
            byte[] magic = reader.ReadBytes(4);
            if (magic.Length != 4 ||
                magic[0] != SaveFormat.Magic[0] || magic[1] != SaveFormat.Magic[1] ||
                magic[2] != SaveFormat.Magic[2] || magic[3] != SaveFormat.Magic[3])
                throw new InvalidDataException("not an MBSV save (bad magic)");

            ushort globalVersion = reader.ReadUInt16();
            if (globalVersion < 1 || globalVersion > SaveFormat.GlobalVersion)
                throw new InvalidDataException($"unsupported save version {globalVersion} (max {SaveFormat.GlobalVersion})");

            long tickCount = reader.ReadInt64();
            uint nextEntityId = reader.ReadUInt32();
            ulong s0 = reader.ReadUInt64();
            ulong s1 = reader.ReadUInt64();
            ulong s2 = reader.ReadUInt64();
            ulong s3 = reader.ReadUInt64();
            int width = reader.ReadInt32();
            int height = reader.ReadInt32();
            int depth = reader.ReadInt32();
            float wastewater = globalVersion >= 2 ? reader.ReadSingle() : 0f;

            var world = new World(width, height, depth);
            // Seed is irrelevant — the RNG state is restored verbatim from the header.
            var sim = new Simulation(world, 0UL, systems, defs);
            sim.Rng.Restore(s0, s1, s2, s3);
            sim.WastewaterLiters = wastewater;
            sim.RestoreClock(tickCount, nextEntityId);

            // --- Chapters, until end of payload ---
            while (payload.Position < payload.Length)
            {
                uint fourCC = reader.ReadUInt32();
                ushort chapterVersion = reader.ReadUInt16();
                int byteLength = reader.ReadInt32();
                long end = payload.Position + byteLength;
                if (byteLength < 0 || end > payload.Length)
                    throw new InvalidDataException(
                        $"chapter '{SaveFormat.FourCCToString(fourCC)}' length {byteLength} exceeds stream");

                switch (fourCC)
                {
                    case SaveFormat.TileChapter:
                        RequireVersionUpTo(fourCC, chapterVersion, SaveFormat.TileVersion);
                        ReadTiles(sim, reader, chapterVersion);
                        break;
                    case SaveFormat.RoomChapter:
                        RequireVersionUpTo(fourCC, chapterVersion, SaveFormat.RoomVersion);
                        ReadRooms(sim, reader, chapterVersion);
                        break;
                    case SaveFormat.CitizenChapter:
                        RequireVersionUpTo(fourCC, chapterVersion, SaveFormat.CitizenVersion);
                        ReadCitizens(sim, reader, chapterVersion);
                        break;
                    case SaveFormat.DeviceChapter:
                        RequireVersionUpTo(fourCC, chapterVersion, SaveFormat.DeviceVersion);
                        ReadDevices(sim, reader, chapterVersion);
                        break;
                    case SaveFormat.ItemChapter:
                        RequireVersionUpTo(fourCC, chapterVersion, SaveFormat.ItemVersion);
                        ReadItems(sim, reader, chapterVersion);
                        break;
                    case SaveFormat.ScriptChapter:
                        RequireVersion(fourCC, chapterVersion, SaveFormat.ScriptVersion);
                        ReadScripts(sim, reader);
                        break;
                    case SaveFormat.SystemChapter:
                        ReadSystemState(systems, reader);
                        break;
                    case SaveFormat.DefsChapter:
                        RequireVersionUpTo(fourCC, chapterVersion, SaveFormat.DefsVersion);
                        ReadDefs(sim, reader, warnings);
                        break;
                    default:
                        break; // unknown chapter (newer build) — skipped via byteLength below
                }

                // Re-sync on the length prefix: skips unknown chapters and guards
                // against a handler consuming a different amount than declared.
                payload.Position = end;
            }

            // Power networks and the job board are derived — rebuild on first tick.
            sim.PowerDirty = true;
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        // Older versions load with defaults for missing fields — the M3+ save
        // compatibility guarantee (TDD §6). Newer-than-known versions still throw.
        private static void RequireVersionUpTo(uint fourCC, ushort got, ushort max)
        {
            if (got < 1 || got > max)
                throw new InvalidDataException(
                    $"chapter '{SaveFormat.FourCCToString(fourCC)}' version {got} unsupported (max {max})");
        }

        private static void ReadSystemState(ISimSystem[] systems, BinaryReader reader)
        {
            string name = reader.ReadString();
            ushort version = reader.ReadUInt16();
            for (int i = 0; i < systems.Length; i++)
            {
                if (systems[i] is IStatefulSystem stateful && stateful.Name == name)
                {
                    stateful.RestoreState(reader, version);
                    return;
                }
            }
            // No matching system in this build — chapter skipped via length prefix.
        }

        private static void RequireVersion(uint fourCC, ushort got, ushort expected)
        {
            if (got != expected)
                throw new InvalidDataException(
                    $"chapter '{SaveFormat.FourCCToString(fourCC)}' version {got} unsupported (expected {expected})");
        }

        // --- TILE v2 (mirrors SaveWriter.WriteTiles) ---
        // Direct array writes — flags saved verbatim, no SetFloor/SetWall re-derivation.
        // v2 appended a per-tile Material array; a pre-v2 save has none, so Material stays
        // zeroed (fresh World arrays), which is the "default material" identity.

        private static void ReadTiles(Simulation sim, BinaryReader reader, ushort version)
        {
            var world = sim.World;
            int n = world.Width * world.Height;
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                for (int i = 0; i < n; i++) level.Floor[i] = reader.ReadUInt16();
                for (int i = 0; i < n; i++) level.Wall[i] = reader.ReadUInt16();
                ReadExactly(reader, level.Flags, n);
                for (int i = 0; i < n; i++) level.RoomId[i] = reader.ReadUInt16();
                if (version >= 2) ReadExactly(reader, level.Material, n); // v2; pre-v2: stays zeroed
                // RegionId: derived + unused — stays zeroed (fresh World arrays).
            }
        }

        // --- ROOM v1 (mirrors SaveWriter.WriteRooms) ---

        private static void ReadRooms(Simulation sim, BinaryReader reader, ushort version)
        {
            var rooms = sim.Rooms.Rooms;
            rooms.Clear();
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                var room = new Room();
                room.TileCount = reader.ReadInt32();
                room.O2Moles = reader.ReadDouble();
                room.CO2Moles = reader.ReadDouble();
                room.N2Moles = reader.ReadDouble();
                room.TemperatureK = reader.ReadDouble();
                rooms.Add(room);
            }
            if (version >= 2)
            {
                sim.Rooms.Anchors.Clear();
                int anchorCount = reader.ReadInt32();
                for (int i = 0; i < anchorCount; i++)
                {
                    string name = reader.ReadString();
                    var probe = ReadInt3(reader);
                    var type = version >= 3 ? (RoomType)reader.ReadByte() : RoomType.None;
                    sim.Rooms.SetAnchor(name, probe, type);
                }
            }
        }

        // --- CITZ v1 (mirrors SaveWriter.WriteCitizens) ---

        // internal (not private) so the pre-v8 legacy path — which nothing in the repo writes any
        // more, since SaveWriter always stamps the current version — can be driven directly by a
        // unit test. Exactly the precedent ReadDevices and ReadItems set, and for the same reason:
        // an old-save-compat branch nothing can reach is a branch nothing can test.
        internal static void ReadCitizens(Simulation sim, BinaryReader reader, ushort version)
        {
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                uint id = reader.ReadUInt32();
                var c = new Citizen();
                c.Name = reader.ReadString();
                c.Pos = ReadInt3(reader);
                c.PrevPos = ReadInt3(reader);
                c.AutoWander = reader.ReadBoolean();
                int pathCount = reader.ReadInt32();
                for (int p = 0; p < pathCount; p++) c.Path.Add(ReadInt3(reader));
                c.PathIndex = reader.ReadInt32();
                c.MoveCooldown = reader.ReadInt32();
                c.IdleCooldown = reader.ReadInt32();
                c.Suffocation = reader.ReadSingle();
                c.Hunger = reader.ReadSingle();
                c.Fatigue = reader.ReadSingle();
                c.Mood = reader.ReadSingle();
                c.Dead = reader.ReadBoolean();
                c.JobKind = (JobKind)reader.ReadByte();
                c.JobTarget = ReadInt3(reader);
                c.CarryingItemId = reader.ReadUInt32();
                c.JobWorkTicks = reader.ReadInt32();
                if (version >= 2) c.Thirst = reader.ReadSingle();
                if (version >= 3) c.ReservedItemId = reader.ReadUInt32();
                if (version >= 4) c.RevealsFog = reader.ReadBoolean();
                if (version >= 5)
                {
                    c.Faction = reader.ReadByte();
                    c.Health = reader.ReadSingle();
                    c.Morale = reader.ReadSingle();
                    c.Archetype = reader.ReadByte();
                }
                if (version >= 6) c.HoldPosition = reader.ReadBoolean();
                // v7: pre-v7 saves predate player-order precedence — no order was in flight when
                // they were written, so false (the default) is the correct read, not a guess.
                if (version >= 7) c.OrderedMove = reader.ReadBoolean();
                // v8 (M2-1, the work-priority grid + three reserved fields).
                //
                // ⭐ A PRE-v8 SAVE LOADS WITH EVERY WORK TYPE OFF — the constructor default, left
                // untouched — and that is a DECISION, not an omission. It departs from the
                // behaviour-preserving read this file uses twice next door (OrderedMove reads false
                // because no order was in flight; Device.Scriptable reads TRUE because every device
                // in a pre-v5 save really was MOSS-addressable). The behaviour-preserving read here
                // would be "every type enabled", because a pre-v8 pawn did every kind of work.
                //
                // It is not taken, for two reasons stated together because neither is sufficient
                // alone. (1) OD-H/OD-I are binding and are phrased as ONE RULE — work is opt-in,
                // off everywhere, no authored exception and no second rule; a load-time default of
                // "all on" would be exactly that second rule. (2) There is nothing to preserve:
                // save/load has NO caller outside the test suite — verified by grep across sim/,
                // hosts/ and client/, the only SaveWriter/SaveReader call sites are tests — so no
                // pre-v8 save exists anywhere to be read. If that ever stops being true, this is
                // the branch to revisit, and the argument above is the one to re-weigh.
                // TWO ACCEPTED LIMITS OF THIS BRANCH, named rather than left to be discovered:
                //
                // (1) NO RANGE CHECK on a stored priority, while Citizen.SetWorkPriority throws
                //     outside 0..4. That asymmetry is deliberate: a reader must not throw on a byte
                //     some other build wrote, and refusing the whole save over one nonsense priority
                //     would lose a colony to a typo. ⭐ It also happens to match RimWorld, though in
                //     the OPPOSITE direction — reference §1.2 records `SetPriority` LOGGING and then
                //     STORING an out-of-range value, i.e. RimWorld is permissive at the setter and
                //     this game is permissive at the reader. Neither is permissive at both.
                // (2) THE STORED COUNT IS TRUSTED, bounded only by its own type (255). A hostile or
                //     corrupt payload can therefore make the reader consume up to 255 bytes here.
                //     It cannot over-read the stream — the chapter is length-prefixed and BinaryReader
                //     throws at the end — and this format has no adversarial threat model (there is
                //     no save loading outside the test suite at all). Named as a limit, not fixed.
                if (version >= 8)
                {
                    int stored = reader.ReadByte();
                    for (int t = 0; t < stored; t++)
                    {
                        byte priority = reader.ReadByte();
                        // Forward compatibility: a save written by a build with MORE work types
                        // than this one has is drained to the byte, and the extras are discarded
                        // rather than mis-assigned. The count is what makes that possible.
                        if (t < c.WorkPrioritiesRaw.Length) c.WorkPrioritiesRaw[t] = priority;
                    }
                    c.WorkIncapable = reader.ReadByte();
                    c.Skill = reader.ReadByte();
                    c.HeldByOrder = reader.ReadBoolean();
                }
                sim.Citizens.Add(c, id);
            }
        }

        // --- DEVC v1 (mirrors SaveWriter.WriteDevices) ---

        // internal (not private) so the pre-v5 legacy DEVC path — which no live save in the repo
        // exercises — can be driven directly by a unit test. Exactly the precedent ReadItems set for
        // its own pre-v3 leg (SaveReader.cs, ReadItems), and for the same reason: an
        // old-save-compat branch nothing can reach is a branch nothing can test.
        internal static void ReadDevices(Simulation sim, BinaryReader reader, ushort version)
        {
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                uint id = reader.ReadUInt32();
                var d = new Device();
                d.Kind = (DeviceKind)reader.ReadByte();
                d.Pos = ReadInt3(reader);
                d.Name = reader.ReadString();
                d.IsOpen = reader.ReadBoolean();
                d.IsLocked = reader.ReadBoolean();
                d.Powered = reader.ReadBoolean();
                d.Rate = reader.ReadSingle();
                d.StoredKWh = reader.ReadSingle();
                d.NetworkId = reader.ReadUInt16();
                if (version >= 2)
                {
                    d.StoredLiters = reader.ReadSingle();
                    d.Progress = reader.ReadSingle();
                    d.FluidNetworkId = reader.ReadUInt16();
                }
                if (version >= 3) d.Condition = reader.ReadSingle();
                if (version >= 4) d.LockOwner = reader.ReadByte();
                // v5 (E0-6). A pre-v5 save predates commissioning: every device in it WAS
                // MOSS-addressable when it was written, so the behaviour-preserving read is the
                // field's default (true), which `new Device()` already gave it. Reading false here
                // would unbind every adapter on load — the player's automation deleted, silently.
                if (version >= 5) d.Scriptable = reader.ReadBoolean();
                sim.Devices.Add(d, id);
                // Re-index the device grid (utility overlays never enter it); the
                // tile's HasDevice flag is already in the saved Flags array.
                if (!Simulation.IsUtilityOverlay(d.Kind)) sim.RegisterLoadedDevice(d);
            }
        }

        // --- ITEM v3 (mirrors SaveWriter.WriteItems) ---

        // internal (not private) so the pre-v3 legacy-reservation read path — which the
        // scenario/slice gate never exercises — can be driven directly by a unit test.
        internal static void ReadItems(Simulation sim, BinaryReader reader, ushort version)
        {
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                uint id = reader.ReadUInt32();
                var it = new ItemStack();
                it.Kind = (ItemKind)reader.ReadByte();
                it.Count = reader.ReadInt32();
                it.Pos = ReadInt3(reader);
                it.CarriedBy = reader.ReadUInt32();
                // v3 widened the reservation to an owner id (0 = free). A pre-v3 save only knew
                // WHETHER a stack was reserved, not by WHOM — the owner is unrecoverable. Restore
                // it FREE, never a sentinel: an owner id no live entity holds would be an
                // ownerless claim no owner-gated release could ever clear — the exact B-1 leak,
                // reintroduced. Free is strictly safer: the reserving job re-reserves (or the haul
                // board re-derives) next tick, worst case a transient double-target that self-heals.
                if (version >= 3) it.ReservedBy = reader.ReadUInt32();
                else { reader.ReadBoolean(); it.ReservedBy = 0u; }
                if (version >= 2) it.Label = reader.ReadString();
                sim.Items.Add(it, id);
            }
        }

        // --- DSLS v1 (mirrors SaveWriter.WriteScripts) ---

        private static void ReadScripts(Simulation sim, BinaryReader reader)
        {
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                string terminalId = reader.ReadString();
                string source = reader.ReadString();
                sim.SetScript(terminalId, source); // preserves saved insertion order
            }
        }

        // --- DEFS v1 (mirrors SaveWriter.WriteDefs) -----------------------------
        // The saved checksum is a fingerprint of the tuning graph the save was made
        // with. The active defs (sim.Defs) are authoritative on load; a mismatch is
        // surfaced as a warning and the load continues — the values themselves are
        // not in the save, they come from the loader's .def files.

        private static void ReadDefs(Simulation sim, BinaryReader reader, List<string> warnings)
        {
            ulong savedChecksum = reader.ReadUInt64();
            if (savedChecksum != sim.Defs.Checksum)
                warnings?.Add(
                    $"save defs checksum {savedChecksum:x16} differs from active defs {sim.Defs.Checksum:x16} — " +
                    "loaded with the active tuning values");
        }

        // --- Primitives ---------------------------------------------------------

        private static Int3 ReadInt3(BinaryReader reader)
        {
            int x = reader.ReadInt32();
            int y = reader.ReadInt32();
            int z = reader.ReadInt32();
            return new Int3(x, y, z);
        }

        private static void ReadExactly(BinaryReader reader, byte[] dest, int count)
        {
            int offset = 0;
            while (offset < count)
            {
                int read = reader.Read(dest, offset, count - offset);
                if (read <= 0) throw new EndOfStreamException("truncated save payload");
                offset += read;
            }
        }
    }
}
