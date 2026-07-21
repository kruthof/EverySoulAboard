using System;
using System.Collections.Generic;

namespace Perilune.Dsl
{
    /// <summary>Front door of the MOSS compiler. Never throws — all problems land in Diagnostics.</summary>
    public static class MossCompiler
    {
        public static CompiledScript Compile(string source)
        {
            var diagnostics = new List<Diagnostic>();
            try
            {
                var tokens = Lexer.Lex(source ?? string.Empty, diagnostics);
                var parser = new Parser(tokens, diagnostics);
                return parser.ParseProgram();
            }
            catch (Exception e)
            {
                // Belt and braces: a compiler bug must still surface as a diagnostic, not a crash.
                diagnostics.Add(new Diagnostic(1, 1, "internal compiler error: " + e.Message, DiagnosticSeverity.Error));
                return CompiledScript.Failed(diagnostics);
            }
        }
    }
}
