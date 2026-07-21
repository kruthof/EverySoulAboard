namespace Perilune.Sim
{
    /// <summary>
    /// A simulation system ticked at a fixed cadence. Systems run in the explicit
    /// order they are registered in <see cref="Simulation"/> — order is part of determinism.
    /// </summary>
    public interface ISimSystem
    {
        string Name { get; }

        /// <summary>Runs every N base ticks (1 = 10 Hz, 2 = 5 Hz, 10 = 1 Hz, ...).</summary>
        int IntervalTicks { get; }

        void Tick(Simulation sim);
    }
}
