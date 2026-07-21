using System.Collections.Generic;
using System.Text;

namespace Perilune.Llm.Providers
{
    /// <summary>
    /// Incremental newline-delimited line splitter — the framing layer under NDJSON streaming
    /// (Ollama). Fed arbitrary text chunks via <see cref="Push"/>, it yields each complete line and
    /// buffers a trailing partial line across chunk boundaries; <see cref="Flush"/> emits a final
    /// unterminated line. LF, CRLF, and bare CR all terminate a line (a CR that ends one chunk is
    /// reconciled with an LF that opens the next). Empty lines are skipped — NDJSON has one JSON
    /// object per non-empty line. Never throws.
    /// </summary>
    public sealed class LineReader
    {
        private readonly StringBuilder _line = new StringBuilder();
        private bool _sawCr;

        public IEnumerable<string> Push(string chunk)
        {
            if (string.IsNullOrEmpty(chunk)) yield break;

            for (int i = 0; i < chunk.Length; i++)
            {
                char c = chunk[i];
                if (c == '\r')
                {
                    if (_line.Length > 0) { yield return _line.ToString(); _line.Clear(); }
                    _sawCr = true;
                }
                else if (c == '\n')
                {
                    if (_sawCr) { _sawCr = false; }
                    else if (_line.Length > 0) { yield return _line.ToString(); _line.Clear(); }
                }
                else
                {
                    _sawCr = false;
                    _line.Append(c);
                }
            }
        }

        public IEnumerable<string> Flush()
        {
            if (_line.Length > 0)
            {
                yield return _line.ToString();
                _line.Clear();
            }
        }
    }
}
