using System.Collections.Generic;

namespace Perilune.Sim
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
            // Hoisted: MachineWear consumes the Director's WearPressure lever, but the
            // Director TICKS late (after Goal, before History) — one instance, two slots.
            var director = new DirectorSystem();
            var stack = new List<ISimSystem>(16)
            {
                new AtmosphereSystem(),
                new PowerSystem(),
                new NavSystem(),           // after Power: telescope Powered flags are fresh this tick
                new ThermalSystem(),
                new WaterSystem(),
                new CitizenSystem(),
                new JobSystem(),
                new SustenanceSystem(),
                new CraftingSystem(),
                new MachineWearSystem(director),
                new MaintenanceSystem(),
                new BuildSystem(),         // passive; completions applied after job progress this tick
                // Economy Wave 0 (W0-6): four PASSIVE, EMPTY registries grouped here beside the
                // existing passive BuildSystem. Their Tick is a no-op today; they exist so their
                // SYSS chapters and checksum seeds are registered (one batched pin move) before
                // the economy lanes spawn. The E-lane named on each fills in the real state.
                // ORDER IS LOAD-BEARING: it fixes the SYSS fold order and therefore the pin, so a
                // later reorder is another pin move. Fixed as the ECONOMY-PLAN §2 lane order
                // (E-STOCK, E-PROD, E-MINE, E-VOY) = the §3.1 seed order — do not reorder.
                new StockZoneSystem(),     // 'ZONE' — E-STOCK filtered stockpiles (empty)
                new ProductionSystem(),    // 'PROD' — E-PROD production graph & bills (empty)
                new OreRegistrySystem(),   // 'ORES' — E-MINE ore registry, a job-source's state (empty)
                new TradeSystem(),         // 'TRAD' — E-VOY trade (empty)
                new HydroponicsSystem(),
                new NeedsSystem(),
                new SafetySystem(),        // after Needs: acts on this tick's fresh Suffocation — a crew
                                           // member in lethal air drops its job and flees to breathable air
                new SocialSystem(),        // after Needs: positions and deaths settled this tick
                new ExplorationSystem(),
                new GoalSystem(),
                director,                  // tension curve reads the settled day; lever feeds MachineWear next tick
                new HistorySystem(),
            };
            if (designerRules != null) stack.Add(designerRules); // rules act, then player scripts
            stack.Add(mossRuntime);
            return stack.ToArray();
        }
    }
}
