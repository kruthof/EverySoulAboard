using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// Hand-authored device positions for a SPECIFIC ship: Garvin arranges the
    /// baked preview / adopted dressing rooms in the editor, the DeviceLayout
    /// editor tool captures (device name → tile), and this applies the result to
    /// the plan BEFORE <see cref="ShipPlanBuilder.Build"/> — so the sim owns the
    /// outcome (pathing, jobs, saves and visuals all agree). Invalid entries are
    /// skipped with a report line instead of throwing: a stale hand edit must
    /// never brick the boot.
    /// </summary>
    public static class DeviceLayout
    {
        public struct Entry
        {
            public string Name;
            public Int3 Pos;
            public bool Remove; // delete the device from the plan instead of moving it
            public bool HasYaw; // visual-only rotation override (door frames, auto props);
            public float YawDeg; // the sim ignores it — the view layer applies it
        }

        /// <summary>Mutates plan.Devices in place. Returns human-readable problem
        /// lines for entries that could not be applied.</summary>
        public static List<string> Apply(ShipPlan plan, IReadOnlyList<Entry> entries)
        {
            var problems = new List<string>();
            if (plan == null || entries == null || entries.Count == 0) return problems;
            var world = AsciiWorld.Build(plan.DeckRows);

            for (int e = 0; e < entries.Count; e++)
            {
                var entry = entries[e];
                int idx = IndexOf(plan, entry.Name);
                if (idx < 0)
                {
                    problems.Add($"'{entry.Name}': no such device in plan");
                    continue;
                }
                var spec = plan.Devices[idx];
                // Yaw-only entries are purely visual (door frames, prop facing):
                // nothing for the sim to apply, and they must not trip the
                // structural-device guard below.
                if (entry.HasYaw && !entry.Remove && entry.Pos.Equals(spec.Pos)) continue;
                if (spec.Kind == DeviceKind.Door || spec.Kind == DeviceKind.Ladder)
                {
                    problems.Add($"'{entry.Name}': {spec.Kind} is structural — edit the plan, not the layout");
                    continue;
                }
                if (Simulation.IsUtilityOverlay(spec.Kind))
                {
                    problems.Add($"'{entry.Name}': utility overlays are not hand-layouted");
                    continue;
                }
                if (entry.Remove)
                {
                    plan.Devices.RemoveAt(idx);
                    continue;
                }
                if (!world.InBounds(entry.Pos))
                {
                    problems.Add($"'{entry.Name}': {entry.Pos} out of bounds");
                    continue;
                }
                if (world.GetFloor(entry.Pos) == TileDefs.Void || world.GetWall(entry.Pos) != 0)
                {
                    problems.Add($"'{entry.Name}': {entry.Pos} is not open floor");
                    continue;
                }
                spec.Pos = entry.Pos;
                plan.Devices[idx] = spec;
            }
            return problems;
        }

        private static int IndexOf(ShipPlan plan, string name)
        {
            if (string.IsNullOrEmpty(name)) return -1;
            for (int i = 0; i < plan.Devices.Count; i++)
                if (plan.Devices[i].Name == name) return i;
            return -1;
        }
    }
}
