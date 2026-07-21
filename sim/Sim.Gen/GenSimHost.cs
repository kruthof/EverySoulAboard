using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// Boots a live <see cref="Simulation"/> from any <see cref="ShipPlan"/> — the
    /// generator's counterpart to the terminal skin's <c>SimHost</c>, but ship-agnostic
    /// (authored or procedurally generated) and file-IO-free (the caller supplies the
    /// <see cref="SimDefs"/>). It assembles the SAME system stack SimHost does, step for
    /// step, so a validated candidate behaves identically to the shipping boot:
    ///
    ///   1. DeviceRegistry + ScriptRuntime (the MOSS host)
    ///   2. ShipPlanBuilder.Build with the effect-spine + SystemStack + memory stack
    ///   3. FogReveal.RevealReachable — the boot fog seed
    ///   4. MossBindings.RegisterAdapters + ApplyScripts
    ///
    /// Unlike SimHost it takes no <c>DeviceLayout.json</c> overlay (those are a hand-tuned
    /// artefact of the authored ship) and reads no files — the validation gates and the
    /// ScenarioRunner CLI build fresh candidates through here, deterministically, as many
    /// times as they need (twin builds, per-gate rebuilds).
    /// </summary>
    public sealed class GenSimHost
    {
        public Simulation Sim { get; private set; }
        public ScriptRuntime Moss { get; private set; }
        public DeviceRegistry Registry { get; private set; }

        /// <summary>Host-owned mind state (empty until an LLM/conversation layer feeds
        /// it; inert for the hashed sim). Exposed so integration harnesses can attach a
        /// ConversationService to a generated ship exactly like the real hosts do.</summary>
        public MindState Minds { get; private set; }
        public FactRegistry Facts { get; private set; }

        private GenSimHost() { }

        /// <summary>Build a fresh sim from <paramref name="plan"/> using <paramref name="defs"/>
        /// (pass <see cref="SimDefs.Default"/> for the compiled defaults). Deterministic: same
        /// plan + same defs ⇒ identical sim state and identical <see cref="Simulation.StateHash"/>.</summary>
        public static GenSimHost Build(ShipPlan plan, SimDefs defs = null)
        {
            defs ??= SimDefs.Default;
            var registry = new DeviceRegistry();
            var moss = new ScriptRuntime(registry);
            var minds = new MindState();
            var facts = new FactRegistry();

            var sim = ShipPlanBuilder.Build(plan,
                MakeSystems(moss, RulesLoader.CreateSystem(defs, registry), minds, facts), defs);

            FogReveal.RevealReachable(sim);
            MossBindings.RegisterAdapters(sim, registry);
            MossBindings.ApplyScripts(sim, moss);

            return new GenSimHost { Sim = sim, Moss = moss, Registry = registry, Minds = minds, Facts = facts };
        }

        /// <summary>Mirror of SimHost.MakeSystems' engine-free body: the effect pump runs
        /// first, the authoritative SystemStack in the middle, memory last. Minds stay empty
        /// until a conversation layer feeds them — inert for the sim, as EffectPump/
        /// MemorySystem touch only host-owned mind state, never the hashed sim state.</summary>
        private static ISimSystem[] MakeSystems(ScriptRuntime moss, ISimSystem designerRules,
                                                MindState minds, FactRegistry facts)
        {
            var effects = new PendingEffectBuffer();

            var stack = SystemStack.CreateDefault(moss, designerRules);
            var systems = new ISimSystem[stack.Length + 2];
            systems[0] = new EffectPump(effects, minds, facts); // MUST run first
            for (int i = 0; i < stack.Length; i++) systems[i + 1] = stack[i];
            systems[systems.Length - 1] = new MemorySystem(minds); // after the event publishers
            return systems;
        }
    }
}
