using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Perilune.Web
{
    /// <summary>
    /// THE <c>blocked</c> CHANNEL — <b>why an order the player painted is doing nothing.</b> A SIBLING
    /// PARTIAL of <see cref="WireFormat"/>, not an edit to it: <c>WireFormat</c> is a spine file
    /// (<c>CLAUDE.md</c>, integrator lane only) and it has been <c>partial</c> since the <c>zones</c>
    /// channel, so this file is a PURE ADDITION and <c>WireFormat.cs</c> has NO DIFF AT ALL.
    /// <c>SurfaceBoundaryTests.WireFormatFiles</c> globs <c>WireFormat*.cs</c> for exactly this.
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// WHAT WAS WRONG, PRECISELY. <b>An order can be refused FOREVER and no surface says so.</b>
    ///
    /// <c>WorksiteSafety.CanStageWorkerAt</c> (<c>sim/Sim.Core/Systems/SafetySystem.cs</c>) refuses to
    /// park a worker on a tile whose air would pull it off the job. It closed a real livelock — 47 640
    /// job starts became 298 and cost two services — and its own header records the price it paid:
    ///
    ///   *"the bug goes from expensive-and-visible to CHEAP-AND-INVISIBLE … A designation painted in
    ///   an airless compartment now simply never progresses, silently, with nothing on any surface
    ///   saying why. <c>CanStageWorkerAt</c> is public so a future wire channel can ask it per tile
    ///   and finally say so."*
    ///
    /// THIS IS THAT CHANNEL. It exists because of a rule this repo has already paid three owner
    /// reports for: <b>a designation the player cannot understand is indistinguishable from a broken
    /// verb.</b> On the shipped grid ship the case is reachable but rare; on the wreck premise
    /// (`docs/design/perilune-wreck-start.plan.md` W4) it is the DEFAULT experience — a player paints
    /// repairs across a dead ship and watches nothing happen.
    ///
    /// ⚠️ IT IS A TILE-STATE CHANNEL AND IT NEVER TOUCHES THE PROJECTION. Not a preference: the sixth
    /// trap shape (`CLAUDE.md`) is that a predicate over "what a glyph resolves to" is defeated by
    /// <c>GLYPH_SUBSTITUTE</c>, and the <c>marks</c>/<c>items</c>/<c>devices</c> lesson three times over
    /// is that THE FIX IS A CHANNEL, NOT A BETTER READER. Every value here is read from
    /// <c>sim.World</c>, the two order registries and <c>WorksiteSafety</c> itself.
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    ///
    /// ⚠️⚠️ WHAT IT ASKS, WHAT IT INFERS, AND WHAT IT DELIBERATELY OMITS. Read this before adding a
    /// reason — the omissions are the design, not gaps somebody forgot.
    ///
    /// <b>ASKED — the sim's own predicates, called directly, never re-derived:</b>
    ///   • <c>WorksiteSafety.CanStageWorkerAt(sim, neighbour)</c> ⇒ <see cref="ReasonAir"/>. This is
    ///     THE authority. It is the identical call <c>JobWork.TryPathToAdjacent</c> makes at
    ///     <c>JobContext.cs:80</c>, on the identical tile, so the channel and the dispatcher cannot
    ///     come to disagree about whether a worker may stand somewhere.
    ///   • <c>Simulation.IsWalkable(neighbour)</c> over <c>Int3.Neighbor4</c> ⇒
    ///     <see cref="ReasonNoApproach"/>. Also the dispatcher's own call, in the dispatcher's own
    ///     canonical neighbour order (the order shared with pathing, room flood, atmosphere and power).
    ///
    /// <c>BlockedReason</c> in <c>GameSession</c> is <c>TryPathToAdjacent</c>'s loop with the
    /// <c>FindPath</c> removed and nothing else changed. That is the whole implementation.
    ///
    /// <b>INFERRED — one thing only, and it is arithmetic, not a rule:</b> the split between
    /// <see cref="ReasonAir"/> and <see cref="ReasonNoApproach"/>. Both are the same dispatcher answer
    /// ("no adjacent tile worked"); which one it is depends on whether ANY neighbour was walkable at
    /// all. Nothing in the sim distinguishes them, and nothing has to — the two are disjoint by
    /// construction here.
    ///
    /// <b>⛔ OMITTED (1) — THE FOUR ATMOSPHERE SUB-REASONS: vacuum · thin air · CO₂ · thermal.</b>
    /// The design charter asked for them by name. They are NOT here, and this is the requirement that
    /// says so: *"if a reason cannot be obtained without duplicating sim logic, say so and leave that
    /// reason out rather than shipping a second, drifting copy."*
    /// <c>AtmosphereSafety.IsBreathable</c> (<c>SafetySystem.cs:11-20</c>) is FOUR BRANCHES BEHIND ONE
    /// BOOL. There is no public way to ask WHICH branch fired. Recomputing them here — comparing
    /// <c>Room.PressureKPa</c>, <c>O2Fraction</c>, <c>CO2Ppm</c> and <c>TemperatureK</c> against
    /// <c>NeedsDefs</c> — is a SECOND DEFINITION of breathability living in a host, and the day a def
    /// or a branch moves, the tile would say "too cold" while the sim refused it for CO₂. That is
    /// exactly the hand-mirror defect this repo deleted <c>ROLE_TO_ITEM</c> and <c>MARK_FOR_FG</c> for.
    /// <b>THE REMEDY FOR THE NEXT LANE, so nobody re-derives it:</b> give <c>AtmosphereSafety</c> a
    /// <c>Reason</c> enum and make <c>IsBreathable</c> literally <c>Reason(...) == Ok</c> — ONE
    /// definition, four names, and this channel then carries the sub-reason with no new authority.
    /// That is a <c>sim/</c> change and belongs to a lane that owns <c>SafetySystem.cs</c>; this lane's
    /// <c>sim/</c> diff is empty by construction. <see cref="ReasonAir"/> is deliberately worded as
    /// "the air where a worker would have to stand is not survivable", which is TRUE of all four
    /// branches, rather than as a guess that is right three times in four.
    ///
    /// <b>⛔ OMITTED (2) — "no crew can PATH here".</b> <c>TryPathToAdjacent</c>'s third test is
    /// <c>sim.Paths.FindPath</c>, and a designation in perfectly good air that no crew can reach is
    /// silently refused too (E0-4 WP-7's shape, <c>MECHANICS.md</c> §13.17). It is omitted for a
    /// measured reason and a structural one. MEASURED: <c>FindPath</c> is a whole-region sweep, which
    /// is why the sim itself pays it LAZILY and then stamps a 5 s <c>JobWork.UnreachableRetryTicks</c>
    /// backoff; running it per designated tile × up to 4 neighbours × every live crew member on every
    /// render at 10 Hz is not a shippable cost. STRUCTURAL: the sim ALREADY KNOWS the answer — each
    /// source stamps <c>_retryAt</c> — but <c>DigJobSource</c>, <c>BuildJobSource</c> and
    /// <c>DeconstructJobSource</c> keep it PRIVATE. <c>HaulJobSource</c> is the one that made it public
    /// (<c>IsBackedOff</c>, for the <c>zones</c> channel's back-off bit), and the honest fix is to
    /// mirror that on the other three and ASK — not to re-derive a reachability answer host-side.
    /// <b>Stated as the residual: a designated tile in breathable air that no crew can reach is still
    /// silent.</b>
    ///
    /// <b>⚡ AND THE SAME EXPOSURE IS THIS CHANNEL'S CHEAPEST OPEN WIN — named for the next lane rather
    /// than accepted forever.</b> <c>DigJobSource</c> already keeps its designated tiles in a private
    /// <c>_sites</c> list, filled by the dispatcher's own tile pass, and already publishes
    /// <c>CandidateCount</c>. Making the LIST readable turns the dig walk below from a whole-world flag
    /// scan into O(orders) — and that scan is <b>the entire cost this channel pays on an untouched
    /// ship</b> (re-measured: <b>8.45 µs of a ~517 µs render, ~1.6 %, for ZERO rows</b>). One accessor
    /// on one job source takes the idle cost to approximately nothing, and it composes with the
    /// <c>IsBackedOff</c> mirror above — the same lane can do both. It is a <c>sim/</c> change and this
    /// lane's <c>sim/</c> diff is empty by construction.
    ///
    /// <b>⚠️ ONE PLACE WHERE "THE SAME PREDICATE" IS NOT LITERALLY TRUE, recorded rather than
    /// smoothed over.</b> The dig <b>site</b> test here is the <c>TileFlags.Designated</c> flag alone;
    /// <c>DigJobSource.VisitTile</c> requires <c>Designated <b>&amp;&amp;</b> wall == TileDefs.Debris</c>.
    /// The two can only diverge on a designated tile that is not debris, which no shipped path
    /// produces — <c>DesignateDigCommand</c> refuses a non-debris tile and <c>DigJobSource</c>'s
    /// completion clears the flag as it clears the wall — and the <c>marks</c> channel has had exactly
    /// the same shape since it shipped. It is recorded because the DAY that becomes reachable (an LLM
    /// effect, a save from a newer host, a wreck generator that paints orders directly) this channel
    /// would badge a tile the dig board never even enumerates.
    ///
    /// <b>⛔ NOT DUPLICATED (3) — the stockpile haul back-off.</b> The charter listed stockpile zones
    /// among the things to cover. They are already covered, authoritatively, and adding them here would
    /// be the two-sources-for-one-layer defect the <c>marks</c> channel exists to remove:
    /// <c>WireFormat.ZoneFlagBackedOff</c> carries it on the <c>zones</c> channel (fed by
    /// <c>HaulJobSource.IsBackedOff</c>) and the Room Zoom ALREADY DRAWS IT — <c>zone-overlay.js</c>
    /// emits <c>rz-zone-backedoff</c> and <c>zone-model.js</c> puts "NOT REACHED" in the zone key. A
    /// zone is also a standing POLICY rather than a queued order, which is why it lives on a channel
    /// about zones.
    ///
    /// <b>⛔ NOT COVERED (4) — MAINTENANCE.</b> <c>MachineWearSystem.TryFindStagingTile</c>
    /// (<c>MachineWearSystem.cs:464</c>) asks the same rule about a needy machine, and a machine in bad
    /// air is silently never serviced. It is off this channel because this channel is scoped to WHAT
    /// THE PLAYER ASKED FOR: maintenance is automatic, the player never painted it, and on a wreck the
    /// row count would be "every damaged device aboard" — a permanent nag about work nobody ordered.
    /// The <c>devices</c> channel already carries per-machine condition for that story.
    ///
    /// <b>FUTURE (5) — the third silent refusal.</b> <c>lane/recovery-economy</c> adds
    /// <c>IsUnfixableWreck</c>: a machine below <c>wear.wreck_threshold</c> with no Parts/Seals aboard
    /// is refused at recruitment, forever, silently. That is a <see cref="ReasonNoConsumable"/>-shaped
    /// fact and the enum below leaves it a reserved trailing value — DECLARED, NEVER EMITTED here,
    /// because this lane cannot see that predicate and inventing a second copy of it is the mistake
    /// this whole header is about. See <see cref="ReasonNoConsumable"/>.
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// SCOPE — THREE REGISTRIES, NOT "EVERY TILE". A world scan over 45×18×8 emitting a row per
    /// unstageable tile is not a channel, it is a fog-of-war rewrite: most of a wreck is airless and
    /// nobody ordered anything there. The rows are exactly the sites the player queued —
    /// <see cref="OrderDig"/> (<c>TileFlags.Designated</c>), <see cref="OrderStrip"/>
    /// (<c>DeconstructSystem.Pending</c>) and <see cref="OrderBuild"/> (<c>BuildSystem.Pending</c>) —
    /// and only those of them the staging rule actually refuses.
    ///
    /// ⛔ <b>"EMPTY ON A HEALTHY SHIP" IS WHAT THIS PARAGRAPH USED TO CLAIM, AND IT IS RETRACTED —
    /// A DEVELOPMENT-TIME RETRACTION, NOT A SHIPPED ONE.</b> Both versions live inside commit
    /// <c>c7309d6</c>: the false premise was found and corrected before the package was ever gated, so
    /// no green ever stood over it on any branch. It is written down anyway, because the reason it was
    /// false is reusable. The claim came from the wreck charter (*"this channel is empty on a healthy
    /// ship — measured: unstageable dig/strip/build 0 / 0 / 0 on grid at 12 days"*) and it is true only
    /// of the AIR reason: the scenario host's livelock audit explicitly excludes walled-in sites on the
    /// grounds that *"walled in is not an AIR refusal"*, so its zeros never counted the class this
    /// channel's second reason reports. MEASURED against a LIVE <c>--ship grid</c> host, and pinned by
    /// <c>BlockedChannelTests.The_Tick_Zero_Payload_Is_Empty_But_Grid_Really_Does_Author_Blocked_Digs</c>:
    /// <b>grid AUTHORS 20 dig designations</b> (a 10×2 rubble block in the hold, x 23–32, y 15–16,
    /// deck 1) <b>and TEN of them ship on this channel as <see cref="ReasonNoApproach"/></b> from the
    /// first frame the crew light that corner. The TICK-0 payload is empty because the ten BLOCKED
    /// tiles — the inner row — are unexplored at boot; the outer ten are explored at tick 0 already and
    /// are simply not blocked. The fog gate, not an untouched ship.
    ///
    /// ⚠️ SO THE HONEST SHAPE IS: <c>zones</c>-like on the AIR reason, and NOT empty on the standard
    /// ship. <b>AND THE BADGES ARE TRANSIENT — SELF-CLEARING, WITH NO PLAYER ACTION — WHICH IS THE
    /// FACT THAT SETTLES WHAT TO DO ABOUT THEM.</b> Driven on a live <c>--ship grid</c> at default
    /// speed, boot seed, sampled every 3 000 ticks (this lane's own run; independent review measured
    /// the same shape on a coarser grid):
    /// <code>
    ///   t=0      (  0 min)  designated=20  exploredDig=10  blockedRows= 0  jobs=[None x8]
    ///   t=3000   (  5 min)  designated=20  exploredDig=20  blockedRows=10  jobs=[Dig x8]
    ///   t=6000   ( 10 min)  designated=20                  blockedRows=10  jobs=[Dig x8]
    ///   t=9000   ( 15 min)  designated=12                  blockedRows= 2  jobs=[Dig x8]
    ///   t=15000  ( 25 min)  designated= 4                  blockedRows= 0
    ///   t=21000  ( 35 min)  designated= 0                  blockedRows= 0   (0 for the next 5 sim-hours)
    /// </code>
    /// <c>DigJobSource.DigWorkTicks = 6000</c> — TEN SIM-MINUTES PER TILE — so nothing can complete
    /// before ~10 min and the whole field is gone by ~35. The ten badges are the layer honestly
    /// narrating a dig block being eaten from the outside in, which is exactly what the player is
    /// watching happen. <b>⛔ A CONTEMPORANEOUS NOTE CLAIMING THE FIELD "NEVER PROGRESSED — 0 dug in
    /// ~75 sim-minutes at 100×" IS RETRACTED IN FULL: it was a measurement artefact of a speed command
    /// that did not take, the shipped dig field is fine, and it is corrected here rather than left to
    /// send the next agent hunting a bug on <c>main</c> that does not exist.</b>
    ///
    /// ⇒ <b>DECISION (owner, after the measurement): SHIP THE BEHAVIOUR AS IT IS.</b> The earlier
    /// proposal to suppress a <see cref="ReasonNoApproach"/> badge when a same-order 4-neighbour is
    /// unblocked is WITHDRAWN and must not be implemented — it pays a permanent silent price (an
    /// isolated walled-in order goes quiet forever) for a temporary cosmetic one. The only sanctioned
    /// alternative was client-side GROUPING — one badge per contiguous block, same rows on the wire,
    /// same key line — and this lane declined it: it is reversible and lies about nothing, but it adds
    /// a clustering pass and its own test surface to soften a condition that resolves itself in ~35
    /// sim-minutes, and the key box ALREADY aggregates ("10 DIG ORDERS STUCK" is one sentence, not ten).
    /// If the owner later wants it, group in <c>blocked-overlay.js</c> and change nothing here.
    ///
    /// ⚠️ A TILE CARRYING TWO ORDERS WOULD EMIT TWO ROWS, and that is deliberate rather than
    /// arbitrated host-side. <c>marks</c> ranks its four kinds because the client draws ONE mark per
    /// tile and a hidden order is a bug; here both rows say the same actionable thing about the same
    /// tile, so a duplicate is a no-op for a consumer that keys by tile (which
    /// <c>roomBlockedTiles</c> does). It is believed unreachable — <c>MarksChannelTests</c> already
    /// pins that dig and strip cannot meet — and it is NOT RELIED UPON. A prose guarantee is precisely
    /// what hid the stockpile×strip regression from the <c>marks</c> package.
    ///
    /// FOG-GATED, mirroring <c>GlyphMapper</c> pass 1 and every sparse channel since. An unexplored
    /// tile emits nothing. In practice a player can only designate what they can see, so this gate is
    /// consistency rather than a live filter — and it is here so that the day a designation arrives
    /// from somewhere else (an LLM effect, a saved game, a script) this channel does not become the one
    /// that leaks the map.
    ///
    /// ⚠️ <b>A JUSTIFICATION IN THE SIM IS NOW STALE BECAUSE OF THIS CHANNEL — filed, not fixed, and
    /// it is the one thing here a reader should carry to a sim lane.</b> <c>SafetySystem.cs:145</c>
    /// declines to cache <c>WorksiteSafety.CanCycle</c> (a linear scan of <c>Simulation.Systems</c> for
    /// a <c>NeedsSystem</c> and a <c>SafetySystem</c>) on the stated ground that it *"runs only while a
    /// job is being claimed or a servicer staged, never per tile per tick"*. <b>That sentence stopped
    /// being true the moment this file shipped:</b> <c>CanStageWorkerAt</c> — and therefore
    /// <c>CanCycle</c> — is now called up to FOUR times per designated tile per render, at 5–10 Hz.
    /// It is the likeliest explanation for why the painted case (<c>GameSession.BuildBlocked</c>'s cost
    /// note) costs ~6–7× the empty one, but <b>that attribution is inferred and was NOT isolated by a
    /// measurement</b> — say so if you quote it. It cannot be fixed from here (this lane's <c>sim/</c>
    /// diff is empty and <c>SafetySystem.cs</c> belongs to whichever lane owns it), and the fix is not
    /// obviously "add a cache" — the comment explains why a static is wrong (parallel sims with
    /// different stacks). Recorded so the next reader of that comment knows its premise has moved.
    ///
    /// ⚠️ <b>ONE GUARD HERE IS DELIBERATELY UNPINNED AND SAYS SO.</b> <c>BlockedReason</c>'s per-NEIGHBOUR
    /// <c>InBounds</c> is pinned by an inclusion test (a corner designation reaches off the map, and
    /// <c>Simulation.IsWalkable</c> does no bounds checking of its own — it would index at −1). The
    /// SITE-level <c>InBounds</c> in <c>AddIfBlocked</c> is NOT pinned, because no shipped path can
    /// produce an out-of-range <c>Pos</c> in either registry: reaching it would mean poking a registry's
    /// internals, and a test that plants an impossible state pins a fiction. It stays because the two
    /// sibling builders (<c>BuildItems</c>, <c>BuildDevices</c>) take the same guard for the same
    /// reason, and because the failure mode is a throw on the render thread.
    ///
    /// VIEW-ONLY, PROJECTION-PURE, PIN-NEUTRAL. Every value is READ from state that is already saved
    /// and hashed (the TILE chapter's flags, the <c>'STRP'</c> and build registries) or computed by a
    /// pure sim predicate. Nothing here mutates, allocates into the sim, mints a
    /// <see cref="Perilune.Glyph.GlyphColor"/> id (<c>GlyphColor</c> is a spine file and is untouched)
    /// or folds into any determinism hash.
    ///
    ///   blocked {"type":"blocked","cells":[[x,y,deck,order,reason],..]}
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo BlockedIc = CultureInfo.InvariantCulture;

        // ── the ORDER enum, APPEND-ONLY ──
        //
        // WHY THE ORDER RIDES THE TUPLE AT ALL, when `marks` already names what is on a tile. Two
        // reasons, both checked in source. (1) `marks` carries dig and strip and NOT build — a build
        // site is on the `designs` channel — so a client wanting to say "this BUILD is blocked" would
        // have to join TWO other channels and still miss the third case. (2) A cross-channel join is a
        // second place for the answer to come from; this channel's whole thesis is that a fact with two
        // sources drifts. One extra small int removes the join.
        //
        // Mirrored by `BLOCKED_ORDER_NAMES` in client/src/wire/messages.js, and the two are pinned
        // equal by client/test/blocked-model.test.js, which PARSES THIS FILE (the house tripwire idiom:
        // marks-model.test.js parses WireFormat.Marks.cs, zone-model.test.js parses WireFormat.Zones.cs,
        // palette.test.js parses GlyphColor.cs). There is no compiler across this seam.

        /// <summary>A dig/clear order: <see cref="Perilune.Sim.TileFlags.Designated"/>.</summary>
        public const int OrderDig = 0;
        /// <summary>A condemned wall or device: the <see cref="Perilune.Sim.DeconstructSystem"/> registry.</summary>
        public const int OrderStrip = 1;
        /// <summary>A queued wall/floor/door: the <see cref="Perilune.Sim.BuildSystem"/> registry.</summary>
        public const int OrderBuild = 2;

        // ── the REASON enum, APPEND-ONLY ──

        /// <summary>
        /// THE AIR WHERE A WORKER WOULD HAVE TO STAND IS NOT SURVIVABLE. At least one 4-neighbour of
        /// the site is walkable, and <c>WorksiteSafety.CanStageWorkerAt</c> refuses EVERY walkable one.
        ///
        /// <para>DELIBERATELY NOT SPLIT into vacuum / thin / CO₂ / thermal — see this file's header,
        /// omission (1). The wording is chosen to be true of all four branches of
        /// <c>AtmosphereSafety.IsBreathable</c>, including the one people forget: a room at full
        /// pressure and perfect O₂ that is merely FREEZING refuses all work, and
        /// <c>CLAUDE.md</c> records a live freezing thermal loop on the slice.</para>
        ///
        /// <para>⚠️ IT IS A LIVE PREDICATE, NOT A STAMP. <c>CanStageWorkerAt</c> re-reads the room every
        /// time, so this row disappears on the very next render once the compartment breathes — there
        /// is no timer to wait out and nothing to clear. That is a property of the rule, inherited, not
        /// a decision made here.</para>
        /// </summary>
        public const int ReasonAir = 0;

        /// <summary>
        /// NOTHING CAN STAND NEXT TO IT. No 4-neighbour of the site is walkable at all, so
        /// <c>JobWork.TryPathToAdjacent</c> has no candidate to even consider — a dig tile buried
        /// inside a rubble field, a strip target walled in on four sides.
        ///
        /// <para>KEPT SEPARATE FROM <see cref="ReasonAir"/> because the player's next action differs:
        /// air is answered with a vent, an approach is answered with a spade. The scenario host's
        /// livelock audit (<c>hosts/scenario/Program.cs</c>) makes the same distinction and EXCLUDES
        /// this case from its count on the grounds that *"walled in is not an AIR refusal"* — the same
        /// line, drawn once as an exclusion and once as a second reason.</para>
        ///
        /// <para>⚠️ OFTEN SELF-RESOLVING, and worth knowing before reading a screenful of them as a
        /// fault: paint a solid block of dig orders and its interior tiles all report this until the
        /// rim is cleared. That is honest — nothing IS happening on those tiles yet — but it is not a
        /// defect to chase.</para>
        /// </summary>
        public const int ReasonNoApproach = 1;

        /// <summary>
        /// ⛔ RESERVED — DECLARED, NEVER EMITTED BY THIS HOST. "The ship has none of the consumable
        /// this work needs", the third silent refusal: <c>lane/recovery-economy</c>'s
        /// <c>IsUnfixableWreck</c> refuses a machine below <c>wear.wreck_threshold</c> with no
        /// Parts/Seals aboard, forever, with nothing said.
        ///
        /// <para>The value is nailed down here so the two lanes cannot both pick 2 for different
        /// meanings, and the client already names it — but NOTHING IN THIS PACKAGE PRODUCES IT, because
        /// this lane cannot call that predicate and a host-side re-derivation of "is there any Parts
        /// aboard" is the exact second-authority mistake omission (1) refuses. The lane that owns the
        /// predicate emits it, in one line, against a name that is already on the wire.</para>
        ///
        /// <para>Pinned as un-emitted by <c>BlockedChannelTests</c> rather than left to trust — a
        /// reserved constant that quietly starts being emitted is how a vocabulary rots.</para>
        /// </summary>
        public const int ReasonNoConsumable = 2;

        /// <summary>
        /// One refused order on the <c>blocked</c> channel. Tuple <c>[x, y, deck, order, reason]</c>,
        /// append-only (a future field is a trailing element, exactly as <see cref="ZoneTile"/>,
        /// <see cref="MarkCell"/>, <see cref="ItemCell"/> and <see cref="DeviceCell"/> document).
        ///
        /// <para>THE TUPLE LEADS WITH <c>x, y, deck</c> because every other sparse channel does —
        /// <c>materials</c>, <c>zones</c>, <c>marks</c>, <c>items</c>, <c>devices</c>, all five checked
        /// in source. One decoder shape across six channels is worth more than any per-payload
        /// preference; the wreck charter wrote this tuple as <c>[x, y, deck, reason]</c> and the extra
        /// element is appended, not inserted.</para>
        ///
        /// <para><see cref="X"/>/<see cref="Y"/>/<see cref="Deck"/> are the SITE — the tile the player
        /// painted — and NOT the neighbour whose air was tested. That is the tile they clicked and the
        /// tile they will look at; naming the staging tile instead would point at a spot where nothing
        /// is drawn and where they ordered nothing.</para>
        /// </summary>
        public readonly struct BlockedCell
        {
            public readonly int X, Y, Deck, Order, Reason;

            public BlockedCell(int x, int y, int deck, int order, int reason)
            { X = x; Y = y; Deck = deck; Order = order; Reason = reason; }
        }

        /// <summary>
        /// Serialize the sparse blocked-order layer: one entry per refused site, in the caller's order.
        ///
        /// ORDER IS THE CALLER'S, AND IT MATTERS — same contract as <see cref="Zones"/>,
        /// <see cref="Marks"/>, <see cref="Items"/> and <see cref="Devices"/>. This method sorts
        /// nothing. <c>GameSession.BuildBlocked</c> emits digs on the z,y,x world walk (the
        /// <c>IJobSource</c> rule-3 scan order the three per-tile channels already use), then strips in
        /// <c>DeconstructSystem.Pending</c> list order, then builds in <c>BuildSystem.Pending</c> list
        /// order — three deterministic index walks over plain <c>List</c>s that are themselves saved,
        /// hashed state. No hash container's internal layout can reach the socket.
        ///
        /// InvariantCulture on every number (its own <see cref="BlockedIc"/>, so this file is readable
        /// in isolation), one line, no whitespace — the house wire style.
        /// </summary>
        public static string Blocked(IReadOnlyList<BlockedCell> cells)
        {
            var sb = new StringBuilder(128);
            sb.Append("{\"type\":\"blocked\",\"cells\":[");
            if (cells != null)
                for (int i = 0; i < cells.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var c = cells[i];
                    sb.Append('[').Append(c.X.ToString(BlockedIc))
                      .Append(',').Append(c.Y.ToString(BlockedIc))
                      .Append(',').Append(c.Deck.ToString(BlockedIc))
                      .Append(',').Append(c.Order.ToString(BlockedIc))
                      .Append(',').Append(c.Reason.ToString(BlockedIc)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }
    }
}
