using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;   // GameSession, WireFormat

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ SMOOTH PAWN MOVEMENT (option B) — the sim stays discrete; the HOST publishes where the
    /// figure should be DRAWN between two tiles, and the client draws its feet there.
    ///
    /// <para><b>THE ONE THING THAT IS EASY TO GET BACKWARDS, AND IS THEREFORE DRIVEN HERE RATHER
    /// THAN REASONED ABOUT.</b> <c>CitizenSystem</c> takes the step FIRST and pays for it
    /// afterwards — <c>PrevPos = Pos; Pos = next; MoveCooldown = ticksPerTile</c> — so for the
    /// whole cooldown window <c>Citizen.Pos</c> is ALREADY the destination, and the counter counts
    /// DOWN. A fresh counter therefore means the figure stands on <c>PrevPos</c>, the tile she is
    /// LEAVING. Interpolating <c>Pos → Path[PathIndex]</c> (the obvious reading of "walk to the
    /// next tile") would draw her a whole tile ahead of the truth, and every assertion below would
    /// still pass on the ratio-shaped ones — so the direction is pinned with an ABSOLUTE equality
    /// against <c>PrevPos</c> at the fresh counter, not with a "somewhere in between".</para>
    ///
    /// <para>Every leg drives a real sim: the walk comes from a <see cref="MoveCitizenCommand"/>
    /// on the shipping boot ship, and the trace is read off the sim tick by tick. No state is
    /// hand-planted anywhere in this file.</para>
    /// </summary>
    public class PawnGlideTests
    {
        /// <summary>One tick's worth of the walk, as the render path would see it.</summary>
        private readonly struct Sample
        {
            public readonly Int3 Prev, Pos;
            public readonly int Cooldown;
            public readonly float Fx, Fy;
            public Sample(Int3 prev, Int3 pos, int cooldown, float fx, float fy)
            { Prev = prev; Pos = pos; Cooldown = cooldown; Fx = fx; Fy = fy; }
            public override string ToString() =>
                string.Format(CultureInfo.InvariantCulture, "prev=({0},{1}) pos=({2},{3}) mc={4} f=({5},{6})",
                    Prev.X, Prev.Y, Pos.X, Pos.Y, Cooldown, Fx, Fy);
        }

        /// <summary>Boot the shipping ship and put ONE crew member on a real multi-tile route,
        /// then record <paramref name="ticks"/> ticks of her walk. Returns the citizen and the
        /// trace. The target is chosen by asking the sim's own pathfinder, so the route is one the
        /// citizen can actually walk.</summary>
        private static (Citizen c, List<Sample> trace, int tpt) WalkTrace(int ticks = 60)
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            var sim = host.Sim;
            int tpt = sim.Defs.Citizen.TicksPerTile;
            Assert.That(tpt, Is.GreaterThan(1), "a 1-tick tile would make the glide unobservable");

            var c = sim.Citizens.Items.FirstOrDefault(z => !z.Dead);
            Assert.IsNotNull(c, "the boot ship has living crew");

            var target = FindRouteTarget(sim, c, minSteps: 4);
            Assert.IsNotNull(target, "the boot ship offers a walkable route of 4+ tiles from the crew member");

            sim.EnqueueCommand(new MoveCitizenCommand(c.Id, target.Value));
            var trace = new List<Sample>(ticks);
            for (int i = 0; i < ticks; i++)
            {
                sim.Tick();
                var (fx, fy) = GameSession.WalkFraction(c, tpt);
                trace.Add(new Sample(c.PrevPos, c.Pos, c.MoveCooldown, fx, fy));
            }
            return (c, trace, tpt);
        }

        private static Int3? FindRouteTarget(Simulation sim, Citizen c, int minSteps)
        {
            var scratch = new List<Int3>();
            for (int r = minSteps; r <= 14; r++)
                for (int dx = -r; dx <= r; dx++)
                    for (int dy = -r; dy <= r; dy++)
                    {
                        if (Math.Abs(dx) + Math.Abs(dy) < minSteps) continue;
                        var p = new Int3(c.Pos.X + dx, c.Pos.Y + dy, c.Pos.Z);
                        if (p == c.Pos || !sim.IsWalkable(p)) continue;
                        scratch.Clear();
                        if (sim.Paths.FindPath(sim, c.Pos, p, scratch) && scratch.Count >= minSteps) return p;
                    }
            return null;
        }

        /// <summary>The samples of ONE glide segment: the consecutive run over which PrevPos and
        /// Pos both stay put and differ (i.e. one tile step being paid for).</summary>
        private static List<Sample> FirstMovingSegment(List<Sample> trace)
        {
            for (int i = 0; i < trace.Count; i++)
            {
                if (trace[i].Prev == trace[i].Pos) continue;
                var seg = new List<Sample>();
                for (int j = i; j < trace.Count; j++)
                {
                    if (trace[j].Prev != trace[i].Prev || trace[j].Pos != trace[i].Pos) break;
                    seg.Add(trace[j]);
                }
                if (seg.Count >= 2) return seg;
            }
            return null;
        }

        // ---------------------------------------------------------------- the direction

        [Test]
        public void FreshCounter_Draws_The_Pawn_On_The_DEPARTED_Tile_Not_The_Destination()
        {
            var (_, trace, tpt) = WalkTrace();
            var seg = FirstMovingSegment(trace);
            Assert.IsNotNull(seg, "the ordered walk produced a tile step");

            var first = seg[0];
            Assert.AreEqual(tpt, first.Cooldown,
                "the first sample of a segment is the tick the step was taken — a FULL counter");
            // ABSOLUTE, not "between": this is the leg that fails if the interpolation is written
            // Pos → Path[PathIndex] instead of PrevPos → Pos.
            Assert.AreEqual((float)first.Prev.X, first.Fx, 1e-6f, "fresh counter ⇒ standing on the DEPARTED tile x");
            Assert.AreEqual((float)first.Prev.Y, first.Fy, 1e-6f, "fresh counter ⇒ standing on the DEPARTED tile y");
            Assert.That(first.Prev, Is.Not.EqualTo(first.Pos), "precondition: the two tiles differ");
            // …and it is NOT the destination, which is where a sign error would put it.
            bool atDestination = Math.Abs(first.Fx - first.Pos.X) < 1e-6f && Math.Abs(first.Fy - first.Pos.Y) < 1e-6f;
            Assert.IsFalse(atDestination, "a fresh counter must not read as 'already arrived' — " + first);
        }

        // ---------------------------------------------------------------- strictly between + monotone

        [Test]
        public void MidTile_Position_Is_Strictly_Between_The_Two_Tiles_And_Advances_Monotonically()
        {
            var (_, trace, tpt) = WalkTrace();
            var seg = FirstMovingSegment(trace);
            Assert.IsNotNull(seg, "the ordered walk produced a tile step");
            var a = seg[0].Prev; var b = seg[0].Pos;

            // The whole segment stays inside the closed box between the two tile centres.
            foreach (var s in seg)
            {
                Assert.That(s.Fx, Is.InRange(Math.Min(a.X, b.X), Math.Max(a.X, b.X)), "x stays between the tiles — " + s);
                Assert.That(s.Fy, Is.InRange(Math.Min(a.Y, b.Y), Math.Max(a.Y, b.Y)), "y stays between the tiles — " + s);
            }

            // Progress along the segment's own direction is STRICTLY increasing every tick, and at
            // least one interior sample is off BOTH endpoints — "between" in the strict sense.
            double dx = b.X - a.X, dy = b.Y - a.Y;
            double len2 = dx * dx + dy * dy;
            Assert.That(len2, Is.GreaterThan(0));
            double prevT = -1; int strictlyInterior = 0;
            foreach (var s in seg)
            {
                double t = ((s.Fx - a.X) * dx + (s.Fy - a.Y) * dy) / len2;
                Assert.That(t, Is.GreaterThan(prevT), "the walk never stalls or backs up — " + s);
                if (t > 1e-6 && t < 1 - 1e-6) strictlyInterior++;
                prevT = t;
            }
            Assert.That(prevT, Is.LessThan(1.0), "the segment ends BEFORE the destination — the next step opens there");
            Assert.That(strictlyInterior, Is.GreaterThanOrEqualTo(tpt - 2),
                "a tile is crossed in " + tpt + " even steps, so all but the first are strictly interior");

            // Distinct drawn positions inside one tile — the thing the player actually sees.
            int distinct = seg.Select(s => (Math.Round(s.Fx, 2), Math.Round(s.Fy, 2))).Distinct().Count();
            Assert.That(distinct, Is.GreaterThanOrEqualTo(5),
                "≥5 distinct sub-tile positions between two integer tiles (was 1: the teleport)");
        }

        [Test]
        public void The_Glide_Has_No_Seam_At_A_Tile_Boundary()
        {
            var (_, trace, _) = WalkTrace();
            // Consecutive drawn positions never jump more than one tile step's worth. Before this
            // package the SAME trace jumps a whole tile once per tile (the teleport); the bound is
            // therefore a real discriminator, not a tautology.
            double worst = 0;
            for (int i = 1; i < trace.Count; i++)
            {
                double d = Math.Abs(trace[i].Fx - trace[i - 1].Fx) + Math.Abs(trace[i].Fy - trace[i - 1].Fy);
                if (d > worst) worst = d;
            }
            Assert.That(worst, Is.LessThan(0.5),
                "no drawn step exceeds half a tile (a teleporting pawn moves a full 1.0 in one tick)");
            Assert.That(worst, Is.GreaterThan(0), "precondition: the crew member actually moved");
        }

        // ---------------------------------------------------------------- standing still

        [Test]
        public void A_Settled_Crew_Member_Draws_Exactly_On_Her_Tile()
        {
            var (c, trace, tpt) = WalkTrace(ticks: 400);   // long enough to arrive and settle
            var settled = trace.Where(s => s.Prev == s.Pos).ToList();
            Assert.IsNotEmpty(settled, "the walk reaches a settled stance (PrevPos == Pos)");
            foreach (var s in settled)
            {
                Assert.AreEqual((float)s.Pos.X, s.Fx, 0f, "settled ⇒ EXACTLY the tile, not near it — " + s);
                Assert.AreEqual((float)s.Pos.Y, s.Fy, 0f, "settled ⇒ EXACTLY the tile, not near it — " + s);
            }
            // The spent-counter case too: a crew member who never walked at all.
            var idle = SimHost.Build(SimHost.DefaultSeed).Sim.Citizens.Items.First(z => !z.Dead);
            var (ix, iy) = GameSession.WalkFraction(idle, tpt);
            Assert.AreEqual((float)idle.Pos.X, ix, 0f);
            Assert.AreEqual((float)idle.Pos.Y, iy, 0f);
            Assert.IsNotNull(c);
        }

        // ---------------------------------------------------------------- the wire

        [Test]
        public void The_Roster_Channel_Carries_Advancing_Fractional_Positions()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeed);
            var gs = new GameSession(host, sink.Add);   // NOT started ⇒ no sim thread
            var sim = host.Sim;
            var c = sim.Citizens.Items.First(z => !z.Dead);
            int deck = c.Pos.Z;
            var target = FindRouteTarget(sim, c, minSteps: 4);
            Assert.IsNotNull(target);
            sim.EnqueueCommand(new MoveCitizenCommand(c.Id, target.Value));

            var seen = new List<(double fx, double fy, int x, int y)>();
            var tilesFromSim = new List<(int, int)>();
            for (int i = 0; i < 60; i++)
            {
                sim.Tick();
                tilesFromSim.Add((c.Pos.X, c.Pos.Y));   // read off the SIM, before the wire is built
                gs.RenderForTest();
                string roster = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"roster\""));
                Assert.IsNotNull(roster, "the roster channel is cached every render");
                var row = RosterRow(roster, c.Id);
                Assert.IsNotNull(row, "the walking crew member has a roster row");
                seen.Add(row.Value);
            }

            // The fraction never leaves the neighbourhood of the tile it is published beside.
            foreach (var s in seen)
                Assert.That(Math.Abs(s.fx - s.x) + Math.Abs(s.fy - s.y), Is.LessThanOrEqualTo(1.0 + 1e-9),
                    "fx/fy stay within one tile of the integer tile they are published beside");
            // ⛔ AND THE INTEGER TILE IS STILL THE SIM'S, UNROUNDED FROM THE GLIDE. This is the leg
            // that fails if a later change ever "helpfully" derives x/y from fx/fy: everything that
            // is NOT a drawing position — room membership, selection, click targets, the CREW WATCH
            // row — reads x/y, so a tile quietly taken from the drawn position would make a crew
            // member belong to a room she is only halfway into.
            Assert.AreEqual(tilesFromSim, seen.Select(s => (s.x, s.y)).ToList(),
                "the roster's x/y is Citizen.Pos, tick for tick — never a rounding of fx/fy");

            int distinctFrac = seen.Select(s => (s.fx, s.fy)).Distinct().Count();
            int distinctTile = seen.Select(s => (s.x, s.y)).Distinct().Count();
            Assert.That(distinctFrac, Is.GreaterThan(distinctTile),
                "the wire carries MORE distinct drawn positions than tiles — that is the whole package");

            // ≥5 distinct fractional positions between one pair of integer tiles.
            var byTile = seen.GroupBy(s => (s.x, s.y)).Select(g => g.Select(s => (s.fx, s.fy)).Distinct().Count()).Max();
            Assert.That(byTile, Is.GreaterThanOrEqualTo(5),
                "≥5 distinct sub-tile positions published while the sim tile stayed put");

            Assert.AreEqual(deck, c.Pos.Z, "precondition: the walk stayed on one deck");
        }

        /// <summary>Pull (fx, fy, x, y) for one cid out of a roster message. Tolerant, test-only —
        /// the roster row is flat JSON, so a scan from the cid to the row's closing brace is
        /// unambiguous.</summary>
        private static (double fx, double fy, int x, int y)? RosterRow(string json, uint cid)
        {
            int i = json.IndexOf("{\"cid\":" + cid.ToString(CultureInfo.InvariantCulture) + ",", StringComparison.Ordinal);
            if (i < 0) return null;
            int end = json.IndexOf('}', json.IndexOf("\"traits\":[", i, StringComparison.Ordinal));
            if (end < 0) return null;
            string row = json.Substring(i, end - i + 1);
            double fx = Field(row, "\"fx\":"), fy = Field(row, "\"fy\":");
            return (fx, fy, (int)Field(row, "\"x\":"), (int)Field(row, "\"y\":"));
        }

        private static double Field(string row, string key)
        {
            int i = row.IndexOf(key, StringComparison.Ordinal);
            Assert.That(i, Is.GreaterThanOrEqualTo(0), "roster row is missing " + key + " — " + row);
            i += key.Length;
            int j = i;
            while (j < row.Length && (char.IsDigit(row[j]) || row[j] == '.' || row[j] == '-')) j++;
            string lit = row.Substring(i, j - i);
            // The parse is InvariantCulture on purpose: the dev machine is de-DE, and a host that
            // leaked a locale comma would otherwise be read back as a bigger integer and pass.
            Assert.IsFalse(lit.Contains(","), "the wire must never carry a locale comma — " + lit);
            return double.Parse(lit, CultureInfo.InvariantCulture);
        }
    }
}
