using System.Collections.Generic;

namespace Moonbase.Sim
{
    /// <summary>
    /// The one authoritative system registration order (order is load-bearing:
    /// Sustenance/Crafting/Maintenance after JobSystem, Hydroponics after Water,
    /// Needs after everything that moves people, Exploration late, MOSS last).
    /// Bootstrap and the headless ScenarioRunner both build from here so the
    /// shipping game and the determinism harness can never diverge.
    /// The MOSS runtime lives in Sim.Dsl, so it is passed in as a plain ISimSystem.
    /// The optional designer-rule system (B5, also Sim.Dsl) runs just BEFORE the player
    /// MOSS runtime: both address the same shared DeviceRegistry, so rules and player
    /// scripts see the same devices and the same tick's state. When it is null the array
    /// is byte-for-byte the pre-B5 stack, so a rules-absent sim hashes identically (no
    /// extra IStatefulSystem folds into StateHash).
    /// </summary>
    public static class SystemStack
    {
        public static ISimSystem[] CreateDefault(ISimSystem mossRuntime, ISimSystem designerRules = null)
        {
            var stack = new List<ISimSystem>(16)
            {
                new AtmosphereSystem(),
                new PowerSystem(),
                new ThermalSystem(),
                new WaterSystem(),
                new CitizenSystem(),
                new JobSystem(),
                new SustenanceSystem(),
                new CraftingSystem(),
                new MachineWearSystem(),
                new MaintenanceSystem(),
                new HydroponicsSystem(),
                new NeedsSystem(),
                new ExplorationSystem(),
                new GoalSystem(),
                new HistorySystem(),
            };
            if (designerRules != null) stack.Add(designerRules); // rules act, then player scripts
            stack.Add(mossRuntime);
            return stack.ToArray();
        }
    }
}
