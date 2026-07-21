using System;
using System.Globalization;
using System.Threading;
using Moonbase.Tui; // SimHost

namespace Moonbase.Web
{
    /// <summary>
    /// PeriluneWeb entry point: boot the shipping sim (SimHost — the same one the terminal
    /// skin and Unity boot), start the fixed-tick GameSession, and serve the flat-2D web
    /// client + WebSocket on localhost.
    ///
    ///   PeriluneWeb [--port N] [--seed N] [--layout PATH] [--data DIR]
    ///
    /// Single global game: every browser tab that connects steers the same ship. Ctrl+C stops
    /// the server cleanly (the sim thread and all sockets are torn down).
    /// </summary>
    public static class Program
    {
        public static int Main(string[] args)
        {
            int port = 8323;
            ulong? seed = null;
            string layout = null, data = null;

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--port": if (i + 1 < args.Length && int.TryParse(args[++i], NumberStyles.Integer, CultureInfo.InvariantCulture, out int p)) port = p; break;
                    case "--seed": if (i + 1 < args.Length && ulong.TryParse(args[++i], NumberStyles.Integer, CultureInfo.InvariantCulture, out ulong s)) seed = s; break;
                    case "--layout": if (i + 1 < args.Length) layout = args[++i]; break;
                    case "--data": if (i + 1 < args.Length) data = args[++i]; break;
                    default: break;
                }
            }

            var host = SimHost.Build(seed ?? SimHost.DefaultSeed, layout, data);
            var web = new WebHost(port);
            var session = new GameSession(host, web.Broadcast);

            web.Run(session);
            session.Start();

            Console.Error.WriteLine($"PeriluneWeb: http://localhost:{port}/  (seed {host.Seed}, defs {host.DefsChecksum:x16})");
            Console.Error.WriteLine($"  client: {web.ClientHtmlPath}");
            Console.Error.WriteLine("  Ctrl+C to stop.");

            var done = new ManualResetEventSlim(false);
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; done.Set(); };
            done.Wait();

            session.Stop();
            web.Stop();
            Console.Error.WriteLine("PeriluneWeb: stopped.");
            return 0;
        }
    }
}
