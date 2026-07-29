using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
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
    ///   PeriluneWeb [--port N] [--seed N] [--layout PATH] [--data DIR] [--ship wreck|grid|slice|perilune]
    ///
    /// THE GAME IS `--ship wreck` — the default since the owner's decision that `./play.sh` must
    /// always launch the current version of the game. Start it with `./play.sh` from the repo
    /// root (that runs this host and the client static server together and prints one URL);
    /// there is nothing to choose.
    ///
    /// ⚠️ THE WRECK IS ROUGH ON PURPOSE AND THE OWNER WANTS TO SEE IT ROUGH. What it does not
    /// have yet, so nobody mistakes inert for broken: the pods do nothing (no thaw — that is W5),
    /// and there is no door/vent verb on either standard surface, which the premise depends on.
    ///
    /// The other three `--ship` values still work by flag and none of them changed:
    ///   grid     — the economy programme's comparison baseline, and the previous default.
    ///   slice    — the 8-crew economy measurement fixture, driven headless by hosts/scenario.
    ///   perilune — the generated/layout ship that backs the tick-3000 determinism goldens.
    /// (`SimHost.Build`'s own default is still ShipChoice.Perilune — the goldens depend on it.
    /// Only this host's player-facing default moved.)
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
            // ⚠️ THE PLAYER-FACING DEFAULT, AND IT IS AN OWNER DECISION — "we decided to always
            // ship the main version in play.sh". `./play.sh` must launch the CURRENT game, not the
            // last one that happened to be finished. Every serious player-visible defect this
            // project has found came from the owner starting the game and looking (the doors that
            // vanished when a room was allocated, the device glyphs with no art, the palette that
            // clipped its own buttons, "starting it with start.sh gives me the old ship"), and a
            // default that needs a remembered flag deletes exactly that feedback loop.
            //
            // `--ship grid|slice|perilune` all still work by flag and none of their behaviour
            // changes: grid is the economy programme's comparison baseline and slice is the
            // headless measurement fixture. NOT the same knob as SimHost.Build's own default
            // parameter (ShipChoice.Perilune) — leave that alone, the goldens read it.
            //
            // Pinned by WebHostDefaultShipTests: this line is a player-facing decision and must
            // not be changeable without a test saying so.
            var ship = ShipChoice.Wreck;

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--port": if (i + 1 < args.Length && int.TryParse(args[++i], NumberStyles.Integer, CultureInfo.InvariantCulture, out int p)) port = p; break;
                    case "--seed": if (i + 1 < args.Length && ulong.TryParse(args[++i], NumberStyles.Integer, CultureInfo.InvariantCulture, out ulong s)) seed = s; break;
                    case "--layout": if (i + 1 < args.Length) layout = args[++i]; break;
                    case "--data": if (i + 1 < args.Length) data = args[++i]; break;
                    case "--ship":
                        if (i + 1 < args.Length)
                        {
                            string shipArg = args[++i];
                            if (shipArg == "slice") ship = ShipChoice.Slice;
                            // Grid is no longer the default but is still the economy programme's
                            // comparison baseline, so it must stay selectable by flag.
                            else if (shipArg == "grid") ship = ShipChoice.Grid;
                            else if (shipArg == "wreck") ship = ShipChoice.Wreck;
                            // Every branch is explicit BECAUSE the default moved: with the default
                            // written as one of these values, a missing branch silently hands back
                            // whatever the default happens to be that week rather than erroring.
                            else if (shipArg == "perilune") ship = ShipChoice.Perilune;
                        }
                        break;
                    default: break;
                }
            }

            var host = SimHost.Build(seed ?? SimHost.DefaultSeedFor(ship), layout, data, ship);
            var web = new WebHost(port);

            // L6: resolve the LLM config (env > repo-root .env > repo-root llm.toml), build the
            // dialogue backend chain (a live provider when a key is present, else the offline
            // template), and hand it to the conversation runtime with real host timestamps.
            var settings = LlmSettings.LoadFromEnvironment(RepoFile(".env"), RepoFile("llm.toml"));
            var conv = new ConversationHub(host, web.Broadcast,
                BuildDialogueChain(settings, out string backendName),
                () => DateTime.UtcNow, settings.BudgetPerHourUsd, settings.Prices);
            var session = new GameSession(host, web.Broadcast, conv);

            web.Run(session);
            session.Start();

            Console.Error.WriteLine($"PeriluneWeb: http://localhost:{port}/  (ship {ship}, seed {host.Seed}, defs {host.DefsChecksum:x16})");
            Console.Error.WriteLine($"  client: {web.ClientHtmlPath}");
            Console.Error.WriteLine($"  NOTE: the page at :{port} is the LEGACY skin (no dialogue/LLM UI).");
            Console.Error.WriteLine($"        The game: `./play.sh` starts both halves; or run `python3 client/serve.py`");
            Console.Error.WriteLine($"        yourself and open http://localhost:8331/?port={port}");
            Console.Error.WriteLine($"  dialogue backend: {backendName}");
            // Only claim the local model is missing when we actually looked. With an explicitly
            // configured dialogue.backend no probe runs (explicit wins, so the answer could not
            // matter), and reporting that as "no local Ollama" would be a plain lie when one is
            // sitting there running.
            if (!settings.DialogueBackendConfigured && !settings.OllamaReady
                && !backendName.StartsWith("ollama", StringComparison.Ordinal))
                Console.Error.WriteLine(
                    "        (no local Ollama serving " + settings.Providers["ollama"].Model + " at "
                    + settings.Providers["ollama"].BaseUrl + " — local-first route not taken)");
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
        /// <summary>Resolve a file next to the repo root (walk up from the binary to the checkout —
        /// the dir holding both content/ and hosts/, the same marker walk WebHost uses for
        /// Client.html). Falls back to a cwd-relative name outside a checkout; the settings
        /// loader File.Exists-guards either way. Hosts own file IO.</summary>
        private static string RepoFile(string name)
        {
            for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
                if (Directory.Exists(Path.Combine(dir.FullName, "content")) &&
                    Directory.Exists(Path.Combine(dir.FullName, "hosts")))
                    return Path.Combine(dir.FullName, name);
            return name;
        }

        private static IReadOnlyList<IChatBackend> BuildDialogueChain(LlmSettings settings, out string backendName)
        {
            string backend = settings.EffectiveBackend(settings.Dialogue);
            var template = new TemplateBackend();

            switch (backend)
            {
                case "anthropic":
                {
                    var p = settings.Providers["anthropic"];
                    string model = ResolveModel(settings.Dialogue.Model, LlmSettings.AnthropicDefaultModel);
                    backendName = backend + "/" + model;
                    var live = new AnthropicBackend(new HttpChat(new HttpClientHandler()),
                        new AnthropicConfig(p.BaseUrl, p.ApiKey, model));
                    return new IChatBackend[] { live, template };
                }
                case "openai":
                {
                    var p = settings.Providers["openai"];
                    string model = ResolveModel(settings.Dialogue.Model, LlmSettings.OpenAiDefaultModel);
                    backendName = backend + "/" + model;
                    var live = new OpenAiCompatBackend(new HttpChat(new HttpClientHandler()),
                        new OpenAiCompatConfig(p.BaseUrl, p.ApiKey, model));
                    return new IChatBackend[] { live, template };
                }
                case "ollama":
                {
                    var p = settings.Providers["ollama"];
                    string model = ResolveModel(settings.Dialogue.Model, p.Model);
                    backendName = backend + "/" + model;
                    // The residency hints keep the adapter's defaults unless configured (ollama_keep_alive
                    // / ollama_num_ctx) — someone who has tuned their local install can override both.
                    var cfg = new OllamaConfig(p.BaseUrl, model);
                    if (p.KeepAlive != null) cfg = cfg with { KeepAlive = p.KeepAlive };
                    if (p.NumCtx.HasValue) cfg = cfg with { NumCtx = p.NumCtx };
                    var live = new OllamaBackend(new HttpChat(new HttpClientHandler()), cfg);
                    return new IChatBackend[] { live, template };
                }
                default:
                    backendName = backend;
                    return new IChatBackend[] { template }; // offline: template only
            }
        }

        /// <summary>An unset route model must never reach a provider verbatim: every one of them rejects
        /// <c>"model": ""</c>, and the chain would then degrade to template on EVERY turn while the boot
        /// line still claimed a live backend. Fall back to the lane default instead.</summary>
        private static string ResolveModel(string configured, string fallback)
            => string.IsNullOrEmpty(configured) ? fallback : configured;
    }
}
