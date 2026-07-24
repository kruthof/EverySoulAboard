using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Tools
{
    /// <summary>
    /// E0-4 WP-3 — the OPT-IN measurement source for the `occupancy --stockpile &lt;bench|far&gt; [N]`
    /// flag. The exact structural twin of <see cref="StripHarness"/> (E0-5's `--strip N`).
    ///
    /// WHY IT EXISTS: the lane's acceptance (plan §1) is the ECONOMY.md §8 A/B — a stockpile beside
    /// the benches is a pre-positioning buffer; a stockpile on the WRONG deck reproduces the −14 %
    /// output-strand regression — but NO authored ship designates a stockpile (plan §0/§1.2:
    /// `HANDOVER.md:199` forbids it, because a zone is the player's decision and authoring one would
    /// delete that decision AND move the four pins). So the lane, exactly like E0-5, ships its own
    /// host-side measurement surface: it enqueues the SAME <see cref="DesignateStockpileCommand"/> a
    /// client click issues, adds zero sim state, and the CI-pinned verb-less default path (no
    /// `--stockpile` flag) never calls it, so the scenario/tick-3000/slice/defs hashes stay
    /// byte-identical.
    ///
    /// Two modes, both accept-all presence stockpiles (no filter — the pre-WP-4 "before"):
    ///   * <c>bench</c> — a small stockpile on the walkable floor NEAREST the crafting benches
    ///     (SalvageRecycler / Fabricator / MachineShop), the pre-positioning-buffer case.
    ///   * <c>far</c> — a stockpile on the OPPOSITE deck, FARTHEST from the benches, the wrong-deck
    ///     case ECONOMY.md §8 measured at 75.7 % on-job travel / −14 % throughput.
    /// </summary>
    public static class StockpileHarness
    {
        /// <summary>The three crafting stations whose outputs generate the haul traffic this lane
        /// measures (`ShipSystems.cs:144`'s crafting set). A stockpile's usefulness or harm is
        /// entirely relative to where these sit.</summary>
        private static bool IsBench(DeviceKind k) =>
            k == DeviceKind.SalvageRecycler || k == DeviceKind.Fabricator || k == DeviceKind.MachineShop;

        /// <summary>A cross-deck-aware distance from a tile to the NEAREST crafting bench. In-plane
        /// cost is Manhattan; a deck change is a whole ladder traverse, so each <c>|dz|</c> step
        /// carries a large penalty — large enough that ANY off-deck tile is farther than EVERY
        /// on-deck tile. This is what makes <c>far</c> land on the opposite deck (the benches are all
        /// on deck 0 in the slice) rather than merely at the far end of the same deck. Returns
        /// <see cref="int.MaxValue"/> when the ship has no bench (nothing to be near/far from).</summary>
        private const int DeckPenalty = 100000;

        private static int DistToNearestBench(Simulation sim, Int3 pos)
        {
            int best = int.MaxValue;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                if (!IsBench(devices[i].Kind)) continue;
                var b = devices[i].Pos;
                int inPlane = System.Math.Abs(pos.X - b.X) + System.Math.Abs(pos.Y - b.Y);
                int d = inPlane + DeckPenalty * System.Math.Abs(pos.Z - b.Z);
                if (d < best) best = d;
            }
            return best;
        }

        /// <summary>
        /// The N stockpile tiles for a mode, chosen deterministically. Every WALKABLE floor tile is a
        /// candidate (the same gate <see cref="DesignateStockpileCommand"/> enforces — a stockpile
        /// only lives on walkable floor). Candidates are ordered by distance-to-nearest-bench —
        /// ASCENDING for <c>bench</c> (nearest first ⇒ a buffer hugging the stations), DESCENDING for
        /// <c>far</c> (farthest first ⇒ the opposite deck) — with strict canonical z,y,x order as the
        /// tie-break, so the pick is a reproducible prefix (the <see cref="StripHarness"/> determinism
        /// discipline). The first N are taken.
        ///
        /// A ship with fewer than N walkable tiles returns all it has; a ship with no bench returns an
        /// empty list (the caller reports the shortfall). PURE — a fresh list, no sim mutation, no RNG;
        /// allocation-tolerant because it is a measurement helper, not a tick path.
        /// </summary>
        public static List<Int3> SelectStockpile(Simulation sim, bool far, int n)
        {
            var picks = new List<Int3>(n < 0 ? 0 : n);
            if (sim == null || n <= 0) return picks;
            var world = sim.World;

            // No bench ⇒ "near/far the benches" is undefined; select nothing rather than guess.
            bool hasBench = false;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count && !hasBench; i++) hasBench = IsBench(devices[i].Kind);
            if (!hasBench) return picks;

            // Gather every walkable candidate with its bench distance and a canonical z,y,x key. The
            // scan is itself canonical, so the tie-break is stable without a second sort key beyond it.
            var cands = new List<(int dist, ulong key, Int3 pos)>();
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Walkable) == 0) continue;   // stockpile ⇒ walkable floor
                        if ((world.GetFlags(p) & TileFlags.Stockpile) != 0) continue;  // already zoned
                        cands.Add((DistToNearestBench(sim, p), Pack(p), p));
                    }

            // Deterministic order: primary by distance (near-first for bench, far-first for far),
            // secondary by canonical z,y,x. A stable, total order ⇒ the same N tiles every run.
            cands.Sort((a, b) =>
            {
                int c = far ? b.dist.CompareTo(a.dist) : a.dist.CompareTo(b.dist);
                return c != 0 ? c : a.key.CompareTo(b.key);
            });

            for (int i = 0; i < cands.Count && picks.Count < n; i++) picks.Add(cands[i].pos);
            return picks;
        }

        /// <summary>Canonical z,y,x pack (20 bits/axis) — the tie-break key, identical to the sort
        /// keys the registries use. Copied here as a measurement helper (host-side, not a tick path).</summary>
        private static ulong Pack(Int3 p) =>
            (ulong)(uint)p.X | ((ulong)(uint)p.Y << 20) | ((ulong)(uint)p.Z << 40);

        /// <summary>
        /// Enqueue a <c>DesignateStockpileCommand</c> (on) for each tile <see cref="SelectStockpile"/>
        /// picks, exactly as a client click would. Presence only — NO filter (the pre-WP-4 accept-all
        /// "before" of the lane's A/B). Commands apply at the next tick boundary (t=0), so the zones
        /// are live before the measurement loop counts its first hour. Returns the count enqueued.
        /// </summary>
        public static int EnqueueStockpile(Simulation sim, bool far, int n)
        {
            var tiles = SelectStockpile(sim, far, n);
            for (int i = 0; i < tiles.Count; i++)
                sim.EnqueueCommand(new DesignateStockpileCommand(tiles[i], on: true));
            return tiles.Count;
        }
    }
}
