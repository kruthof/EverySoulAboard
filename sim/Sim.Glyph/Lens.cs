namespace Perilune.Glyph
{
    /// <summary>
    /// A read-only overlay selector: which room/device metric recolours the map. None is
    /// the plain terrain view. The lens is a pure INPUT to <see cref="GlyphMapper"/> — it
    /// never touches the sim.
    /// </summary>
    public enum Lens : byte
    {
        None = 0,
        Pressure,
        Oxygen,
        Co2,
        Temperature,
        Power,
        Water,
    }
}
