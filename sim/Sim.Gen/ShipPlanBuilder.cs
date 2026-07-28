using System;
using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// The single path from a <see cref="ShipPlan"/> to a running
    /// <see cref="Simulation"/>. Deterministic: same plan + same systems →
    /// identical sim state. Throws on authoring errors (bad anchors, devices in
    /// walls) so broken plans fail at boot, not mid-game.
    /// </summary>
    public static class ShipPlanBuilder
    {
        public static Simulation Build(ShipPlan plan, ISimSystem[] systems, SimDefs defs = null)
        {
            if (plan == null) throw new ArgumentNullException(nameof(plan));
            if (plan.DeckRows == null || plan.DeckRows.Length == 0)
                throw new ArgumentException($"plan '{plan.Name}': no deck rows");

            var world = AsciiWorld.Build(plan.DeckRows);
            var sim = new Simulation(world, plan.Seed, systems, defs);

            for (int i = 0; i < plan.Devices.Count; i++)
            {
                var spec = plan.Devices[i];
                if (!world.InBounds(spec.Pos))
                    throw new ArgumentException($"plan '{plan.Name}': device {spec.Name} out of bounds at {spec.Pos}");
                if (!Simulation.IsUtilityOverlay(spec.Kind) && world.GetWall(spec.Pos) != 0)
                    throw new ArgumentException($"plan '{plan.Name}': device {spec.Name} inside a wall at {spec.Pos}");
                var device = sim.AddDevice(spec.Kind, spec.Pos, spec.Name);
                device.IsOpen = spec.IsOpen;
                device.StoredKWh = spec.StoredKWh;
                device.StoredLiters = spec.StoredLiters;

                // W1 (the wreck start): OPTIONAL damage authoring. `null` means the author said
                // nothing, so NOTHING is written and Device's own initialisers stand — Condition
                // = 1f, Scriptable = true. Every DeviceSpec on grid/slice/perilune omits both, so
                // these two lines are a no-op on every shipped ship BY CONSTRUCTION rather than by
                // coincidence; that is pinned by AuthoredDamageTests' census (0 non-pristine
                // devices on all three ships), whose non-vacuity is an inclusion test that plants
                // a wrecked device and requires the same census to catch it.
                // See DeviceSpec.Condition for why the encoding is Nullable and not a sentinel.
                if (spec.Condition.HasValue)
                {
                    float condition = spec.Condition.Value;
                    // Domain check, in the same spirit as the bounds/wall/debris/anchor checks
                    // around it: a broken plan fails at boot, not mid-game. `!(a && b)` rather
                    // than `<0 || >1` so NaN is refused too.
                    //
                    // ⚠️ THIS IS AN AUTHORING-TIME TYPO-CATCH, NOT AN INVARIANT ON
                    // `Device.Condition`, AND NOTHING SHOULD LATER BE BUILT ON IT AS IF IT WERE.
                    // It sees exactly one of the field's several writers — this one. Condition
                    // arrives out of range by other routes with nothing to stop it:
                    // `SaveReader.cs:307` reads a raw Single straight off the stream with no
                    // clamp (a hand-edited or corrupt save is unfiltered), and
                    // `MachineWearSystem.cs:280/284` assign `RestoredCondition`/`JuryRigCondition`
                    // — def scalars — unguarded, so a bad `wear.def` puts a device above 1
                    // without passing through here at all. Making this an invariant would mean
                    // clamping at the field, which is a different (and unchartered) change.
                    if (!(condition >= 0f && condition <= 1f))
                        throw new ArgumentException(
                            $"plan '{plan.Name}': device {spec.Name} authors Condition {condition.ToString(System.Globalization.CultureInfo.InvariantCulture)} outside 0..1");
                    device.Condition = condition;
                }
                if (spec.Scriptable.HasValue) device.Scriptable = spec.Scriptable.Value;
            }

            for (int i = 0; i < plan.Citizens.Count; i++)
            {
                var spec = plan.Citizens[i];
                var citizen = sim.AddCitizen(spec.Name, spec.Pos);
                citizen.AutoWander = spec.AutoWander;
                citizen.RevealsFog = spec.RevealsFog;
                citizen.HoldPosition = spec.HoldPosition;
            }

            for (int i = 0; i < plan.Items.Count; i++)
            {
                var spec = plan.Items[i];
                var item = sim.AddItem(spec.Kind, spec.Count, spec.Pos);
                if (!string.IsNullOrEmpty(spec.Label)) item.Label = spec.Label;
            }

            // Authored dig designations: the same flag DesignateDigCommand sets, seeded at
            // boot so the job board has work from tick 0. Validated like devices/anchors —
            // a designation on something that isn't debris is an authoring error, not a
            // silent no-op (the whole point is that the crew CAN reach and dig it).
            for (int i = 0; i < plan.DigDesignations.Count; i++)
            {
                var pos = plan.DigDesignations[i];
                if (!world.InBounds(pos))
                    throw new ArgumentException($"plan '{plan.Name}': dig designation out of bounds at {pos}");
                if (world.GetWall(pos) != TileDefs.Debris)
                    throw new ArgumentException($"plan '{plan.Name}': dig designation at {pos} is not debris");
                world.SetFlag(pos, TileFlags.Designated, true);
            }
            if (plan.DigDesignations.Count > 0) sim.JobsDirty |= JobBoardDirty.Tiles; // boot dig designations

            for (int i = 0; i < plan.Rooms.Count; i++)
            {
                var spec = plan.Rooms[i];
                if (sim.World.GetWall(spec.Probe) != 0)
                    throw new ArgumentException($"plan '{plan.Name}': anchor {spec.Anchor} probes a wall at {spec.Probe}");
                sim.Rooms.SetAnchor(spec.Anchor, spec.Probe, spec.Type);
            }

            if (plan.Goals.Count > 0)
            {
                GoalSystem goals = null;
                for (int i = 0; i < systems.Length; i++)
                    if (systems[i] is GoalSystem g) goals = g;
                if (goals == null)
                    throw new ArgumentException($"plan '{plan.Name}' has goals but the system stack has no GoalSystem");
                for (int i = 0; i < plan.Goals.Count; i++)
                    goals.Add(plan.Goals[i].Kind, plan.Goals[i].Param, plan.Goals[i].Text);
            }

            sim.Rooms.RecomputeIfDirty(sim);
            for (int i = 0; i < plan.PressurizedAnchors.Count; i++)
            {
                string name = plan.PressurizedAnchors[i];
                var room = RoomOf(sim, name)
                    ?? throw new ArgumentException($"plan '{plan.Name}': pressurized anchor '{name}' not found");
                if (ReferenceEquals(room, sim.Rooms.Rooms[0]))
                    throw new ArgumentException($"plan '{plan.Name}': anchor '{name}' resolves to vacuum — leaky room");
                RoomState.Pressurize(room);
            }

            for (int i = 0; i < plan.Scripts.Count; i++)
                sim.SetScript(plan.Scripts[i].TerminalId, plan.Scripts[i].Source);

            return sim;
        }

        private static Room RoomOf(Simulation sim, string anchorName)
        {
            var anchors = sim.Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
                if (anchors[i].Name == anchorName)
                    return sim.Rooms.RoomAt(sim.World, anchors[i].Probe);
            return null;
        }
    }
}
