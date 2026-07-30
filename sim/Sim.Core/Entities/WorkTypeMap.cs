namespace Perilune.Sim
{
    /// <summary>
    /// M2-2 — <b>THE ONE PLACE A <see cref="JobKind"/> IS CLASSIFIED AS WORK.</b> The work-type veto
    /// asks exactly one question at five gates ("may this crew member take this work?"), and every
    /// one of those gates needs the same translation from the sim's job vocabulary
    /// (<see cref="JobKind"/>, twelve values, what the SIM does) to the player's
    /// (<see cref="WorkType"/>, six values, what the PLAYER assigns). Two translations that can
    /// disagree is exactly the hand-mirrored-pair shape this repo has been bitten by four times
    /// (<c>CapabilityComputer</c>/<c>EffectValidator</c> is the current instance), so there is one
    /// table and every gate reads it.
    ///
    /// <para><b>THE MAPPING, and the two rows that are decisions rather than transcription:</b>
    /// <list type="bullet">
    ///   <item><c>Dig</c> ⇒ <c>Mine</c> · <c>Deconstruct</c> ⇒ <c>Deconstruct</c> ·
    ///     <c>Craft</c> ⇒ <c>Craft</c> · <c>Maintain</c> ⇒ <c>Repair</c> — one to one.</item>
    ///   <item>⭐ <c>HaulToBuild</c> ⇒ <b><c>Construct</c></b>, NOT <c>Haul</c>. Carrying material to
    ///     a build site is the first leg of building it: it exists only because a build designation
    ///     wants feeding, it is claimed by <c>BuildJobSource</c>, and a player who switched
    ///     <c>Construct</c> on and <c>Haul</c> off expects their builder to fetch her own beams.
    ///     Mapping it to <c>Haul</c> would make <c>Construct</c>-only unbuildable in the common case
    ///     and would split ONE source across TWO work types (see <see cref="MaskOfKinds"/>).
    ///     Charter row A7. RimWorld agrees: hauling to a blueprint is Construction work, not
    ///     Hauling.</item>
    ///   <item><c>HaulPickup</c> and <c>HaulDeliver</c> are both <c>Haul</c> — one job in two
    ///     phases. ⚠️ The veto is still asked only at the CLAIM (<c>HaulPickup</c>); the in-job
    ///     transition to <c>HaulDeliver</c> is deliberately ungated, so a running haul completes
    ///     rather than dropping cargo on the floor when a checkbox changes. That ruling is pinned
    ///     by <c>WorkTypeVetoTests.MidHaul_HaulSwitchedOff_DeliveryStillCompletes</c>.</item>
    /// </list></para>
    ///
    /// <para>⛔ <b>AND FOUR KINDS ARE NOT WORK — the exclusions, named rather than defaulted.</b>
    /// <c>None</c> (no job), <c>Eat</c>, <c>Drink</c> (needs) and <c>Flee</c> (self-preservation).
    /// A pawn with every work type off must still eat, drink and run from vacuum; that is what
    /// makes OD-H's default-OFF survivable at boot rather than a starvation bug. <c>Citizen.cs</c>
    /// states the rule ("an order the player gave must not be a way to starve someone"); this is
    /// where it becomes unaskable, because <see cref="TryOf"/> simply has no work type to return.
    /// </para>
    ///
    /// <para>⚠️ <b>ADDING A <see cref="JobKind"/> MEANS ADDING A ROW HERE.</b> The switch has no
    /// <c>default:</c> that guesses — an unlisted kind returns false, i.e. "not work, never
    /// vetoed", which is the safe direction but is also SILENT. That silence is closed by
    /// <c>WorkTypeVetoTests.EveryJobKind_IsClassified</c>, which walks
    /// <c>Enum.GetValues(typeof(JobKind))</c> against its own independently written table and goes
    /// red on an unclassified kind. Pure, allocation-free, no RNG: safe on any tick path.</para>
    /// </summary>
    public static class WorkTypeMap
    {
        /// <summary>
        /// The <see cref="WorkType"/> <paramref name="kind"/> belongs to, or <c>false</c> when this
        /// job kind is NOT work at all (<c>None</c>, <c>Eat</c>, <c>Drink</c>, <c>Flee</c>) and can
        /// therefore never be vetoed.
        /// </summary>
        public static bool TryOf(JobKind kind, out WorkType type)
        {
            switch (kind)
            {
                case JobKind.Dig: type = WorkType.Mine; return true;
                case JobKind.HaulPickup:
                case JobKind.HaulDeliver: type = WorkType.Haul; return true;
                case JobKind.Build:
                case JobKind.HaulToBuild: type = WorkType.Construct; return true;
                case JobKind.Deconstruct: type = WorkType.Deconstruct; return true;
                case JobKind.Craft: type = WorkType.Craft; return true;
                case JobKind.Maintain: type = WorkType.Repair; return true;

                // NOT WORK — listed, not defaulted. See the class comment.
                case JobKind.None:
                case JobKind.Eat:
                case JobKind.Drink:
                case JobKind.Flee:
                default:
                    type = default;
                    return false;
            }
        }

        /// <summary>
        /// The set of work types <paramref name="kinds"/> spans, as a bit per <see cref="WorkType"/>
        /// (bit <c>i</c> = <c>(WorkType)i</c>) — the shape <see cref="JobSystem"/> caches per
        /// <see cref="IJobSource"/> at registration so the per-citizen gate is a mask test rather
        /// than a re-walk of <see cref="IJobSource.HandledKinds"/> on every selection pass.
        ///
        /// <para>A returned <c>0</c> means "this source hands out nothing the player can switch
        /// off", and <see cref="JobSystem"/> treats that as UNGATED rather than as "always
        /// vetoed" — a source whose kinds are all needs/survival is not the veto's business, and
        /// the same reading keeps a future non-work source from being silently disabled by a
        /// grid it has nothing to do with.</para>
        /// </summary>
        public static byte MaskOfKinds(JobKind[] kinds)
        {
            byte mask = 0;
            if (kinds == null) return mask;
            for (int i = 0; i < kinds.Length; i++)
                if (TryOf(kinds[i], out var type)) mask |= (byte)(1 << (int)type);
            return mask;
        }

        /// <summary>Does <paramref name="mask"/> (as built by <see cref="MaskOfKinds"/>) contain
        /// exactly one work type? Every shipped <see cref="IJobSource"/> does, which is what makes
        /// the per-SOURCE gate in <see cref="JobSystem.TryAssign"/> exactly as precise as a
        /// per-KIND one. Pinned — see <c>WorkTypeVetoTests.EverySource_SpansExactlyOneWorkType</c>,
        /// whose failure message says what a two-type source would have to do instead.</summary>
        public static bool IsSingleWorkType(byte mask) => mask != 0 && (mask & (mask - 1)) == 0;
    }
}
