using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// The space layer v0 (WS-NAV P1; VISION "The Bridge", ARCHITECTURE "The space
    /// layer"): a deterministic 2D system chart the same Simulation ticks. One system
    /// carries all three v0 concerns — contact drift (nav), delta-v/burn transits
    /// (helm), and telescope detection (sensors); the sensor pass splits into its own
    /// system when it deepens (P2 survey gameplay).
    ///
    /// Detection honesty rule: a contact enters play ONLY when a powered, operational
    /// telescope's signal-to-noise clears the defs threshold — snr = emission ×
    /// (reference_range / distance)². No fog-of-war fiat, no RNG. Detections publish
    /// <see cref="ContactDetectedEvent"/> for the history/knowledge layers.
    ///
    /// All state here is canonical: SYSS-saved via IStatefulSystem and folded into
    /// StateHash ('NAVS' seed). Chart content (contacts) is authored/scenario input
    /// via <see cref="AddContact"/> — id order IS the canonical list order.
    /// </summary>
    public sealed class NavSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Nav";
        public int IntervalTicks => 10;      // 1 Hz nav/sensor pass
        private const float DtSeconds = 1f;  // interval-paired (structural, not a def)

        public ushort StateVersion => 1;

        private bool _initialized;           // first-tick defs pull (saved)
        public double ShipX, ShipY;          // Mm on the chart; ship starts at origin
        public double DeltaVRemainingMps;
        public uint TransitTargetId;         // 0 = not in transit
        public int TransitPassesRemaining;   // nav passes (1 Hz), not raw ticks

        private uint _nextContactId = 1;
        private readonly List<SpaceContact> _contacts = new List<SpaceContact>(32);

        /// <summary>Canonical id-ordered contact list (inspectors, bridge console, tests).</summary>
        public IReadOnlyList<SpaceContact> Contacts => _contacts;

        /// <summary>Author a chart object (scenario/content input, not gameplay fiat).
        /// Ids are monotonic; append order is canonical order.</summary>
        public uint AddContact(ContactKind kind, double x, double y, double velX, double velY, float emission)
        {
            var c = new SpaceContact
            {
                Id = _nextContactId++,
                Kind = kind,
                X = x, Y = y,
                VelX = velX, VelY = velY,
                Emission = emission,
            };
            _contacts.Add(c);
            return c.Id;
        }

        public bool TryGetContact(uint id, out SpaceContact contact)
        {
            for (int i = 0; i < _contacts.Count; i++)
            {
                if (_contacts[i].Id != id) continue;
                contact = _contacts[i];
                return true;
            }
            contact = default;
            return false;
        }

        public void Tick(Simulation sim)
        {
            var defs = sim.Defs.Nav;
            if (!_initialized)
            {
                DeltaVRemainingMps = defs.InitialDeltaVMps;
                _initialized = true;
            }

            // 1. Drift — linear, deterministic (the flagged no-orbital-mechanics simplification).
            for (int i = 0; i < _contacts.Count; i++)
            {
                var c = _contacts[i];
                c.X += c.VelX * DtSeconds;
                c.Y += c.VelY * DtSeconds;
                _contacts[i] = c;
            }

            // 2. Transit countdown → arrival on station at the (drifting) target.
            if (TransitTargetId != 0 && --TransitPassesRemaining <= 0)
            {
                for (int i = 0; i < _contacts.Count; i++)
                {
                    if (_contacts[i].Id != TransitTargetId) continue;
                    ShipX = _contacts[i].X;
                    ShipY = _contacts[i].Y;
                    sim.Events.Publish(new ShipArrivedAtContactEvent(_contacts[i].Id, _contacts[i].Kind));
                    break;
                }
                TransitTargetId = 0;
                TransitPassesRemaining = 0;
            }

            // 3. Sensors — one powered, operational telescope enables the SNR pass.
            if (!AnyPoweredTelescope(sim)) return;
            double refSq = (double)defs.TelescopeReferenceRangeMm * defs.TelescopeReferenceRangeMm;
            for (int i = 0; i < _contacts.Count; i++)
            {
                var c = _contacts[i];
                if (c.Detected) continue;
                double dx = c.X - ShipX, dy = c.Y - ShipY;
                double distSq = Math.Max(dx * dx + dy * dy, 1e-12);
                double snr = c.Emission * refSq / distSq;
                if (snr < defs.TelescopeSnrThreshold) continue;
                c.Detected = true;
                c.DetectedTick = sim.TickCount;
                _contacts[i] = c;
                sim.Events.Publish(new ContactDetectedEvent(c.Id, c.Kind));
            }
        }

        private static bool AnyPoweredTelescope(Simulation sim)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind == DeviceKind.Telescope && d.Powered && d.IsOperational(sim.Defs))
                    return true;
            }
            return false;
        }

        /// <summary>
        /// Begin a transit to a DETECTED contact: spends the flat defs burn cost,
        /// computes transit passes from current distance and defs speed. Rejected
        /// (false) when already in transit, target unknown/undetected, or delta-v
        /// is short — the command layer surfaces failures, never throws.
        /// </summary>
        public bool TryBeginBurn(Simulation sim, uint contactId)
        {
            var defs = sim.Defs.Nav;
            if (TransitTargetId != 0) return false;
            if (!TryGetContact(contactId, out var c) || !c.Detected) return false;
            if (DeltaVRemainingMps < defs.BurnCostMps) return false;

            double dx = c.X - ShipX, dy = c.Y - ShipY;
            double distance = Math.Sqrt(dx * dx + dy * dy);
            DeltaVRemainingMps -= defs.BurnCostMps;
            TransitTargetId = contactId;
            TransitPassesRemaining = Math.Max(1,
                (int)Math.Ceiling(distance / (defs.TransitSpeedMmPerS * DtSeconds)));
            return true;
        }

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(_initialized);
            writer.Write(ShipX);
            writer.Write(ShipY);
            writer.Write(DeltaVRemainingMps);
            writer.Write(TransitTargetId);
            writer.Write(TransitPassesRemaining);
            writer.Write(_nextContactId);
            writer.Write(_contacts.Count);
            for (int i = 0; i < _contacts.Count; i++)
            {
                var c = _contacts[i];
                writer.Write(c.Id);
                writer.Write((byte)c.Kind);
                writer.Write(c.X); writer.Write(c.Y);
                writer.Write(c.VelX); writer.Write(c.VelY);
                writer.Write(c.Emission);
                writer.Write(c.Detected);
                writer.Write(c.DetectedTick);
            }
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version != 1) return;
            _initialized = reader.ReadBoolean();
            ShipX = reader.ReadDouble();
            ShipY = reader.ReadDouble();
            DeltaVRemainingMps = reader.ReadDouble();
            TransitTargetId = reader.ReadUInt32();
            TransitPassesRemaining = reader.ReadInt32();
            _nextContactId = reader.ReadUInt32();
            _contacts.Clear();
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                _contacts.Add(new SpaceContact
                {
                    Id = reader.ReadUInt32(),
                    Kind = (ContactKind)reader.ReadByte(),
                    X = reader.ReadDouble(), Y = reader.ReadDouble(),
                    VelX = reader.ReadDouble(), VelY = reader.ReadDouble(),
                    Emission = reader.ReadSingle(),
                    Detected = reader.ReadBoolean(),
                    DetectedTick = reader.ReadInt64(),
                });
            }
        }

        public ulong StateChecksum()
        {
            ulong h = 0x4E415653UL; // 'NAVS'
            h = XxHash64.Combine(h, _initialized ? 1UL : 0UL);
            h = XxHash64.Combine(h, ShipX);
            h = XxHash64.Combine(h, ShipY);
            h = XxHash64.Combine(h, DeltaVRemainingMps);
            h = XxHash64.Combine(h, (ulong)TransitTargetId | ((ulong)(uint)TransitPassesRemaining << 32));
            h = XxHash64.Combine(h, _nextContactId);
            for (int i = 0; i < _contacts.Count; i++)
            {
                var c = _contacts[i];
                h = XxHash64.Combine(h, (ulong)c.Id | ((ulong)(byte)c.Kind << 32)
                                       | (c.Detected ? 1UL << 40 : 0));
                h = XxHash64.Combine(h, c.X);
                h = XxHash64.Combine(h, c.Y);
                h = XxHash64.Combine(h, c.VelX);
                h = XxHash64.Combine(h, c.VelY);
                h = XxHash64.Combine(h, c.Emission);
                h = XxHash64.Combine(h, (ulong)c.DetectedTick);
            }
            return h;
        }
    }

    /// <summary>
    /// Player/bridge command: burn toward a detected contact. Ordinary inbox command
    /// (saved in no chapter — commands are transient; the resulting NavSystem state is
    /// what persists). Failure is silent at sim level v0; the issuing host surfaces it.
    /// </summary>
    public sealed class BeginBurnCommand : ISimCommand
    {
        public uint ContactId;

        public void Execute(Simulation sim)
        {
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
            {
                if (systems[i] is NavSystem nav)
                {
                    nav.TryBeginBurn(sim, ContactId);
                    return;
                }
            }
        }
    }
}
