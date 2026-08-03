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
    /// <b>✅ WAS OMITTED (2) — "no crew can PATH here" — AND IS NOW ANSWERED. See
    /// <see cref="ReasonUnreachable"/>.</b> The paragraph below is kept verbatim because it is the
    /// prescription that was followed, not a stale claim: <c>IJobSource.IsBackedOff</c> was lifted to
    /// the contract, the other three sources now mirror <c>HaulJobSource</c>'s shape, and
    /// <c>JobSystem.IsBackedOff</c> fans out so this host asks ONE question. ⚠️ TWO CLAUSES OF IT
    /// HAVE MOVED AND ARE CORRECTED HERE RATHER THAN LEFT TO MISLEAD: the sim does NOT "already know
    /// the answer" to reachability — it knows only that <b>a recent attempt failed</b>, which is
    /// weaker (see <see cref="ReasonUnreachable"/>); and the residual sentence at the end
    /// (<i>"a designated tile in breathable air that no crew can reach is still silent"</i>) is now
    /// true only of a tile <b>nobody has attempted</b>, not of every such tile.</b>
    ///
    /// <c>TryPathToAdjacent</c>'s third test is
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
    /// <b>⛔ THAT WIN WAS OFFERED TO THE <see cref="ReasonUnreachable"/> LANE AND DECLINED — with a
    /// reason, so nobody re-opens it as an oversight.</b> <c>DigJobSource._sites</c> is a DERIVED
    /// board, not a registry: <c>JobSystem.Rescan</c> refills it only when <c>JobBoardDirty.Tiles</c>
    /// is set, and only from inside <c>JobSystem.Tick</c>. The <c>TileFlags.Designated</c> plane, by
    /// contrast, is authoritative and synchronous — the flag IS the order. Reading the derived board
    /// would make this channel's COVERAGE a function of dispatcher scheduling and of whether whichever
    /// writer painted the flag remembered to dirty the board (a save/load, a MOSS tile write, an LLM
    /// effect, a generator that paints orders directly — the same list the next paragraph but one
    /// already flags). <b>That buys ~1.6 % of a render by making the anti-silence channel able to go
    /// silent</b>, and it narrows the reported set as well: the divergence recorded immediately below
    /// would stop being latent and start dropping rows. Confirmation that this is not theoretical:
    /// <c>GameSession.RenderForTest</c> does not tick, and several tests in
    /// <c>BlockedChannelTests</c> set <c>Designated</c> directly and then render — against
    /// <c>_sites</c> every one of them would see an empty board. If a later lane wants the µs, the
    /// safe shape is a registry written where the flag is written, not a read of a board that is
    /// rebuilt when the dispatcher gets round to it.
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
    /// <b>⛔ NOT COVERED (4) — AUTOMATIC MAINTENANCE.</b> <c>MachineWearSystem.TryFindStagingTile</c>
    /// asks the same rule about a needy machine, and a machine in bad
    /// air is silently never serviced. It is off this channel because this channel is scoped to WHAT
    /// THE PLAYER ASKED FOR: maintenance is automatic, the player never painted it, and on a wreck the
    /// row count would be "every damaged device aboard" — a permanent nag about work nobody ordered.
    /// The <c>devices</c> channel already carries per-machine condition for that story.
    /// ⭐ <b>M2-9 NARROWS THIS OMISSION WITHOUT REVERSING IT</b>: a machine a player has DIRECTLY
    /// ordered repaired is no longer automatic work, so it is on the channel — as
    /// <see cref="OrderRepair"/>. ⭐⭐ <b>AMENDED 2026-08-03 BY D5 — IT IS NOW ON IT FOR <i>TWO</i>
    /// REASONS, NOT ONE</b> (this paragraph said "ONE reason only" and that is what a reader is sent
    /// here to check before adding a third): <see cref="ReasonNoConsumable"/> — nothing aboard to fix
    /// it with — and <see cref="ReasonNoRoute"/> — the crew member who was ordered cannot walk to it.
    /// They are asked in that walk in the OPPOSITE order to this sentence: route FIRST, stock second
    /// (<c>GameSession.BuildBlocked</c>'s repair walk, and <see cref="ReasonNoRoute"/>'s precedence
    /// paragraph says why). The AIR staging refusal above is still silent for a repair, ordered or
    /// not — and deliberately so since M3-14, because an order overrides the air.
    ///
    /// <b>⭐ CLOSED (5) — the third silent refusal, discharged by M2-9.</b>
    /// <c>MaintenanceSystem.IsUnfixableWreck</c>: a machine below <c>wear.wreck_threshold</c> with no
    /// Parts, Seals or Swarf aboard is refused at recruitment, forever, with nothing said. It is now
    /// emitted as <see cref="ReasonNoConsumable"/> for a machine the player ordered repaired — ASKED
    /// of the sim's own public predicate, in one line, never re-derived here. That was the whole
    /// condition this paragraph attached to it, and it is met by the lane that owns the order rather
    /// than by this one inventing a second copy of the predicate.
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// SCOPE — WHAT THE PLAYER ORDERED, NOT "EVERY TILE". A world scan over 45×18×8 emitting a row per
    /// unstageable tile is not a channel, it is a fog-of-war rewrite: most of a wreck is airless and
    /// nobody ordered anything there. The rows are exactly the sites the player queued —
    /// <see cref="OrderDig"/> (<c>TileFlags.Designated</c>), <see cref="OrderStrip"/>
    /// (<c>DeconstructSystem.Pending</c>), <see cref="OrderBuild"/> (<c>BuildSystem.Pending</c>) and,
    /// since M2-9, <see cref="OrderRepair"/> (<c>GameSession._prioritised</c>, the host's transient
    /// record of the direct orders — the sim keeps no order registry) — and only those of them the
    /// relevant rule actually refuses.
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
    ///   blocked {"type":"blocked","cells":[[x,y,deck,order,reason,detail],..]}
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

        /// <summary>
        /// ⭐ <b>A DIRECT REPAIR ORDER (M2-9) — <i>"that machine, now"</i>, aimed at ONE machine by
        /// ONE named crew member</b> (<c>Perilune.Sim.PrioritiseJobCommand</c>). The only order kind
        /// here that is NOT a registry the sim owns: the sim keeps no order registry at all (the
        /// held job IS the order), so the source is <c>GameSession._prioritised</c> — the host's
        /// transient record of what was asked. See <see cref="ReasonNoConsumable"/>.
        ///
        /// <para>⚠️ <b>THE CLIENT DOES NOT NAME THIS VALUE YET, AND THAT IS DELIBERATE RATHER THAN
        /// AN OMISSION.</b> <c>BLOCKED_ORDER_NAMES</c> in <c>client/src/wire/messages.js</c> still
        /// stops at <c>build</c>, so <c>blockedOrderName(3)</c> returns <c>''</c> and
        /// <c>room-model.js</c> falls back to the generic word: the badge reads <b>"ORDER BLOCKED —
        /// NO PARTS OR SEALS ABOARD"</b> rather than "REPAIR BLOCKED — …". That is the forward-compat
        /// path <c>decodeBlocked</c> was BUILT for and documents by name (*"a row with an unknown
        /// ORDER is KEPT too … the payload of a blocked row is THIS TILE IS STUCK, and that fact
        /// survives intact even when the why or the what comes from a newer host"*). The surface
        /// that draws a repair order — and the word for it — is M2-10's package; this one adds the
        /// verb and its refusal, and touches no client file.</para>
        /// </summary>
        public const int OrderRepair = 3;

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
        ///
        /// <para>⭐⭐ <b>M3-14 (2026-07-31) — AND IT NOW ALSO DISAPPEARS WHEN THE PLAYER ORDERS
        /// SOMEBODY ONTO THE SITE, WHICH IS RUNG 3 AND NOT AN EXCEPTION TO THIS CHANNEL'S RULE.</b>
        /// <c>WorksiteSafety.CanStageWorkerAt</c> gained a <c>forced</c> argument: a job held under a
        /// direct order crosses the pressure frontier on purpose
        /// (<c>rimworld-reference.md</c> §8.4 rung 2). <c>GameSession.BlockedReason</c> therefore asks
        /// the SAME predicate with the SAME flag — *"one rule, not two"* — because a channel still
        /// asking the un-bypassed question would badge a site the sim is happily working. <b>The
        /// header's central claim is unchanged and this is what keeps it true:</b> the call here is
        /// still the identical call <c>JobWork.TryPathToAdjacent</c> makes, on the identical tile,
        /// now with the identical flag.</para>
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
        ///
        /// <para>⭐ <b>SINCE THE D5 FOLLOW-ON (2026-08-03) IT ALSO REACHES <see cref="OrderRepair"/>
        /// ROWS, FROM A SECOND EMITTER.</b> <c>GameSession.AddNoApproachRow</c> raises it on a machine
        /// whose direct order the sim DROPPED because the machine lost its staging tile mid-job
        /// (<c>MaintenanceSystem.DriveWorker</c>'s first line, <c>JobDropReason.NoWorksiteTile</c>).
        /// Same sentence, same question — <c>TryFindStagingTile(forced: true)</c>, re-asked live every
        /// render — reached from a repair order rather than from the world walk. ⛔ It does NOT close
        /// <c>MECHANICS</c> §13.25 b2, which is the order refused AT ISSUE TIME for want of a staging
        /// tile: that one creates no job at all, so there is nothing to report and it stays filed.</para>
        /// </summary>
        public const int ReasonNoApproach = 1;

        /// <summary>
        /// ⭐⭐ <b>THE SHIP HAS NOTHING TO FIX IT WITH — LIVE SINCE M2-9, AND RESERVED-BUT-UNEMITTED
        /// FOR THE THREE PACKAGES BEFORE IT.</b> The player has pointed a named crew member at a
        /// machine below <c>wear.wreck_threshold</c>, and there is no Parts, no Seals and no Swarf
        /// stack anywhere aboard that a servicer could reach: the empty-handed jury-rig is refused by
        /// wreck rule W2, so there is no service to perform. Emitted for
        /// <see cref="OrderRepair"/> rows only.
        ///
        /// <para><b>THE PREDICATE IS <c>MaintenanceSystem.IsUnfixableWreck</c>, ASKED IN ONE
        /// LINE</b> (<c>GameSession.BuildBlocked</c>'s repair walk, which hands the answer to
        /// <c>AddUnfixableRow</c>). It is public for precisely this call, and
        /// its own doc comment says why: a view-only channel must ask *"the same question the
        /// dispatcher asks rather than re-deriving it — re-deriving is how the two answers drift
        /// apart"*. The tier ladder (Parts ▸ Seals ▸ Swarf), the carry/reservation filters and the
        /// breathability of the stack's own tile all live behind that one call.</para>
        ///
        /// <para><b>IT IS A LIVE PREDICATE, NOT A STAMP</b>, like <see cref="ReasonAir"/>: the row
        /// disappears on the very next render once a single Swarf stack is set down within reach.
        /// The player's next action is *find parts*, which is why it is a different sentence from
        /// every other reason here.</para>
        ///
        /// <para>⚠️ <b>ONLY AN ORDERED MACHINE IS ELIGIBLE.</b> Automatic maintenance stays off this
        /// channel — see omission (4) in this file's header, which is unchanged: on a wreck the row
        /// count would otherwise be "every damaged device aboard", a permanent nag about work nobody
        /// asked for. What M2-9 adds is a machine the player DID ask about.</para>
        ///
        /// <para>The value was nailed down early so two lanes could not both pick 2 for different
        /// meanings; the client has named it (<c>no_consumable</c> → *"NO PARTS OR SEALS ABOARD"*)
        /// since before anything produced it.</para>
        ///
        /// <para>⭐⭐ <b>M3-13 — AND IT IS THE ONE REASON THAT CARRIES A
        /// <see cref="BlockedCell.Detail"/>: the <c>ItemKind</c> BYTE the order is waiting for.</b>
        /// <b>WHAT WAS WRONG WITH THE GENERIC SENTENCE, precisely.</b> <i>NO PARTS OR SEALS
        /// ABOARD</i> (a) <b>omits Swarf</b>, which is a third tier that clears this row on its own
        /// (wreck rule W2's whole point: salvage from the dead half of the ship is what makes a
        /// wreck fixable), and (b) <b>names no item as the one to go and get</b> — it describes the
        /// ship's larder rather than the order's want. A badge that lists the wrong two of three
        /// sends the player to make the wrong thing, and <i>invisible feedback is functional</i> has
        /// a twin: <b>wrong feedback is worse than none</b>. The badge now reads
        /// <c>NEEDS PARTS — NOTHING ABOARD TO REPAIR IT WITH</c>: one item to go and get, and a
        /// clause that stays true about the other two.
        /// <br/>⛔ <b>A REPAIR ORDER NEVER WANTS A <c>ControllerModule</c> — CENSUSED, AND THE
        /// CHARTER'S PREMISE WAS WRONG ABOUT THIS.</b> M3-13's charter motivated the field with
        /// <i>"the existing <c>ReasonNoConsumable</c> is the wrong sentence for
        /// <c>ControllerModule</c>"</i>. It is not: <c>ControllerModule</c> has exactly two
        /// consumers in the game — <c>CommissionDeviceCommand</c> and <c>ThawGate</c>'s rung table —
        /// and neither is a repair. The repair ladder is <c>Parts</c> ▸ <c>Seals</c> ▸ <c>Swarf</c>
        /// and nothing else. The charter's example was a THAW-side fact borrowed into a repair-side
        /// justification; the field is right, the reason given for it was not, and the reason is
        /// corrected here rather than left to be quoted forward.
        /// <br/><b>THE ITEM IS ASKED, NOT CHOSEN HERE</b> —
        /// <c>MaintenanceSystem.WantedRepairConsumable</c>, i.e. the top rung of the sim's own
        /// <c>RepairConsumableTier</c> ladder, which is the same declaration
        /// <c>FindNearestConsumable</c> walks. A host-side <c>ItemKind.Parts</c> literal would be
        /// the second authority omission (1) of this file's header refuses by name, and it would
        /// go quietly wrong the day the ladder's top tier moves.
        /// <br/>⚠️ <b>THE SECOND CLAUSE OF THE SENTENCE IS NOT PADDING.</b> This row is emitted
        /// only when the ship holds NONE of the three tiers, so <i>any</i> of them would clear it;
        /// the badge names the top one because that is the one a servicer would actually pick up
        /// and the one that buys a full overhaul, and <i>"NOTHING ABOARD"</i> is what keeps the
        /// sentence true about the other two rather than implying Parts is the only key.</para>
        /// </summary>
        public const int ReasonNoConsumable = 2;

        /// <summary>
        /// <b>NO CREW HAS MANAGED TO START WORK HERE.</b> The site's approach is walkable and the air
        /// where a worker would stand is survivable — so neither <see cref="ReasonAir"/> nor
        /// <see cref="ReasonNoApproach"/> applies — and the sim's own job board is nevertheless
        /// holding an unreachable BACK-OFF against this exact tile: <c>JobSystem.IsBackedOff</c>, the
        /// fan-out of <c>IJobSource.IsBackedOff</c> over dig, strip, build-ready, build-material and
        /// haul. This is omission (2) in this file's header, closed.
        ///
        /// <para><b>⚠️ IT IS NOT THE SAME PREDICATE AS "UNREACHABLE", AND THE PLAYER-FACING WORDS SAY
        /// THE WEAKER, TRUE THING.</b> A back-off stamp means *"a claim on this target was attempted
        /// and it failed"* — nothing more. The constant is named for the case that produces it
        /// overwhelmingly (a shut door, a collapsed corridor, a compartment nobody can walk to), but
        /// the CLAIM this channel makes is only that no crew member has got started. Three things
        /// follow, and all three are deliberate:</para>
        ///
        /// <para>• <b>IT UNDER-CLAIMS.</b> Only sites somebody actually TRIED carry a stamp. A tile
        /// walled off since boot that no idle crew member has yet reached for is silent here, and a
        /// ship whose whole crew is busy stamps nothing at all. That is the same direction this
        /// header commits the channel to throughout — *"a SUBSET of the truly-refused sites, never a
        /// superset"* — and it is the safe one for a surface whose purpose is to be believed.
        /// ⛔ Do NOT patch it with a host-side <c>FindPath</c>: a second implementation of
        /// reachability can disagree with the behaviour it is supposed to explain, which is the
        /// second-authority defect omission (1) exists to refuse. It is also why the measured cost
        /// stays a dictionary probe rather than a whole-region sweep per neighbour per crew per
        /// render at 10 Hz.
        /// <br/>⚠️ <b>AND D5 (2026-08-03) IS NOT A COUNTER-EXAMPLE TO THAT REFUSAL — READ THE SCOPE
        /// BEFORE CONCLUDING THE RULE WAS RELAXED.</b> <see cref="ReasonNoRoute"/> does run a
        /// <c>FindPath</c> during render, and it escapes both objections rather than overriding
        /// them: it is not a SECOND implementation (it asks
        /// <c>MaintenanceSystem.TryFindStagingTile</c> for the tile and the sim's own
        /// <c>PathService</c> for the route — the identical pair <c>DriveWorker</c> asks, so the
        /// badge and the executor cannot disagree), and it is not a SWEEP (one A* per PENDING DIRECT
        /// ORDER, bounded by the crew and gated on <c>_prioritised</c> being non-empty, versus this
        /// reason's per designated tile × up to 4 neighbours × every crew member). The paragraph
        /// above still stands for THIS reason and for the dig/strip/build walks; the arithmetic that
        /// separates the two cases is written out on <see cref="ReasonNoRoute"/>.</para>
        ///
        /// <para>• <b>THE BUILD-MATERIAL CARRIER IS NOT ABOUT THE SITE'S OWN APPROACH AT ALL.</b>
        /// <c>BuildJobSource._matRetryAt</c> is stamped when <c>TryReserveMaterialFor</c> finds no
        /// free material stack the citizen can reach — a site whose own tile is perfectly reachable.
        /// It is on this reason anyway, because splitting it would require a second constant whose
        /// predicate this host cannot separate from the first. The wording therefore covers both:
        /// <i>"no crew has reached it, or the material for it"</i>.</para>
        ///
        /// <para>⛔ <b>AND THE ONE CASE A READER WILL EXPECT MOST IS THE ONE THIS CANNOT REPORT —
        /// MEASURED, AND FILED RATHER THAN FIXED. A <i>BUILD</i> BEHIND A SHUT DOOR IS STILL
        /// SILENT.</b> The package charter names <c>_matRetryAt</c> as *"the one the 480 000-tick
        /// scenario actually trips"*. It is not, whenever material is reachable:
        /// <c>TryReserveMaterialFor</c> checks a path to the MATERIAL and never to the SITE, so the
        /// claim SUCCEEDS, the citizen walks to the Regolith, and <c>ProgressHaulToBuild</c> phase A
        /// then abandons on <c>JobWork.TryPathToAdjacent(site)</c> — <b>a path that records no
        /// back-off at all</b>. That loop IS the 480 000-tick livelock, nothing stamps it, and so
        /// nothing here can name it. <c>_matRetryAt</c> fires only when NO material is reachable
        /// (driven in <c>JobSourceBackoffTests</c>). <b>THE FIX IS ONE LINE</b> — stamp
        /// <c>_matRetryAt[site]</c> in that abandon branch — <b>but it is a WRITE on a dispatch path
        /// and this lane is pin-neutral by charter, so it belongs to the pin chain.</b> Until then,
        /// the reason covers dig, strip, ready-build and no-reachable-material; a materialed-by-haul
        /// build behind a shut door remains the residual.</para>
        ///
        /// <para>• <b>AIR WINS.</b> <c>JobWork.TryPathToAdjacent</c> stamps a back-off for an AIR
        /// refusal exactly as it does for a pathing one, so a site in bad air is usually ALSO backed
        /// off. <c>GameSession.BlockedReason</c> therefore asks this question LAST, after the two
        /// staging questions, and a tile that is both airless and un-reached reports
        /// <see cref="ReasonAir"/>. The player's next action differs — air is answered with a vent, a
        /// closed door with a hand on the door — and telling them to go looking for a route when the
        /// compartment is simply not breathable would be a confident lie.</para>
        ///
        /// <para><b>⭐ HOW A PLAYER PRODUCES IT, ON THE SHIPPING GAME, WITH NOTHING PLANTED —
        /// AND A RETRACTION.</b> An earlier draft of this package's acceptance note said *"the reason
        /// is not currently producible by a player on either shipped ship"*. <b>THAT IS FALSE AND IS
        /// RETRACTED IN FULL.</b> It came from a rig that censused the wrong <c>DeviceKind</c> (it
        /// filtered <c>2</c>, which is <c>Scrubber</c>; <c>Door</c> is <c>0</c>), so it never shut a
        /// door and then reported that no door could be shut. On <c>--ship wreck</c>, deck 0:
        /// <b>arm O and shut the two doors that boot OPEN — <c>(5,7)</c> and <c>(5,10)</c> — then arm
        /// STRIP and condemn a wall on the stranded side.</b> Those two doors are the only way into
        /// the spine corridor between the <c>y=7</c> and <c>y=10</c> wall lines, and shutting them
        /// takes deck-0 explored+breathable+crew-reachable from <b>208 tiles to 60</b>. Driven end to
        /// end through the real player commands (<c>client/tools/blocked-reach-shot.mjs</c>): six
        /// stranded walls, <b>six rows carrying reason 3 within 5 s</b>, still there after 70 s
        /// untouched, and the badge drawn on the Level-2 Room Zoom in LIFE SUPPORT.
        /// ⚠️ <b>THE VERB IS STRIP, NOT BUILD</b> — see the build residual above; a build behind the
        /// same shut door produces nothing at all.</para>
        ///
        /// <para><b>⭐ IT IS LATCHED HOST-SIDE, AND WITHOUT THE LATCH THIS REASON WOULD BE CORRECT FOR
        /// FIVE SECONDS AND SILENT FOR FIFTEEN MINUTES.</b> The stamp lasts
        /// <c>JobWork.UnreachableRetryTicks = 50</c> ticks, and <c>HaulJobSource</c>'s
        /// <c>ForgetBackoffsOnTileChange</c> clears its whole map on any <c>JobBoardDirty.Tiles</c>
        /// event. Re-stamping needs a citizen to attempt the claim AGAIN, and a one-pawn crew on a
        /// 900 s Maintain service will not for 9 000 ticks — so the raw predicate blinks out with the
        /// door still shut. That is precisely the invisible-feedback failure the <c>marks</c> channel
        /// exists to prevent, and shipping it would re-introduce it inside the package built to
        /// remove it. <c>GameSession</c> therefore remembers a site it has seen backed off and keeps
        /// reporting it until the site leaves its registry or a crew member actually takes a job on
        /// it — see <c>GameSession.BlockedReason</c>'s latch. The latched claim is the honest one:
        /// <i>the last attempt failed and none has succeeded since.</i></para>
        ///
        /// <para>⚠️ <b>TWO PROPERTIES RECORDED RATHER THAN DISCOVERED LATER.</b>
        /// (1) <b>A ZONED TILE CAN CARRY TWO MARKS AT ONCE.</b> <c>JobSystem.IsBackedOff</c> asks every
        /// source including <c>HaulJobSource</c>, whose map is keyed on STOCKPILE tiles — so an order
        /// painted on a zoned tile could draw this badge AND the <c>zones</c> channel's back-off chip
        /// together. They would be saying the same true thing about the same tile through two layers,
        /// which is why the fan-out does not filter by source type (that would be a second place that
        /// knows which sources exist). BELIEVED LATENT: it could not be produced in play. If it ever
        /// shows up as visual noise, arbitrate it in the CLIENT, not by narrowing the fan-out.
        /// (2) <b>THE FOG GATE PRUNES THE LATCH.</b> <c>GameSession.AddIfBlocked</c> returns on an
        /// unexplored tile BEFORE <c>BlockedReason</c> runs, so an unexplored site is not re-marked and
        /// its latch entry is dropped on that render. Re-exploring the tile therefore shows nothing
        /// until something re-stamps it. That is deliberate — the fog gate must not be defeated by a
        /// host-side memory — and it is pinned by
        /// <c>BlockedChannelTests.An_Unexplored_Unreachable_Site_Does_Not_Reach_The_Wire</c>.</para>
        /// </summary>
        public const int ReasonUnreachable = 3;

        /// <summary>
        /// ⭐ <b>NOBODY ABOARD IS ASSIGNED THAT WORK — M2-18, and under OD-H it is the MOST-EMITTED
        /// REASON IN THE GAME ON DAY ONE.</b> The site's approach is walkable and survivable, and
        /// <b>not one living crew member can take the work type this order belongs to</b>: every one
        /// of them has it switched off in the WORK tab, or is incapable of it.
        ///
        /// <para><b>WHY IT EXISTS AT ALL.</b> M2-2 gave the dispatcher a veto
        /// (<c>JobSystem.CanTakeFrom</c>) and OD-H booted every work type <b>off</b>. The first order
        /// a new player paints is therefore refused for exactly this reason, on a ship with exactly
        /// one crew member, and before this constant the game answered with <i>nothing</i>: paint a
        /// strip order, watch it sit there, forever, silently. That is the 480 000-tick livelock
        /// wearing new clothes, and the binding rule <i>a designation the player cannot see is
        /// indistinguishable from a broken verb</i> has already cost this project three owner
        /// reports. This is the refusal M2 itself creates, said out loud.</para>
        ///
        /// <para>⛔ <b>THE ANSWER COMES FROM THE SIM'S OWN PREDICATE AND IS NEVER RE-DERIVED HERE.</b>
        /// <c>GameSession.NobodyAboardTakesTheWorkFor</c> asks <see cref="Perilune.Sim.Citizen"/>'s
        /// <c>CanTakeWorkType</c>, the same question the dispatcher's five gates ask, over the live
        /// crew — and it gets the work type out of <c>WorkTypeMap.TryOf</c>, the sim's ONE
        /// <c>JobKind</c>→<c>WorkType</c> table. A host-side read of <c>WorkPrioritiesRaw</c> would
        /// look identical and would be WRONG for an INCAPABLE pawn (<c>CanTakeWorkType</c> folds both
        /// reasons to refuse; the raw grid folds one), which is the second-authority defect omission
        /// (1) of this file's header refuses by name. Pinned by
        /// <c>BlockedChannelTests.A_Pawn_Whose_Work_Is_ON_But_Who_Is_INCAPABLE_Still_Blocks_The_Order</c>.</para>
        ///
        /// <para><b>ALL, NOT ANY — and one crew member cannot tell the difference.</b> The row is
        /// emitted only when NO living crew member can take the work. One pawn who has it off while a
        /// shipmate has it on is not a blocked order, it is a queue; badging it would teach the player
        /// to ignore the badge. ⚠️ On the shipped wreck the crew is ONE, so all and any coincide and
        /// the fixture that separates them has to carry two
        /// (<c>BlockedChannelTests.Two_Pawns_One_Of_Them_Assigned_Is_Not_This_Reason</c>). A
        /// <b>dead</b> crew member is skipped:
        /// what she was assigned is not a fact about the ship any more.</para>
        ///
        /// <para><b>PRECEDENCE: it ranks BELOW <see cref="ReasonNoApproach"/> and
        /// <see cref="ReasonAir"/>, and ABOVE <see cref="ReasonUnreachable"/>.</b> Below the two
        /// staging questions because they are about the WORLD and this is about a switch: an order in
        /// a vacuum stays refused after the player enables the work type, so telling them to open the
        /// WORK tab would send them to the wrong screen (pinned by
        /// <c>Airless_And_WorkTypeOff_Reports_Air</c>). Above the reach question because
        /// <see cref="ReasonUnreachable"/> is a LATCHED RECORD OF A PAST ATTEMPT while this is a live
        /// fact about the present — when nobody may even try, "no crew has reached it" points at a
        /// route that is not the problem.</para>
        ///
        /// <para><b>LIVE, NOT LATCHED.</b> Like <see cref="ReasonAir"/> and unlike
        /// <see cref="ReasonUnreachable"/>, this re-reads the crew every render: switch the work type
        /// on and the badge is gone on the next frame, with no timer to wait out. That is what makes
        /// the acceptance demo a three-second loop rather than a stopwatch.</para>
        ///
        /// <para>⚠️ <b>ON A SHIP WITH NO LIVING CREW AT ALL the sentence is still true and is still
        /// emitted</b> — the quantifier is over an empty set and nobody aboard is indeed assigned
        /// anything. Stated rather than special-cased: a branch for "there is no one left" would be a
        /// second rule guarding a state in which the game is already over.</para>
        ///
        /// <para><b>THE WORDS ARE M2-20's.</b> That package owns the vocabulary for "this pawn is
        /// doing nothing" and says <i>"Awaiting orders"</i> on the PERSON
        /// (<c>GameSession.AwaitingOrdersLabel</c>); this says <i>"nobody aboard is assigned that
        /// work"</i> on the TILE. One player confusion, two surfaces, and no third word is invented
        /// for either — the client's sentence is <c>BLOCKED_REASON_TEXT.work_type_off</c>.</para>
        /// </summary>
        public const int ReasonWorkTypeOff = 4;

        /// <summary>
        /// ⭐⭐ <b>D5 — THE CREW MEMBER THE PLAYER ORDERED CANNOT WALK TO THE MACHINE.</b> The
        /// worksite has a staging tile she is allowed to stand on; there is no route from where she
        /// is to that tile. Emitted for <see cref="OrderRepair"/> rows only, and only for a machine
        /// the player DIRECTLY ORDERED — <c>GameSession.OrderedWorksiteIsOutOfReach</c>.
        ///
        /// <para><b>THE DEFECT IT CLOSES, MEASURED ON THE SHIPPED WRECK.</b> Right-click ▸
        /// <i>PRIORITISE: REPAIR</i> on <c>fabricator_1</c> (24,2,0): the order is ACCEPTED —
        /// <c>PrioritiseJobCommand</c> asks <c>MaintenanceSystem.TryFindStagingTile</c>, which tests
        /// WALKABLE and SURVIVABLE and <b>never tests REACHABLE</b> — the crew dock reads
        /// <i>"Heading to service fabricator_1"</i>, she walks 17 sim-seconds to the ship's one Parts
        /// stack, and the instant she stands on it <c>MaintenanceSystem.DriveWorker</c>'s pickup
        /// branch re-asks <c>FindPath(worker → staging)</c>, gets false and calls <c>Abandon</c>.
        /// That clears <c>JobKind</c>, which clears <c>HeldByOrder</c>, which IS the order. Taken at
        /// tick 1, gone at tick 171, machine untouched, <b>and nothing on any surface said a word</b>.
        /// The cause is one shut door — <c>door_d0_s2</c> (27,7,0) — and since OD-N doors open through
        /// MOSS only, a first-hour player has no way to know that is what they are looking at.</para>
        ///
        /// <para><b>RIMWORLD IS THE AUTHORITY FOR WHAT WAS WRONG.</b>
        /// <c>docs/design/rimworld-reference.md</c> §2.2: <i>"RimWorld's answer to an impossible order
        /// is a refusal at the point of the click — the context menu greys the entry and states the
        /// reason. It does not accept the order and then fail silently"</i>, flagged there as <b>the
        /// single most transferable fact in §2 for Perilune</b>. This repo deliberately keeps the
        /// ACCEPTANCE (§2.2's pinned ruling: an order beats the grid, never incapability, never the
        /// staging rule) and closes the SILENCE instead — the refusal is legible from the frame after
        /// the click rather than synchronous with it.</para>
        ///
        /// <para>⛔ <b>WHY IT IS NOT <see cref="ReasonUnreachable"/>, WHICH IS THE OBVIOUS RE-USE.</b>
        /// That reason is documented as, and is, <b>a latched record of a PAST ATTEMPT</b>: the host
        /// reads <c>JobSystem.IsBackedOff</c> ("a claim was attempted here and it failed"), one of
        /// whose five carriers fires on the MATERIAL rather than the site — which is why its sentence
        /// hedges (<i>"NO CREW HAS REACHED IT, OR THE MATERIAL FOR IT"</i>). This answer is neither
        /// latched nor hedged: the pathfinder was run, from her tile, to the tile the executor will
        /// path to, and it said no. Emitting it under a code whose contract is "somebody tried once"
        /// would corrupt the one reason on this channel that is honest about being weak. Two answers,
        /// two codes — the same call M2-18 made for <see cref="ReasonWorkTypeOff"/>.</para>
        ///
        /// <para><b>THE QUESTION IS ASKED, NEVER RE-DERIVED — and it is asked of the SAME TILE the
        /// executor will path to.</b> <c>MaintenanceSystem.TryFindStagingTile(..., forced: true)</c>
        /// returns the first walkable+survivable neighbour in canonical <c>Neighbor4</c> order, and
        /// <c>DriveWorker</c> paths to exactly that tile. So when a machine has two walkable
        /// neighbours and only the SECOND is reachable, this row is still correct: the order really
        /// does die, because the sim never tries the second one. A host-side "is any neighbour
        /// reachable" sweep would be a kinder answer and a WRONG one — the second-authority defect
        /// this channel's header refuses by name.</para>
        ///
        /// <para><b>PRECEDENCE: FIRST among the repair walk's reasons, above
        /// <see cref="ReasonNoConsumable"/>.</b> An order that cannot be walked to will not be served
        /// whatever the ship's stock is, and the player's next action is a ROUTE (a door, a dig), not
        /// a craft. Sending them to the fabrication bench for Parts they cannot deliver is the
        /// wrong-screen failure <see cref="ReasonWorkTypeOff"/>'s own precedence paragraph argues
        /// against.</para>
        ///
        /// <para>⭐⭐ <b>THE SCOPE WAS "SHUT AT ISSUE TIME"; SINCE THE D5 FOLLOW-ON (2026-08-03) THE
        /// MID-ORDER CASE IS COVERED TOO, BY A SECOND EMITTER ON THE SAME CODE.</b> What stood here
        /// was: the row rides <c>GameSession._prioritised</c>, that record is RETIRED on the first
        /// render after the sim takes the order (the whitelist's arm (1)), so an order given while
        /// the route was OPEN and closed mid-order died at the identical arm with nothing said
        /// (driven: taken tick 1, record retired, door shut tick 41, dropped tick 171, channel
        /// empty). That is now closed from the SIM side, which is where the ruling put it:
        /// <c>MaintenanceSystem.Abandon</c> — the one funnel all NINE of <c>DriveWorker</c>'s abandon
        /// arms go through — publishes <c>OrderDroppedEvent</c> with a <c>JobDropReason</c>;
        /// <c>GameSession.NoteDroppedOrders</c> catches it at the TICK boundary and files it; and
        /// <c>BuildBlocked</c>'s FIFTH walk re-asks <c>OrderedWorksiteIsOutOfReach</c> — this same
        /// method — every render. So this constant now has two callers and ONE question behind both.
        /// <br/>⛔ <b>AND THEY NEVER BOTH ANSWER FOR ONE MACHINE.</b> A live pending record outranks a
        /// dead one: <c>NoteDroppedOrders</c> files nothing while <c>_prioritised</c> holds the crew
        /// member (the issue-time case keeps its record precisely BECAUSE this question is asked
        /// before the taken-retire rule), so the issue-time half owns the badge from the click to the
        /// drop and beyond, and the mid-order half exists only where the pending record is already
        /// gone. <c>MECHANICS</c> §13.25 b3.</para>
        ///
        /// <para><b>LIVE, NOT LATCHED</b> — like <see cref="ReasonAir"/> and
        /// <see cref="ReasonWorkTypeOff"/>, and unlike <see cref="ReasonUnreachable"/>. Re-asked every
        /// render: open the door and the badge is gone on the next frame. ⚠️ <b>And the order does
        /// NOT come back with it</b> — RimWorld's <c>Pawn_MindState.priorityWork</c> record, which
        /// re-issues a forced job after an interruption, is still not built (<c>MECHANICS</c>
        /// §13.25d), so the player re-orders. That is a real gap, stated rather than implied; it is
        /// also exactly the shape <see cref="ReasonNoConsumable"/> has shipped with since M2-9 (the
        /// badge clears when a stack appears; the dead order does not restart).</para>
        ///
        /// <para><b>THE COST, MEASURED, BECAUSE THIS FILE'S HEADER TALKS A READER OUT OF EXACTLY THIS
        /// CALL.</b> The header refuses <c>FindPath</c> for the DIG/STRIP/BUILD walks and it is right
        /// to: there it would be per designated tile × up to 4 neighbours × every crew member × every
        /// render. Here it is <b>ONE A* per PENDING REPAIR ORDER per render</b>, and
        /// <c>_prioritised</c> holds at most one entry per crew member — on the shipped wreck, one.
        /// A FAILING A* (the worst case: it exhausts the crew member's whole reachable region) on the
        /// wreck at boot measures <b>103 µs</b> in a Debug build, against a ~517 µs render; in the
        /// steady state the walk is gated on <c>_prioritised.Count &gt; 0</c> and costs nothing at
        /// all. That is a different order of magnitude from the sweep the header rejects, and the
        /// arithmetic is written down here so the next lane does not have to re-derive it.</para>
        /// </summary>
        public const int ReasonNoRoute = 5;

        /// <summary>
        /// ⭐ <b>NO DETAIL</b> — the value <see cref="BlockedCell.Detail"/> carries for every reason
        /// that has nothing to add, which today is five of the six.
        ///
        /// <para><b>−1 AND NOT 0, DELIBERATELY.</b> <c>0</c> is a perfectly real payload in the one
        /// meaning the field currently has (<c>ItemKind.Regolith</c>), so a zero default would make
        /// "this reason says nothing more" indistinguishable from "this order wants Regolith" —
        /// a sentinel collision, which is <c>moss-model.js</c>'s DA-M1 lesson (<i>a missing state is
        /// −1/UNKNOWN, never 0/NOMINAL, because a screen may not invent a reading for a row it
        /// cannot read</i>) applied to a wire int rather than to a screen row.</para>
        /// </summary>
        public const int DetailNone = -1;

        /// <summary>
        /// One refused order on the <c>blocked</c> channel. Tuple
        /// <c>[x, y, deck, order, reason, detail]</c>, append-only (a future field is a trailing
        /// element, exactly as <see cref="ZoneTile"/>, <see cref="MarkCell"/>,
        /// <see cref="ItemCell"/> and <see cref="DeviceCell"/> document).
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
        ///
        /// ─────────────────────────────────────────────────────────────────────────────────────
        /// <para>⭐⭐ <b>M3-13 — <see cref="Detail"/>, THE SIXTH ELEMENT: ONE INT WHOSE MEANING IS
        /// DECIDED BY <see cref="Reason"/>.</b> Every other reason sends
        /// <see cref="WireFormat.DetailNone"/>.</para>
        ///
        /// <code>
        ///   reason                            Detail means                     rendered as
        ///   --------------------------------  -------------------------------  --------------------------
        ///   ReasonAir            (0)          — (DetailNone)                   the reason's own sentence
        ///   ReasonNoApproach     (1)          — (DetailNone)                   the reason's own sentence
        ///   ReasonNoConsumable   (2)          the ItemKind BYTE the order       "NEEDS PARTS — NOTHING
        ///                                     is waiting for                    ABOARD TO REPAIR IT WITH"
        ///   ReasonUnreachable    (3)          — (DetailNone)                   the reason's own sentence
        ///   ReasonWorkTypeOff    (4)          — (DetailNone)                   the reason's own sentence
        ///   ReasonNoRoute        (5)          — (DetailNone)                   the reason's own sentence
        /// </code>
        ///
        /// <para><b>WHY A PAYLOAD INT AND NOT A SIXTH REASON CODE.</b> "The order wants a
        /// <c>Seals</c>" as <c>ReasonNoInput = 5</c> would cost a mirrored constant, a
        /// name in <c>BLOCKED_REASON_NAMES</c>, a sentence in <c>BLOCKED_REASON_TEXT</c> and a
        /// legend swatch — <b>per item</b> — and it <i>still</i> would not carry the item. One int
        /// serves this reason and every future one, at the price of the table above, which is
        /// exactly the kind of thing that rots if it is not written down beside the field.</para>
        ///
        /// <para>⛔ <b>THE HAZARD OF THE SIXTH ELEMENT IS THE POSITIONAL ARRAY, NOT A DELTA GATE.</b>
        /// <see cref="BlockedCell"/> has NO <c>SameAs</c> and this channel has no field-list delta
        /// gate at all: <c>blocked</c> ships through <c>GameSession.Send</c>, which dedupes on the
        /// WHOLE serialized string, so a serialized <c>Detail</c> is inside the dedupe key by
        /// construction and the <see cref="DeviceCell"/> scar is unreachable here. What IS reachable
        /// is a decoder that destructures FIVE elements by index: it keeps working, silently, and
        /// drops the field. ⇒ <b>every index-reader of this tuple was censused and updated in the
        /// commit that added the element</b> — <c>client/src/wire/messages.js</c>'s
        /// <c>decodeBlocked</c> (the only one that reads past <c>[4]</c>), plus the three screenshot
        /// rigs that read <c>c[2]</c>/<c>c[3]</c>/<c>c[4]</c> for census lines
        /// (<c>blocked-shot.mjs</c>, <c>blocked-reach-shot.mjs</c>, <c>work-blocked-shot.mjs</c>),
        /// which are position-stable under an APPEND and were re-read to confirm it. The C# side is
        /// compiler-enforced: this constructor takes six arguments and has no default, so a
        /// construction site that was not updated does not build.</para>
        /// </summary>
        public readonly struct BlockedCell
        {
            public readonly int X, Y, Deck, Order, Reason, Detail;

            /// <param name="detail">Per-reason payload — see the table above. Pass
            /// <see cref="WireFormat.DetailNone"/> when the reason has nothing to add. NO DEFAULT
            /// VALUE, on purpose: a defaulted parameter would let a new construction site ship a
            /// silent <c>DetailNone</c> for a reason that has something to say, and the compiler is
            /// the only thing on this side of the wire that can catch that.</param>
            public BlockedCell(int x, int y, int deck, int order, int reason, int detail)
            { X = x; Y = y; Deck = deck; Order = order; Reason = reason; Detail = detail; }
        }

        /// <summary>
        /// Serialize the sparse blocked-order layer: one entry per refused site, in the caller's order.
        ///
        /// ORDER IS THE CALLER'S, AND IT MATTERS — same contract as <see cref="Zones"/>,
        /// <see cref="Marks"/>, <see cref="Items"/> and <see cref="Devices"/>. This method sorts
        /// nothing. <c>GameSession.BuildBlocked</c> emits digs on the z,y,x world walk (the
        /// <c>IJobSource</c> rule-3 scan order the three per-tile channels already use), then strips in
        /// <c>DeconstructSystem.Pending</c> list order, then builds in <c>BuildSystem.Pending</c> list
        /// order, then (M2-9) PENDING direct repair orders in CITIZEN STORE order, then (D5 follow-on,
        /// 2026-08-03) DROPPED direct repair orders in the same CITIZEN STORE order — five
        /// deterministic index
        /// walks over plain <c>List</c>s that are themselves saved, hashed state. No hash container's
        /// internal layout can reach the socket: the two repair walks probe a dictionary by crew id but
        /// never enumerate one, for exactly that reason.
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
                      .Append(',').Append(c.Reason.ToString(BlockedIc))
                      .Append(',').Append(c.Detail.ToString(BlockedIc)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }
    }
}
