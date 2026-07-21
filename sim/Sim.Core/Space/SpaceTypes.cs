namespace Perilune.Sim
{
    /// <summary>What a space contact is once resolved. Append-only (save/wire token).</summary>
    public enum ContactKind : byte
    {
        Comet = 0,     // water-ice rendezvous (resource run)
        Derelict = 1,  // dead vessel (away-mission site, P3)
        Station = 2,   // dead or living installation (P3)
    }

    /// <summary>
    /// One object on the system chart (VISION "The Bridge"). Positions/velocities in
    /// megameters (Mm) on a flat 2D chart — the flagged honest simplification: no
    /// orbital mechanics, deterministic linear drift. A contact EXISTS in play only
    /// once <see cref="Detected"/> — set by a powered telescope's signal-to-noise
    /// check, never by fiat.
    /// </summary>
    public struct SpaceContact
    {
        public uint Id;
        public ContactKind Kind;
        public double X, Y;         // Mm
        public double VelX, VelY;   // Mm/s
        public float Emission;      // unitless signature strength (1 = reference)
        public bool Detected;
        public long DetectedTick;
    }

    /// <summary>A telescope resolved a new contact this pass (read by history/UI/crew-knowledge layers).</summary>
    public readonly struct ContactDetectedEvent : ISimEvent
    {
        public readonly uint ContactId;
        public readonly ContactKind Kind;

        public ContactDetectedEvent(uint contactId, ContactKind kind)
        {
            ContactId = contactId;
            Kind = kind;
        }
    }

    /// <summary>The ship completed its transit and is on station at the contact.</summary>
    public readonly struct ShipArrivedAtContactEvent : ISimEvent
    {
        public readonly uint ContactId;
        public readonly ContactKind Kind;

        public ShipArrivedAtContactEvent(uint contactId, ContactKind kind)
        {
            ContactId = contactId;
            Kind = kind;
        }
    }
}
