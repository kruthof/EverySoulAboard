using System;

namespace Perilune.Sim
{
    /// <summary>
    /// WHICH of the job board's derived sub-boards a writer invalidated, so the dispatcher can
    /// rebuild only those and skip the rest. Replaces the single <c>bool JobsDirty</c> (ECONOMY-PLAN
    /// W0-3): every <see cref="Simulation.AddItem"/> used to force the O(W·H·D) world tile pass plus
    /// every source's full re-derivation; on a production ship that emits items dozens per second
    /// that is the tick's dominant cost.
    ///
    /// FOUR axes, because the board's inputs are four independent things and each writer touches a
    /// known subset:
    ///
    ///   • <see cref="Tiles"/>  — the world grid (a designation, a wall/floor edit, a stockpile
    ///     zone). The ONLY thing that gates the dispatcher's single z,y,x world pass
    ///     (<see cref="IJobTileScanner"/>). This is the whole performance win: an item change no
    ///     longer walks the world.
    ///   • <see cref="Items"/>  — the ground-item store (add/remove/move/reserve-release). Gates
    ///     the haul board's item derivation and the build source's free-material count.
    ///   • <see cref="Sites"/>  — the build pending list (designate/deposit/cancel/complete). Gates
    ///     the build source's ready/needs-material split.
    ///   • <see cref="Citizens"/> — a citizen changed job with nothing else changing (an LLM grant,
    ///     an abandon). Every source re-derives its "already assigned" set from citizen state on
    ///     ANY rescan, so this flag exists only to TRIGGER a rescan for that case without paying for
    ///     the tile / item / site passes it does not need. See W0-3's report and
    ///     <see cref="JobSystem.Rescan"/>.
    ///
    /// A writer that sets too FEW flags is a silent missed-rescan bug; one that sets too many is
    /// merely the old full-rescan behaviour with more typing (always safe, never wrong). The mapping
    /// table lives in W0-3's report. Combined with <c>|=</c> at every writer so contributions from
    /// several systems in one tick accumulate until <see cref="JobSystem"/> consumes and clears them.
    ///
    /// NOT saved and NOT hashed: like the old boolean it is forced to <see cref="All"/> on load
    /// (<see cref="Perilune.Sim"/> <c>SaveReader</c>) and rebuilt on the first tick.
    /// </summary>
    [Flags]
    public enum JobBoardDirty : byte
    {
        None = 0,
        Tiles = 1 << 0,
        Items = 1 << 1,
        Sites = 1 << 2,
        Citizens = 1 << 3,
        All = Tiles | Items | Sites | Citizens,
    }
}
