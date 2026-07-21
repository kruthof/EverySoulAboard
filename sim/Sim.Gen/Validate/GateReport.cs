using System.Collections.Generic;
using System.Text;

namespace Perilune.Gen.Validate
{
    /// <summary>One validation gate's structured verdict: a pass/fail plus a human-readable
    /// list of findings (empty on a clean pass, one line per problem on a failure). Gates
    /// never throw for a <em>ship</em> problem — they report it here; they throw only on a
    /// genuine harness bug.</summary>
    public sealed class GateResult
    {
        public string Code { get; }     // "V1".."V7"
        public string Name { get; }     // "connectivity", "power", …
        public bool Passed { get; }
        public IReadOnlyList<string> Findings { get; }

        public GateResult(string code, string name, bool passed, IReadOnlyList<string> findings)
        {
            Code = code;
            Name = name;
            Passed = passed;
            Findings = findings ?? System.Array.Empty<string>();
        }

        public static GateResult Pass(string code, string name) =>
            new GateResult(code, name, true, System.Array.Empty<string>());

        public static GateResult Fail(string code, string name, IReadOnlyList<string> findings) =>
            new GateResult(code, name, false, findings);
    }

    /// <summary>The aggregate verdict over V1–V7. <see cref="AllPassed"/> is the gate that the
    /// CLI's exit-code contract keys on; <see cref="Format"/> renders the full report (culture-
    /// free) for the CLI and the tests.</summary>
    public sealed class ValidationReport
    {
        public string ShipName { get; }
        public ulong Seed { get; }
        public IReadOnlyList<GateResult> Gates { get; }

        public ValidationReport(string shipName, ulong seed, IReadOnlyList<GateResult> gates)
        {
            ShipName = shipName;
            Seed = seed;
            Gates = gates;
        }

        public bool AllPassed
        {
            get
            {
                for (int i = 0; i < Gates.Count; i++)
                    if (!Gates[i].Passed) return false;
                return true;
            }
        }

        /// <summary>The first failing gate, or null. Used by the sweep summary.</summary>
        public GateResult FirstFailure()
        {
            for (int i = 0; i < Gates.Count; i++)
                if (!Gates[i].Passed) return Gates[i];
            return null;
        }

        public string Format()
        {
            var sb = new StringBuilder();
            sb.Append("validation: ").Append(ShipName).Append(" (seed ").Append(Seed).Append(')').Append('\n');
            for (int i = 0; i < Gates.Count; i++)
            {
                var g = Gates[i];
                sb.Append("  ").Append(g.Passed ? "PASS " : "FAIL ")
                  .Append(g.Code).Append(' ').Append(g.Name).Append('\n');
                for (int f = 0; f < g.Findings.Count; f++)
                    sb.Append("       - ").Append(g.Findings[f]).Append('\n');
            }
            sb.Append(AllPassed ? "  => ALL GATES PASS" : "  => GATE FAILURE");
            return sb.ToString();
        }
    }
}
