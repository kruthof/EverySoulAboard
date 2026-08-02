namespace Perilune.Sim
{
    /// <summary>
    /// One sleeper's authored competence: six skill levels and the work types she cannot do at
    /// all. A <c>readonly struct</c> with six named bytes rather than an array, so
    /// <see cref="SleeperAptitudes"/>'s table is a static literal that allocates nothing and the
    /// lookup on a thaw copies seven bytes instead of handing out a mutable reference into the
    /// authoring table.
    /// </summary>
    public readonly struct SleeperAptitude
    {
        public readonly byte Repair, Construct, Craft, Deconstruct, Mine, Haul;

        /// <summary>The <see cref="Citizen.WorkIncapable"/> mask, VERBATIM — one bit per
        /// <see cref="WorkType"/>, set = cannot do it at all.</summary>
        public readonly byte Incapable;

        public SleeperAptitude(byte repair, byte construct, byte craft,
                               byte deconstruct, byte mine, byte haul, byte incapable)
        {
            Repair = repair; Construct = construct; Craft = craft;
            Deconstruct = deconstruct; Mine = mine; Haul = haul;
            Incapable = incapable;
        }

        /// <summary>This row's level for <paramref name="type"/>. A switch rather than an indexer
        /// so the compiler refuses to build a row that forgets a work type.</summary>
        public byte LevelOf(WorkType type)
        {
            switch (type)
            {
                case WorkType.Repair: return Repair;
                case WorkType.Construct: return Construct;
                case WorkType.Craft: return Craft;
                case WorkType.Deconstruct: return Deconstruct;
                case WorkType.Mine: return Mine;
                default: return Haul;
            }
        }

        public bool IsIncapableOf(WorkType type) => (Incapable & (1 << (int)type)) != 0;
    }

    /// <summary>
    /// ⭐ <b>M3-8 — WHO IS IN EACH CAPSULE.</b> The wreck's seven living sleepers, each with an
    /// authored six-skill spread and at least one thing she cannot do at all, applied to the
    /// citizen <b>at the moment the capsule opens</b> (<c>CryoSystem.Open</c>). Before this table
    /// every crew member on every ship was level 0 at everything and incapable of nothing
    /// (<c>docs/MECHANICS.md</c> §13.37.5: <i>"NOTHING WRITES A SKILL"</i>) — this is the first
    /// writer in the game.
    ///
    /// <para><b>THE SIM HALF OWES THE HOST HALF NOTHING.</b> The prose that explains these numbers
    /// lives in <c>AuthoredShips.WreckSleepers()</c> and is attached by a host observing
    /// <see cref="CitizenThawedEvent"/>. A headless sim with no persona layer at all still thaws
    /// the same person with the same competence, because competence is sim state and a mind is
    /// not. That split is the package, and it is the offline invariant.</para>
    ///
    /// <para>⭐ <b>LITERALS KEYED BY NAME, NOT A DEF FIELD</b> — the <see cref="ThawGate.RungOf"/>
    /// precedent, taken for the same reason. A def field would ship a P4/P5 re-pin and a checksum
    /// fold for content that is one ship's authoring, and the rule ("this person is this good") is
    /// no more tunable than the rung ladder is. The key is the sleeper's DISPLAY name — what
    /// <see cref="CryoSystem.SleeperName"/> derives from the capsule's <c>pod_&lt;who&gt;</c>
    /// device name — so the table and <c>AuthoredShips.WreckPods</c> are joined on exactly the
    /// string the player reads, and a typo produces an untouched level-0 citizen rather than a
    /// wrong one. <c>StringComparer.Ordinal</c>: the dev machine is de-DE.</para>
    ///
    /// <para>⚠️ <b>THE FOUR DEAD SLEEPERS HAVE NO ROW</b> (OD-9: a wrecked capsule never cycles, so
    /// Vance / Sokolov / Iqbal / Osei can never become citizens), and ⚠️ <b>RELL HAS NO ROW
    /// EITHER</b> — the survivor who boots awake is not thawed, so nothing on this path would ever
    /// reach her. She keeps the fleet-wide level-0 default; see <c>docs/MECHANICS.md</c> §13.39 for
    /// why that was a decision and what it costs.</para>
    ///
    /// <para>⚠️ <b>AN INCAPABLE TYPE IS AUTHORED AT LEVEL 0</b>, always — a row claiming skill in
    /// something the person cannot do at all would be two contradictory facts about one woman.
    /// Enforced by <c>SleeperPersonaTests.EveryAuthoredRow_IsInternallyConsistent</c>, not by
    /// convention.</para>
    ///
    /// <para>⚠️ <b><see cref="WorkType.Haul"/> LEVELS BUY NOTHING TODAY</b> and the numbers here do
    /// not pretend otherwise: <c>WorkRates</c>' haul bonus is 0 because hauling accrues no work
    /// ticks anywhere in this sim (§13.37.5, FILED). A haul level here is a fact about the person
    /// for the WORK tab to draw; <b>haul INCAPABILITY, by contrast, is fully live</b> — it gates
    /// WHETHER through <c>Citizen.CanTakeWorkType</c> at all five sites, which is exactly why Bahri
    /// carries it.</para>
    /// </summary>
    public static class SleeperAptitudes
    {
        private static byte Mask(params WorkType[] types)
        {
            byte m = 0;
            for (int i = 0; i < types.Length; i++) m |= (byte)(1 << (int)types[i]);
            return m;
        }

        /// <summary>
        /// The seven, in thaw-ladder order (<see cref="ThawGate.RungOf"/> rung 1 first — the order
        /// the player will actually meet them in, because the ladder is priced by capsule
        /// condition). The prose for each is <c>AuthoredShips.WreckSleepers()</c>; the two halves
        /// are joined by name and checked against each other by test.
        ///
        /// <code>
        ///   rung  who         rep con cra dec min hau   cannot
        ///   ----  ----------  --- --- --- --- --- ---   ---------------------
        ///     1   Lindqvist     9   7   2   5   0   4   Mine
        ///     2   Ozawa         5   0  11   6   2   3   Construct
        ///     3   Ferreira      3   4   0  11   7   9   Craft
        ///     4   Mbeki         0   6   0   8  13   9   Repair, Craft
        ///     5   Bahri         7  12   5   4   3   0   Haul
        ///     6   Nakamura     10   2  13   0   0   3   Deconstruct, Mine
        ///     7   Torres       14  11   9  10   0   8   Mine
        /// </code>
        ///
        /// <para>⭐ <b>THE SPREAD IS A DESIGN STATEMENT, NOT DECORATION.</b> Mining is the first link
        /// of the wreck's whole production chain (Regolith → Scrap → Parts → ControllerModule, which
        /// the thaw ladder itself spends) — and <b>three of the seven cannot mine at all, Torres
        /// among them: the best crew member aboard and the most expensive capsule to open.</b> So
        /// waking the strongest person does not also solve the chain. Of the four who CAN,
        /// <b>Mbeki (13) is the strongest by a wide margin</b> — <c>WorkRates</c>' mine curve is the
        /// steepest in the table (100/level), so she cuts at 2.30× against Ferreira's 1.70× (7),
        /// Bahri's 1.30× (3) and Ozawa's 1.20× (2). Nobody is ever hard-blocked: Rell is capable of
        /// everything at level 0, and 0 is untrained rather than unable. The choice the table poses
        /// is therefore <i>how fast</i>, not <i>whether</i> — but it is a real one, and it is priced:
        /// the cheapest capable miner is <b>Ozawa at rung 2</b> (level 2, 1.20×, 2 <c>Seals</c>),
        /// while Mbeki is <b>rung 4</b> (2.30×, 2 <c>Parts</c>) — a whole production tier deeper into
        /// the chain her own rate is what makes fast.</para>
        ///
        /// <para>⛔ <b>CORRECTED IN REVIEW, AND THE OLD SENTENCE IS QUOTED BECAUSE IT WAS
        /// LOAD-BEARING</b> — it was repeated in <c>docs/MECHANICS.md</c> §13.39.2, in Mbeki's own
        /// <c>RaidBackstory</c> and in a test's assertion message. It read: <i>"Mbeki (rung 4) is
        /// the only sleeper who can feed the chain she is paid for."</i> <b>That is FALSE against
        /// the table two lines above it</b> — FOUR of the seven have a non-zero Mine level and none
        /// of the other three is incapable — and it refuted itself one sentence later by conceding
        /// that Rell can mine at 0. The true claim is the one now stated: an ABSENCE in three
        /// sleepers, and a wide MARGIN in one.</para>
        /// </summary>
        private static readonly string[] Names =
        {
            "Lindqvist", "Ozawa", "Ferreira", "Mbeki", "Bahri", "Nakamura", "Torres",
        };

        /// <summary>⚠️ <b>POSITIONALLY PAIRED WITH <see cref="Names"/></b> — row <c>i</c> is
        /// <c>Names[i]</c>'s. Two parallel arrays rather than a dictionary so the table reads as the
        /// table in the doc above and allocates nothing; the pairing is asserted end to end by
        /// <c>SleeperPersonaTests</c>, which drives real thaws and checks hand-written literals, so
        /// a transposition is caught by behaviour rather than by comment.</summary>
        private static readonly SleeperAptitude[] Rows =
        {
            //                     rep con cra dec min hau
            new SleeperAptitude(     9,  7,  2,  5,  0,  4, Mask(WorkType.Mine)),                        // Lindqvist
            new SleeperAptitude(     5,  0, 11,  6,  2,  3, Mask(WorkType.Construct)),                   // Ozawa
            new SleeperAptitude(     3,  4,  0, 11,  7,  9, Mask(WorkType.Craft)),                       // Ferreira
            new SleeperAptitude(     0,  6,  0,  8, 13,  9, Mask(WorkType.Repair, WorkType.Craft)),      // Mbeki
            new SleeperAptitude(     7, 12,  5,  4,  3,  0, Mask(WorkType.Haul)),                        // Bahri
            new SleeperAptitude(    10,  2, 13,  0,  0,  3, Mask(WorkType.Deconstruct, WorkType.Mine)),  // Nakamura
            new SleeperAptitude(    14, 11,  9, 10,  0,  8, Mask(WorkType.Mine)),                        // Torres
        };

        /// <summary>How many sleepers are authored. Seven — the wreck's living, thawable capsules.
        /// A constant so a census test states the number rather than reading it back off the array
        /// it is meant to be checking.</summary>
        public const int Count = 7;

        /// <summary>Every authored name, in ladder order. The array is COPIED: the table is not
        /// handed out.</summary>
        public static string[] AuthoredNames() => (string[])Names.Clone();

        /// <summary>
        /// The authored row for a sleeper's display name, or <c>false</c> for anybody else — every
        /// other crew member on every other ship, and Rell. Ordinal comparison, zero allocation,
        /// total (an unknown name is a no-op, never a throw: a capsule somebody renames must not
        /// crash a thaw).
        /// </summary>
        public static bool TryGet(string sleeperName, out SleeperAptitude aptitude)
        {
            if (!string.IsNullOrEmpty(sleeperName))
            {
                for (int i = 0; i < Names.Length; i++)
                {
                    if (!string.Equals(Names[i], sleeperName, System.StringComparison.Ordinal)) continue;
                    aptitude = Rows[i];
                    return true;
                }
            }
            aptitude = default;
            return false;
        }

        /// <summary>
        /// ⭐ <b>THE WRITE.</b> Stamp <paramref name="citizen"/>'s authored competence onto her, by
        /// her own name. Returns whether a row was found — <c>false</c> leaves the citizen exactly
        /// as she was (level 0, capable of everything), which is what every non-sleeper aboard
        /// every ship keeps.
        ///
        /// <para>⚠️ CALLED FROM <c>CryoSystem.Open</c>, WHICH IS A TICK PATH — but only on the tick
        /// a capsule opens, which happens at most seven times in a run, and the method allocates
        /// nothing. <see cref="Citizen.SetSkill"/> is used rather than a raw array write so the
        /// domain check (0..20) applies to authored content too: an out-of-range literal in the
        /// table above must fail loudly at the first thaw, not survive into a save.</para>
        /// </summary>
        public static bool Apply(Citizen citizen)
        {
            if (citizen == null) return false;
            if (!TryGet(citizen.Name, out var a)) return false;
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
            {
                var type = (WorkType)t;
                citizen.SetSkill(type, a.LevelOf(type));
                citizen.SetIncapableOf(type, a.IsIncapableOf(type));
            }
            return true;
        }
    }
}
