namespace Perilune.Sim
{
    /// <summary>
    /// The single entry point for all input to the sim: player orders, UI actions,
    /// MOSS actuator calls, and validated LLM effects all become commands, queued
    /// from any thread and executed in arrival order at the start of a tick.
    /// The command log (given the same seed) fully determines sim state.
    /// </summary>
    public interface ISimCommand
    {
        void Execute(Simulation sim);
    }
}
