using Moonbase.Dsl;
using Moonbase.Sim;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>Proves the dotnet test host compiles the sim sources and can tick.</summary>
    public class SmokeTests
    {
        [Test]
        public void SimTicksAndHashesDeterministically()
        {
            var map = new[]
            {
                "#####",
                "#...#",
                "#####",
            };
            var a = new Simulation(AsciiWorld.Build(map), 7,
                SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));
            var b = new Simulation(AsciiWorld.Build(map), 7,
                SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));
            for (int i = 0; i < 100; i++) { a.Tick(); b.Tick(); }
            Assert.That(a.StateHash(), Is.EqualTo(b.StateHash()));
        }
    }
}
