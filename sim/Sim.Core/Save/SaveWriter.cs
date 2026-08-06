using System;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace Perilune.Sim
{
    /// <summary>
    /// Shared constants for the chaptered MBSV binary save format (TDD §6).
    ///
    /// Stream layout (after GZip decompression), little-endian throughout
    /// (BinaryWriter/BinaryReader defaults):
    ///
    ///   header:
    ///     byte[4]   magic 'M','B','S','V'
    ///     ushort    global version (= 1)
    ///     long      tick count
    ///     uint      next entity id
    ///     ulong[4]  RNG state s0..s3
    ///     int       world width
    ///     int       world height
    ///     int       world depth
    ///
    ///   chapters, repeated until end of stream:
    ///     byte[4]   chapter FourCC (ASCII, in order — e.g. 'T','I','L','E')
    ///     ushort    chapter version
    ///     int       payload byte length
    ///     byte[N]   payload
    ///
    /// Unknown chapter ids are skipped via the length prefix (forward compatibility).
    /// Derived state is never serialized: ZLevel.RegionId, power networks, the job
    /// board and path caches are all rebuilt after load. Room contents ARE saved —
    /// atmosphere is not derivable (TDD §6).
    /// </summary>
    internal static class SaveFormat
    {
        public const ushort GlobalVersion = 2; // v2: header + WastewaterLiters

        // FourCC ids as little-endian uint32: first character in the lowest byte, so
        // the bytes appear in ASCII order in the stream. const so they work as case labels.
        public const uint TileChapter = 'T' | 'I' << 8 | 'L' << 16 | 'E' << 24; // "TILE"
        public const uint RoomChapter = 'R' | 'O' << 8 | 'O' << 16 | 'M' << 24; // "ROOM"
        public const uint CitizenChapter = 'C' | 'I' << 8 | 'T' << 16 | 'Z' << 24; // "CITZ"
        public const uint DeviceChapter = 'D' | 'E' << 8 | 'V' << 16 | 'C' << 24; // "DEVC"
        public const uint ItemChapter = 'I' | 'T' << 8 | 'E' << 16 | 'M' << 24; // "ITEM"
        public const uint ScriptChapter = 'D' | 'S' << 8 | 'L' << 16 | 'S' << 24; // "DSLS"
        public const uint SystemChapter = 'S' | 'Y' << 8 | 'S' << 16 | 'S' << 24; // "SYSS"
        public const uint DefsChapter = 'D' | 'E' << 8 | 'F' << 16 | 'S' << 24; // "DEFS"

        public const ushort TileVersion = 2;    // v2: + per-tile Material array (byte[n]) per level
        public const ushort RoomVersion = 3;    // v2: + named room anchors; v3: + anchor RoomType
        public const ushort CitizenVersion = 10; // v10 the MENTAL BREAK's five fields (M4-9); v2 +Thirst; v3 +ReservedItemId; v4 +RevealsFog; v5 +Faction/Health/Morale/Archetype; v6 +HoldPosition; v7 +OrderedMove; v8 +the work-priority grid, WorkIncapable, Skill, HeldByOrder (M2-1); v9 the one Skill byte WIDENS to a per-work-type array (M3-7, OD-M item 8A)
        // v7: + Facing (2 bits in a byte, drawing-only — Device.Facing's own doc carries the
        // divergence from RimWorld and the pin-neutrality obligation).
        public const ushort DeviceVersion = 7;  // v2: + StoredLiters/Progress/FluidNetworkId; v3: + Condition; v4: + LockOwner; v5: + Scriptable (E0-6); v6: + Faulted (OD-O/M3-16)
        public const ushort ItemVersion = 3;    // v2: + Label; v3: bool ReservedForJob → uint ReservedBy (owner id)
        public const ushort ScriptVersion = 1;
        public const ushort DefsVersion = 1;    // v1: ulong checksum of the sim's active SimDefs

        public static readonly byte[] Magic = { (byte)'M', (byte)'B', (byte)'S', (byte)'V' };

        /// <summary>One shared encoding for BinaryWriter/BinaryReader string symmetry.</summary>
        public static readonly Encoding Utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

        public static string FourCCToString(uint id) => new string(new[]
        {
            (char)(id & 0xFF), (char)(id >> 8 & 0xFF), (char)(id >> 16 & 0xFF), (char)(id >> 24 & 0xFF),
        });
    }

    /// <summary>
    /// Serializes a <see cref="Simulation"/> into the chaptered MBSV format, GZip
    /// compressed. Pure function of the sim — never mutates it, never closes the
    /// target stream (the caller owns file/rotation policy; Sim.Core never touches
    /// file APIs, TDD §6). Field order is mirrored 1:1 by <see cref="SaveReader"/>.
    /// </summary>
    public static class SaveWriter
    {
        // Pooled chapter staging buffer: each chapter is length-prefixed, so its payload
        // is buffered here before framing. Saves are occasional; one reusable stream
        // per thread is plenty (TDD §6: serialize between ticks into a pooled stream).
        [ThreadStatic] private static MemoryStream _chapterBuffer;


        /// <summary>Write a complete save to <paramref name="stream"/>. Does NOT close the stream.</summary>
        public static void Write(Simulation sim, Stream stream)
        {
            if (sim == null) throw new ArgumentNullException(nameof(sim));
            if (stream == null) throw new ArgumentNullException(nameof(stream));

            using (var gzip = new GZipStream(stream, CompressionLevel.Optimal, leaveOpen: true))
            {
                WritePayload(sim, gzip);
            }
        }

        /// <summary>
        /// Header + chapters, uncompressed. Internal so tests can compare payload bytes
        /// directly (the GZip envelope may embed runtime-dependent header bytes).
        /// </summary>
        internal static void WritePayload(Simulation sim, Stream output)
        {
            var writer = new BinaryWriter(output, SaveFormat.Utf8, leaveOpen: true);
            WriteHeader(sim, writer);

            var buffer = _chapterBuffer;
            if (buffer == null) buffer = _chapterBuffer = new MemoryStream(64 * 1024);
            var chapter = new BinaryWriter(buffer, SaveFormat.Utf8, leaveOpen: true);

            WriteChapter(writer, buffer, chapter, sim, SaveFormat.TileChapter, SaveFormat.TileVersion, WriteTiles);
            WriteChapter(writer, buffer, chapter, sim, SaveFormat.RoomChapter, SaveFormat.RoomVersion, WriteRooms);
            WriteChapter(writer, buffer, chapter, sim, SaveFormat.CitizenChapter, SaveFormat.CitizenVersion, WriteCitizens);
            WriteChapter(writer, buffer, chapter, sim, SaveFormat.DeviceChapter, SaveFormat.DeviceVersion, WriteDevices);
            WriteChapter(writer, buffer, chapter, sim, SaveFormat.ItemChapter, SaveFormat.ItemVersion, WriteItems);
            WriteChapter(writer, buffer, chapter, sim, SaveFormat.ScriptChapter, SaveFormat.ScriptVersion, WriteScripts);

            // Tuning-graph fingerprint: the checksum of the defs this sim ran with, so
            // a load can flag "these saved constants differ from the active defs" (the
            // save is loaded regardless — the defs are the loader's, not the file's).
            WriteChapter(writer, buffer, chapter, sim, SaveFormat.DefsChapter, SaveFormat.DefsVersion, WriteDefs);

            // One SYSS chapter per stateful system (e.g. MOSS latches/timers), keyed
            // by system Name; per-system blob version inside the payload.
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
            {
                if (systems[i] is IStatefulSystem stateful)
                {
                    WriteChapter(writer, buffer, chapter, sim, SaveFormat.SystemChapter, 1, (_, w) =>
                    {
                        w.Write(stateful.Name);
                        w.Write(stateful.StateVersion);
                        stateful.CaptureState(w);
                    });
                }
            }

            writer.Flush();
        }

        // --- Header -------------------------------------------------------------

        private static void WriteHeader(Simulation sim, BinaryWriter w)
        {

            w.Write(SaveFormat.Magic);                       // byte[4] 'M','B','S','V'
            w.Write(SaveFormat.GlobalVersion);               // ushort
            w.Write(sim.TickCount);                          // long
            w.Write(sim.NextEntityId);  // uint next entity id
            var (s0, s1, s2, s3) = sim.Rng.State;
            w.Write(s0);                                     // ulong x4 RNG state
            w.Write(s1);
            w.Write(s2);
            w.Write(s3);
            w.Write(sim.World.Width);                        // int x3 world dimensions
            w.Write(sim.World.Height);
            w.Write(sim.World.Depth);
            w.Write(sim.WastewaterLiters);                  // header v2
        }

        // --- Chapter framing ----------------------------------------------------

        private delegate void ChapterBody(Simulation sim, BinaryWriter w);

        private static void WriteChapter(
            BinaryWriter outer, MemoryStream buffer, BinaryWriter chapterWriter,
            Simulation sim, uint fourCC, ushort version, ChapterBody body)
        {
            buffer.SetLength(0); // also resets Position to 0
            body(sim, chapterWriter);
            chapterWriter.Flush();

            outer.Write(fourCC);                     // byte[4] chapter id (LE uint = ASCII order)
            outer.Write(version);                    // ushort chapter version
            outer.Write(checked((int)buffer.Length)); // int payload byte length
            outer.Write(buffer.GetBuffer(), 0, (int)buffer.Length);
        }

        // --- TILE v2: per z-level, W*H-sized arrays -----------------------------
        // for z in 0..Depth-1: ushort[n] Floor, ushort[n] Wall, byte[n] Flags,
        // ushort[n] RoomId, byte[n] Material (v2). Flags are saved verbatim
        // (HasDevice/Designated included — the reader must NOT re-derive them).
        // RegionId is derived and currently unused: not saved, left zeroed on load.

        private static void WriteTiles(Simulation sim, BinaryWriter w)
        {
            var world = sim.World;
            int n = world.Width * world.Height;
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                for (int i = 0; i < n; i++) w.Write(level.Floor[i]);
                for (int i = 0; i < n; i++) w.Write(level.Wall[i]);
                w.Write(level.Flags, 0, n);
                for (int i = 0; i < n; i++) w.Write(level.RoomId[i]);
                w.Write(level.Material, 0, n); // v2
            }
        }

        // --- ROOM v1 ------------------------------------------------------------
        // int count; per room (list order, [0] = vacuum):
        // int TileCount, double O2Moles, double CO2Moles, double N2Moles, double TemperatureK.

        private static void WriteRooms(Simulation sim, BinaryWriter w)
        {
            var rooms = sim.Rooms.Rooms;
            w.Write(rooms.Count);
            for (int i = 0; i < rooms.Count; i++)
            {
                var room = rooms[i];
                w.Write(room.TileCount);
                w.Write(room.O2Moles);
                w.Write(room.CO2Moles);
                w.Write(room.N2Moles);
                w.Write(room.TemperatureK);
            }
            // v2: named anchors (MOSS room namespace) — string Name, Int3 Probe.
            // v3: + byte RoomType per anchor.
            var anchors = sim.Rooms.Anchors;
            w.Write(anchors.Count);
            for (int i = 0; i < anchors.Count; i++)
            {
                w.Write(anchors[i].Name);
                WriteInt3(w, anchors[i].Probe);
                w.Write((byte)anchors[i].Type); // v3
            }
        }

        // --- CITZ v1 ------------------------------------------------------------
        // int count; per citizen (store order):
        // uint Id, string Name, Int3 Pos, Int3 PrevPos, bool AutoWander,
        // int PathCount + Int3[PathCount] Path, int PathIndex, int MoveCooldown,
        // int IdleCooldown, float Suffocation, float Hunger, float Fatigue, float Mood,
        // bool Dead, byte JobKind, Int3 JobTarget, uint CarryingItemId, int JobWorkTicks.
        // v8: + byte WorkTypeCount, byte[WorkTypeCount] work priorities (WorkType order),
        //       byte WorkIncapable, byte Skill, bool HeldByOrder.

        private static void WriteCitizens(Simulation sim, BinaryWriter w)
        {
            var citizens = sim.Citizens.Items;
            w.Write(citizens.Count);
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                w.Write(c.Id);
                w.Write(c.Name ?? "");
                WriteInt3(w, c.Pos);
                WriteInt3(w, c.PrevPos);
                w.Write(c.AutoWander);
                w.Write(c.Path.Count);
                for (int p = 0; p < c.Path.Count; p++) WriteInt3(w, c.Path[p]);
                w.Write(c.PathIndex);
                w.Write(c.MoveCooldown);
                w.Write(c.IdleCooldown);
                w.Write(c.Suffocation);
                w.Write(c.Hunger);
                w.Write(c.Fatigue);
                w.Write(c.Mood);
                w.Write(c.Dead);
                w.Write((byte)c.JobKind);
                WriteInt3(w, c.JobTarget);
                w.Write(c.CarryingItemId);
                w.Write(c.JobWorkTicks);
                w.Write(c.Thirst); // v2
                w.Write(c.ReservedItemId); // v3
                w.Write(c.RevealsFog);     // v4
                w.Write(c.Faction);        // v5
                w.Write(c.Health);         // v5
                w.Write(c.Morale);         // v5
                w.Write(c.Archetype);      // v5
                w.Write(c.HoldPosition);   // v6
                w.Write(c.OrderedMove);    // v7 (E0-3 player-order precedence)
                // v8 (M2-1, the work-priority grid). The COUNT goes in first and the reader trusts
                // it, so the stream is SELF-DESCRIBING: a seventh work type then changes what a v8
                // payload contains without changing how a v8 payload is parsed, and an old save
                // stays readable without another version bump. (Note the deliberate asymmetry with
                // Simulation.StateHash, which folds NO count here: that fold walks a fixed-length
                // in-memory array whose length is a compile-time constant, and folding a constant
                // would add a constant to every citizen's fold while proving nothing — and it would
                // break the alignment the path-boundary collision pair is built on. A count belongs
                // in a variable-length STREAM read by a version-tolerant reader, not in a fold over
                // a fixed-length array.)
                w.Write((byte)c.WorkPrioritiesRaw.Length);
                for (int t = 0; t < c.WorkPrioritiesRaw.Length; t++) w.Write(c.WorkPrioritiesRaw[t]);
                w.Write(c.WorkIncapable);
                // v9 (M3-7) — the SKILL ARRAY, in the slot v8 gave to a single reserved byte. Same
                // self-describing shape as the priority grid four lines up and for the same reason: a
                // seventh work type changes what a v9 payload CONTAINS without changing how one is
                // PARSED. ⚠️ The count is what makes the v8→v9 migration in SaveReader legible — an
                // old payload has one bare byte here and no count at all, so the reader must branch on
                // the version rather than on the data.
                w.Write((byte)c.SkillsRaw.Length);
                for (int t = 0; t < c.SkillsRaw.Length; t++) w.Write(c.SkillsRaw[t]);
                w.Write(c.HeldByOrder); // M2-19's sticky claim — READ since M2-19 and WRITTEN since
                                        // M2-9 (PrioritiseJobCommand): live state, not reserved
                // ⭐⭐ v10 (M4-9) — THE MENTAL BREAK. Five fields, appended at the END of the record
                // so a v9 payload is a strict prefix of a v10 one and the reader's branch is a
                // trailing `if (version >= 10)` rather than a re-shuffle. ⚠️ NO SELF-DESCRIBING
                // COUNT here, unlike the two arrays above, and that is not an inconsistency: those
                // are variable-length runs whose length is a compile-time constant that could
                // CHANGE (a seventh work type); these are five scalars of fixed width whose count
                // can only change by another version bump, which is exactly what a version is for.
                w.Write(c.BreakDwell);
                w.Write(c.BreakThresholdPct);
                w.Write((byte)c.BreakTier);
                w.Write(c.BreakEndsAtTick);
                w.Write(c.BreakReprieveUntilTick);
            }
        }

        // --- DEVC v1 ------------------------------------------------------------
        // int count; per device (store order):
        // uint Id, byte Kind, Int3 Pos, string Name, bool IsOpen, bool IsLocked,
        // bool Powered, float Rate, float StoredKWh, ushort NetworkId.
        // NetworkId/Powered are derived by PowerSystem but part of StateHash, so they
        // are saved for immediate hash equality; PowerDirty=true after load rebuilds them.

        private static void WriteDevices(Simulation sim, BinaryWriter w)
        {
            var devices = sim.Devices.Items;
            w.Write(devices.Count);
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                w.Write(d.Id);
                w.Write((byte)d.Kind);
                WriteInt3(w, d.Pos);
                w.Write(d.Name ?? "");
                w.Write(d.IsOpen);
                w.Write(d.IsLocked);
                w.Write(d.Powered);
                w.Write(d.Rate);
                w.Write(d.StoredKWh);
                w.Write(d.NetworkId);
                w.Write(d.StoredLiters);    // v2
                w.Write(d.Progress);        // v2
                w.Write(d.FluidNetworkId);  // v2
                w.Write(d.Condition);       // v3
                w.Write(d.LockOwner);       // v4
                w.Write(d.Scriptable);      // v5 (E0-6)
                w.Write(d.Faulted);         // v6 (OD-O / M3-16 — the authored dead board)
                // v7 — masked at the WRITER too, so a corrupt in-memory value cannot be persisted
                // and then read back as truth on the next load.
                w.Write((byte)(d.Facing & 3));
            }
        }

        // --- ITEM v3 ------------------------------------------------------------
        // int count; per item (store order):
        // uint Id, byte Kind, int Count, Int3 Pos, uint CarriedBy,
        // uint ReservedBy (v3; was bool ReservedForJob in v1/v2), string Label (v2).

        private static void WriteItems(Simulation sim, BinaryWriter w)
        {
            var items = sim.Items.Items;
            w.Write(items.Count);
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                w.Write(it.Id);
                w.Write((byte)it.Kind);
                w.Write(it.Count);
                WriteInt3(w, it.Pos);
                w.Write(it.CarriedBy);
                w.Write(it.ReservedBy);   // v3 (was bool ReservedForJob ≤ v2)
                w.Write(it.Label ?? ""); // v2
            }
        }

        // --- DSLS v1 ------------------------------------------------------------
        // int count; per script (insertion order): string TerminalId, string Source.

        private static void WriteScripts(Simulation sim, BinaryWriter w)
        {
            var scripts = sim.Scripts;
            w.Write(scripts.Count);
            for (int i = 0; i < scripts.Count; i++)
            {
                w.Write(scripts[i].TerminalId ?? "");
                w.Write(scripts[i].Source ?? "");
            }
        }

        // --- DEFS v1 ------------------------------------------------------------
        // ulong Checksum of the sim's active SimDefs (see SimDefs.ComputeChecksum).
        // A fingerprint only — the actual tuning values live in the .def files, not
        // the save; the loader compares this against its own active defs' checksum.

        private static void WriteDefs(Simulation sim, BinaryWriter w)
        {
            w.Write(sim.Defs.Checksum);
        }

        // --- Primitives ---------------------------------------------------------

        private static void WriteInt3(BinaryWriter w, Int3 p)
        {
            w.Write(p.X);
            w.Write(p.Y);
            w.Write(p.Z);
        }
    }
}
