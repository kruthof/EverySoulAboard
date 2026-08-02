namespace Perilune.Sim
{
    /// <summary>
    /// ⭐⭐ OD-N — <b>IS A MOSS SERVER LIVE ABOARD?</b> The ship-wide gate that decides whether the
    /// two remote-actuation commands (<see cref="SetDoorStateCommand"/>,
    /// <see cref="SetDeviceStateCommand"/>) may write anything at all.
    ///
    /// <para><b>THE OWNER'S DECISION, quoted (OD-N, <c>docs/ROADMAP.md</c> §5, 2026-07-31):</b>
    /// <i>"The doors should be open and closed via MOSS and MOSS should only be accessible once a
    /// MOSS server has been repaired (has to be in an open room of course)."</i></para>
    ///
    /// <para>⛔ <b>A RULE, NOT A TUNABLE — and that is the whole reason this package is pin-neutral.</b>
    /// The <c>ThawGate</c> precedent, verbatim: no hashed state, no def field, neither checksum. This
    /// type has <b>no instance state and no static mutable state</b>; every call re-reads
    /// <c>Device.Kind</c>, <c>Device.Powered</c> and <c>Device.Condition</c>, all of them already
    /// hashed and already saved. A cached "MOSS is live" latch on <c>Simulation</c> would be a new
    /// hashed field and a re-pin of P1/P2/P3, which is the shape mutation 8 exists to redden.</para>
    ///
    /// <para><b>ZERO-ALLOC.</b> <see cref="IsServerLive"/> is called from
    /// <see cref="SetDoorStateCommand.Execute"/>, which runs inside <c>Simulation.Tick</c>'s command
    /// drain. One linear pass over <c>sim.Devices.Items</c>, no LINQ, no closure, no string.</para>
    ///
    /// <para>⭐ <b>THE TWO TIERS, AND WHY THEY LIVE IN TWO FILES.</b> OD-N cuts the console's
    /// authority in half and the two halves are asked by two different predicates:</para>
    /// <list type="bullet">
    ///   <item><b>REPAIRED</b> — <see cref="IsServerLive"/>, HERE. Manual actuation, one typed line
    ///   at a time: <c>open</c>/<c>close</c>/<c>lock</c>/<c>unlock</c>, <c>set &lt;dev&gt;.rate</c>,
    ///   property reads, the ledger detail and the audit ring.</item>
    ///   <item><b>COMMISSIONED</b> — <see cref="ThawGate.IsCommissionedConsole"/>, THERE. Installed
    ///   programs, the thaw, and (M3-4) the pod bay. It additionally requires
    ///   <c>Device.Scriptable</c>, i.e. a <c>ControllerModule</c> fitted.</item>
    /// </list>
    /// <para>Naming them apart is deliberate: a reader who arrives after both exist must be able to
    /// see the split in the code without reading a charter.</para>
    ///
    /// <para>⛔ <b>THE PREDICATE IS ABOUT THE SHIP, NEVER ABOUT THE CALLER.</b> MOSS's own writes
    /// leave as these same two commands (<c>Sim.Dsl/DeviceAdapters.cs</c>), so a gate asking <i>"did
    /// this come from MOSS?"</i> would need a provenance flag on the command — new state, and a lie
    /// the moment an installed program outlives the terminal that installed it. Asking <i>"is a MOSS
    /// server live aboard?"</i> makes MOSS's own path self-consistent by construction and needs
    /// nothing new on the wire.</para>
    ///
    /// <para>⚠️ <b>ANY HEALTHY POWERED TERMINAL COUNTS, and there is deliberately NO NAME LITERAL.</b>
    /// A <c>Name == "term_moss"</c> test in <c>sim/Sim.Core/</c> would make every other ship
    /// ungateable and is exactly the authored-name coupling <c>Simulation.cs:553-555</c> warns about.
    /// The known consequence, ruled on by the integrator 2026-07-31 and kept: on the wreck, repairing
    /// <c>term_nav</c> would also light the console. Measured, that is theoretical — <c>term_nav</c>
    /// is at (41,2,1), <c>Powered = false</c>, <c>NetworkId = 0</c> and unreachable in the boot flood,
    /// so by the time a player can reach and power it they have already opened the doors the console
    /// was gating. <b>It goes live the moment content authors a second reachable powered Terminal on
    /// a wrecked ship — a content-review item, not a code one.</b></para>
    /// </summary>
    public static class MossGate
    {
        /// <summary>
        /// ⭐ <b>THE TERM, AND THE THRESHOLD IS <c>MaintainBelow</c> RATHER THAN <c>FailBelow</c> —
        /// A CORRECTION THIS PACKAGE MEASURED RATHER THAN INHERITED.</b>
        ///
        /// <para>The package was chartered against <c>Powered &amp;&amp; IsOperational</c>. Driven on
        /// the shipping <c>--ship wreck</c> at tick 40, that term is <b>TRUE before the player does
        /// anything</b>: <see cref="Device.IsOperational"/> is <c>Condition &gt;= FailBelow</c>
        /// (<c>Device.cs:119</c>), <c>Terminal</c>'s <c>fail</c> is <b>0.02</b>
        /// (<c>MachineDefs.cs:42</c>), and <c>term_moss</c> is authored at <b>0.14</b>
        /// (<c>Sim.Gen/AuthoredShips.cs:2059</c>). ⇒ the gate would have shipped OPEN and OD-N would
        /// have delivered nothing.</para>
        ///
        /// <para><c>MaintainBelow</c> is <b>0.20</b> — the sim's own <i>"this machine wants a
        /// service"</i> line. <c>term_moss</c> fails it at boot by 0.06 and clears it after ANY
        /// service (<c>wear.def:18-20,61</c>: Parts → 1.00 · Seals → 0.90 · bare hands → 0.60 ·
        /// Swarf → 0.45). The wreck's 0.14 was authored to sit below <c>wear.wreck_threshold</c>
        /// (0.25), which is the band that means "wrecked" here — never <c>fail</c>.</para>
        ///
        /// <para>⚠️ <b><c>Powered</c> IS ASKED SEPARATELY AND THAT IS NOT DOUBLE-STATING.</b>
        /// <see cref="Device.IsOperational"/> folds the condition half and <b>nothing else</b>; it
        /// never reads <c>Powered</c>. A terminal with a healthy board and no power is not a
        /// server.</para>
        ///
        /// <para>PURE: reads live sim state, mutates nothing, draws no RNG, publishes no event,
        /// allocates nothing. Both determinism twins get the same answer.</para>
        /// </summary>
        public static bool IsServerLive(Simulation sim)
        {
            if (sim == null) return false;
            var defs = sim.Defs;
            if (defs == null) return false;
            float maintainBelow = defs.Machines[(int)DeviceKind.Terminal].MaintainBelow;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (IsLiveTerminal(devices[i], maintainBelow)) return true;
            return false;
        }

        /// <summary>
        /// ⭐ THE REPAIRED TIER'S TERM, EXTRACTED SO THERE IS EXACTLY ONE OF IT. Both
        /// <see cref="IsServerLive"/> (which early-returns, because it runs inside
        /// <c>SetDoorStateCommand.Execute</c>'s tick path) and <see cref="LiveServer"/> (which scans
        /// for the lowest <c>Device.Id</c>) ask THIS. Written as a static helper rather than by
        /// having one call the other so the tick path keeps its early return; a mutation to the
        /// term still moves both callers, which is the property that mattered.
        /// </summary>
        private static bool IsLiveTerminal(Device d, float maintainBelow)
            => d.Kind == DeviceKind.Terminal && d.Powered && d.Condition >= maintainBelow;

        /// <summary>
        /// ⭐ M3-17 — <b>WHICH TERMINAL IS THE CONSOLE SPEAKING THROUGH?</b> The lowest-<c>Device.Id</c>
        /// terminal <see cref="IsServerLive"/>'s own term accepts, or <c>null</c> when MOSS is dark.
        ///
        /// <para><b>WHY IT HAS TO EXIST</b> — the exact reason
        /// <see cref="ThawGate.CommissionedConsoleName"/> gives one tier up. The MOSS prompt addresses
        /// the pseudo-terminal <c>@console</c> (spec §1.3), a free-text key with no device behind it,
        /// so a typed <c>commission</c> has no terminal to fit a module TO unless the sim resolves
        /// one. The client may not pick: <c>Device.Condition</c> and <c>Device.Scriptable</c> are the
        /// two facts the tiers turn on and neither has ever reached the wire.</para>
        ///
        /// <para>⚠️ <b>THE TIE-BREAK IS INHERITED, NOT RE-DECIDED.</b> A ship with two live terminals
        /// answers through the lower-Id one — the same known consequence
        /// <see cref="ThawGate.CommissionedConsoleName"/> records, and the same reason (no name
        /// literal may live in <c>Sim.Core</c>). On the shipping wreck it is not reachable: the only
        /// other Terminal, <c>term_nav</c>, is unpowered and off the flood network.</para>
        ///
        /// <para>Returns the <see cref="Device"/> rather than its name because the caller needs the
        /// TILE — <see cref="CommissionDeviceCommand"/> is addressed by <c>Int3</c>, and a host that
        /// looked the name up a second time could address a different device than the one this gate
        /// judged. Zero-alloc; no mutation, no RNG.</para>
        /// </summary>
        public static Device LiveServer(Simulation sim)
        {
            if (sim == null) return null;
            var defs = sim.Defs;
            if (defs == null) return null;
            float maintainBelow = defs.Machines[(int)DeviceKind.Terminal].MaintainBelow;
            Device found = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (found != null && d.Id >= found.Id) continue;
                if (!IsLiveTerminal(d, maintainBelow)) continue;
                found = d;
            }
            return found;
        }

        /// <summary>
        /// ⛔ <b>THE REFUSAL, IN WORDS — and it may never be a bare <c>return;</c>.</b> This repo has
        /// paid three owner reports for <i>invisible feedback is functional</i>; a door that refuses
        /// silently and a door that is broken are the same picture.
        ///
        /// <para><b>REFUSE BY PREDICATE, REPORT BY PREDICATE.</b> The command is the authority; every
        /// surface that wants to say WHY calls <see cref="IsServerLive"/> and renders THIS constant,
        /// and none of them re-derives the rule. Three surfaces do so today: the MOSS <c>exec</c>
        /// reply's stream-2 error line, the <c>operate</c> reply's reason, and the TUI status line.
        /// An event on the bus was considered and refused — <c>DoorStateChangedEvent</c> is published
        /// after a SUCCESSFUL write, and a refusal event would be a new event type consumed by one
        /// host while this constant is consumed by three.</para>
        ///
        /// <para>⚠️ <b>IT MUST NOT READ LIKE M3-16's SENTENCE.</b> OD-O gives one vent a dead
        /// controller board, and its refusal (<i>CONTROLLER FAULT — BOARD UNRESPONSIVE</i>) comes
        /// from a different predicate about a different thing: this one is a property of the SHIP,
        /// that one of the TARGET. A player who cannot tell them apart is sent to repair the wrong
        /// machine, on the wrong deck. <b>One vocabulary, two facts.</b></para>
        ///
        /// <para>A <c>const string</c> and not a composed one: it carries no number, so it needs no
        /// formatter and reaches a tick path without allocating.</para>
        /// </summary>
        public const string OfflineRefusal =
            "MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR ONE TO REACH THE DOORS";

        /// <summary>
        /// ⭐ <b>THE COMMISSIONED TIER FOR A PROGRAM — AND IT IS <see cref="SetScriptCommand"/>'s OWN
        /// PREDICATE, RESTATED IN ONE PLACE RATHER THAN A SECOND ONE INVENTED HERE.</b>
        ///
        /// <para>The command reads: <i>if a device carries this name and it is not
        /// <c>Scriptable</c>, refuse.</i> Both halves matter, and the second is a decision the
        /// command's own remarks already record: <b>a terminal id with NO device behind it is
        /// allowed</b>, because the id is a free-text key (<c>hosts/scenario</c> and several tests
        /// drive <c>term_main</c> with no device at all) and refusing those would turn "no device"
        /// into "no automation" for callers who never had a device to fit a module to.</para>
        ///
        /// <para>⛔ <b>WHY NOT <see cref="ThawGate.IsCommissionedConsole"/>, WHICH IS ALSO THE
        /// "COMMISSIONED TIER".</b> That predicate additionally requires the named terminal to EXIST,
        /// to be <c>Powered</c> and to be above its <c>fail</c> floor — correct for a THAW, which is
        /// a physical act performed at a specific console, and wrong here, because it would make the
        /// console REPORT a refusal the command it is about to enqueue would not make. A surface that
        /// says no while the sim says yes is the same defect as a surface that says yes while the sim
        /// says no, pointing the other way. <b>The two commissioned-tier questions are different
        /// questions and they live beside their own commands.</b></para>
        ///
        /// <para>Zero-alloc; <c>Ordinal</c> name comparison, through the command's own finder, so the
        /// de-DE dev machine cannot make the two disagree.</para>
        /// </summary>
        public static bool CanInstallProgram(Simulation sim, string terminalName)
        {
            if (sim == null) return false;
            return !SetScriptCommand.TryFindNamedDevice(sim, terminalName, out var terminal)
                || terminal.Scriptable;
        }

        /// <summary>
        /// The COMMISSIONED tier's refusal — the second half of the split, said in words for the
        /// first time. <c>SetScriptCommand</c> (<c>Commands.cs:376</c>) has always refused to install
        /// a program on a terminal with no <c>ControllerModule</c> fitted, and it has always done so
        /// with a bare <c>return;</c>.
        ///
        /// <para>⚠️ ALLOCATES (it names the terminal). Host and test only — it is never reached from a
        /// tick path, which is why the ship-gate sentence above is a <c>const</c> and this one is a
        /// method. Upper case and InvariantCulture-free by construction: no number crosses it.</para>
        /// </summary>
        public static string NotCommissionedRefusal(string terminalName)
            => "MOSS IS NOT COMMISSIONED — FIT A CONTROLLER MODULE TO "
             + (string.IsNullOrEmpty(terminalName) ? "THE TERMINAL" : terminalName.ToUpperInvariant());

        // ══════════════════════════════════════════ M3-17 — CROSSING THE SPLIT: the commission verb
        //
        // ⭐⭐ THE ACT THAT MOVES A CONSOLE FROM THE REPAIRED TIER TO THE COMMISSIONED ONE, AND UNTIL
        // THIS PACKAGE NO SHIPPING SURFACE COULD ASK FOR IT. `CommissionDeviceCommand` has existed
        // since E0-6 and `GameSession.HandleCommission` since the build palette; nothing on any
        // surface ever sent the wire command, so the opening arc dead-ended one step before the pod
        // bay (HANDOVER 2026-08-02, "THE PLAYTEST BLOCKER"). What was missing was a SENDER.
        //
        // ⛔ THE VERB SITS AT THE **REPAIRED** TIER, WHICH IS THE ONLY PLACE IT CAN SIT. Putting it
        // at the commissioned tier would require a commissioned console to commission a console.
        // A DARK terminal still refuses — with the SHIP's sentence, not a target-side one.

        /// <summary>Why a typed <c>commission</c> was refused. Ordered WORST-FIRST, and the order IS
        /// the contract (<c>GameSession.HandleMoss</c>'s stated ship-then-target rule): a player on a
        /// dead-computer ship must be told to repair a terminal, not to go and craft a module.</summary>
        public enum CommissionRefusal : byte
        {
            /// <summary>Accepted — a module is about to be fitted.</summary>
            None = 0,
            /// <summary>No terminal aboard clears the REPAIRED tier. The ship's own sentence.</summary>
            NoServer = 1,
            /// <summary>The console already carries a <c>ControllerModule</c>.</summary>
            AlreadyCommissioned = 2,
            /// <summary>Nothing to fit: fewer loose modules aboard than <c>build.commission_cost</c>.</summary>
            NoModule = 3,
        }

        /// <summary>
        /// What a typed <c>commission</c> resolved to — the verdict, the terminal it judged, and the
        /// two numbers a refusal has to be able to say. <b>Numbers, never prose</b>
        /// (<see cref="ThawVerdict"/>'s rule): the sentence is composed once, in
        /// <see cref="DescribeCommission"/>, on a host thread.
        /// </summary>
        public readonly struct CommissionVerdict
        {
            public readonly CommissionRefusal Reason;
            /// <summary>The terminal this verdict is about; empty only for <see cref="CommissionRefusal.NoServer"/>.</summary>
            public readonly string TerminalName;
            /// <summary>Its tile — what <see cref="CommissionDeviceCommand"/> is addressed by.</summary>
            public readonly Int3 Pos;
            /// <summary><c>build.commission_cost</c> at the moment of the ask.</summary>
            public readonly int Cost;
            /// <summary>Loose <see cref="CommissionDeviceCommand.Currency"/> aboard.</summary>
            public readonly int UnitsAboard;

            public CommissionVerdict(CommissionRefusal reason, string terminalName, Int3 pos,
                                     int cost, int unitsAboard)
            {
                Reason = reason;
                TerminalName = terminalName ?? "";
                Pos = pos;
                Cost = cost;
                UnitsAboard = unitsAboard;
            }

            public bool Allowed => Reason == CommissionRefusal.None;
        }

        /// <summary>
        /// ⭐⭐ <b>EVALUATE A TYPED <c>commission</c>.</b> PURE — reads live sim state, spends nothing,
        /// mutates nothing, draws no RNG. <see cref="CommissionDeviceCommand"/> stays the authority
        /// and re-checks its own two target terms at the tick boundary; this function exists so the
        /// console can SAY what the ship is about to do, in the same frame as the keystroke
        /// (<c>rimworld-reference.md</c> §2.2, the same construction the thaw uses).
        ///
        /// <para><b>THE TERMS, WORST-FIRST.</b> (1) the SHIP — is any terminal repaired? (2) the
        /// TARGET — is it already commissioned? (3) the PRICE, <b>LAST</b>, so a refusal never bills:
        /// M3-3's contract, and here it is structural rather than careful, because this function
        /// cannot spend at all.</para>
        ///
        /// <para><b>WHICH TERMINAL.</b> <paramref name="requestedTid"/> is honoured only when it names
        /// a terminal that is itself live; otherwise the subject is <see cref="LiveServer"/>'s. The
        /// prompt sends <c>@console</c>, which names no device, so in ordinary play the subject is
        /// always the resolved one. A dark terminal named explicitly does NOT become the subject —
        /// term 1 has already passed at that point (some other terminal is live), and answering
        /// about a console the ship is not speaking through would be a different bug.</para>
        /// </summary>
        public static CommissionVerdict EvaluateCommission(Simulation sim, string requestedTid)
        {
            if (sim == null || sim.Defs == null)
                return new CommissionVerdict(CommissionRefusal.NoServer, "", default, 0, 0);

            int cost = sim.Defs.Build.CommissionCost;
            int aboard = CommissionDeviceCommand.Affordable(sim);

            // ── term 1: THE SHIP ────────────────────────────────────────────────────────────────
            var target = LiveServer(sim);
            if (target == null)
                return new CommissionVerdict(CommissionRefusal.NoServer, "", default, cost, aboard);

            if (!string.IsNullOrEmpty(requestedTid))
            {
                float maintainBelow = sim.Defs.Machines[(int)DeviceKind.Terminal].MaintainBelow;
                var devices = sim.Devices.Items;
                for (int i = 0; i < devices.Count; i++)
                {
                    var d = devices[i];
                    // Ordinal — a device name is an identifier and the dev machine is de-DE.
                    if (!string.Equals(d.Name, requestedTid, System.StringComparison.Ordinal)) continue;
                    if (IsLiveTerminal(d, maintainBelow)) target = d;
                    break;
                }
            }

            // ── term 2: THE TARGET ──────────────────────────────────────────────────────────────
            if (target.Scriptable)
                return new CommissionVerdict(CommissionRefusal.AlreadyCommissioned,
                                             target.Name, target.Pos, cost, aboard);

            // ── term 3: THE PRICE, LAST ─────────────────────────────────────────────────────────
            if (aboard < cost)
                return new CommissionVerdict(CommissionRefusal.NoModule,
                                             target.Name, target.Pos, cost, aboard);

            return new CommissionVerdict(CommissionRefusal.None,
                                         target.Name, target.Pos, cost, aboard);
        }

        /// <summary>
        /// ⭐ THE SENTENCE THE CONSOLE SAYS — one line, upper case, every number InvariantCulture,
        /// and <b>a named reason with a number wherever one exists</b> (M3-3's style).
        ///
        /// <para>⚠️ <b>ITS REFUSALS JOIN THE PINNED CONSOLE FAMILY</b> — pairwise distinct AND
        /// distinct in their first four words, guarded by
        /// <c>ThawGateTests.TheConsoleSentences_ArePairwiseDistinct</c>. Two of the leads deliberately
        /// avoid the terminal's name so the lead cannot change with content:
        /// <c>ALREADY COMMISSIONED — PROGRAMS…</c> and <c>COMMISSIONING NEEDS n CONTROLLER MODULE…</c>.
        /// <see cref="CommissionRefusal.NoServer"/> reuses <see cref="OfflineRefusal"/> rather than
        /// inventing a second ship sentence — refuse by predicate, report by predicate.</para>
        ///
        /// <para>⚠️ <b>AND IT MUST NOT COLLIDE WITH <see cref="ThawGate"/>'s RUNG SENTENCE</b>, which
        /// composes <c>NEEDS 1 CONTROLLER MODULE — SHIP HAS 0</c> for a thaw whose rung is a module.
        /// Naming the ACT (<c>COMMISSIONING NEEDS …</c>) is what keeps two different asks about the
        /// same item from arriving as one message.</para>
        ///
        /// <para>ALLOCATES — host and test only, never a tick path (the <see cref="ThawGate.Describe"/>
        /// rule, which is why <see cref="OfflineRefusal"/> stays a <c>const</c>).</para>
        /// </summary>
        public static string DescribeCommission(in CommissionVerdict v)
        {
            var ic = System.Globalization.CultureInfo.InvariantCulture;
            string who = string.IsNullOrEmpty(v.TerminalName)
                ? "THE TERMINAL" : v.TerminalName.ToUpperInvariant();
            string item = ThawGate.ItemWords(CommissionDeviceCommand.Currency);
            switch (v.Reason)
            {
                case CommissionRefusal.None:
                    return "COMMISSION ACCEPTED — " + who + " — " + v.Cost.ToString(ic) + " " + item
                         + " FITTED; PROGRAMS AND THE POD BAY ARE OPEN";
                case CommissionRefusal.AlreadyCommissioned:
                    return "ALREADY COMMISSIONED — PROGRAMS AND THE POD BAY ARE OPEN ON " + who;
                case CommissionRefusal.NoModule:
                    return "COMMISSIONING NEEDS " + v.Cost.ToString(ic) + " " + item
                         + " — SHIP HAS " + v.UnitsAboard.ToString(ic);
                case CommissionRefusal.NoServer:
                default:
                    // The SHIP's own sentence, not a second one. The one thing a refusal may never
                    // be is silent, so the default arm answers rather than returning "".
                    return OfflineRefusal;
            }
        }
    }
}
