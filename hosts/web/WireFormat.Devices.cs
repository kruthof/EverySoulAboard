using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Perilune.Sim;   // ItemKind + MaintenanceSystem.RepairSpend, for the `spend` element

namespace Perilune.Web
{
    /// <summary>
    /// THE <c>devices</c> CHANNEL — per-device WEAR STATE, read from <see cref="Perilune.Sim.Device"/>
    /// itself instead of from the projected glyph cell. A SIBLING PARTIAL of <see cref="WireFormat"/>,
    /// not an edit to it: <c>WireFormat</c> is a spine file (<c>CLAUDE.md</c>, integrator lane only)
    /// and it has been <c>partial</c> since the <c>zones</c> channel, so this file is a PURE ADDITION
    /// and <c>WireFormat.cs</c> has NO DIFF AT ALL. <c>SurfaceBoundaryTests.WireFormatFiles</c> globs
    /// <c>WireFormat*.cs</c> for exactly this.
    ///
    /// ⚠️ NAME COLLISION, CHECKED AND DELIBERATE. There is already a <c>device</c> (SINGULAR) message
    /// — a one-shot event reply that opens a MOSS terminal (<c>WireFormat.cs</c>'s header,
    /// <c>{"type":"device","kind":"terminal","tid":".."}</c>, dispatched by <c>main.js</c> as
    /// <c>case 'device'</c>). This channel is <c>devices</c> (PLURAL), it is a cached STATE channel,
    /// and the two never meet: <c>Emit</c> sends the singular, <c>Send</c> caches the plural, and the
    /// client's switch has one <c>case</c> for each. The plural was chosen over inventing a third word
    /// because <c>materials</c>/<c>zones</c>/<c>marks</c>/<c>items</c> are all plural nouns naming what
    /// the payload is a list of, and consistency across five channels beats avoiding a near-miss.
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// WHAT WAS WRONG, PRECISELY. A device's <see cref="Perilune.Sim.Device.Condition"/> — its wear
    /// state, 1 = pristine … 0 = wrecked — HAS NEVER REACHED THE CLIENT AT ALL.
    ///
    /// The only trace of it in the projection is a COLOUR: <c>GlyphMapper.DeviceColour</c> writes
    /// <c>GlyphColor.Broken</c> into the tile's FOREGROUND byte when
    /// <see cref="Perilune.Sim.Device.IsOperational"/> is false. That byte is <c>cell[1]</c>, and
    /// BOTH standard surfaces read only <c>cell[0]</c>, the glyph
    /// (<c>client/src/items/glyph-map.js</c>, <c>client/src/ui/room-model.js</c>'s <c>roomCells</c>).
    /// So the fact never arrives. And even if a surface did start reading <c>cell[1]</c> it would get
    /// ONE BIT — "inoperative or not" — which is:
    ///
    ///   1. NOT A GRADIENT. A machine at Condition 0.95 and one at 0.11 produce a byte-identical cell.
    ///      Wrecked art needs to know HOW worn, not merely whether the sim has given up on it.
    ///   2. OVERWRITTEN BY EVERYTHING. <c>GlyphMapper</c> pass 5 (a crew member on the tile) and the
    ///      strip re-apply on line 178 both rewrite that same fg byte afterwards, so the one bit is
    ///      not even reliably present. This is the <c>marks</c>/<c>items</c> lesson for the third time:
    ///      THE FIX IS A CHANNEL, NOT A BETTER READER.
    ///
    /// This channel therefore exists so that a later art package can pick a wrecked piece per device.
    /// IT DRAWS NOTHING ITSELF and it deliberately does not decide what "wrecked" looks like.
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    ///
    /// ⚠️ UTILITY OVERLAYS (Conduit, Pipe) ARE NOT ON THIS CHANNEL. Three independent reasons, all
    /// measured rather than assumed, and it is stated here because it is the one silent omission:
    ///
    ///   • THEY ARE NOT TILE-RESIDENT. <see cref="Perilune.Sim.Simulation.IsUtilityOverlay"/> keeps
    ///     them out of <c>_deviceGrid</c> and off <c>TileFlags.HasDevice</c>; <c>GlyphMapper</c> pass 4
    ///     skips them by name. Neither standard surface has ANY per-tile representation of a conduit,
    ///     so there is no piece of art whose selection this channel could inform.
    ///   • THEIR CONDITION CANNOT CHANGE. <c>content/core/SimDefs/machines.def</c> gives Conduit and
    ///     Pipe <c>wear = 0</c>, and <c>MachineWearSystem.Tick</c> opens with
    ///     <c>if (def.WearPerHour &lt;= 0f) continue;</c> — so they sit at Condition 1 forever on every
    ///     shipped ship. Pinned by <c>DevicesChannelTests.Utility_Overlays_Are_Wear_Free_In_The_Defs</c>,
    ///     which reads the DEFS rather than restating the number, so giving a conduit a wear rate
    ///     fails a test that names this paragraph instead of silently hiding a gradient.
    ///   • THEY ARE 88 % OF THE DEVICE STORE. Measured on <c>--ship grid</c>: 1 250 devices, of which
    ///     1 104 are Conduit (1 088) or Pipe (16). The counterfactual was MEASURED, not estimated —
    ///     with them the channel is <b>1 110 rows / 19 066 B / ~146 µs</b> instead of
    ///     <b>146 rows / 2 562 B / ~26 µs</b>: 7.6× the rows, 7.4× the bytes, 5.6× the time, and ~34 %
    ///     of a render instead of ~6 %, to carry a byte the defs make a constant. Method and the rest
    ///     of the cost story are in <c>GameSession.BuildDevices</c>.
    ///
    /// ⚠️ FURNITURE IS ON THE CHANNEL, and that is NOT the same call. Beds, tables, chairs, lockers,
    /// desks, plant pots and ladders are also <c>wear = 0</c> — but they ARE tile-resident, they ARE
    /// drawn by both surfaces, and the owner's damaged-boot ship can author any Condition it likes on
    /// them at generation time. "Cannot wear" is not "cannot be damaged"; only the first two bullets
    /// together justify an omission, and furniture fails the first.
    ///
    /// FOG-GATED, mirroring <c>GlyphMapper</c> pass 4 (whose gate is pass 1's, and is FIRST). A device
    /// on a tile with no <see cref="Perilune.Sim.TileFlags.Explored"/> emits nothing — the same line
    /// <c>marks</c> and <c>items</c> drew: a rendering fix must not become a fog-of-war change.
    ///
    /// ✅ DISCHARGED (W0b, 2026-07-28) — the paragraph below is kept VERBATIM because it is the
    /// contract that was honoured, not a stale note. The art that draws this channel
    /// (<c>client/src/items/wear.js</c>) and the DIRTY-VERSION GATE
    /// (<c>GameSession.SendDevices</c>) landed in the same package, as required. What the gate does:
    /// the cell list is compared element-wise against the last EMITTED one and the SERIALIZATION is
    /// skipped when nothing moved — so the ~2/3 of the cost measured in serialization goes away in
    /// the steady state, while the BUILD stays (there is no sim-side version counter on
    /// <c>Device.Condition</c>, and adding one is a sim change for a rendering concern). The wire
    /// FORMAT is unchanged: this is the dirty-version half of the sketch below, not the
    /// partial-row half, and it therefore needs no client merge state and no new resync contract.
    /// The saving is stated as MEASURED in the package report; a count of skipped bytes is not a
    /// speed-up.
    ///
    /// ⚠️ TWO CLAIMS IN THE BOX BELOW ARE NOW FALSE AND ARE RETRACTED HERE RATHER THAN EDITED OUT.
    /// <b>(1) "for no consumer" / "just as consumerless".</b> Both surfaces draw this channel now
    /// (<c>client/src/items/wear.js</c>), so the ~26 µs host cost and the ~2.62 µs client cost buy a
    /// picture the player can see. <b>(2) "At boot all 146 grid rows read cond = 255".</b> True of
    /// <c>--ship grid</c> and NOT of the ship the game opens on: <c>--ship wreck</c> boots with 41 of
    /// its 72 tile-resident devices below the wreck floor, which is the whole point of it.
    /// <b>WHAT IS NOT DONE, stated so it is not mistaken for done:</b> the CLIENT half is NOT
    /// memoised. <c>decodeDevices</c> + <c>roomDeviceConditions</c> still run once per Room Zoom
    /// repaint and once per Overview paint. That was worth doing while the cost bought nothing; now
    /// that it buys the art it is an ordinary optimisation with no merge condition attached, and it
    /// is deliberately left alone rather than bundled in.
    ///
    /// ⛔ A CONDITION ON THE NEXT LANE, NOT AN OPTION — THE DELTA SCHEME LANDS *WITH* THE ART.
    /// This channel is rebuilt AND RE-SERIALIZED on every render, ten times a second, whether or not
    /// a single byte moved. <c>GameSession.Send</c> dedupes by whole-payload string equality, so it
    /// saves the SOCKET and never the CPU — and two-thirds of that CPU is the serialization rather
    /// than the build: independent review measured the builder at <b>~10.7 µs of a ~29.4 µs total</b>
    /// on <c>--ship grid</c>. At boot all 146 grid rows read <c>cond = 255, oper = 1</c>, so TODAY the
    /// channel spends ~6 % of every render regenerating <b>2 562 bytes of constant for no consumer</b>.
    /// The client is charged too, smaller but just as consumerless: <c>decodeDevices</c> +
    /// <c>roomDeviceConditions</c> cost <b>~2.62 µs per Room Zoom repaint</b> at 146 rows (median
    /// n = 5, independent review).
    ///
    /// Shipping it whole was the right call for THIS lane — a delta contract with no consumer is a
    /// wire format nobody can check, and the job here was to make <see cref="Perilune.Sim.Device.Condition"/>
    /// reachable at all. THE TRADE EXPIRES THE MOMENT THE DATA IS DRAWN. So it is written here as a
    /// condition rather than as an option: <b>the delta / dirty-version scheme MUST land in the SAME
    /// package as the art that first draws this channel — not in a follow-up after it.</b> A drawn
    /// channel is a channel with a reason to be correct, which is exactly when the contract can be
    /// pinned; a follow-up is how a 6 % render cost becomes permanent.
    ///
    /// Sketch, so the next lane does not re-derive it: keep the previous build's
    /// <c>(cond, oper)</c> pair per device, emit only rows whose pair moved, and emit EVERYTHING on a
    /// forced render — which is what <c>Snapshot</c> and a reconnect already are, so the resync path
    /// exists and needs no invention. A coarser quantisation (a 4-bit bucket) is the cheaper
    /// half-measure and is NOT a substitute: it halves the payload and leaves the per-render rebuild
    /// exactly where it is.
    ///
    /// VIEW-ONLY, PROJECTION-PURE, PIN-NEUTRAL. Every value is READ from state that is already saved
    /// and hashed (the DEVC chapter's kind/pos/condition, the TILE chapter's Explored flag). Nothing
    /// here mutates, allocates into the sim, mints a <see cref="Perilune.Glyph.GlyphColor"/> id
    /// (<c>GlyphColor</c> is a spine file and is untouched) or folds into any determinism hash.
    ///
    /// ⚠️ A SEVENTH ELEMENT LANDED WITH THE OPERATE VERB (2026-07-28), and the paragraph below that
    /// listed <c>IsOpen</c> among the deliberate omissions is CORRECTED IN PLACE rather than deleted:
    /// the omission was right on the day it was written ("adding it for no consumer is not" one
    /// trailing element) and it stopped being right the moment a surface could open a door or a vent.
    /// See <see cref="DeviceCell.Open"/> for why it is the one omitted field that qualified and
    /// <c>Powered</c> still does not.
    ///
    /// ⭐ A NINTH ELEMENT LANDED WITH D4 (2026-08-02) — <see cref="DeviceCell.Air"/>, whether a worker
    /// could be staged at this machine WITHOUT the player's order waiving the air rule. It passes the
    /// same two tests <c>Open</c> had to pass and the omission list still applies to everything else:
    /// it has a CONSUMER (the Room Zoom's PRIORITISE offer, which promised a repair with no word about
    /// the vacuum the pawn would be ordered into) and it is NOT VOLATILE (a compartment crosses the
    /// breathability line when it is vented, sealed or repressurised — a player-or-MOSS event, not a
    /// per-tick one, unlike <c>Powered</c>, which <c>PowerSystem.Balance</c> re-stamps every second).
    ///
    /// ⚠️ AND IT ANSWERS THE OBJECTION M3-13 FILED AGAINST ITSELF — *"a second per-KIND bit should get
    /// its own channel"*. That note is about <c>Serv</c>, which is a per-KIND CONSTANT delivered
    /// per-row and therefore genuinely redundant N times over. <c>Air</c> is the opposite: it is LIVE
    /// PER-DEVICE STATE that differs between two machines of the same kind three tiles apart and moves
    /// while the player watches. Per-device state is precisely what this channel carries.
    ///
    /// ⭐⭐ A TENTH ELEMENT LANDED WITH "THE ORDER NAMES ITS PRICE" (2026-08-02) —
    /// <see cref="DeviceCell.Spend"/>, WHICH CONSUMABLE A SERVICE AT THIS MACHINE WOULD EAT. It takes
    /// the same two tests <c>Open</c> and <c>Air</c> had to take.
    ///
    /// ⭐ THE CONSUMER: the Room Zoom's PRIORITISE offer again. The shipped wreck boots with exactly
    /// ONE <c>Parts</c> unit aboard and the player's first repair order eats it with nothing said
    /// anywhere (T13 finding, 2026-08-02) — the ship's last Part disappears into a machine and the
    /// commissioning chain that needed it is now unreachable. <i>Invisible feedback is FUNCTIONAL.</i>
    ///
    /// ⭐ NOT VOLATILE, AND THE ARGUMENT IS SPECIFIC RATHER THAN A SHRUG — <c>Powered</c> was refused
    /// BY NAME for being re-stamped by <c>PowerSystem.Balance</c> once a second on every drawing
    /// device, so a new element has to say what re-stamps IT. Nothing does. The value is
    /// <c>MaintenanceSystem.WhatARepairWouldSpend</c>, and it can only move when
    /// (a) THE SHIP'S TOP AVAILABLE RUNG CHANGES — the last free <c>Parts</c> unit is picked up,
    /// consumed or crafted, i.e. a DISCRETE item event a few times a sim-hour at most — or
    /// (b) A DEVICE CROSSES <c>wear.wreck_threshold</c> (0.25), which at the fastest shipped wear rate
    /// of 0.020/operating hour is one crossing per machine per RUN, and which changes the answer only
    /// on a ship whose best rung is <c>Swarf</c>. There is no per-tick writer in either path.
    ///
    /// ⭐ MEASURED AT BOOT ON ALL THREE SHIPPED SHIPS WITH THE FOG FULLY REVEALED, rather than argued:
    /// <c>--ship wreck</c> emits
    /// <b>73 rows, every one of them <c>5</c> (<c>Parts</c>)</b> — 11 loose consumable units aboard
    /// and 41 tile-resident devices below the wreck floor, and the two precomputed answers AGREE
    /// because the top rung is Parts.
    /// <c>--ship grid</c> emits 146 rows and <c>--ship slice</c> 111, every one of them
    /// <c>-2</c> (neither holds a consumable and nothing is below the floor). All three payloads were
    /// byte-identical across two successive renders. Contrast <c>Powered</c>, which differs on most
    /// renders on a ship where nothing at all is happening. Cost: the element appends 2 bytes per row
    /// for a one-digit kind and 3 for a sentinel (wreck 1 813 B, grid 3 876 B, slice 2 995 B).
    ///
    /// ⚠️ SAID PLAINLY BECAUSE IT IS THE MOST FREQUENT FLIP AND IT IS NOT A TICK: <c>FindNearest</c>
    /// skips a stack with <c>CarriedBy != 0</c>, so while a servicer WALKS with the ship's only Parts
    /// stack every row reads the next rung down, and it returns when she sets the remainder down or
    /// consumes it. That is TWO transitions per service on a ship holding one stack of the top rung —
    /// bounded by pickups, not by frames — and it is the same carried-stack blackout
    /// <c>MaintenanceSystem.HasAutonomouslySpendableStock</c> already files against itself. It is also
    /// the honest answer rather than a defect: while she is carrying them, a SECOND order really would
    /// be paid for out of the next rung.
    ///
    /// ⚠️ AND IT IS A HINT, NOT A PROMISE, exactly as <c>GameSession.HandleCommission</c>'s status line
    /// is: <i>"written from what is affordable RIGHT NOW rather than from the command's outcome …
    /// It is a hint, not a result."</i> A repair order is 9 000 ticks of fetch-and-service and the
    /// funnel re-runs at the fetch, so stock can move underneath the number the player read. NOTHING
    /// IS RESERVED — <c>MaintenanceSystem</c>'s class header refuses reservations deliberately.
    ///
    ///   devices {"type":"devices","cells":[[x,y,deck,kind,cond,oper,open,serv,air,spend,face],..]}
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo DeviceIc = CultureInfo.InvariantCulture;

        /// <summary>⛔ <b>THE <c>spend</c> ELEMENT'S "NOTHING TO SAY" SENTINEL.</b> An older host's
        /// row has no tenth element and decodes to this; so does a machine the sim would refuse a
        /// service to outright (<c>MaintenanceSystem.RepairSpend.NoService</c> — below
        /// <c>wear.wreck_threshold</c> with nothing aboard, i.e. <c>IsUnfixableWreck</c>). Both mean
        /// the surface says NOTHING about a price, which is the only honest answer in either case:
        /// D4's own send-back lesson was <i>override-never-source</i> — an absent field must not
        /// become a fabricated value. A NAMED CONSTANT and not a bare <c>-1</c>, on
        /// <see cref="DetailNone"/>'s precedent.</summary>
        public const int SpendUnknown = -1;

        /// <summary>⛔ <b>THE <c>spend</c> ELEMENT'S "THIS SERVICE IS FREE" VALUE</b> —
        /// <c>MaintenanceSystem.RepairSpend.Nothing</c>, the empty-handed jury-rig. DISTINCT FROM
        /// <see cref="SpendUnknown"/> and that is the whole reason there are two sentinels rather than
        /// one: "the ship pays nothing for this repair" is a fact worth telling the player, and
        /// "this client does not know" is a silence. Collapsing them would turn every unknown into a
        /// cheerful and false <i>SPENDS NOTHING</i>.
        ///
        /// <para>NEGATIVE, so the whole non-negative range stays the raw <see cref="Perilune.Sim.ItemKind"/>
        /// byte — the same shape <see cref="BlockedCell.Detail"/> already uses on the <c>blocked</c>
        /// channel, where an item kind and a sentinel share one integer column.</para></summary>
        public const int SpendNothing = -2;

        /// <summary>The wire value for one <c>MaintenanceSystem.WhatARepairWouldSpend</c> answer.
        /// TOTAL over the enum: an unrecognised member falls to <see cref="SpendUnknown"/> (say
        /// nothing) rather than to a kind, because the failure mode of a wrong price is a player who
        /// spends the ship's last Part believing it was free.</summary>
        public static int RepairSpendWire(MaintenanceSystem.RepairSpend outcome, ItemKind kind)
        {
            if (outcome == MaintenanceSystem.RepairSpend.Consumable) return (int)kind;
            if (outcome == MaintenanceSystem.RepairSpend.Nothing) return SpendNothing;
            return SpendUnknown;
        }

        /// <summary>
        /// One tile-resident device on the <c>devices</c> channel. Tuple
        /// <c>[x, y, deck, kind, cond, oper]</c>, append-only (a future field is a trailing element,
        /// exactly as <see cref="ZoneTile"/>, <see cref="MarkCell"/> and <see cref="ItemCell"/>
        /// document).
        ///
        /// <para>THE TUPLE LEADS WITH <c>x, y, deck</c> because every other sparse channel does —
        /// <c>materials</c>, <c>zones</c>, <c>marks</c>, <c>items</c>, all four checked in source. One
        /// decoder shape across five channels is worth more than any per-payload preference.</para>
        ///
        /// <para><see cref="Kind"/> is the raw <see cref="Perilune.Sim.DeviceKind"/> byte — the sim's
        /// own enum, NOT a re-declared wire vocabulary the way <see cref="MarkDebris"/> and friends are
        /// (those name a set the <c>marks</c> channel invented; this one already exists).</para>
        ///
        /// <para>IT IS CARRIED RATHER THAN LEFT TO THE FRAME'S GLYPH, and the reason is measured in
        /// <c>GlyphMapper</c> rather than assumed. <c>Glyphs.ForDevice</c> is injective over the 26
        /// TILE-RESIDENT kinds and NOT over all 28 — Conduit and Pipe deliberately share <c>'~'</c>,
        /// which is a documented collision in <c>Glyphs.cs</c> and is one more reason those two do not
        /// belong here. So "the glyph identifies the kind" is very nearly true for the rows this
        /// channel carries (pinned by
        /// <c>DevicesChannelTests.The_Device_Glyph_Is_Injective_Only_Over_The_Tile_Resident_Kinds</c>,
        /// which measures both halves off <c>Glyphs.ForDevice</c> itself) — but only very nearly, and
        /// it fails in the two places that matter. (1) PASS 5 ERASES IT: a living
        /// crew member writes <c>Glyphs.Citizen</c> over the whole cell unconditionally, after pass 4,
        /// so a device with someone standing on it has NO device glyph on the frame at all. That is
        /// loss 3 of the <c>items</c> channel with the roles swapped, and crew stand on machines
        /// constantly — maintenance is a job that puts a person on the device's own tile. (2) DOOR IS
        /// NOT ONE GLYPH: <c>GlyphMapper.DeviceGlyph</c> intercepts <c>DeviceKind.Door</c> and returns
        /// <c>'+'</c>, <c>'/'</c> or <c>'X'</c> from state, so the inverse of <c>ForDevice</c> is not
        /// the inverse of what the projection writes. A channel whose rows can only be READ by
        /// cross-referencing the lossy projection would reproduce the exact defect it exists to
        /// remove.</para>
        ///
        /// <para>⚠️ THE CLIENT HAS NO NUMERIC MIRROR OF <c>DeviceKind</c> TODAY, and this lane
        /// deliberately does not add one. What exists is a mirror BY NAME — <c>room-model.js</c>'s
        /// palette carries <c>deviceKind: 'Bed' | 'Desk' | …</c> strings for <c>Cmd.place</c> — and a
        /// glyph→art table in <c>client/src/items/glyph-map.js</c>, a directory a PARALLEL LANE OWNS.
        /// The consumer that needs kind→art is the wrecked-sprite join, which is a later package; it
        /// should derive its table from <c>ITEMS</c> the way <c>glyph-map.js</c> does rather than hand-
        /// writing a third mirror. The byte is on the wire and waiting; nothing here interprets it.</para>
        ///
        /// <para><see cref="Cond"/> is <see cref="Perilune.Sim.Device.Condition"/> QUANTISED TO A BYTE:
        /// <c>0 = wrecked … 255 = pristine</c>, <c>round(clamp(Condition,0,1) × 255)</c>. A byte and not
        /// the float for three reasons: the payload is one to three ASCII digits instead of up to
        /// eleven (<c>0.30000001192092896</c> is what <c>float.ToString("R")</c> can produce, and this
        /// channel is the largest sparse one on the wire); art selection wants BUCKETS, and 256 of them
        /// is two orders of magnitude finer than any plausible damage ramp; and an integer cannot pick
        /// up a locale decimal separator on a de-DE machine, which is a live class of bug here. The
        /// clamp is not defensive theatre — <c>Device.Condition</c> is a public mutable float and
        /// <c>DeconstructSystem</c> clamps it for the same reason.</para>
        ///
        /// <para><see cref="Oper"/> is <c>1</c> when <see cref="Perilune.Sim.Device.IsOperational"/>,
        /// else <c>0</c>. IT IS NOT REDUNDANT WITH <see cref="Cond"/> AND THE CLIENT CANNOT DERIVE IT.
        /// The failure threshold is PER KIND and lives in <c>machines.def</c>. COUNTED off the shipped
        /// table, not estimated — and RE-COUNTED off it, never adjusted by arithmetic, after the
        /// wreck start appended <c>CryoPod</c>, and RE-COUNTED AGAIN after M3-10 appended
        /// <c>Heater</c>: the 27 tile-resident kinds carry FOUR distinct
        /// thresholds — <c>0</c>
        /// (9 kinds: Ladder and every furniture piece, which can therefore never be inoperative at
        /// all), <c>0.02</c> (3: Terminal, Light, WaterTank), <c>0.05</c> (2: Door, Battery) and
        /// <c>0.10</c> (13: the machines, <c>CryoPod</c> and <c>Heater</c> among them). A client
        /// comparing <c>cond</c> to ONE threshold of its own
        /// would be a SECOND AUTHORITY on "is this machine dead?", and the best it could do is pick
        /// 0.10 and be wrong for the other 14 of 27. (⚠️ 14 was ALSO the answer at 25 and at 26
        /// kinds, and that is a COINCIDENCE THREE TIMES OVER rather than a licence to leave the
        /// sentence alone: each of CryoPod and Heater grew the population and the largest group by
        /// one, so the difference cancelled twice. This repo has already shipped one stale census
        /// that survived precisely because it was written as a difference.) That is the duplicate-authority defect this repo
        /// has already paid for in the glyph→item tables and the mark layer. One element, computed
        /// where the defs are. The census is pinned by
        /// <c>DevicesChannelTests.The_Failure_Threshold_Really_Is_Per_Kind</c>, so this paragraph
        /// cannot quietly rot into a stale count.
        ///
        /// <para><see cref="Open"/> is <see cref="Perilune.Sim.Device.IsOpen"/> as <c>1</c>/<c>0</c>.
        /// IT IS THE ONE FIELD PROMOTED OUT OF THE OMISSION LIST BELOW, and the two tests it has to
        /// pass are the ones that list states: it needs a CONSUMER and it must not be VOLATILE.
        ///
        /// <para>THE CONSUMER: the Room Zoom's OPERATE affordance. A door/vent toggle has to say which
        /// way it will move BEFORE the player clicks — "OPEN" and "SHUT" are different orders, not two
        /// spellings of one — and there was no other route. The door glyph carries the state
        /// (<c>'+'</c>/<c>'/'</c>/<c>'X'</c>) but <c>GlyphMapper</c> pass 5 erases the whole cell under
        /// a crew member, and reading it at all would be a predicate over a glyph, which
        /// <c>GLYPH_SUBSTITUTE</c> defeats (the sixth trap shape). A VENT'S state is not in the
        /// projection in ANY form: <c>Glyphs.ForDevice</c> returns <c>'^'</c> open or shut, so a client
        /// reading the frame cannot tell a sealed compartment from a filling one.</para>
        ///
        /// <para>NOT VOLATILE: <c>IsOpen</c> is written by <c>SetDoorStateCommand</c> /
        /// <c>SetDeviceStateCommand</c> — player and MOSS intent, never a per-tick system. (It also
        /// named <c>AddRoomCommand</c>, which force-opened every bordering door; W4b deleted that
        /// loop and M1-L-b deleted the command, so this list is now exhaustive rather than merely
        /// current.) On <c>--ship wreck</c> at boot it is a constant. That is exactly the test
        /// <c>Powered</c>, <c>Progress</c> and <c>StoredLiters</c> fail, and they are still omitted for
        /// it: <c>PowerSystem.Balance</c> stamps <c>Powered</c> on EVERY drawing device once a second,
        /// so carrying it would make this payload differ on most renders even on a ship where nothing
        /// is happening. The OPERATE verb's power feedback therefore rides its own one-shot reply
        /// (<c>WireFormat.Operate.cs</c>), computed at the moment of the click, and not this channel.</para>
        ///
        /// <para>WHAT IS DELIBERATELY LEFT OUT, so a later lane knows it was a decision:
        /// <c>Powered</c>, <c>IsLocked</c>, <c>Progress</c>, <c>StoredKWh</c>,
        /// <c>StoredLiters</c>, <c>Rate</c>, <c>NetworkId</c>, <c>Scriptable</c> and <c>Name</c>. Every
        /// one of them is a DIFFERENT FEATURE (a power overlay, a door animation, a fill gauge, the
        /// MOSS directory — which already has its own <c>terminals</c> channel), none is needed to pick
        /// a wrecked sprite, and the volatile ones would be actively harmful here: <c>Powered</c>,
        /// <c>Progress</c> and <c>StoredLiters</c> change on most ticks, so carrying them would make
        /// this payload differ on EVERY render even on a ship where nothing is wearing at all.
        /// <c>Condition</c> moves at ≤0.02 per operating hour, so one device's byte is stable across
        /// roughly 7 200 ticks. (⚠️ That is a PER-DEVICE figure and it does NOT mean the channel is
        /// normally deduped away — <c>Send</c> compares the WHOLE payload, grid runs tens of wearing
        /// machines out of phase, and one row is enough. The honest version of the dedupe story is in
        /// <c>GameSession.BuildDevices</c>.) Adding a field is one trailing element; adding it for no
        /// consumer is not.</para>
        /// </summary>
        public readonly struct DeviceCell
        {
            public readonly int X, Y, Deck, Kind, Cond, Oper, Open, Serv, Air, Spend, Face;

            /// <param name="serv">⭐ <b>M3-13 — 1 when this KIND of machine can ever be serviced at
            /// all, 0 when it never can.</b> <c>MaintenanceSystem.IsEverServiceable</c>, i.e. the
            /// def's own <c>maint</c> opt-out (<c>CryoPod</c> is <c>0.00</c>, deliberately —
            /// <c>MECHANICS.md</c> §13.22c). It is here so the Room Zoom's right-click menu can
            /// stop offering <i>PRIORITISE: REPAIR</i> on a machine the sim will never take an
            /// order for (<c>rimworld-reference.md</c> §2.2). <b>A PER-KIND FACT DELIVERED
            /// PER-ROW</b>, and that is a deliberate trade: the alternative shapes were a new
            /// channel (more plumbing than the fact is worth) or a client-side list of
            /// never-serviceable kinds — which is a hand mirror of a DEF and drifts the day content
            /// moves, the exact second-authority defect <c>ROLE_TO_ITEM</c> was deleted for. The
            /// cost is one small int per row on a channel that is already dirty-gated.</param>
            /// <param name="air">⭐ <b>D4 — 1 when a worker could be staged at this machine WITHOUT
            /// the player's order waiving the air rule; 0 when the ONLY way to put someone here is
            /// that waiver.</b> Computed by asking <c>MaintenanceSystem.TryFindStagingTile</c> — the
            /// sim's own staging search, the one <c>RecruitForNeediest</c> and <c>DriveWorker</c> both
            /// use — with <c>forced</c> false and then true, which is M3-14 rung 3's pattern (the same
            /// rule asked in one more place) rather than a host-side re-derivation of breathability.
            /// <b>Approach is deliberately NOT folded in:</b> a walled-in machine answers 1, because
            /// "nowhere to stand" is a different refusal with different words and this bit must not
            /// blame the air for the geometry. It exists so the Room Zoom's PRIORITISE offer can say
            /// what the order will cost before the player gives it — the M3 demo's finding D4, where a
            /// direct repair order into a still-depressurising hall was accepted, unannotated, and
            /// killed the pawn.</param>
            /// <param name="spend">⭐⭐ <b>WHICH CONSUMABLE A SERVICE AT THIS MACHINE WOULD EAT, RIGHT
            /// NOW.</b> A raw <see cref="Perilune.Sim.ItemKind"/> byte, or <see cref="SpendNothing"/>
            /// (the free empty-handed jury-rig), or <see cref="SpendUnknown"/> (no service to price —
            /// the sim would refuse it). Computed by asking
            /// <c>MaintenanceSystem.WhatARepairWouldSpend</c> with <c>forced: true</c>, because the
            /// offer prices an ORDER and an order may spend D3's autonomous reserve.
            ///
            /// <para><b>IT IS THE DISPATCHER'S OWN FUNNEL AND NOT <c>WantedRepairConsumable</c>.</b>
            /// That property is <c>RepairConsumableTier(0)</c> UNCONDITIONALLY — correct for the
            /// <c>blocked</c> badge it serves, which is raised only when the ship holds none of the
            /// three rungs, and a confident lie here: on a Seals-only ship it says PARTS while the
            /// service eats Seals.</para>
            ///
            /// <para><b>PER-DEVICE, BUT WITH ONLY TWO POSSIBLE VALUES PER RENDER.</b> The answer is a
            /// fact about the SHIP'S STOCK except for one device input — whether this machine is below
            /// <c>wear.wreck_threshold</c>, which is the Swarf rung's precondition. So
            /// <c>GameSession.BuildDevices</c> computes both answers ONCE per render and selects per
            /// row; a per-row call would be three item-store scans × every row × 10 Hz, a cost
            /// <c>FindNearestConsumable</c>'s own comment files as owed.</para>
            ///
            /// <para>⚠️ <b>IT ANSWERS A COUNTERFACTUAL, NOT "WILL THIS ORDER BE ACCEPTED".</b> The row
            /// carries a price for a pristine machine and for a <c>serv = 0</c> capsule too, on the
            /// same rule <c>open</c> is read for every kind under: <i>the channel carries facts about
            /// devices, not answers to one surface's question.</i> Whether there is an order to give
            /// is <c>serv</c>'s job and the offer asks it FIRST.</para></param>
/// <param name="face">⭐⭐ <b>WHICH WAY THE THING IS TURNED — 0..3, one quarter-turn each.</b>
            /// <c>Device.Facing</c> verbatim; the owner asked for it while building (2026-08-05).
            /// <para>⛔ <b>IT IS DRAWING-ONLY AND THE ROW IS THE ONLY PLACE IT GOES.</b> Nothing in
            /// <c>sim/</c> reads the field, so this element carries no mechanic — it is how the two
            /// SVG surfaces learn to turn the picture, and nothing more. Appended LAST, so a client
            /// that has not learnt it reads a ten-element row exactly as before; the absent value
            /// must reproduce the pre-element behaviour, which for a facing is 0 (see
            /// <c>messages.js</c>'s own house rule).</para>
            /// <para>⚠️ <b>A FITTING IS SKINNED BY GLYPH, NOT BY THIS ROW</b> — <c>roomCells</c> reads
            /// the frame's ASCII byte and <c>furnitureSvg</c> draws from that, so the client JOINS the
            /// facing on <c>(x,y)</c> exactly as it already joins <c>cond</c>. That join is why the
            /// element lives on THIS channel rather than in the frame: the frame's cell is one glyph
            /// byte plus a mark byte and has no room for a device attribute.</para></param>
            public DeviceCell(int x, int y, int deck, int kind, int cond, int oper, int open, int serv, int air, int spend, int face)
            { X = x; Y = y; Deck = deck; Kind = kind; Cond = cond; Oper = oper; Open = open; Serv = serv; Air = air; Spend = spend; Face = face; }

            /// <summary>ALL ELEVEN FIELDS, explicitly. Used by <c>GameSession.SendDevices</c>'s
            /// dirty-version gate, whose sufficiency argument is that the compared value IS the
            /// serializer's whole input — so it must compare everything the serializer reads, and a
            /// field added to this tuple must be added here IN THE SAME COMMIT or the gate silently
            /// starts skipping renders in which that field moved.
            ///
            /// <para>NOT <c>Equals</c>/<c>IEquatable</c> and NOT <c>==</c>: a struct with no override
            /// falls back to <c>ValueType.Equals</c>, which reflects and boxes, and the gate would
            /// then cost more per render than the serialization it avoids. A named method also makes
            /// the call site say what it is doing.</para></summary>
            /// <para>⚠️ <c>Open</c> was added AT THE MERGE of the OPERATE verb (which added the
            /// seventh element) with the delta gate (which added this method): the two lanes touched
            /// this struct from opposite sides and git reported no conflict on the field list itself.
            /// Without this clause a door/vent toggle moves ONLY <c>Open</c>, the gate skips, and the
            /// OPEN⇄SHUT chip silently stops updating — which is the most reachable cell in the
            /// matrix, because a toggle is player-driven and <c>AddDevice</c> appends, so a door the
            /// player just built IS the last row.</para></summary>
            /// <para>⭐ <c>Serv</c> was added by M3-13 IN THIS SAME COMMIT, which is the whole
            /// discipline the paragraph above records. It is per-KIND and therefore constant for
            /// the life of a session, so omitting it here could not be caught by any live
            /// behaviour — which makes it the most dangerous kind of omission, not the most
            /// harmless: the gate's own sufficiency argument is <i>"the compared value IS the
            /// serializer's whole input"</i>, and an argument that is true by accident stops being
            /// true the day a def is hot-reloaded.</para>
            /// <para>⭐ <c>Air</c> was added by D4 IN THIS SAME COMMIT, and here the omission would be
            /// LIVE rather than latent: <c>Air</c> is the only element on this tuple that can move
            /// while nothing else about the device does. Vent the compartment a pristine, closed,
            /// serviceable machine stands in and <c>Cond</c>, <c>Oper</c>, <c>Open</c> and <c>Serv</c>
            /// are all byte-identical — so a <c>SameAs</c> that did not compare it would skip the
            /// render, and the PRIORITISE menu would go on offering a repair with no hazard clause for
            /// as long as nothing else aboard happened to wear out. That is the <c>Open</c>
            /// paragraph's failure re-run on a state the player can trigger from the MOSS console.</para>
            /// <para>⭐⭐ <c>Spend</c> was added by "the order names its price" IN THIS SAME COMMIT, and
            /// its omission would be LIVE like <c>Air</c>'s rather than latent like <c>Serv</c>'s — with
            /// the twist that the moving row is usually SOMEBODY ELSE'S. The value is ship-global: the
            /// moment a servicer lifts the last free <c>Parts</c> stack, EVERY row's <c>Spend</c> drops a
            /// rung while that device's own <c>Cond</c>, <c>Oper</c>, <c>Open</c>, <c>Serv</c> and
            /// <c>Air</c> hold still — so a <c>SameAs</c> that skipped it would leave the offer promising
            /// <i>SPENDS 1 PARTS</i> over a ship that has none, which is worse than the silence the
            /// package exists to end.</para>
            public bool SameAs(in DeviceCell o) =>
                X == o.X && Y == o.Y && Deck == o.Deck && Kind == o.Kind && Cond == o.Cond && Oper == o.Oper
                && Open == o.Open && Serv == o.Serv && Air == o.Air && Spend == o.Spend && Face == o.Face;
        }

        /// <summary>The wire byte for a raw <see cref="Perilune.Sim.Device.Condition"/>:
        /// <c>0 = wrecked … 255 = pristine</c>. Clamped first (the field is a public mutable float),
        /// then rounded HALF-UP with integer arithmetic rather than <c>MathF.Round</c>, whose default
        /// is banker's rounding — 0.1 must land on 26, not 25, and "the number moved by one because a
        /// midpoint tied" is not a thing anyone should have to debug through a sprite.
        ///
        /// ⚠️ A CLAIM THIS METHOD USED TO MAKE IS RETRACTED, and the retraction is here rather than
        /// deleted. The low clamp was commented *"also catches NaN, which would otherwise pass
        /// <c>&lt; 0</c>"*, and the test asserting it said <c>!(x &gt; 0)</c> was WHY NaN maps to 0.
        /// It is not. NaN does fall through <c>&lt; 0</c> — and lands on 0 anyway, because .NET's
        /// float→int conversion is saturating (NaN ⇒ 0). <b>NO INPUT DISTINGUISHES THE TWO
        /// SPELLINGS</b>, so <c>condition &lt; 0f</c> is a NO-OP MUTATION and its survival is not a
        /// hole in a guard. Pinned as an equivalence, not as folklore, by
        /// <c>DevicesChannelTests.ConditionByte_Maps_Zero_To_Zero_And_Pristine_To_255</c>. What this
        /// line DOES decide is the negative clamp: delete it and <c>ConditionByte(-1f)</c> returns
        /// −254, which is the mutation that reddens.</summary>
        public static int ConditionByte(float condition)
        {
            // THE LOW CLAMP. `!(condition > 0f)` over `condition < 0f` is a READABILITY choice and not
            // a behavioural one — see the retraction above; both spellings agree on every input,
            // NaN included. Deleting the line outright is what changes an answer.
            if (!(condition > 0f)) return 0;
            if (condition >= 1f) return 255;
            return (int)(condition * 255f + 0.5f);
        }

        /// <summary>
        /// Serialize the sparse device layer: one entry per tile-resident device, in the caller's order.
        ///
        /// ORDER IS THE CALLER'S, AND IT MATTERS — same contract as <see cref="Zones"/>,
        /// <see cref="Marks"/> and <see cref="Items"/>. This method sorts nothing.
        /// <c>GameSession.BuildDevices</c> walks <c>sim.Devices.Items</c> in STORE ORDER — the same
        /// order <c>GlyphMapper</c> pass 4 walks, a plain <c>List</c> index walk rather than any hash
        /// container's layout, and part of the saved, hashed state — so two runs of one seed emit the
        /// same bytes.
        ///
        /// InvariantCulture on every number (its own <see cref="DeviceIc"/>, so this file is readable in
        /// isolation), one line, no whitespace — the house wire style.
        /// </summary>
        public static string Devices(IReadOnlyList<DeviceCell> cells)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"devices\",\"cells\":[");
            if (cells != null)
                for (int i = 0; i < cells.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var c = cells[i];
                    sb.Append('[').Append(c.X.ToString(DeviceIc))
                      .Append(',').Append(c.Y.ToString(DeviceIc))
                      .Append(',').Append(c.Deck.ToString(DeviceIc))
                      .Append(',').Append(c.Kind.ToString(DeviceIc))
                      .Append(',').Append(c.Cond.ToString(DeviceIc))
                      .Append(',').Append(c.Oper.ToString(DeviceIc))
                      .Append(',').Append(c.Open.ToString(DeviceIc))
                      .Append(',').Append(c.Serv.ToString(DeviceIc))
                      .Append(',').Append(c.Air.ToString(DeviceIc))
                      .Append(',').Append(c.Spend.ToString(DeviceIc))
              .Append(',').Append(c.Face.ToString(DeviceIc)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }
    }
}
