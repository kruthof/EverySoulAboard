using System;

namespace Moonbase.Sim
{
    /// <summary>
    /// Builds a World from ASCII maps — used by tests (SimHarness) and by authored
    /// bootstrap maps. One string per row, one string[] per z-level (index 0 = bottom).
    /// Chars: '.' floor, '#' wall (on floor), 'R' rock, ' ' void.
    /// </summary>
    public static class AsciiWorld
    {
        public static World Build(params string[][] levels)
        {
            if (levels.Length == 0) throw new ArgumentException("need at least one z-level");
            int height = levels[0].Length;
            int width = levels[0][0].Length;
            var world = new World(width, height, levels.Length);

            for (int z = 0; z < levels.Length; z++)
            {
                string[] rows = levels[z];
                if (rows.Length != height) throw new ArgumentException($"level {z}: row count mismatch");
                for (int y = 0; y < height; y++)
                {
                    string row = rows[y];
                    if (row.Length != width) throw new ArgumentException($"level {z} row {y}: width mismatch");
                    for (int x = 0; x < width; x++)
                    {
                        var p = new Int3(x, y, z);
                        switch (row[x])
                        {
                            case '.':
                                world.SetFloor(p, TileDefs.Floor);
                                break;
                            case '#':
                                world.SetFloor(p, TileDefs.Floor);
                                world.SetWall(p, TileDefs.Wall);
                                break;
                            case 'R':
                                world.SetFloor(p, TileDefs.Debris);
                                world.SetWall(p, TileDefs.Debris);
                                break;
                            case ' ':
                                break; // void
                            default:
                                throw new ArgumentException($"unknown map char '{row[x]}'");
                        }
                    }
                }
            }

            return world;
        }
    }
}
