using System;

namespace Perilune.Glyph
{
    /// <summary>
    /// A semantic colour id — never an RGB value. The map layer emits these; the skin
    /// (terminal palette, web sprite tint) is the sole owner of concrete colours. New
    /// ids append to the END: the enum index is a stable golden-file token (base-36),
    /// so reordering would silently rewrite every golden.
    /// </summary>
    public enum GlyphColor : byte
    {
        Unknown = 0,   // fog / unresolved
        Void,          // vacuum, off-ship
        Floor,
        Wall,
        Debris,
        Crew,          // friendly citizen
        Hostile,       // enemy citizen
        Item,          // ground stack
        Device,        // operational machine
        DeviceDim,     // powered-draw machine currently unpowered
        Broken,        // machine below its fail threshold / corpse
        Locked,        // locked door
        Terminal,
        Water,         // reserved: liquid rendering (no emitter yet)
        Growth,        // reserved: crop maturity tint (no emitter yet)
        Designate,     // reserved: A4 dig designation
        Stockpile,     // reserved: A4 stockpile zones
        LensGood,      // overlay ramps (best → worst, plus cold/hot poles)
        LensOk,
        LensWarn,
        LensBad,
        LensCold,
        LensHot,
        Accent,
        Text,
        TextDim,
    }

    /// <summary>Per-cell rendering attributes; the skin decides how each is shown.</summary>
    [Flags]
    public enum GlyphAttr : byte
    {
        None = 0,
        Inverse = 1 << 0, // cursor / selection
        Dim = 1 << 1,     // de-emphasised; canonical unpowered signal (DeviceDim colour is a convenience mirror)
        Bold = 1 << 2,    // reserved: A4 pane emphasis (no emitter yet)
    }
}
