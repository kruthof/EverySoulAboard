namespace Perilune.Sim
{
    /// <summary>A terminal's MOSS program source — sim state, saved in the DSLS chapter.</summary>
    public readonly struct ScriptEntry
    {
        public readonly string TerminalId;
        public readonly string Source;

        public ScriptEntry(string terminalId, string source)
        {
            TerminalId = terminalId;
            Source = source;
        }
    }
}
