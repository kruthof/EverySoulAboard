using System;

namespace Perilune.Sim
{
    /// <summary>
    /// ONE INSTANTANEOUS CENSUS of the ship's matter, water and air — the stock half of the ledger.
    /// Every field is READ out of state some system already owns; nothing here is derived from a
    /// second reading of itself.
    ///
    /// <para><b>A sample is a stock, never a rate.</b> Rates live on <see cref="ShipLedgerReport"/>
    /// and exist only when two samples separated in sim-time are available. That split is the whole
    /// design: a rate cannot be read out of one instant, and inventing one from nameplate capacity
    /// ("this fabricator could make 96 Parts/day") is the exact class of lie E0-8 exists to end —
    /// <c>ShipSystems</c>'s own FABRICATION row already carries the admission, "powered is not busy".</para>
    /// </summary>
    public readonly struct ShipLedgerSample
    {
        /// <summary>Sim tick this census was taken at. The rate window's only clock.</summary>
        public readonly long Tick;

        /// <summary>
        /// UNITS PER <see cref="ItemKind"/>, indexed by the enum's ordinal, length
        /// <see cref="ShipLedger.KindCount"/>. Counts EVERY <see cref="ItemStack"/> in the store —
        /// on the ground, carried by a crew member, and reserved for a job alike.
        /// <para>Never null on a <see cref="Valid"/> sample.</para>
        /// </summary>
        public readonly int[] Units;

        /// <summary>
        /// ⚠️ UNITS OF A KIND THE ENUM DOES NOT NAME. Zero in every reachable state today; it exists
        /// so that a stack whose <see cref="ItemStack.Kind"/> falls outside
        /// <see cref="ShipLedger.KindCount"/> is COUNTED rather than silently dropped from
        /// <see cref="TotalUnits"/>. A ledger that quietly stops counting a resource is the defect
        /// this package was chartered against; an out-of-range kind must show up as a number nobody
        /// can explain, not as a rounding error in a total.
        /// </summary>
        public readonly long UnknownUnits;

        /// <summary>
        /// THE ROLL-UP: every unit of every kind, plus <see cref="UnknownUnits"/>.
        ///
        /// <para><b>This is E4's Appraisal hook</b> (<c>ECONOMY.md</c> §13.3: "if MassLedger ships
        /// without a total-value roll-up, E4 either re-walks every entity or bolts on a second
        /// aggregate"). It is an UNWEIGHTED unit count, and that is deliberate: <b>there is no price,
        /// value or mass scalar anywhere in this sim today</b>, so any weighting shipped here would
        /// be invented rather than derived. E4 supplies the price vector and dots it with
        /// <see cref="Units"/> — <see cref="ShipLedger.KindCount"/> multiplies, no entity walk. The
        /// aggregate E4 must not have to re-derive is the per-kind array, and that is what ships.</para>
        /// </summary>
        public readonly long TotalUnits;

        /// <summary>Number of <see cref="ItemStack"/> entities behind <see cref="TotalUnits"/> — the
        /// census's own size, so a reader can tell 700 potatoes in one stack from 700 stacks.</summary>
        public readonly int Stacks;

        /// <summary>Crew with <see cref="Citizen.Dead"/> false. NOT <c>sim.Citizens.Items.Count</c>:
        /// dead crew are never removed from the store (<c>NeedsSystem.cs:198</c> only sets the flag),
        /// which is the bug this file's audit found in <see cref="ShipMetrics"/>.</summary>
        public readonly int LivingCrew;

        /// <summary>Litres standing in <see cref="DeviceKind.WaterTank"/>s. THE DRINKABLE STOCK —
        /// greywater is not drinkable and reaches a tank only through a powered reclaimer.</summary>
        public readonly float TankLiters;

        /// <summary>Σ <c>water.def tank_capacity_liters</c> over the tanks aboard.</summary>
        public readonly float TankCapacityLiters;

        /// <summary><see cref="Simulation.WastewaterLiters"/> — the shipwide greywater pool.
        /// Reported beside the tanks, never added to them: see <see cref="DaysOfWaterDerivation"/>.</summary>
        public readonly float GreywaterLiters;

        /// <summary>Σ <see cref="Room.O2Moles"/> over PRESSURISED rooms (the
        /// <c>ShipMetrics.cs:64</c> 50 kPa gate, verbatim). The standing air the crew are breathing.</summary>
        public readonly double BreathableO2Moles;

        /// <summary>Rooms that cleared the 50 kPa gate.</summary>
        public readonly int PressurizedRooms;

        /// <summary>Rooms excluded because a gas field was NaN/∞. Non-zero ⇒ the air numbers above
        /// are incomplete and <see cref="ShipLedgerReport.DaysOfAir"/> refuses to band.</summary>
        public readonly int NonFiniteRooms;

        /// <summary>False on <c>default(ShipLedgerSample)</c> — i.e. "no census has been taken".
        /// <see cref="ShipLedger.Report"/> uses it to tell "no window yet" from "a window of 0 ticks".</summary>
        public readonly bool Valid;

        internal ShipLedgerSample(long tick, int[] units, long unknownUnits, long totalUnits, int stacks,
                                  int livingCrew, float tankLiters, float tankCapacityLiters,
                                  float greywaterLiters, double breathableO2Moles,
                                  int pressurizedRooms, int nonFiniteRooms)
        {
            Tick = tick; Units = units; UnknownUnits = unknownUnits; TotalUnits = totalUnits;
            Stacks = stacks; LivingCrew = livingCrew;
            TankLiters = tankLiters; TankCapacityLiters = tankCapacityLiters;
            GreywaterLiters = greywaterLiters;
            BreathableO2Moles = breathableO2Moles;
            PressurizedRooms = pressurizedRooms; NonFiniteRooms = nonFiniteRooms;
            Valid = true;
        }

        /// <summary>Units of one kind, 0 for a kind this build does not know.</summary>
        public int UnitsOf(ItemKind kind)
        {
            int k = (int)kind;
            return Units != null && (uint)k < (uint)Units.Length ? Units[k] : 0;
        }
    }

    /// <summary>
    /// THE LEDGER AS THE PLAYER READS IT: one <see cref="ShipLedgerSample"/> plus the four chartered
    /// members that need two of them (<c>ECONOMY-PLAN.md</c> §1, E0-8).
    ///
    /// <para><b>THE SENTINEL CONVENTION, and it differs per member — read it before believing a
    /// number.</b> The house idiom is <c>ShipSystemRow.Load == -1</c>, "no meaningful value"; it is
    /// followed here, with one deliberate exception.</para>
    /// <list type="bullet">
    /// <item><see cref="WindowTicks"/> <c>== 0</c> ⇒ NO WINDOW YET. Every rate below is meaningless
    /// and a surface must render "measuring", not a zero.</item>
    /// <item><see cref="PartsPerDay"/> is SIGNED and 0 is a real answer (a ship that neither makes
    /// nor spends Parts), so -1 is NOT its sentinel. <see cref="WindowTicks"/> is the only thing that
    /// says whether it means anything.</item>
    /// <item><see cref="DaysOfWater"/> / <see cref="DaysOfAir"/> are -1 when the stock is NOT
    /// DEPLETING (steady or rising), when it would outlast <see cref="ShipLedger.MaxMeaningfulDays"/>,
    /// or when there is no window. The first two are the ordinary healthy-ship answer.</item>
    /// </list>
    /// </summary>
    public readonly struct ShipLedgerReport
    {
        /// <summary>The stock census this report is about (the LATER of the two samples).</summary>
        public readonly ShipLedgerSample Now;

        /// <summary>Sim ticks between the two samples. 0 ⇒ no rate below means anything.</summary>
        public readonly long WindowTicks;

        /// <summary>
        /// ⚠️ <b>NET</b> change in <see cref="ItemKind.Parts"/> units per sim-day over the window —
        /// production MINUS consumption, not gross output. Negative is normal and correct on a ship
        /// spending Parts (<c>MachineShop</c> eats 2 per <c>ControllerModule</c>;
        /// <c>PlaceDeviceCommand</c> charges <c>device_place_cost</c>).
        /// <para><b>Gross production is NOT derivable</b> without a lifetime counter, and a lifetime
        /// counter is saved state, which is hashed state, which moves a determinism pin. E0-8 is
        /// chartered pin-neutral, so the honest member is the net one and it says so in its name's
        /// documentation rather than in a footnote nobody reads.</para>
        /// </summary>
        public readonly double PartsPerDay;

        /// <summary>Signed net change in <see cref="ShipLedgerSample.TotalUnits"/> per sim-day. Same
        /// contract as <see cref="PartsPerDay"/>: net, signed, meaningless when
        /// <see cref="WindowTicks"/> is 0.</summary>
        public readonly double MatterUnitsPerDay;

        /// <summary>
        /// Sim-days until the TANKS are dry at the measured net drain, or -1
        /// (see the sentinel convention on this struct). Reads the drinkable stock only.
        /// Limits: <see cref="ShipLedger.DaysOfWaterDerivation"/>.
        /// </summary>
        public readonly double DaysOfWater;

        /// <summary>
        /// Sim-days until the pressurised compartments hold no oxygen at the measured net loss, or -1.
        /// ⚠️ THIS IS NOT AN AIR SUPPLY — this sim has no air reserve at all. Read
        /// <see cref="ShipLedger.DaysOfAirDerivation"/> before quoting it anywhere.
        /// </summary>
        public readonly double DaysOfAir;

        internal ShipLedgerReport(in ShipLedgerSample now, long windowTicks, double partsPerDay,
                                  double matterUnitsPerDay, double daysOfWater, double daysOfAir)
        {
            Now = now; WindowTicks = windowTicks;
            PartsPerDay = partsPerDay; MatterUnitsPerDay = matterUnitsPerDay;
            DaysOfWater = daysOfWater; DaysOfAir = daysOfAir;
        }
    }

    /// <summary>
    /// THE LEDGER (<c>ECONOMY-PLAN.md</c> §1, E0-8) — a PURE, ON-DEMAND DERIVATION, modelled exactly
    /// on its neighbours <see cref="ShipMetrics"/> and <see cref="ShipSystems"/>. One item pass, one
    /// device pass, one citizen pass, one room pass; call at ≤1 Hz, NEVER per tick.
    ///
    /// <para><b>IT ADDS NO SIM STATE.</b> No field on <see cref="Simulation"/>, no
    /// <see cref="IStatefulSystem"/>, no <see cref="SimDefs"/> row, no hash fold, no
    /// <c>GlyphColor</c>. Nothing here mutates the sim, draws from the RNG or publishes an event, so
    /// a read of this ledger between two ticks leaves both determinism twins byte-identical. That is
    /// the charter's binding constraint and it is why the ledger is a report and not a system.</para>
    ///
    /// <para><b>WHY IT IS NOT "COMPUTED INCREMENTALLY IN THE OWNING SYSTEM", which is what the
    /// charter asked for.</b> Those two requirements are in direct conflict and pin-neutrality wins.
    /// An incremental accumulator (a running Parts-produced counter on <c>CraftingSystem</c>) is
    /// per-definition carried across ticks, so it must be SAVED — and this repo's first invariant is
    /// "every saved field is hashed", which moves a pin. Leaving it unsaved is worse than moving a
    /// pin: the counter would reset on load, and a metric that changes value when you reload the game
    /// is a lie with a save file behind it. The alternative shipped instead is the two-sample window
    /// (<see cref="ShipLedgerTracker"/>): the accumulation lives entirely OUTSIDE the sim, on the
    /// host, where it costs no hashed state and where a reload simply restarts the window and says
    /// so. Cost, stated plainly: rates are unavailable for the first
    /// <see cref="ShipLedgerTracker.DefaultMinWindowTicks"/> ticks of a session, and they measure NET
    /// change rather than gross flow.</para>
    ///
    /// <para><b>Cost.</b> O(items + devices + citizens + rooms) per call, allocating one
    /// <see cref="int"/>[<see cref="KindCount"/>]. <see cref="ShipMetrics.Compute"/> already walks
    /// the same four stores at the same cadence (its potato count is a full item pass), so this adds
    /// no new asymptotic cost and NOTHING at all to the tick path.</para>
    /// </summary>
    public static class ShipLedger
    {
        // ---------------------------------------------------------------- item-kind census
        //
        // ⚠️ SIZED OFF THE ENUM, NEVER OFF A LITERAL. Two sibling economy lanes are adding item kinds
        // right now (E0-6 `Seals`, E0-7 `Ice`). A hard-coded 7 here would make each of them silently
        // vanish from the ledger — the ledger quietly stopping counting a new resource is precisely
        // the lying metric this package exists to end, so the array grows with the enum by
        // construction and `LedgerKindCoverageTests` drives every declared kind through a real sim.
        //
        // max+1 rather than Length, so a future gap in the ordinals cannot shrink the array below the
        // largest kind's index.

        /// <summary>Length of <see cref="ShipLedgerSample.Units"/>: one slot per <see cref="ItemKind"/>
        /// ordinal from 0 to the largest declared value. Grows with the enum, automatically.</summary>
        public static readonly int KindCount = ComputeKindCount();

        private static readonly string[] KindNamesCache = BuildKindNames();

        private static int ComputeKindCount()
        {
            var values = (ItemKind[])Enum.GetValues(typeof(ItemKind));
            int max = -1;
            for (int i = 0; i < values.Length; i++)
            {
                int v = (int)values[i];
                if (v > max) max = v;
            }
            return max + 1;
        }

        private static string[] BuildKindNames()
        {
            var names = new string[KindCount];
            for (int i = 0; i < names.Length; i++)
            {
                var kind = (ItemKind)i;
                // Defined() rather than ToString(): an undeclared ordinal stringifies to its NUMBER,
                // which reads on a wire exactly like a kind name and would hide a gap.
                names[i] = Enum.IsDefined(typeof(ItemKind), kind) ? kind.ToString() : "Kind" + i;
            }
            return names;
        }

        /// <summary>The <see cref="ItemKind"/> name for a <see cref="ShipLedgerSample.Units"/> index.
        /// An undeclared ordinal (a gap) reads <c>Kind&lt;n&gt;</c>, never a bare number.</summary>
        public static string KindName(int index) =>
            (uint)index < (uint)KindNamesCache.Length ? KindNamesCache[index] : "Kind" + index;

        // ---------------------------------------------------------------- thresholds

        /// <summary>The <c>ShipMetrics.cs:64</c> pressurised-room gate, verbatim — a room below this
        /// is not a compartment the crew live in, so its gas is not part of the air ledger.</summary>
        private const double PressurizedKPa = 50.0;

        /// <summary>
        /// A stock that would outlast this many sim-days at the measured rate is reported as NOT
        /// DEPLETING (-1) rather than as a number.
        ///
        /// <para>Two reasons, and the second is the load-bearing one. (1) Nobody can act on "1,400
        /// days of water". (2) At that ratio the measured delta is at or below float noise in a
        /// <see cref="float"/> tank level around 500 L, so the digits would be manufactured. Printing
        /// a manufactured number is the failure mode this package is named for.</para>
        /// </summary>
        public const double MaxMeaningfulDays = 999.0;

        // ---------------------------------------------------------------- the census

        /// <summary>
        /// Take one census. Pure read; deterministic (entity store order and room index order
        /// throughout, exactly as <see cref="ShipMetrics"/> and <see cref="ShipSystems"/> walk them).
        /// </summary>
        public static ShipLedgerSample Sample(Simulation sim)
        {
            if (sim == null) throw new ArgumentNullException(nameof(sim));

            // --- items (one pass) ---
            var units = new int[KindCount];
            long unknown = 0, total = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                int count = it.Count;
                int k = (int)it.Kind;
                if ((uint)k < (uint)units.Length) units[k] += count; else unknown += count;
                total += count;
            }

            // --- citizens (one pass) --- living only; dead crew stay in the store forever.
            var citizens = sim.Citizens.Items;
            int living = 0;
            for (int i = 0; i < citizens.Count; i++) if (!citizens[i].Dead) living++;

            // --- devices (one pass) --- the tank ledger.
            float stored = 0f, capacity = 0f;
            var devices = sim.Devices.Items;
            float perTank = sim.Defs.Water.TankCapacityLiters;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.WaterTank) continue;
                stored += d.StoredLiters;
                capacity += perTank;
            }

            // --- rooms (one pass) --- the standing breathable air.
            //
            // The NaN guard is NOT belt-and-braces: NaN loses every comparison silently, so an
            // unguarded room would slip PAST the pressure gate (`NaN < 50` is false ⇒ "pressurised")
            // and then poison the O2 sum, turning DaysOfAir into NaN — which serialises onto the wire
            // as a token no JSON parser accepts. `ShipSystems.Census` carries the identical guard and
            // states the identical reason; `ShipMetrics` carries NONE, which is finding L5 of this
            // package's audit.
            var rooms = sim.Rooms.Rooms;
            double o2 = 0;
            int pressurized = 0, nonFinite = 0;
            for (int i = 1; i < rooms.Count; i++)   // room 0 is the vacuum sink
            {
                var room = rooms[i];
                if (room == null || room.TileCount <= 0) continue;
                if (!double.IsFinite(room.PressureKPa) || !double.IsFinite(room.O2Moles))
                { nonFinite++; continue; }
                if (room.PressureKPa < PressurizedKPa) continue;
                pressurized++;
                o2 += room.O2Moles;
            }

            return new ShipLedgerSample(sim.TickCount, units, unknown, total, items.Count, living,
                                        stored, capacity, sim.WastewaterLiters, o2,
                                        pressurized, nonFinite);
        }

        // ---------------------------------------------------------------- the rates

        /// <summary>
        /// Combine two censuses into the player-facing report. <paramref name="then"/> is the EARLIER
        /// sample; an invalid or non-earlier <paramref name="then"/> yields a report with
        /// <see cref="ShipLedgerReport.WindowTicks"/> 0 and no rates, which is the honest answer for
        /// "I have not been watching long enough".
        /// </summary>
        public static ShipLedgerReport Report(in ShipLedgerSample now, in ShipLedgerSample then)
        {
            if (!now.Valid) return default;

            long window = then.Valid ? now.Tick - then.Tick : 0;
            if (window <= 0)
                return new ShipLedgerReport(now, 0, 0, 0, -1, -1);

            double days = window / (double)SimClockUtil.TicksPerDay;

            double partsPerDay = (now.UnitsOf(ItemKind.Parts) - then.UnitsOf(ItemKind.Parts)) / days;
            double matterPerDay = (now.TotalUnits - then.TotalUnits) / days;

            double daysOfWater = Runway(now.TankLiters, then.TankLiters, days);
            double daysOfAir = now.NonFiniteRooms > 0 || then.NonFiniteRooms > 0
                ? -1
                : Runway(now.BreathableO2Moles, then.BreathableO2Moles, days);

            return new ShipLedgerReport(now, window, partsPerDay, matterPerDay, daysOfWater, daysOfAir);
        }

        /// <summary>
        /// Days until <paramref name="stockNow"/> reaches zero at the net rate measured between the
        /// two readings, or -1 when it is not depleting, would outlast
        /// <see cref="MaxMeaningfulDays"/>, or is already at (or below) zero.
        ///
        /// <para>"Already zero" is -1 rather than 0 ON PURPOSE: 0 would read as "runs out today",
        /// a forecast, when what is true is that it ALREADY ran out and there is no runway left to
        /// forecast. The surface says EMPTY off the stock, not off this.</para>
        /// </summary>
        private static double Runway(double stockNow, double stockThen, double days)
        {
            if (!double.IsFinite(stockNow) || !double.IsFinite(stockThen)) return -1;
            if (stockNow <= 0) return -1;
            double lossPerDay = (stockThen - stockNow) / days;
            if (!(lossPerDay > 0)) return -1;                 // steady, rising, or NaN
            double runway = stockNow / lossPerDay;
            return runway > MaxMeaningfulDays ? -1 : runway;
        }

        // ---------------------------------------------------------------- derivations
        //
        // Plain-prose DERIVATION notes, the `ShipSystems.Derivation` pattern (IX-M22 / DA-M3): exactly
        // how a member is computed and what it CANNOT see. Host knowledge, shipped beside the number,
        // deterministic, never LLM text. Unknown id ⇒ "".

        /// <summary>Stable snake_case ids, in fixed presentation order — a host decision, not a
        /// client sort (same rule as <c>ShipSystems.Ids</c>).</summary>
        public static readonly string[] Ids = { IdMatter, IdPartsPerDay, IdDaysOfWater, IdDaysOfAir };

        public const string IdMatter = "matter";
        public const string IdPartsPerDay = "parts_per_day";
        public const string IdDaysOfWater = "days_of_water";
        public const string IdDaysOfAir = "days_of_air";

        /// <summary>The derivation note for a ledger member id, or "" for an unknown id.</summary>
        public static string Derivation(string id)
        {
            switch (id)
            {
                case IdMatter: return MatterDerivation;
                case IdPartsPerDay: return PartsPerDayDerivation;
                case IdDaysOfWater: return DaysOfWaterDerivation;
                case IdDaysOfAir: return DaysOfAirDerivation;
                default: return "";
            }
        }

        /// <summary>
        /// The charter's <b>MassLedger</b> (<c>ECONOMY-PLAN.md</c> §1, E0-8), RENAMED to "matter"
        /// throughout because nothing in this simulation has a mass: there is no kilogram anywhere in
        /// <c>SimDefs</c>, and a field called mass carrying stack units would itself be the lying
        /// metric this package was chartered to remove.
        /// </summary>
        public const string MatterDerivation =
            "MATTER is a census of every item stack aboard, in UNITS OF THAT KIND — carried, "
          + "reserved and lying on the deck alike. TOTAL is their unweighted sum. "
          + "LIMIT 1: UNITS ARE NOT KILOGRAMS AND NOT CURRENCY. This sim defines no mass and no "
          + "price, so one Potato and one ControllerModule count the same here; the per-kind "
          + "breakdown is what a later valuation weights. "
          + "LIMIT 2: IT COUNTS ITEMS, NOT THE SHIP. Matter bound into walls, floors and installed "
          + "devices is invisible to this census — it becomes countable only when a strip order "
          + "turns it back into stacks. A ship that deconstructs a bulkhead has not gained matter, "
          + "it has moved matter into the only place this ledger can see.";

        public const string PartsPerDayDerivation =
            "PARTS/DAY is the NET change in the Parts stock over the measured window, scaled to a "
          + "sim-day. Negative means the ship spent more Parts than it made, which is an ordinary "
          + "state: a MachineShop eats 2 Parts per ControllerModule and placing a device is charged "
          + "in Parts. "
          + "LIMIT: THIS IS NOT PRODUCTION. Gross output cannot be read anywhere in this sim — "
          + "nothing counts completed batches — and a lifetime counter would be saved state, which "
          + "is hashed state, which moves a determinism pin this report is forbidden to move. A busy "
          + "fabricator whose output is consumed as fast as it appears reads 0 here. "
          + "LIMIT 2: it is a WINDOW, so it lags. A window shorter than the measurement window shows "
          + "nothing at all rather than a number built from too little evidence.";

        public const string DaysOfWaterDerivation =
            "DAYS OF WATER is the litres standing in the tanks divided by the net rate at which that "
          + "total is falling, measured over the window. Greywater is reported beside it and "
          + "deliberately NOT added: it is not drinkable and reaches a tank only through a powered "
          + "reclaimer, so counting it would promise water the crew cannot drink. "
          + "LIMIT 1: THE LOOP HAS A FAUCET. water.def makeup_floor_liters tops the greywater pool "
          + "back up whenever it would fall below its floor (the B-2 fix), so the ship's water can "
          + "never be exhausted outright; what CAN happen, and what this number is for, is a tank "
          + "emptying faster than its reclaimer refills it — measured on the shipping slice, "
          + "tank_hydro reaches 0.02 L. "
          + "LIMIT 2: it is a NET rate, so a reclaimer that fails mid-window is averaged with the "
          + "healthy half of that window and the runway reads longer than it is.";

        public const string DaysOfAirDerivation =
            "DAYS OF AIR is the oxygen standing in the pressurised compartments divided by the net "
          + "rate at which it is falling. "
          + "⚠️ LIMIT 1, AND READ IT BEFORE QUOTING THE NUMBER: THIS SHIP HAS NO AIR RESERVE. A "
          + "powered, open vent injects gas FROM NOTHING (AtmosphereSystem's own class doc says so), "
          + "so there is no tank to run down and this is not a supply figure. What it actually "
          + "measures is whether the ship is LOSING air faster than its vents replace it — a breach "
          + "or a dead vent, not a shortage. On a healthy ship it reads NOT DEPLETING, and that is "
          + "the correct answer, not a broken gauge. "
          + "LIMIT 2: OXYGEN IS NOT WHAT KILLS THE CREW HERE. Measured, worst-room CO2 climbs to "
          + "~17,600 ppm over 3 days on the slice with every scrubber healthy, because scrubbers are "
          + "room-local (MECHANICS.md 13.1). CO2 has its own row on the MOSS ledger; this member "
          + "cannot see it. "
          + "LIMIT 3: it is a SHIP TOTAL. One compartment venting to space while the rest hold "
          + "pressure barely moves it — the same weakness a mean has, and the reason ShipSystems "
          + "bands life support off the WORST room instead.";
    }

    /// <summary>
    /// THE HOST-SIDE RATE WINDOW. Holds the two censuses <see cref="ShipLedger.Report"/> needs and
    /// rolls the baseline forward so the window stays bounded.
    ///
    /// <para><b>This class is deliberately NOT part of the simulation.</b> It is not an
    /// <see cref="ISimSystem"/>, is never registered in the <c>SystemStack</c>, holds no reference to
    /// a <see cref="Simulation"/>, is never saved and folds into no hash — the same arrangement
    /// <c>HistorySystem</c> uses to live on the host. Two hosts watching one sim keep independent
    /// windows and neither can perturb the other or the pins.</para>
    ///
    /// <para><b>Consequence, stated rather than hidden: a reload restarts the window.</b> The rates
    /// go back to "measuring" after a load, because the evidence for them was never in the save. The
    /// alternative — persisting the window — is saved state, is therefore hashed state, and moves a
    /// pin. This is the honest side of that trade and the surface must render it as "measuring", not
    /// as zero.</para>
    /// </summary>
    public sealed class ShipLedgerTracker
    {
        /// <summary>10 sim-minutes. Below this no rate is published at all: a tank level is a
        /// <see cref="float"/> around 500 L, and a delta taken over a few hundred ticks is float
        /// noise wearing a decimal point.</summary>
        public const long DefaultMinWindowTicks = Simulation.TicksPerSecond * 60L * 10L;

        /// <summary>1 sim-hour. How often the baseline rolls forward, which bounds the reported
        /// window to [roll, 2·roll) in steady state — long enough to be stable, short enough that a
        /// leak starting today is not averaged against yesterday.</summary>
        public const long DefaultRollWindowTicks = Simulation.TicksPerSecond * 60L * 60L;

        private readonly long _minWindow, _rollWindow;
        private ShipLedgerSample _baseline;   // the EARLIER sample the rates are measured against
        private ShipLedgerSample _pending;    // the next baseline, promoted once it is old enough

        public ShipLedgerTracker(long minWindowTicks = DefaultMinWindowTicks,
                                 long rollWindowTicks = DefaultRollWindowTicks)
        {
            if (minWindowTicks <= 0) throw new ArgumentOutOfRangeException(nameof(minWindowTicks));
            if (rollWindowTicks <= 0) throw new ArgumentOutOfRangeException(nameof(rollWindowTicks));
            _minWindow = minWindowTicks;
            _rollWindow = rollWindowTicks;
        }

        /// <summary>Ticks in the window the last <see cref="Observe"/> reported; 0 = still measuring.</summary>
        public long WindowTicks { get; private set; }

        /// <summary>
        /// Take a census and return the report. Call at whatever cadence the host renders (≤1 Hz is
        /// the house rule for every full-scan report); the window is measured in SIM ticks, so a
        /// paused ship simply stops widening it and a fast-forwarded one widens it quickly — which is
        /// what a sim-day rate should do.
        /// </summary>
        public ShipLedgerReport Observe(Simulation sim)
        {
            var now = ShipLedger.Sample(sim);

            // A rewound clock (a load into an older save, or a fresh sim on the same host) invalidates
            // both stored samples: a negative window would otherwise produce a rate with the sign
            // flipped, which is worse than no rate.
            if (_baseline.Valid && now.Tick < _baseline.Tick) { _baseline = default; _pending = default; }

            if (!_baseline.Valid) { _baseline = now; _pending = now; }
            else if (now.Tick - _pending.Tick >= _rollWindow) { _baseline = _pending; _pending = now; }

            long span = now.Tick - _baseline.Tick;
            var report = span >= _minWindow
                ? ShipLedger.Report(now, _baseline)
                : ShipLedger.Report(now, default);
            WindowTicks = report.WindowTicks;
            return report;
        }

        /// <summary>Forget both samples — the window restarts on the next <see cref="Observe"/>.</summary>
        public void Reset() { _baseline = default; _pending = default; WindowTicks = 0; }
    }
}
