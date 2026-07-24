using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Tools
{
    /// <summary>
    /// E0-5 WP-4 — the OPT-IN measurement source for the `occupancy --strip N` flag.
    ///
    /// WHY IT EXISTS: the handover's guardrail ("re-run occupancy, check the h29+ flatline lifts")
    /// is unsatisfiable without a designation source, and NO authored ship designates anything —
    /// deconstruct is the player's decision (ECONOMY.md §7.2), so authoring it into a ship would
    /// delete the decision. This harness supplies that intent for measurement ONLY: it is host-side,
    /// adds zero sim state, and the CI-pinned verb-less default path (`--strip 0`, the default)
    /// never calls it, so the pinned scenario/tick-3000/slice/defs hashes stay byte-identical.
    ///
    /// It is a thin wrapper around the SAME <c>DesignateDeconstructCommand</c> the shipping client
    /// issues, so what it measures is what a player would get.
    /// </summary>
    public static class StripHarness
    {
        /// <summary>
        /// The first <paramref name="n"/> WORKABLE interior (non-hull) WALL tiles, in canonical
        /// z,y,x scan order — the exact order the job dispatcher fills its tile board, so the harness
        /// designates a deterministic, reproducible prefix.
        ///
        /// A tile qualifies iff:
        ///   * it is a real <see cref="TileDefs.Wall"/>, AND
        ///   * it is NOT <see cref="DeconstructSystem.IsPressureHull"/> (the canvas edge), AND
        ///   * it has at least one WALKABLE 4-neighbour — a floor tile a crew member can stand on to
        ///     cut it.
        /// The first two are exactly <c>DeconstructSystem.CanDesignate</c>'s wall gate, so every pick
        /// is a legal designation. (The staging cap / duplicate / citizen-standing checks are moot:
        /// we return DISTINCT tiles, walls are not walkable, and the caller bounds N below
        /// <c>max_staged</c>.)
        ///
        /// WHY THE WALKABLE-NEIGHBOUR CLAUSE — a MEASURED correction, not the lane plan's letter.
        /// The plan §1 said "N legal interior walls in canonical order", full stop. Measured, that
        /// selects the wrong walls: the authored slice is CARVED FROM SOLID MASS (not one Void tile
        /// on either deck — see <c>DeconstructSystemTests</c>), so the only hull walls are the
        /// map-edge ring, and the first ~40 non-edge walls in z,y,x order are STRUCTURAL walls buried
        /// in that mass with no walkable neighbour on any side. They are legal to condemn but no crew
        /// can path adjacent (<c>JobWork.TryPathToAdjacent</c> finds no walkable neighbour), so they
        /// generate ZERO work: `--strip 40` on the naive selector tore down 0/40 over 3 sim-days and
        /// did not move occupancy. Requiring a walkable neighbour picks the interior PARTITIONS a
        /// player would actually strip (the "tear down the gym bulkhead" of ECONOMY.md §7.2) — the
        /// walls that create real demand. This is the honest measurement source, NOT a yield tune:
        /// the yield is untouched; only the harness stops designating unreachable rock.
        ///
        /// A ship with fewer than N workable interior walls returns all it has — the caller reports
        /// the shortfall. PURE (a fresh list, no sim mutation, no RNG); allocation-tolerant because
        /// it is a measurement helper, not a tick path.
        /// </summary>
        public static List<Int3> SelectWalls(World world, int n)
        {
            var picks = new List<Int3>(n < 0 ? 0 : n);
            if (world == null || n <= 0) return picks;
            for (int z = 0; z < world.Depth && picks.Count < n; z++)
                for (int y = 0; y < world.Height && picks.Count < n; y++)
                    for (int x = 0; x < world.Width && picks.Count < n; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (world.GetWall(p) != TileDefs.Wall) continue;      // only a standing wall
                        if (DeconstructSystem.IsPressureHull(world, p)) continue; // never the canvas edge
                        if (!HasWalkableNeighbor(world, p)) continue;         // must be reachable to work
                        picks.Add(p);
                    }
            return picks;
        }

        /// <summary>True iff any 4-neighbour (canonical +x,−x,+y,−y order) is in bounds and carries
        /// the <see cref="TileFlags.Walkable"/> flag — a floor tile a crew member can stand on to
        /// reach the wall. The base walkable flag (not the door-aware <c>Simulation.IsWalkable</c>)
        /// is the right proxy for SELECTION: the dispatcher does the real door-aware path at claim
        /// time; here we only need "there is a floor beside it".</summary>
        private static bool HasWalkableNeighbor(World world, Int3 pos)
        {
            for (int i = 0; i < 4; i++)
            {
                var neighbor = Int3.Neighbor4(pos, i);
                if (!world.InBounds(neighbor)) continue;
                if ((world.GetFlags(neighbor) & TileFlags.Walkable) != 0) return true;
            }
            return false;
        }

        /// <summary>
        /// Enqueue a <c>DesignateDeconstructCommand</c> (Wall) for each tile <see cref="SelectWalls"/>
        /// picks, exactly as a client click would. Commands apply at the next tick boundary (t=0),
        /// so the designations are live before the measurement loop counts its first hour. Returns
        /// the count enqueued.
        /// </summary>
        public static int EnqueueStrip(Simulation sim, int n)
        {
            var walls = SelectWalls(sim.World, n);
            for (int i = 0; i < walls.Count; i++)
                sim.EnqueueCommand(new DesignateDeconstructCommand(walls[i], DeconstructKind.Wall, on: true));
            return walls.Count;
        }
    }
}
