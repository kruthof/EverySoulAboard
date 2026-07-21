using System;
using System.IO;
using Perilune.Tui.Terminal;

namespace Perilune.Tui
{
    /// <summary>
    /// PeriluneTui entry point. Two modes:
    ///
    ///   --dump  … headless text frames (CI / agents). All flags unchanged:
    ///     PeriluneTui --dump [--seed N] [--ticks N | --days D] [--every M]
    ///                 [--deck 0|1|all] [--lens …] [--cursor x,y]
    ///                 [--colors] [--metrics] [--out FILE] [--layout PATH] [--data DIR]
    ///
    ///   --play  … interactive DF-style terminal client (raw ANSI, alt-screen).
    ///
    /// With no mode flag: interactive when attached to a real terminal, else the boot dump
    /// (so piped/CI invocations stay byte-identical to before). --play into a redirected
    /// stdin/stdout refuses cleanly instead of spraying escape codes down a pipe.
    /// </summary>
    public static class Program
    {
        public static int Main(string[] args)
        {
            bool hasDump = Contains(args, "--dump");
            bool hasPlay = Contains(args, "--play");

            var opt = new DumpMode.Options();
            DumpMode.TryParse(args, 0, opt, Console.Error);

            bool interactive = hasPlay || (!hasDump && !IsRedirected());
            return interactive ? RunInteractive(opt) : RunDump(opt);
        }

        private static int RunInteractive(DumpMode.Options opt)
        {
            if (IsRedirected())
            {
                Console.Error.WriteLine(
                    "PeriluneTui: interactive mode needs a real terminal (stdin/stdout are redirected).");
                Console.Error.WriteLine("Use `--dump` for headless frames.");
                return 2;
            }

            ulong seed = opt.Seed ?? SimHost.DefaultSeed;
            var host = SimHost.Build(seed, opt.LayoutPath, opt.DataDir);
            var term = new AnsiTerminal();
            new GameLoop(term, host).Run();
            return 0;
        }

        private static int RunDump(DumpMode.Options opt)
        {
            TextWriter output = Console.Out;
            StreamWriter fileWriter = null;
            try
            {
                if (!string.IsNullOrEmpty(opt.OutFile))
                {
                    fileWriter = new StreamWriter(opt.OutFile, append: false);
                    output = fileWriter;
                }
                int code = DumpMode.Run(opt, output);
                if (fileWriter != null)
                    Console.Error.WriteLine($"wrote dump to {opt.OutFile}");
                return code;
            }
            finally
            {
                fileWriter?.Dispose();
            }
        }

        private static bool IsRedirected() => Console.IsInputRedirected || Console.IsOutputRedirected;

        private static bool Contains(string[] args, string flag)
        {
            for (int i = 0; i < args.Length; i++)
                if (args[i] == flag) return true;
            return false;
        }
    }
}
