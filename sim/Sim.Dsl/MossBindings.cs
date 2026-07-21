using Moonbase.Sim;

namespace Moonbase.Dsl
{
    /// <summary>
    /// The one MOSS binding recipe shared by every host (Unity view and headless
    /// clients): wire sim devices/rooms to script adapters, then load the authored
    /// terminal programs. Derived purely from sim state — valid for fresh and
    /// loaded games alike, so both twins bind identically.
    /// </summary>
    public static class MossBindings
    {
        /// <summary>MOSS bindings, derived purely from sim state — valid for fresh and loaded games.</summary>
        public static void RegisterAdapters(Simulation sim, DeviceRegistry registry)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var device = devices[i];
                if (string.IsNullOrEmpty(device.Name)) continue;
                switch (device.Kind)
                {
                    case DeviceKind.Door:
                        registry.Register(device.Name, new DoorAdapter(sim, device));
                        break;
                    case DeviceKind.AirVent:
                    case DeviceKind.Scrubber:
                    case DeviceKind.SolarWing:
                    case DeviceKind.GrowBed:
                    case DeviceKind.WaterTank:
                    case DeviceKind.Reclaimer:
                        registry.Register(device.Name, new UtilityDeviceAdapter(sim, device));
                        break;
                }
            }

            // Room sensors come from sim-state anchors (saved; survive loads and recomputes).
            var anchors = sim.Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
                registry.Register(anchors[i].Name, new RoomAdapter(sim, anchors[i].Probe));

            // The read-only ship-wide metrics namespace (B5): available to player scripts
            // and designer rules alike. Read-only, so it can't touch the player invariant.
            registry.Register("ship", new ShipMetricsAdapter(sim));
        }

        /// <summary>Compile every saved script from sim.Scripts — source is sim state,
        /// so a loaded game recompiles to identical programs.</summary>
        public static void ApplyScripts(Simulation sim, ScriptRuntime moss)
        {
            for (int i = 0; i < sim.Scripts.Count; i++)
                moss.SetProgram(sim.Scripts[i].TerminalId, sim.Scripts[i].Source);
        }
    }
}
