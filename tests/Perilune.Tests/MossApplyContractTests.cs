using Moonbase.Dsl;
using Moonbase.Sim;
using Moonbase.Tui;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// The MOSS pane's apply contract, exercised WITHOUT a terminal or $EDITOR (those live in
    /// GameLoop, impure). GameLoop.EditMossScript does a DUAL APPLY on the edited source —
    /// exactly what these tests drive directly:
    ///   1. sim.EnqueueCommand(new SetScriptCommand(id, src))  → canonical sim state (saved,
    ///      fed to both determinism twins), applied on the next Tick.
    ///   2. moss.SetProgram(id, src)                            → hot-swap the live program now.
    /// This mirrors MossBindings.ApplyScripts / the Unity MossTerminalPanel.Run contract.
    /// </summary>
    public class MossApplyContractTests
    {
        private const string TermHydro = "term_hydro"; // the one authored terminal on the ship

        [Test]
        public void RealShip_HasAuthoredScript_ThatBindsCleanly()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            Assert.IsTrue(TryGetSource(host.Sim, TermHydro, out var src), "term_hydro script exists at boot");
            Assert.IsNotEmpty(src);

            // Run past the 2s 'every' cadence; RegisterAdapters must resolve vent_hydro /
            // door_storage / the hydro & lifesupport room anchors, so no runtime error surfaces.
            for (int i = 0; i < 40; i++) host.Sim.Tick();
            Assert.IsFalse(host.Moss.TryGetRuntimeError(TermHydro, out var err),
                "authored program must not raise a runtime error — adapters cover its devices/rooms; got: " + err);
        }

        [Test]
        public void DualApply_MakesSourceCanonical_AndHotSwapsProgram()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            TryGetSource(host.Sim, TermHydro, out var original);
            string edited = original + "# edited by the pane\n";

            // The dual apply.
            host.Sim.EnqueueCommand(new SetScriptCommand(TermHydro, edited));
            var diags = host.Moss.SetProgram(TermHydro, edited);
            host.Sim.Tick(); // the command applies here

            // (1) canonical sim state updated in place (still exactly one entry for the terminal).
            Assert.IsTrue(TryGetSource(host.Sim, TermHydro, out var stored));
            Assert.AreEqual(edited, stored);
            Assert.AreEqual(1, CountEntries(host.Sim, TermHydro), "SetScript replaces, never duplicates");

            // (2) the appended comment still compiles clean (hot-swap took a valid program).
            Assert.AreEqual(0, diags.Count, "a trailing comment is valid MOSS");
        }

        [Test]
        public void EditToBrokenSource_SurfacesCompileDiagnostics()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            // What the pane shows is MossCompiler.Compile(source).Diagnostics — a pure read, no
            // SetProgram side effect (which would reset the running program's latches/timers).
            var diags = MossCompiler.Compile("if broken(").Diagnostics;
            Assert.Greater(diags.Count, 0, "a malformed program must produce diagnostics for the pane");
        }

        [Test]
        public void CreateNewScript_ForTerminalWithNone_IsAllowed()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            const string fresh = "term_fresh";
            Assert.IsFalse(TryGetSource(host.Sim, fresh, out _), "no script for a fresh terminal id");

            string src = "# created via empty-source editor path\nevery 5s:\n  open(door_storage)\n";
            host.Sim.EnqueueCommand(new SetScriptCommand(fresh, src));
            host.Moss.SetProgram(fresh, src);
            host.Sim.Tick();

            Assert.IsTrue(TryGetSource(host.Sim, fresh, out var stored), "new script now canonical state");
            Assert.AreEqual(src, stored);
        }

        private static bool TryGetSource(Simulation sim, string id, out string source)
        {
            for (int i = 0; i < sim.Scripts.Count; i++)
                if (sim.Scripts[i].TerminalId == id) { source = sim.Scripts[i].Source; return true; }
            source = null;
            return false;
        }

        private static int CountEntries(Simulation sim, string id)
        {
            int n = 0;
            for (int i = 0; i < sim.Scripts.Count; i++) if (sim.Scripts[i].TerminalId == id) n++;
            return n;
        }
    }
}
