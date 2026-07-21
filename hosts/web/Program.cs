using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;
using System.Threading;
using Perilune.Llm;
using Perilune.Llm.Providers;
using Perilune.Tui; // SimHost

namespace Perilune.Web
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

            // L6: resolve the LLM config (env > .env > toml — env only here, the offline default),
            // build the dialogue backend chain (a live provider when a key is present, else the
            // offline template), and hand it to the conversation runtime with real host timestamps.
            var settings = LlmSettings.LoadFromEnvironment();
            var conv = new ConversationHub(host, web.Broadcast,
                BuildDialogueChain(settings, out string backendName),
                () => DateTime.UtcNow, settings.BudgetPerHourUsd, settings.Prices);
            var session = new GameSession(host, web.Broadcast, conv);

            web.Run(session);
            session.Start();

            Console.Error.WriteLine($"PeriluneWeb: http://localhost:{port}/  (seed {host.Seed}, defs {host.DefsChecksum:x16})");
            Console.Error.WriteLine($"  client: {web.ClientHtmlPath}");
            Console.Error.WriteLine($"  dialogue backend: {backendName}");
            Console.Error.WriteLine("  Ctrl+C to stop.");

            var done = new ManualResetEventSlim(false);
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; done.Set(); };
            done.Wait();

            session.Stop();
            web.Stop();
            Console.Error.WriteLine("PeriluneWeb: stopped.");
            return 0;
        }

        /// <summary>
        /// The dialogue backend CHAIN for the conversation runtime: the settings' effective
        /// dialogue backend first (downgraded to template when its key is absent — the game is
        /// always playable offline), then an offline <see cref="TemplateBackend"/> terminator so
        /// the chain can never fail. Host-owned IO boundary: the HttpClientHandler for a live
        /// provider is created here, never in the sockets-free ConversationHub.
        /// </summary>
        private static IReadOnlyList<IChatBackend> BuildDialogueChain(LlmSettings settings, out string backendName)
        {
            string backend = settings.EffectiveBackend(settings.Dialogue);
            backendName = backend;
            string model = settings.Dialogue.Model;
            var template = new TemplateBackend();

            switch (backend)
            {
                case "anthropic":
                {
                    var p = settings.Providers["anthropic"];
                    var live = new AnthropicBackend(new HttpChat(new HttpClientHandler()),
                        new AnthropicConfig(p.BaseUrl, p.ApiKey, model));
                    return new IChatBackend[] { live, template };
                }
                case "openai":
                {
                    var p = settings.Providers["openai"];
                    var live = new OpenAiCompatBackend(new HttpChat(new HttpClientHandler()),
                        new OpenAiCompatConfig(p.BaseUrl, p.ApiKey, model));
                    return new IChatBackend[] { live, template };
                }
                case "ollama":
                {
                    var p = settings.Providers["ollama"];
                    var live = new OllamaBackend(new HttpChat(new HttpClientHandler()),
                        new OllamaConfig(p.BaseUrl, model));
                    return new IChatBackend[] { live, template };
                }
                default:
                    return new IChatBackend[] { template }; // offline: template only
            }
        }
    }
}
