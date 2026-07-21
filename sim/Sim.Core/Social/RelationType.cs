namespace Perilune.Sim
{
    /// <summary>
    /// The named tier a directed opinion edge has settled into (SocialSystem S1
    /// hysteresis classifier). Carried on the wire as a byte via
    /// <see cref="RelationshipChangedEvent"/>/<see cref="ArgumentEvent"/>/<see cref="BondEvent"/>
    /// so the event contract stays lane-independent. APPEND-ONLY: never renumber or
    /// remove a member — saves and event byte payloads pin these values.
    /// </summary>
    public enum RelationType : byte
    {
        None = 0,
        Friend = 1,
        CloseFriend = 2,
        Rival = 3,
        Enemy = 4,
    }
}
