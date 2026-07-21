using System.Globalization;

namespace Moonbase.Dsl
{
    public enum DslKind : byte { Number, Bool, Str }

    /// <summary>
    /// The single value type of MOSS: a number (double), a boolean, or a string.
    /// A struct so that steady-state interpretation never boxes or allocates.
    /// Unit suffixes on literals (%, ppm, kPa, C, kW) are metadata only — the
    /// raw number is stored (19.5% => 19.5, 5000ppm => 5000).
    /// </summary>
    public readonly struct DslValue
    {
        public readonly DslKind Kind;
        public readonly double Num;
        public readonly bool Bool;
        public readonly string Str;

        private DslValue(DslKind kind, double num, bool boolean, string str)
        {
            Kind = kind;
            Num = num;
            Bool = boolean;
            Str = str;
        }

        public static DslValue Number(double v) => new DslValue(DslKind.Number, v, false, null);
        public static DslValue Boolean(bool v) => new DslValue(DslKind.Bool, 0, v, null);
        public static DslValue Text(string v) => new DslValue(DslKind.Str, 0, false, v);

        /// <summary>For audit/error messages only — allocates for numbers.</summary>
        public override string ToString()
        {
            switch (Kind)
            {
                case DslKind.Bool: return Bool ? "true" : "false";
                case DslKind.Str: return Str ?? "";
                default: return Num.ToString(CultureInfo.InvariantCulture);
            }
        }
    }
}
