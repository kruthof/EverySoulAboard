namespace Perilune.Sim
{
    /// <summary>
    /// The ordinary-command form of applying a dialogue-proposed effect. A
    /// conversation backend's <see cref="CitizenEffect"/> enters the sim ONLY through
    /// this command on the standard <see cref="ISimCommand"/> inbox, so it executes at
    /// tick start in arrival order and is recorded in the command log exactly like a
    /// player order (LLM_CITIZENS.md §10: "Effect application is recorded in the sim's
    /// command log like player commands" — replays are deterministic given the log even
    /// though generation was not).
    ///
    /// Re-validation happens HERE, against CURRENT state, via <see cref="EffectValidator"/>:
    /// the capability manifest that produced the effect may be stale (job taken, fact
    /// already out). Rejections publish <see cref="CitizenEffectAppliedEvent"/> with
    /// Accepted=false, which the dialogue layer words as an in-character tool_result error.
    ///
    /// Closes over the host-owned <see cref="MindState"/>/<see cref="FactRegistry"/>
    /// (Simulation.cs is untouched; minds are not part of StateHash in v0). Inert unless
    /// constructed — the scenario/tui hosts never build one, so the determinism hash is
    /// undisturbed. This is the effect-apply twin of <see cref="EffectPump"/>: same
    /// validate-and-publish body, but driven by the command inbox rather than a
    /// separate buffer+system, which is the path the conversation runtime uses.
    /// </summary>
    public sealed class ApplyCitizenEffectCommand : ISimCommand
    {
        private readonly CitizenEffect _effect;
        private readonly MindState _minds;
        private readonly FactRegistry _facts;
        private readonly EffectValidator _validator;

        public ApplyCitizenEffectCommand(CitizenEffect effect, MindState minds, FactRegistry facts, EffectValidator validator = null)
        {
            _effect = effect;
            _minds = minds;
            _facts = facts;
            _validator = validator ?? new EffectValidator();
        }

        public void Execute(Simulation sim)
        {
            if (_effect == null || _minds == null || _facts == null) return;
            bool accepted = _validator.TryApply(sim, _minds, _facts, _effect);
            sim.Events.Publish(new CitizenEffectAppliedEvent
            {
                CitizenId = _effect.CitizenId,
                Kind = _effect.Kind,
                Accepted = accepted,
            });
        }
    }
}
