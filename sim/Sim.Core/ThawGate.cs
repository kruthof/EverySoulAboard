using System;

namespace Perilune.Sim
{
    /// <summary>
    /// One rung of the thaw ladder: which repair a capsule needs before it will open, and how much
    /// of it. A <c>readonly struct</c> so <see cref="ThawGate.RungOf"/> allocates nothing — the
    /// gate is destined for a command executing inside <c>Simulation.Tick</c>, and Sim.Core is
    /// zero-alloc in tick paths (test-enforced, not aspirational).
    /// </summary>
    public readonly struct ThawRung
    {
        /// <summary>1..7, ascending in difficulty. Rung 1 is the healthiest capsule.</summary>
        public readonly int Rung;
        /// <summary>The consumable the repair spends.</summary>
        public readonly ItemKind Item;
        /// <summary>How many units of <see cref="Item"/>.</summary>
        public readonly int Count;

        public ThawRung(int rung, ItemKind item, int count)
        {
            Rung = rung;
            Item = item;
            Count = count;
        }
    }

    /// <summary>
    /// ⭐ WHY THE THAW REFUSED, OR <see cref="None"/>. One member per SENTENCE the ship can say —
    /// the RimWorld analogue (<c>docs/design/rimworld-reference.md</c> §2.2) is a refusal at the
    /// point of the click that STATES THE REASON, so a single "no" would have been the defect this
    /// milestone exists to avoid.
    ///
    /// <para>⛔ <b>APPEND-ONLY.</b> The ordinal reaches no save and no hash — nothing here is sim
    /// state — but it does reach the wire (<c>WireFormat.MossThaw</c>), so a renumber would
    /// silently re-label a client's strings.</para>
    /// </summary>
    public enum ThawRefusal : byte
    {
        /// <summary>Not a refusal: the gate said yes and <see cref="ThawCommand"/> may charge.</summary>
        None = 0,

        // ── term 1, the pod ─────────────────────────────────────────────────────────────────
        /// <summary>No <see cref="DeviceKind.CryoPod"/> aboard carries that name.</summary>
        NoSuchPod = 1,
        /// <summary>The capsule is already open. A pod is SINGLE-USE (§13.27, OD-M item 6 = A), so
        /// this is permanent and is a DIFFERENT sentence from <see cref="PodNoSignal"/>: nobody
        /// died, they are already walking around.</summary>
        PodAlreadyOpen = 2,
        /// <summary>Unpowered, or below the <c>CryoPod</c> row's <c>fail</c> threshold — OD-9's
        /// wrecked capsule, whose sleeper did not survive the raid. PERMANENT.</summary>
        PodNoSignal = 3,

        // ── term 2, the console ─────────────────────────────────────────────────────────────
        /// <summary>The terminal the request came through is missing, unpowered, below its
        /// <c>fail</c> threshold, or not commissioned.</summary>
        NoConsole = 4,

        // ── term 3, the cycle ───────────────────────────────────────────────────────────────
        /// <summary>Another capsule is mid-cycle. One at a time — the owner's stated mechanic.</summary>
        PodCycling = 5,

        // ── term 4, the rung (OD-L) ─────────────────────────────────────────────────────────
        /// <summary>The repair this capsule's band names is not aboard in the count it names.
        /// ⭐ THE REASON IS THE HINT.</summary>
        Rung = 6,

        // ── term 5, the headroom ────────────────────────────────────────────────────────────
        /// <summary>CO₂ removal would not cover the crew the thaw would create. A STEP FUNCTION:
        /// a tier unlock, not a pacer (wreck plan §3.4.1).</summary>
        Scrubbing = 7,
        /// <summary>The larder would not carry the larger crew for <see cref="ThawGate.MinDaysOfFood"/>
        /// days. The only CONTINUOUS headroom term.</summary>
        Food = 8,
        /// <summary>The tanks would not carry the larger crew for <see cref="ThawGate.MinDaysOfWater"/>
        /// days.</summary>
        Water = 9,
        /// <summary>Standing breathable oxygen below <see cref="ThawGate.MinO2CrewDays"/> crew-days.
        /// ⚠️ MEASURED AT ~99 (grid) / ~172 (wreck) CREW-DAYS: this term REPORTS and never binds on
        /// a ship that is not already lost. It is kept because deleting a term makes the report
        /// lie by omission, not because it paces anything.</summary>
        Oxygen = 10,

        // ── term 6, the price, HAS NO MEMBER HERE, AND THAT IS A DECISION ────────────────────
        //
        // The charter's own contract table leaves term 6's refusal column empty, and the code
        // agrees: term 4 reads the ship's loose stock through `LooseMatter.Affordable` and term 6
        // spends it through `LooseMatter.TryPay` — the SAME lens, on the SAME state, inside one
        // synchronous command — so the charge cannot refuse. A `Price` member would be a reason
        // nothing can produce, and a §13 "wired but nothing reaches it" entry from birth.
        // `ThawCommand.Execute` still checks the spend (a disclosed, UNTESTED defensive guard —
        // the `CommissionDeviceCommand` precedent), because "cannot fail" is a claim about today's
        // callers and the alternative is a capsule that cycles for free.
    }

    /// <summary>
    /// ⭐ THE GATE'S ANSWER — one refusal (or <see cref="ThawRefusal.None"/>) plus every NUMBER the
    /// sentence needs. A <c>readonly struct</c> of value fields and two already-existing string
    /// REFERENCES, so <see cref="ThawGate.Evaluate"/> allocates nothing: it is called from
    /// <see cref="ThawCommand.Execute"/>, which runs inside <c>Simulation.Tick</c>.
    ///
    /// <para><b>THE STRING IS COMPOSED SOMEWHERE ELSE, ON PURPOSE.</b> <see cref="ThawGate.Describe"/>
    /// turns this into prose and it ALLOCATES; it is a host/test call, never a tick-path one. The
    /// split is what lets the refusal carry a number without the tick path carrying a
    /// <c>StringBuilder</c>.</para>
    /// </summary>
    public readonly struct ThawVerdict
    {
        /// <summary>Why not, or <see cref="ThawRefusal.None"/>.</summary>
        public readonly ThawRefusal Reason;

        /// <summary>The capsule the request named, 0 when no capsule resolved.</summary>
        public readonly uint PodId;

        /// <summary>The capsule's <c>Device.Name</c> — a REFERENCE to the sim's own string (never a
        /// composed one), or the name the request asked for when nothing resolved.</summary>
        public readonly string PodName;

        /// <summary>The rung term 4 resolved (rung 0 when the gate stopped before term 4).</summary>
        public readonly ThawRung Rung;

        /// <summary>Units of <see cref="ThawRung.Item"/> lying loose aboard — the "SHIP HAS" number.</summary>
        public readonly int UnitsAboard;

        /// <summary>Crew the working scrubbers cover (term 5) — the "COVERS" number.</summary>
        public readonly int CrewCovered;

        /// <summary>Living crew AFTER the thaw would land, i.e. <c>living + 1</c>. The denominator
        /// every headroom term is measured against: the gate answers "may this ship carry the crew
        /// it is about to have", never "the crew it has".</summary>
        public readonly int CrewAfterThaw;

        /// <summary>What the binding headroom term READ (days of food, days of water, crew-days of
        /// O₂). Meaningless unless <see cref="Reason"/> is a headroom reason.</summary>
        public readonly double Reading;

        /// <summary>What that term REQUIRED. Beside <see cref="Reading"/> so the number never
        /// travels without the floor it failed.</summary>
        public readonly double Floor;

        /// <summary>Whole sim-minutes left on the cycling capsule, rounded UP (never 0 while a
        /// cycle is live: "0 min" reads as done).</summary>
        public readonly int MinutesRemaining;

        internal ThawVerdict(ThawRefusal reason, uint podId, string podName, ThawRung rung,
                             int unitsAboard, int crewCovered, int crewAfterThaw,
                             double reading, double floor, int minutesRemaining)
        {
            Reason = reason; PodId = podId; PodName = podName; Rung = rung;
            UnitsAboard = unitsAboard; CrewCovered = crewCovered; CrewAfterThaw = crewAfterThaw;
            Reading = reading; Floor = floor; MinutesRemaining = minutesRemaining;
        }

        /// <summary>May the capsule cycle?</summary>
        public bool Allowed => Reason == ThawRefusal.None;
    }

    /// <summary>
    /// ⭐ THE HEADROOM CENSUS — the same live state <c>ShipLedger.Sample</c> reads, read again,
    /// zero-alloc, for the crew the ship is ABOUT TO HAVE.
    ///
    /// <para>⛔ <b>AND IT MAY NOT CALL THE LEDGER.</b> <c>ArchitectureBoundaryTests</c>
    /// (<c>:519</c>) denies every file under <c>sim/Sim.Core</c> except <c>ShipLedger.cs</c> the
    /// identifier <c>ShipLedger</c>, deliberately with no scope filter, because
    /// <c>ShipLedger.Sample</c> ALLOCATES an <c>int[]</c> per census and this struct is filled
    /// inside <c>Simulation.Tick</c>. ⇒ <b>one source of truth by ASSERTION, not by call</b>:
    /// <c>ThawGateTests.TheGateAndTheLedgerAgree_OnADrivenShip</c> drives a real ship and requires
    /// the four shared quantities below to be equal to the ledger's, to the bit.</para>
    /// </summary>
    public readonly struct ThawHeadroom
    {
        /// <summary>Crew with <c>Citizen.Dead</c> false. ⚠️ NOT <c>sim.Citizens.Items.Count</c> —
        /// dead crew are never removed from the store. Must equal <c>ShipLedgerSample.LivingCrew</c>.</summary>
        public readonly int LivingCrew;

        /// <summary><see cref="LivingCrew"/> + 1 — every term below is measured against this.</summary>
        public readonly int CrewAfterThaw;

        /// <summary><c>DeviceKind.Scrubber</c>s that are <c>Powered</c> and above their <c>fail</c>.</summary>
        public readonly int WorkingScrubbers;

        /// <summary>The largest crew a strict CO₂ surplus covers at
        /// <see cref="WorkingScrubbers"/>. <c>int.MaxValue</c> when the defs make CO₂ free.</summary>
        public readonly int CrewScrubbingCovers;

        /// <summary>Units of <c>Potato</c> aboard. Must equal <c>ShipLedgerSample.FoodUnits</c> —
        /// carried and reserved stacks included, exactly as the ledger counts them.</summary>
        public readonly int FoodUnits;

        /// <summary>Sim-days <see cref="CrewAfterThaw"/> can be fed, or
        /// <see cref="double.PositiveInfinity"/> when the defs make nobody hungry.</summary>
        public readonly double DaysOfFood;

        /// <summary>Litres standing in <c>WaterTank</c>s. Must equal <c>ShipLedgerSample.TankLiters</c>.</summary>
        public readonly float TankLiters;

        /// <summary>Sim-days <see cref="CrewAfterThaw"/> can drink, or +∞ when nobody thirsts.</summary>
        public readonly double DaysOfWater;

        /// <summary>Σ <c>Room.O2Moles</c> over PRESSURISED rooms. Must equal
        /// <c>ShipLedgerSample.BreathableO2Moles</c>.</summary>
        public readonly double BreathableO2Moles;

        /// <summary>Crew-days of standing oxygen for <see cref="CrewAfterThaw"/>, or +∞ when the
        /// defs make nobody breathe. ⚠️ Reads ~172 on the wreck at boot: it reports, it never binds.</summary>
        public readonly double O2CrewDays;

        internal ThawHeadroom(int livingCrew, int workingScrubbers, int crewScrubbingCovers,
                              int foodUnits, double daysOfFood, float tankLiters, double daysOfWater,
                              double breathableO2Moles, double o2CrewDays)
        {
            LivingCrew = livingCrew; CrewAfterThaw = livingCrew + 1;
            WorkingScrubbers = workingScrubbers; CrewScrubbingCovers = crewScrubbingCovers;
            FoodUnits = foodUnits; DaysOfFood = daysOfFood;
            TankLiters = tankLiters; DaysOfWater = daysOfWater;
            BreathableO2Moles = breathableO2Moles; O2CrewDays = o2CrewDays;
        }
    }

    /// <summary>
    /// ⭐ THE THAW LADDER'S RUNG TABLE — the per-pod repair requirement OD-L asks for, derived from
    /// a number the wreck already authors.
    ///
    /// <para><b>WHY <c>Condition</c> CARRIES IT.</b> Three places the rung could have lived: a new
    /// hashed <c>Device</c> field (refused — <c>Entities/Device.cs:46-49</c> and the wreck plan's
    /// W5.1 both say <i>"NO new <c>Device</c> field"</i>), a new def node (moves P4 and P5 for a
    /// table nobody tunes at runtime — and a def field pinned only by the checksum is NOT pinned),
    /// or the pod's own authored <c>Condition</c>, whose documented meaning is already <i>"how badly
    /// the raid treated it"</i> (<c>Device.cs:47</c>). The third is already hashed, already saved,
    /// already authored per pod — so the ladder costs <b>no new state, no def field and no pin</b>.
    /// M2-1's precedent, in its own words: <i>"it is a rule, not a tunable."</i></para>
    ///
    /// <para><b>THE TABLE (owner batch item OD-M item 1, answered 2026-07-31, option A —
    /// BINDING).</b> Depth is the difficulty curve and is non-decreasing; the COUNT escalates inside
    /// a depth. Chain depth runs 0,0,2,2,3,3,3 and the last rung costs <b>three times the
    /// commissioning gate</b>. ⭐ <b>OD-M item 1's CURVE is untouched by D2's re-scale below — the
    /// items, the counts, the depths and the pods' ORDER are the same seven rows they were.</b>
    /// What moved is where the EDGES sit.</para>
    ///
    /// <code>
    ///   rung  band          the wreck's pod   item              count  chain depth
    ///   ----  ------------  ---------------   ----------------  -----  -----------
    ///     1   c &gt;= 0.92     Lindqvist 0.99    Seals                 1       0
    ///     2   c &gt;= 0.84     Ozawa     0.91    Seals                 2       0
    ///     3   c &gt;= 0.76     Ferreira  0.83    Parts                 1       2
    ///     4   c &gt;= 0.68     Mbeki     0.75    Parts                 2       2
    ///     5   c &gt;= 0.60     Bahri     0.67    ControllerModule      1       3
    ///     6   c &gt;= 0.52     Nakamura  0.59    ControllerModule      2       3
    ///     7   otherwise     Torres    0.51    ControllerModule      3       3
    /// </code>
    ///
    /// <para>⭐⭐ <b>D2 (2026-08-02) — THE BANDS ARE 0.08 WIDE AND EVERY POD SITS 0.07 ABOVE ITS
    /// OWN FLOOR, AND THAT NUMBER IS AN OWNER RULING, NOT AN IMPLEMENTER'S CHOICE.</b> The M3
    /// milestone demo measured the shipped ladder DECAYING UNDER THE PLAYER: bands were 0.02–0.03
    /// wide, the pods were authored 0.01–0.02 above their own floors, and <c>CryoPod</c> wear is
    /// 0.001/h — so the FIRST rung crossing landed at <b>sim-hour 9</b> (measured, driven, six of
    /// the seven pods at once) and every capsule aboard had collapsed onto rung 7 by <b>sim-hour
    /// 120</b>. Mbeki's price went <c>2 PARTS</c> → <c>1 CONTROLLER MODULE</c> inside 100
    /// sim-minutes with nothing said. The owner's call (2026-08-02): <i>keep the decay as a
    /// feature, slow it, surface it.</i> ⇒ 0.07 of headroom is <b>~70 sim-hours at nominal
    /// wear</b> — days rather than hours — and the SURFACE half is the <c>alerts</c> bar
    /// (<c>hosts/web/WireFormat.Alerts.cs</c>), which reads <see cref="BandFloorOf"/> so the warning
    /// and the price can never disagree about where an edge is.</para>
    ///
    /// <para>⚠️⚠️ <b>0.07 AND NOT 0.10, AND THE REASON IS THE SECOND OWNER RULING OF THE SAME
    /// DAY.</b> The first draft of this table used 0.11-wide bands (0.10 of headroom, ~100
    /// sim-hours) and paid for them with RANGE: seven bands 0.11 wide need 0.66 of Condition, which
    /// pushed the ladder down to 0.98 → 0.32 and left the deepest capsule <b>~220</b> unattended
    /// sim-hours from <c>CryoPod</c>'s <c>fail</c> (0.10) where the shipped ship left it ~680. A pod
    /// below <c>fail</c> is <see cref="ThawRefusal.PodNoSignal"/> FOREVER — <c>maint = 0</c> means
    /// no repair path exists, player-forced or otherwise (<c>MaintenanceSystem.cs:223,505</c> both
    /// skip on <c>Condition &gt;= MaintainBelow</c>, which <c>0</c> makes universally true) — so
    /// that trade was taken to the owner rather than shipped. <b>The ruling: walk the bands back to
    /// ~70 sim-hours so every capsule stays above Condition 0.50.</b> The ladder now spans
    /// 0.99 → 0.51, Torres sits <b>~410</b> sim-hours above <c>fail</c>, and the price-crossing
    /// pacing is still <b>~7×</b> the shipped tree's. ⚠️ The alert bar deliberately does NOT warn
    /// about the <c>fail</c> crossing — it warns about the PRICE, the thing D2 was chartered to
    /// surface. That row is FILED for M5-2's alert stack, not deleted.</para>
    ///
    /// <para>⚠️ <b>THE COMMISSIONING GATE IS THE PROLOGUE, NOT A RUNG.</b> Every thaw needs a
    /// commissioned terminal and commissioning costs 1 <c>ControllerModule</c>
    /// (<c>Commands/Commands.cs:753,778</c>; <c>build.def commission_cost = 1</c>), and the wreck's
    /// <c>term_moss</c> boots <c>scriptable: false</c>. That gate is <i>"restore MOSS"</i> — the
    /// wreck premise's own opening objective — and it is deliberately NOT encoded here. Its stated
    /// residual, accepted by the owner: rung 1 is much easier than the prologue, which is the
    /// deliberate release of pressure after it.</para>
    ///
    /// <para>⚠️ <b>CHAIN DEPTH 1 (<c>Scrap</c>) IS DELIBERATELY UNUSED.</b> <c>Scrap</c> is a
    /// crafting intermediate, not a repair consumable — the shipped repair ladder is
    /// <c>Parts</c> / <c>Seals</c> / <c>Swarf</c> (<c>Sim.Gen/AuthoredShips.cs:1584</c>). Stated so
    /// nobody "fills the gap" and puts an intermediate in a pod.</para>
    ///
    /// <para>⭐ <b>THE LOWER EDGE OF EVERY BAND IS INCLUSIVE, UNIFORMLY</b> — a pod at exactly 0.92
    /// is rung 1, at exactly 0.84 is rung 2, at exactly 0.52 is rung 6. That matches the owner's own
    /// notation for the top band (<i>"≥ …"</i>), so one comparison spelling reads the whole table.
    /// <b>The choice is made here on purpose</b>: RimWorld's <c>CapableOf</c> is
    /// <c>GetLevel(c) &gt; c.minForCapable</c>, a strict <c>&gt;</c>, so <i>"a capacity sitting
    /// exactly at <c>minForCapable</c> is NOT capable"</i> (<c>docs/design/rimworld-reference.md</c>
    /// §6.1) — the opposite convention, and the lesson it teaches is that <b>an edge nobody chose is
    /// an edge somebody will hit.</b> Pinned by <c>WreckShipTests</c>' exact-edge legs.</para>
    ///
    /// <para>⭐ <b>M3-3 CONNECTED IT.</b> <see cref="Evaluate"/>'s term 4 reads
    /// <see cref="RungOf"/> and <see cref="ThawCommand"/> spends what it names, so the paragraph
    /// that used to stand here — <i>"nothing in the sim calls this yet"</i> — is retired. The
    /// band-edge BEHAVIOURAL sweep M3-6 deferred by name is
    /// <c>ThawGateTests.TheRungChanges_AtEverySixInteriorBandEdge</c>; it drives
    /// <see cref="Evaluate"/> rather than <see cref="RungOf"/>, which is the difference between
    /// asserting the table and asserting the ladder. Current record:
    /// <c>docs/MECHANICS.md</c> §13.30.</para>
    /// </summary>
    public static class ThawGate
    {
        /// <summary>The ladder has seven rungs, one per intact occupied capsule on the wreck.</summary>
        public const int RungCount = 7;

        /// <summary>
        /// ⭐⭐ <b>THE SIX INTERIOR BAND EDGES, DESCENDING — AND THE ONE PLACE THEY ARE WRITTEN.</b>
        /// Each entry is the INCLUSIVE lower edge of the band whose rung is its index + 1; rung
        /// <see cref="RungCount"/> is the catch-all and has no floor.
        ///
        /// <para><b>WHY AN ARRAY AND NOT THE IF-CHAIN IT REPLACED (D2).</b> Until D2 these six
        /// numbers existed only as the literals of an <c>if</c> ladder inside
        /// <see cref="RungOf"/>, which was fine while nothing else needed to know where an edge
        /// sat. The decay warning needs exactly that — <i>how far is this capsule from the edge
        /// below it?</i> — and a second copy of the six numbers is the "one player confusion, two
        /// surfaces" defect this repo keeps naming. <see cref="RungOf"/> reads this array and
        /// <see cref="BandFloorOf"/> reports it, so the price and the warning cannot drift apart:
        /// move an edge and both move.</para>
        ///
        /// <para><c>static readonly</c>, so it is built once at type init and every call is a
        /// bounds-checked read — <see cref="RungOf"/> stays zero-alloc, which it must, because
        /// <see cref="Evaluate"/> runs inside <c>Simulation.Tick</c>.</para>
        ///
        /// <para>⚠️ IT IS A RULE, NOT A TUNABLE — literals in code, deliberately never a def node.
        /// See the class remarks: a def field here moves P4 and P5 for a table nobody tunes at
        /// runtime, and a def field pinned only by a checksum is not pinned at all.</para>
        /// </summary>
        private static readonly float[] BandFloors = { 0.92f, 0.84f, 0.76f, 0.68f, 0.60f, 0.52f };

        /// <summary>What <see cref="BandFloorOf"/> answers for the catch-all rung, which has no
        /// lower edge: a capsule on rung <see cref="RungCount"/> can decay but its PRICE can never
        /// rise again. Negative on purpose — no <c>Condition</c> can equal it, so a caller that
        /// forgets to check gets a margin that is never inside any warning window rather than a
        /// silently plausible 0.</summary>
        public const float NoBandFloor = -1f;

        /// <summary>
        /// The rung a capsule at <paramref name="condition"/> sits on. Pure, total (every float
        /// resolves — rung 7 is the catch-all) and zero-alloc.
        ///
        /// <para>Lower edges are INCLUSIVE — see the class remarks for why that was a decision and
        /// not a default.</para>
        /// </summary>
        public static ThawRung RungOf(float condition)
        {
            for (int i = 0; i < BandFloors.Length; i++)
                if (condition >= BandFloors[i]) return RungSpec(i + 1);
            return RungSpec(RungCount);
        }

        /// <summary>The item and count OD-M item 1 priced each rung at. Split out of
        /// <see cref="RungOf"/> so the WHERE (<see cref="BandFloors"/>) and the WHAT live apart: D2
        /// moved every edge and touched none of these seven rows, and the shape of the diff is what
        /// says so.</summary>
        private static ThawRung RungSpec(int rung)
        {
            switch (rung)
            {
                case 1: return new ThawRung(1, ItemKind.Seals, 1);
                case 2: return new ThawRung(2, ItemKind.Seals, 2);
                case 3: return new ThawRung(3, ItemKind.Parts, 1);
                case 4: return new ThawRung(4, ItemKind.Parts, 2);
                case 5: return new ThawRung(5, ItemKind.ControllerModule, 1);
                case 6: return new ThawRung(6, ItemKind.ControllerModule, 2);
                default: return new ThawRung(7, ItemKind.ControllerModule, 3);
            }
        }

        /// <summary>
        /// ⭐ D2 — <b>THE INCLUSIVE LOWER EDGE OF <paramref name="rung"/>'S BAND</b>, i.e. the
        /// <c>Condition</c> at which a capsule stops being on that rung and its thaw gets more
        /// expensive. <see cref="NoBandFloor"/> for the catch-all rung (and for any out-of-range
        /// argument), because rung <see cref="RungCount"/> has no edge below it.
        ///
        /// <para>Total and zero-alloc, like <see cref="RungOf"/>, and reading the SAME array — the
        /// warning bar's whole claim is that it names the edge the price will actually cross.</para>
        /// </summary>
        public static float BandFloorOf(int rung)
            => rung >= 1 && rung <= BandFloors.Length ? BandFloors[rung - 1] : NoBandFloor;

        /// <summary>
        /// ⚠️ <b>HOW CLOSE TO ITS EDGE A CAPSULE HAS TO BE BEFORE THE SHIP SAYS SO</b> — measured in
        /// <c>Condition</c>, because that is what the sim actually has; 0.025 is <b>25 sim-hours at
        /// the <c>CryoPod</c>'s nominal 0.001/h wear</b>, i.e. about a sim-day of notice, which is
        /// the shape the charter asked for ("roughly a sim-day").
        ///
        /// <para><b>A NAMED CONSTANT AND NOT A DEF FIELD, for exactly
        /// <see cref="MinDaysOfFood"/>'s reasons</b> — a def scalar moves P4 and P5 for a number
        /// nobody tunes at runtime, and a def field pinned only by a checksum is not pinned. Same
        /// precedent chain: <c>CryoSystem.ThawSecondsPerCycle</c>, <c>BuildSystem.FloorConstructTicks</c>,
        /// the band table above.</para>
        ///
        /// <para>⚠️ <b>IT IS NOT A TIME, AND THE DIFFERENCE IS VISIBLE IN PLAY.</b> Real wear is
        /// <c>WearPerHour × DirectorSystem.WearPressure</c> and the pressure runs 1.00–1.35
        /// (<c>MachineWearSystem.cs:70</c>), so the notice this margin buys is 18.5–25 sim-hours
        /// depending on how badly the run is going. A margin expressed in hours would have to sample
        /// that pressure and would go stale the moment it changed; a margin in Condition is a fact
        /// about the ladder, and the ship gets LESS warning exactly when it is under more
        /// pressure — which is the right direction for a warning to lean.</para>
        /// </summary>
        public const float DecayWarningMargin = 0.025f;

        /// <summary>
        /// ⭐⭐ D2 — <b>THE CAPSULE WHOSE THAW PRICE IS ABOUT TO RISE</b>, or <c>null</c> when no
        /// capsule aboard is within <see cref="DecayWarningMargin"/> of its band's lower edge.
        /// <paramref name="margin"/> comes back as the distance that capsule still has (in
        /// <c>Condition</c>), or <see cref="NoBandFloor"/> when there is nothing to report.
        ///
        /// <para><b>NEAREST TO CROSSING WINS, and there is exactly one line to spend.</b> The bar is
        /// one sentence (the <c>ending</c> precedent); the POD BAY — MOSS <c>pods</c> — is the
        /// detail view that shows all seven. Ties break on the lower <c>Device.Id</c>, the same
        /// election <c>CryoSystem</c> and <see cref="CommissionedConsoleName"/> already use, so the
        /// ship never flickers between two capsules that are equally close.</para>
        ///
        /// <para><b>WHO IS ELIGIBLE.</b> A capsule that is shut (an open one has no price), powered
        /// and above its <c>fail</c> threshold (a wrecked pod's sleeper is already dead — term 1
        /// refuses it permanently, so "its price will rise" would be a lie), and NOT on the
        /// catch-all rung (rung <see cref="RungCount"/> has no edge left to cross:
        /// <see cref="BandFloorOf"/> answers <see cref="NoBandFloor"/> and the margin test can never
        /// pass).</para>
        ///
        /// <para>Pure and zero-alloc — it returns a REFERENCE to a device the sim already owns.
        /// Host and test call it; nothing in a tick path does, but it costs nothing if one ever
        /// does.</para>
        /// </summary>
        public static Device CapsuleNearestToRungCrossing(Simulation sim, out float margin)
        {
            margin = NoBandFloor;
            if (sim == null) return null;
            Device found = null;
            float best = 0f;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.CryoPod) continue;
                if (d.IsOpen) continue;
                if (!d.Powered || !d.IsOperational(sim.Defs)) continue;

                float floor = BandFloorOf(RungOf(d.Condition).Rung);
                if (floor == NoBandFloor) continue;          // the catch-all rung: no edge below it
                float left = d.Condition - floor;
                if (left > DecayWarningMargin) continue;     // still comfortable
                if (found != null && (left > best || (left == best && d.Id >= found.Id))) continue;
                found = d;
                best = left;
            }
            margin = found == null ? NoBandFloor : best;
            return found;
        }

        // ═════════════════════════════════════════════════════════════════ M3-3: the contract
        //
        // ⭐ SIX TERMS, IN ORDER, EVERY ONE RESOLVED FROM SIM STATE — HOST-SIDE NEVER.
        //
        //   1 the pod      Kind == CryoPod && !IsOpen && Powered && Condition >= fail
        //   2 the console  a Terminal named `tid`, Powered && IsOperational && Scriptable
        //   3 the cycle    no pod anywhere with Progress > 0            (one at a time)
        //   4 the rung     RungOf(pod.Condition)'s item is aboard in its count      (OD-L)
        //   5 the headroom scrubbing · food · water · O2, each a named term WITH a number
        //   6 the price    all-or-nothing, charged LAST — in ThawCommand, never here
        //
        // ⛔ WHY THE ORDER IS THE CONTRACT AND NOT A DETAIL. The player reads ONE sentence, so the
        // gate must stop at the FIRST thing wrong and it must be the most actionable one. Pod →
        // console → cycle → rung → headroom runs cheapest-and-most-permanent first: "this sleeper
        // is dead" never has to compete with "the larder is thin", and a ship that has not restored
        // MOSS is never told about scrubbers it cannot reach anyway.
        //
        // ⛔ AND WHY THE HOST MAY CALL Evaluate: because calling it is the OPPOSITE of re-deciding.
        // `GameSession.HandleMoss` renders the verdict this function returns and enqueues the
        // command unconditionally; the command calls the SAME function at execute time and IT is
        // authoritative. There is exactly one implementation of every term above, it lives in
        // Sim.Core, and the TUI, a replay and a load all reach the identical one. A term evaluated
        // in `GameSession` instead would be "not replayed on load, not folded into the hash, and
        // not present in the TUI" (wreck plan §3.3) — which is what mutation 4 exists to make red.

        /// <summary>
        /// ⚠️ THE MINIMUM FOOD RUNWAY A THAW MAY LEAVE THE SHIP ON, in sim-days, for the crew the
        /// thaw would CREATE.
        ///
        /// <para><b>A NAMED CONSTANT AND NOT A DEF FIELD, DELIBERATELY.</b> A def scalar moves P4
        /// (defs defaults checksum) and P5 (rules-inclusive), which this package's pin ritual
        /// requires to HOLD — and a def field pinned only by a checksum is not pinned at all. The
        /// shipped precedents are <c>CryoSystem.ThawSecondsPerCycle</c> and
        /// <c>BuildSystem.FloorConstructTicks</c>: a v1 literal, stated as a rule rather than a
        /// tunable. M3-6's ruling for the rung table, applied to the floors it sits beside.</para>
        ///
        /// <para><b>MEASURED, so the number is not a guess.</b> <c>ledger --ship wreck</c> reads
        /// <b>60 u / 43.20 d</b> at h1 with one crew member; at eight crew that same larder is
        /// <b>5.4 d</b>. So this floor does not bind anywhere on the shipping ship's thaw curve,
        /// which is correct and is the point: <b>the pacing is the ladder, the headroom is the ship
        /// talking.</b> It bites a ship that has actually run its larder down —
        /// <c>--ship grid</c> reads 2.07 d at h1 — which is a ship that should not be waking
        /// people.</para>
        /// </summary>
        public const double MinDaysOfFood = 3.0;

        /// <summary>The same floor for drinking water, same shape and same reasoning. The wreck
        /// stands at 300 L, i.e. 150 sim-days for two crew.</summary>
        public const double MinDaysOfWater = 3.0;

        /// <summary>
        /// ⚠️ THE TERM THAT REPORTS AND MUST NEVER BIND, and the floor is chosen to guarantee it.
        /// Standing breathable O₂ measures ~99 crew-days on <c>--ship grid</c> and ~172 on the
        /// wreck, because a powered vent injects gas FROM NOTHING — there is no reserve to run
        /// down. One crew-day is therefore two orders of magnitude below anything a live ship
        /// reads, and the term can only fire on a ship whose compartments have already lost
        /// pressure. Keeping it costs one comparison and stops the report lying by omission;
        /// letting it pace anything would be the "obvious first draft" the wreck plan §3.4.1
        /// measured and killed.
        /// </summary>
        public const double MinO2CrewDays = 1.0;

        /// <summary>Seconds in a sim-day. The ledger's own <c>86400.0</c>, restated here because
        /// this file may not name <c>ShipLedger</c> (see <see cref="ThawHeadroom"/>).</summary>
        private const double SecondsPerDay = 86400.0;

        /// <summary>
        /// The pressurised-room gate, <c>ShipMetrics.cs:64</c> verbatim — a room below this is not
        /// a compartment the crew live in, so its gas is not part of the air the gate counts.
        /// ⚠️ A SECOND COPY OF THE LEDGER'S PRIVATE CONSTANT, and that is the cost of the boundary.
        /// It is pinned by AGREEMENT, not by sharing: <c>TheGateAndTheLedgerAgree_OnADrivenShip</c>
        /// drives a real ship and requires both O₂ sums to be equal.
        /// </summary>
        private const double PressurizedKPa = 50.0;

        /// <summary>The only <c>ItemKind</c> that reduces <c>Citizen.Hunger</c> — the ledger's
        /// <c>FoodKind</c>, restated for the same boundary reason and pinned by the same agreement
        /// test.</summary>
        private const ItemKind FoodKind = ItemKind.Potato;

        /// <summary>
        /// ⭐ THE WHOLE CONTRACT, EVALUATED. Pure: reads live sim state, mutates nothing, draws no
        /// RNG, publishes no event, allocates nothing. Both determinism twins get the same verdict.
        ///
        /// <para><paramref name="terminalName"/> is the console the request arrived through (term 2)
        /// and <paramref name="podName"/> is the capsule's <c>Device.Name</c> (term 1). Term 6, the
        /// price, is NOT evaluated here — a pure function may not spend — but term 4 has already
        /// read the same stock through the same <c>LooseMatter</c> lens, which is what makes
        /// "charged last" structurally true rather than merely intended.</para>
        /// </summary>
        public static ThawVerdict Evaluate(Simulation sim, string terminalName, string podName)
        {
            if (sim == null) throw new ArgumentNullException(nameof(sim));

            // ── term 1: the pod ──────────────────────────────────────────────────────────────
            Device pod = FindCryoPod(sim, podName);
            if (pod == null) return Refuse(ThawRefusal.NoSuchPod, 0, podName);
            if (pod.IsOpen) return Refuse(ThawRefusal.PodAlreadyOpen, pod.Id, pod.Name);
            if (!pod.Powered || !pod.IsOperational(sim.Defs))
                return Refuse(ThawRefusal.PodNoSignal, pod.Id, pod.Name);

            // ── term 2: the console ──────────────────────────────────────────────────────────
            if (!IsCommissionedConsole(sim, terminalName))
                return Refuse(ThawRefusal.NoConsole, pod.Id, pod.Name);

            // ── term 3: the cycle ────────────────────────────────────────────────────────────
            Device cycling = FindCyclingPod(sim);
            if (cycling != null)
                return new ThawVerdict(ThawRefusal.PodCycling, cycling.Id, cycling.Name, default,
                                       0, 0, 0, 0, 0, MinutesLeft(cycling.Progress));

            // ── term 4: the rung (OD-L) — the reason IS the hint ─────────────────────────────
            ThawRung rung = RungOf(pod.Condition);
            int aboard = LooseMatter.Affordable(sim, rung.Item);
            if (aboard < rung.Count)
                return new ThawVerdict(ThawRefusal.Rung, pod.Id, pod.Name, rung,
                                       aboard, 0, 0, 0, 0, 0);

            // ── term 5: the headroom — each term named, each carrying its number ──────────────
            ThawHeadroom room = Headroom(sim);
            if (room.CrewAfterThaw > room.CrewScrubbingCovers)
                return new ThawVerdict(ThawRefusal.Scrubbing, pod.Id, pod.Name, rung,
                                       aboard, room.CrewScrubbingCovers, room.CrewAfterThaw, 0, 0, 0);
            if (room.DaysOfFood < MinDaysOfFood)
                return new ThawVerdict(ThawRefusal.Food, pod.Id, pod.Name, rung,
                                       aboard, 0, room.CrewAfterThaw, room.DaysOfFood, MinDaysOfFood, 0);
            if (room.DaysOfWater < MinDaysOfWater)
                return new ThawVerdict(ThawRefusal.Water, pod.Id, pod.Name, rung,
                                       aboard, 0, room.CrewAfterThaw, room.DaysOfWater, MinDaysOfWater, 0);
            if (room.O2CrewDays < MinO2CrewDays)
                return new ThawVerdict(ThawRefusal.Oxygen, pod.Id, pod.Name, rung,
                                       aboard, 0, room.CrewAfterThaw, room.O2CrewDays, MinO2CrewDays, 0);

            // Term 6 is ThawCommand's, and it is the only step that spends.
            return new ThawVerdict(ThawRefusal.None, pod.Id, pod.Name, rung,
                                   aboard, room.CrewScrubbingCovers, room.CrewAfterThaw, 0, 0,
                                   MinutesLeft(0f));
        }

        private static ThawVerdict Refuse(ThawRefusal reason, uint podId, string podName) =>
            new ThawVerdict(reason, podId, podName ?? "", default, 0, 0, 0, 0, 0, 0);

        /// <summary>
        /// ⭐ TERM 2, NAMED AND REUSABLE: is <paramref name="terminalName"/> a console MOSS can be
        /// commissioned through — powered, above its <c>fail</c> threshold, AND fitted with a
        /// <c>ControllerModule</c>?
        ///
        /// <para><b>THE NAME ANTICIPATES A SPLIT THAT IS NOT THIS PACKAGE'S.</b> OD-N cuts the
        /// console's authority in two: a REPAIRED console (<c>Powered &amp;&amp; Condition &gt;=
        /// MaintainBelow</c>) opens doors and vents, a COMMISSIONED one runs programs and thaws.
        /// M3-15 writes the repaired-tier predicate in a new <c>MossGate.cs</c>. THIS is the
        /// commissioned tier and it is called that so the two can never be confused for one
        /// another by a reader who arrives after both exist. Nothing here implements or anticipates
        /// the door/vent half.</para>
        ///
        /// <para>On the shipping ship this term is not hypothetical: <c>term_moss</c> is authored
        /// at <c>Condition 0.14</c>, <c>scriptable: false</c>
        /// (<c>sim/Sim.Gen/AuthoredShips.cs:2059</c>) and pinned that way by
        /// <c>WreckShipTests.TheMossTerminal_BootsUnCommissioned</c>, so the player must repair AND
        /// commission it before any thaw is possible.</para>
        /// </summary>
        public static bool IsCommissionedConsole(Simulation sim, string terminalName)
        {
            if (sim == null || string.IsNullOrEmpty(terminalName)) return false;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Terminal) continue;
                if (!string.Equals(d.Name, terminalName, StringComparison.Ordinal)) continue;
                return d.Powered && d.IsOperational(sim.Defs) && d.Scriptable;
            }
            return false;
        }

        /// <summary>
        /// ⭐ M3-4 — <b>WHICH CONSOLE IS THE BAY SPEAKING THROUGH?</b> The name of a commissioned
        /// console aboard (lowest <c>Device.Id</c>), or <c>null</c> when there is none.
        ///
        /// <para><b>IT ASKS <see cref="IsCommissionedConsole"/> AND NOTHING ELSE</b> — the finder is
        /// DEFINED as "the lowest-Id terminal that predicate accepts", so there is exactly one
        /// commissioned-console rule and this is not a second one. A reader looking for the rule
        /// finds it in one place; a mutation to the predicate moves this too.</para>
        ///
        /// <para><b>WHY IT HAS TO EXIST.</b> The MOSS prompt addresses the pseudo-terminal
        /// <c>@console</c> (spec §1.3, IX-M41), which is a free-text key with no device behind it —
        /// so a POD BAY asked for from the prompt has no terminal NAME to give
        /// <see cref="Evaluate"/>'s term 2, and would refuse on every ship forever. The client may
        /// not pick one either: <c>Device.Scriptable</c> has never reached the wire, so a client
        /// choosing a terminal would be guessing at the one fact the gate turns on. ⇒ the SIM
        /// resolves it, the host puts the resolved name on the wire, and the client sends that name
        /// back with the thaw. One authority, no guess.</para>
        ///
        /// <para>⚠️ <b>SHIP-WIDE, NOT NAME-KEYED — the <see cref="MossGate"/> rule, deliberately.</b>
        /// <c>MossGate.IsServerLive</c> asks <i>"is a MOSS server live aboard?"</i> and carries no
        /// name literal for the reason its own remarks give (a name test in Sim.Core makes every
        /// other ship ungateable). The bay is the same shape of question one tier up. The known
        /// consequence is the same one and it is inherited, not re-decided: a ship with two
        /// commissioned terminals answers through the lower-Id one.</para>
        ///
        /// <para>Zero-alloc (it returns a REFERENCE to <c>Device.Name</c>, never a composed string),
        /// Ordinal by construction, no RNG, no mutation.</para>
        /// </summary>
        public static string CommissionedConsoleName(Simulation sim)
        {
            if (sim == null) return null;
            Device found = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Terminal) continue;
                if (found != null && d.Id >= found.Id) continue;
                if (!IsCommissionedConsole(sim, d.Name)) continue;
                found = d;
            }
            return found?.Name;
        }

        /// <summary>The capsule that name belongs to, or null. Ordinal comparison: a device name is
        /// an identifier, and the dev machine is de-DE.</summary>
        private static Device FindCryoPod(Simulation sim, string podName)
        {
            if (string.IsNullOrEmpty(podName)) return null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.CryoPod) continue;
                if (string.Equals(d.Name, podName, StringComparison.Ordinal)) return d;
            }
            return null;
        }

        /// <summary>
        /// The capsule already mid-cycle, or null. ⚠️ ANY pod with <c>Progress &gt; 0</c> blocks,
        /// including one <c>CryoSystem</c> would not itself advance: the rule is "the bay is busy",
        /// and a capsule stuck at full progress with nowhere to open (<c>CryoSystem</c>'s hold) is
        /// the busiest state the bay has. Lowest <c>Id</c> wins, matching the system's own election.
        /// </summary>
        private static Device FindCyclingPod(Simulation sim)
        {
            Device found = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.CryoPod) continue;
                if (d.IsOpen || d.Progress <= 0f) continue;
                if (found == null || d.Id < found.Id) found = d;
            }
            return found;
        }

        /// <summary>Whole sim-minutes a cycle at <paramref name="progress"/> has left, rounded UP
        /// and never below 1 — "0 min" reads as finished. InvariantCulture is irrelevant to an int,
        /// which is exactly why the rounding happens here and not in the formatter.</summary>
        private static int MinutesLeft(float progress)
        {
            double secondsLeft = (1.0 - progress) * CryoSystem.ThawSecondsPerCycle;
            int minutes = (int)Math.Ceiling(secondsLeft / 60.0);
            return minutes < 1 ? 1 : minutes;
        }

        /// <summary>
        /// ⭐ THE HEADROOM CENSUS. One device pass, one item pass, one citizen pass, one room pass —
        /// <c>ShipMetrics.Compute</c>'s shape, and zero-alloc for the same reason it is: this runs
        /// inside <c>Simulation.Tick</c>. Public because the agreement test and the host's report
        /// both read it.
        /// </summary>
        public static ThawHeadroom Headroom(Simulation sim)
        {
            if (sim == null) throw new ArgumentNullException(nameof(sim));

            // --- citizens --- living only; dead crew stay in the store forever (NeedsSystem.cs:198
            // only sets the flag), which is why this is not `Items.Count`. The ledger's own rule.
            int living = 0;
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++) if (!citizens[i].Dead) living++;
            int crewAfter = living + 1;

            // --- devices --- scrubbers and tanks in one pass.
            int scrubbers = 0;
            float tankLiters = 0f;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind == DeviceKind.Scrubber)
                {
                    if (d.Powered && d.IsOperational(sim.Defs)) scrubbers++;
                }
                else if (d.Kind == DeviceKind.WaterTank)
                {
                    tankLiters += d.StoredLiters;
                }
            }

            // ⭐ THE STEP FUNCTION. Capacity is `scrubbers * scrubber_mol_per_second`; demand is
            // `crew * co2_per_person_per_second`; the gate is a STRICT surplus. At the shipped defs
            // that is 0.001 / 2.73e-4 = 3.663 crew per working scrubber, so one scrubber covers 3
            // and two cover 7 — a tier unlock, measured, and NOT a pacer (wreck plan §3.4.1).
            // `ceil(x) - 1` is the strict-surplus inverse and is correct on an exact boundary too:
            // at exactly 4.000 crew-equivalents, four crew is not a SURPLUS, so it covers three.
            double perCrewCO2 = sim.Defs.Atmosphere.CO2PerPersonPerSecond;
            double scrubCapacity = scrubbers * sim.Defs.Atmosphere.ScrubberMolPerSecond;
            int covers = perCrewCO2 > 0
                ? (int)Math.Ceiling(scrubCapacity / perCrewCO2) - 1
                : int.MaxValue;
            if (covers < 0) covers = 0;

            // --- items --- the larder. Counts CARRIED and RESERVED stacks, exactly as the ledger
            // does, so the two agree; the PRICE reads `LooseMatter` instead, which is a different
            // question (what may be spent) and deliberately a different number.
            int foodUnits = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (it.Kind == FoodKind) foodUnits += it.Count;
            }

            // --- rooms --- the standing breathable air. The ledger's walk, verbatim: skip the
            // vacuum sink at index 0, skip empty rooms, EXCLUDE a room whose gas is non-finite
            // (NaN loses every comparison silently and would otherwise slip past the pressure gate
            // and poison the sum), then the 50 kPa gate.
            double o2 = 0;
            var rooms = sim.Rooms.Rooms;
            for (int i = 1; i < rooms.Count; i++)
            {
                var room = rooms[i];
                if (room == null || room.TileCount <= 0) continue;
                if (!double.IsFinite(room.PressureKPa) || !double.IsFinite(room.O2Moles)) continue;
                if (room.PressureKPa < PressurizedKPa) continue;
                o2 += room.O2Moles;
            }

            return new ThawHeadroom(living, scrubbers, covers, foodUnits,
                                    Days(foodUnits, crewAfter * FoodUnitsPerCrewPerDay(sim.Defs)),
                                    tankLiters,
                                    Days(tankLiters, crewAfter * LitersPerCrewPerDay(sim.Defs)),
                                    o2,
                                    Days(o2, crewAfter * O2MolesPerCrewPerDay(sim.Defs)));
        }

        /// <summary>Stock ÷ per-day draw, or <see cref="double.PositiveInfinity"/> when there is no
        /// draw to divide by. ⚠️ +∞ AND NOT -1: this is a GATE, and the ledger's -1 sentinel ("no
        /// meaningful value") would compare BELOW every floor and refuse every thaw on a ship whose
        /// content pack made nobody hungry. A stock nobody consumes lasts forever, and the
        /// comparison must say so.</summary>
        private static double Days(double stock, double drawPerDay)
        {
            if (!(drawPerDay > 0)) return double.PositiveInfinity;
            double days = stock / drawPerDay;
            return double.IsFinite(days) ? days : double.PositiveInfinity;
        }

        /// <summary>
        /// Food units ONE living crew member eats per sim-day: the rate Hunger fills
        /// (<c>needs.def hunger_per_second</c> over a sim-day) ÷ the Hunger one unit removes
        /// (<c>sustenance.def potato_hunger_value</c>). 0 when either def makes the question
        /// meaningless.
        /// <para>⚠️ A SECOND COPY of <c>ShipLedger.FoodUnitsPerCrewPerDay</c>, forced by the ledger
        /// boundary and pinned by the agreement test. The shipped tuning fills the meter in TWO
        /// sim-days, not one — a derivation written from <c>sustenance.def</c>'s COMMENT rather
        /// than its numbers under-reports the runway by exactly 2× (E0-9 shipped that mistake once).
        /// </para>
        /// </summary>
        public static double FoodUnitsPerCrewPerDay(SimDefs defs)
        {
            if (defs == null) return 0;
            double perUnit = defs.Sustenance.PotatoHungerValue;
            if (!(perUnit > 0)) return 0;
            double hungerPerDay = defs.Needs.HungerPerSecond * SecondsPerDay;
            if (!(hungerPerDay > 0)) return 0;
            return hungerPerDay / perUnit;
        }

        /// <summary>
        /// Litres ONE living crew member drinks per sim-day, DERIVED and not guessed: Thirst fills
        /// at <c>needs.def thirst_per_second</c>, a crew member self-serves when it crosses
        /// <c>sustenance.def need_threshold</c>, and a drink is <c>drink_liters</c> and zeroes the
        /// meter (<c>SustenanceSystem.cs:222-223</c>). ⇒ drinks/day = 86 400 · rate ÷ threshold.
        /// At the shipped tuning that is 2 drinks × 0.5 L = <b>1.0 L per crew per sim-day</b>.
        /// <para>There is no ledger member to copy here — <c>DaysOfWater</c> is MEASURED from two
        /// censuses and a gate has only one instant — so this is the modelled twin of it, with the
        /// same limitation food's modelled runway has: it cannot see the reclaimer refilling.</para>
        /// </summary>
        public static double LitersPerCrewPerDay(SimDefs defs)
        {
            if (defs == null) return 0;
            double threshold = defs.Sustenance.NeedThreshold;
            if (!(threshold > 0)) return 0;
            double drinksPerDay = defs.Needs.ThirstPerSecond * SecondsPerDay / threshold;
            if (!(drinksPerDay > 0)) return 0;
            return drinksPerDay * defs.Sustenance.DrinkLiters;
        }

        /// <summary>Oxygen ONE living crew member breathes in a sim-day — the ledger's
        /// <c>CrewO2MolesPerDay</c> divided by its crew count, restated across the boundary and
        /// pinned by the agreement test.</summary>
        public static double O2MolesPerCrewPerDay(SimDefs defs)
            => defs == null ? 0 : defs.Atmosphere.O2PerPersonPerSecond * SecondsPerDay;

        // ─────────────────────────────────────────────────────────── the sentence the ship says
        //
        // ⚠️ ALLOCATES. Host and test only — never a tick path. This is the whole reason
        // ThawVerdict carries numbers instead of prose.

        /// <summary>
        /// ⭐ THE REFUSAL, IN WORDS — one sentence, upper case, every number InvariantCulture.
        ///
        /// <para>The RimWorld analogue decides the shape (<c>docs/design/rimworld-reference.md</c>
        /// §2.2, whose own boxed conclusion calls it <i>"the single most transferable fact in §2
        /// for Perilune"</i>): the refusal states the reason at the point of the click. A verdict
        /// that reached the player as a greyed row with no sentence would be the defect this
        /// milestone is built to avoid.</para>
        ///
        /// <para><b>NO PLURALISATION, on purpose.</b> <c>NEEDS 2 CONTROLLER MODULE</c> reads like a
        /// machine and this is a machine talking; a pluralisation table would be a second place for
        /// the item vocabulary to drift from <c>ItemKind</c>. Two of the three ladder items
        /// (<c>Parts</c>, <c>Seals</c>) are already plural nouns.</para>
        /// </summary>
        public static string Describe(in ThawVerdict v)
        {
            var ic = System.Globalization.CultureInfo.InvariantCulture;
            switch (v.Reason)
            {
                case ThawRefusal.None:
                    return "THAW ACCEPTED — " + Sleeper(v.PodName) + " — "
                         + v.MinutesRemaining.ToString(ic) + " min";
                case ThawRefusal.NoSuchPod:
                    return "NO SUCH POD";
                case ThawRefusal.PodAlreadyOpen:
                    return "POD IS EMPTY — ALREADY THAWED";
                case ThawRefusal.PodNoSignal:
                    return "POD — NO SIGNAL";
                case ThawRefusal.NoConsole:
                    // ⚠️ RE-WORDED BY M3-4 (2026-08-01) — the old sentence was `NO CONSOLE — MOSS
                    // IS OFFLINE`, and M3-15 made it FALSE for the state it fires in most. OD-N
                    // split the console's authority in two, so a player can now stand at a console
                    // that just opened a door and be told MOSS is offline; the honest answer names
                    // the missing ControllerModule. The family (this sentence · MossGate's two ·
                    // M3-16's shipped CONTROLLER FAULT) is pinned PAIRWISE DISTINCT by
                    // `ThawGateTests.TheConsoleSentences_ArePairwiseDistinct` — the review that
                    // filed this found only one of the three pairs guarded.
                    return "NO COMMISSIONED CONSOLE — FIT A CONTROLLER MODULE TO A WORKING TERMINAL";
                case ThawRefusal.PodCycling:
                    return "POD " + Sleeper(v.PodName) + " IS CYCLING — "
                         + v.MinutesRemaining.ToString(ic) + " min";
                case ThawRefusal.Rung:
                    return "NEEDS " + v.Rung.Count.ToString(ic) + " " + ItemWords(v.Rung.Item)
                         + " — SHIP HAS " + v.UnitsAboard.ToString(ic);
                case ThawRefusal.Scrubbing:
                    return "SCRUBBING COVERS " + v.CrewCovered.ToString(ic) + " OF "
                         + v.CrewAfterThaw.ToString(ic);
                case ThawRefusal.Food:
                    return "FOOD " + Fixed1(v.Reading) + " DAYS — NEEDS " + Fixed1(v.Floor);
                case ThawRefusal.Water:
                    return "WATER " + Fixed1(v.Reading) + " DAYS — NEEDS " + Fixed1(v.Floor);
                case ThawRefusal.Oxygen:
                    return "O2 " + Fixed1(v.Reading) + " CREW-DAYS — NEEDS " + Fixed1(v.Floor);
                default:
                    // Unreachable while the enum and this switch agree. It is a SENTENCE and not a
                    // "" because the one thing a refusal may never be is silent.
                    return "THAW REFUSED";
            }
        }

        /// <summary>
        /// ⭐ M3-4 — <b>THE SENTENCE A POD BAY ROW CARRIES</b>, which is the same as
        /// <see cref="Describe"/>'s for every refusal and DIFFERENT for the one verdict that is not
        /// a refusal.
        ///
        /// <para><b>WHY IT DIFFERS, AND WHY THAT IS NOT TWO VOCABULARIES.</b> <see cref="Describe"/>
        /// answers <i>"what happened when I asked?"</i> — <c>THAW ACCEPTED — OZAWA — 4 min</c>, a
        /// sentence about an ACT, correct on the reply to a click and wrong in a column of standing
        /// capsules, none of which has been asked about. A row answers <i>"what is true of this
        /// capsule?"</i>, and for an allowed one the true thing is <b>what it will spend</b>:
        /// <c>READY — 1 SEALS</c>, the charter's own mock. Every other arm DELEGATES, so the
        /// refusal vocabulary has exactly one implementation and a re-wording reaches both
        /// surfaces.</para>
        ///
        /// <para>ALLOCATES — host and test only, like <see cref="Describe"/>.</para>
        /// </summary>
        public static string DescribeRow(in ThawVerdict v)
        {
            if (v.Reason != ThawRefusal.None) return Describe(v);
            var ic = System.Globalization.CultureInfo.InvariantCulture;
            return "READY — " + v.Rung.Count.ToString(ic) + " " + ItemWords(v.Rung.Item);
        }

        /// <summary>One decimal, InvariantCulture, and "999+" above the point where a runway stops
        /// meaning anything (the ledger's <c>MaxMeaningfulDays</c> idea — an infinite runway must
        /// not print as "∞" or as a locale's own float spelling).</summary>
        private static string Fixed1(double days)
        {
            if (!double.IsFinite(days) || days > 999.0) return "999+";
            return days.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture);
        }

        /// <summary>The sleeper's name, upper case, from the capsule's device name — the same
        /// inverse of the authoring convention <c>CryoSystem</c> uses to name the person who steps
        /// out, so the refusal and the arrival call her the same thing.</summary>
        private static string Sleeper(string podName)
            => CryoSystem.SleeperName(podName ?? "").ToUpperInvariant();

        /// <summary>
        /// ⭐⭐ <b>THE REFUSAL VOCABULARY — THE ONE PLACE A <see cref="ItemKind"/> IS SPELLED INSIDE
        /// A REFUSAL SENTENCE.</b> A <c>switch</c> over consts, not <c>Enum.ToString()</c>: an
        /// undeclared ordinal must not reach a player as a number, and <c>ControllerModule</c> must
        /// not reach one as one word.
        ///
        /// <para>⚠️ <b>SCOPED TO REFUSALS, AND THE SCOPE IS MEASURED RATHER THAN ASSUMED.</b> An
        /// earlier wording of this comment claimed it was <i>"the one place this game spells an
        /// ItemKind for a player"</i>, and that is FALSE: the stockpile FILTER chips spell the same
        /// enum on two shipping surfaces and spell it DIFFERENTLY on purpose — <c>CTRL MOD</c>
        /// (<c>client/src/ui/stock-filter-model.js:29</c> and <c>hosts/tui/Ui/StockFilterModel.cs:89</c>,
        /// which are pinned equal to EACH OTHER). A chip has a column to fit in; a refusal sentence
        /// has a line of prose. Two vocabularies for two jobs is fine — what is NOT fine is two
        /// vocabularies for ONE job, which is what this switch exists to prevent.</para>
        ///
        /// <para>⭐ <b>PUBLIC SINCE M3-13, AND THAT IS THE WHOLE POINT OF THE FIELD IT SERVES.</b>
        /// Two surfaces now name an item in a refusal — the MOSS <b>POD BAY</b> row
        /// (<c>NEEDS 1 CONTROLLER MODULE — SHIP HAS 0</c>, composed here by
        /// <see cref="Describe"/>) and the Room Zoom's <c>blocked</c> TILE BADGE (composed
        /// client-side from the <c>Detail</c> element of a <c>WireFormat.BlockedCell</c>, because
        /// the wire carries an <see cref="ItemKind"/> BYTE and never a string). M2-18's rule
        /// applies verbatim — <i>"one player confusion, two surfaces, and they must agree; neither
        /// package invents a second vocabulary"</i> — so the client's mirror
        /// (<c>ITEM_WORDS</c> in <c>client/src/wire/messages.js</c>) is pinned equal to THIS switch
        /// by a test that PARSES THIS FILE (<c>client/test/blocked-model.test.js</c>, the house
        /// tripwire idiom: there is no compiler across that seam). Re-word a case here and the
        /// client test reddens.</para>
        ///
        /// <para><b>NO PLURALISATION</b> — see <see cref="Describe"/>'s remarks.</para>
        /// </summary>
        public static string ItemWords(ItemKind kind)
        {
            switch (kind)
            {
                case ItemKind.Seals: return "SEALS";
                case ItemKind.Parts: return "PARTS";
                case ItemKind.ControllerModule: return "CONTROLLER MODULE";
                default: return kind.ToString().ToUpperInvariant();
            }
        }
    }
}
