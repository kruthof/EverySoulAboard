namespace Moonbase.Dsl
{
    public enum DiagnosticSeverity : byte { Error, Warning }

    /// <summary>A compile-time diagnostic. Line/Col are 1-based.</summary>
    public readonly struct Diagnostic
    {
        public readonly int Line, Col;
        public readonly string Message;
        public readonly DiagnosticSeverity Severity;

        public Diagnostic(int line, int col, string message, DiagnosticSeverity severity)
        {
            Line = line;
            Col = col;
            Message = message;
            Severity = severity;
        }

        public override string ToString() =>
            (Severity == DiagnosticSeverity.Error ? "error (" : "warning (") + Line + "," + Col + "): " + Message;
    }
}
