using Moonbase.Sim;
using Moonbase.Tui;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// Fast .NET mirror of the Unity-side day-one survival gate: an UNTOUCHED
    /// shipping ship must keep both crew alive for a full day. This is the test
    /// that keeps the compact ship honest — smaller rooms hold less passive air,
    /// so the design must include working life support (the upper-deck corridor
    /// recirculator pair), not just volume. Caught a real asphyxiation when the
    /// planner shrank the hull.
    /// </summary>
    public class ShipDesignTests
    {
        [Test]
        public void AuthoredShip_KeepsCrewAlive_ForADay()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            var sim = host.Sim;
            long ticksPerDay = (long)(86400 * 10); // 10 Hz fixed tick
            for (long t = 0; t < ticksPerDay; t++) sim.Tick();

            int alive = 0;
            foreach (var c in sim.Citizens.Items) if (!c.Dead) alive++;
            Assert.AreEqual(2, alive, "nobody may die on day one of an untouched ship");
        }
    }
}
