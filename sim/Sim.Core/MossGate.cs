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
        /// surface that wants to say WHY calls <see cref="IsServerLive"/> and renders THIS sentence,
        /// and none of them re-derives the rule. Two surfaces do so today: the MOSS <c>exec</c>
        /// reply's stream-2 error line and the <c>operate</c> reply's reason. (⚠️ The TUI status line
        /// is NOT one of them and the older wording of this paragraph was wrong about it:
        /// <c>hosts/tui/GameLoop.cs:274,310</c> asks <see cref="IsServerLive"/> and then writes its
        /// own lower-case <i>"moss offline — repair a terminal"</i>. It is a second vocabulary for
        /// one fact and it is FILED, not fixed here — the TUI is not a shipping surface.)
        /// An event on the bus was considered and refused — <c>DoorStateChangedEvent</c> is published
        /// after a SUCCESSFUL write, and a refusal event would be a new event type consumed by one
        /// host while this one is consumed by two.</para>
        ///
        /// <para>⚠️ <b>IT MUST NOT READ LIKE M3-16's SENTENCE.</b> OD-O gives one vent a dead
        /// controller board, and its refusal (<i>CONTROLLER FAULT — BOARD UNRESPONSIVE</i>) comes
        /// from a different predicate about a different thing: this one is a property of the SHIP,
        /// that one of the TARGET. A player who cannot tell them apart is sent to repair the wrong
        /// machine, on the wrong deck. <b>One vocabulary, two facts.</b></para>
        ///
        /// <para>⭐ <b>THE LEAD IS STILL A <c>const</c>, AND IT IS THE HALF THAT NEVER VARIES.</b> The
        /// SHIP fact — <i>no terminal aboard is in service</i> — is the same on every ship, so it is
        /// a literal; the NEXT STEP is not, so it is composed by <see cref="OfflineRefusal"/> below.
        /// This constant is also the family's LEAD for
        /// <c>ThawGateTests.TheConsoleSentences_ArePairwiseDistinct</c>: pairwise distinctness is a
        /// property of the first four words, and those four words live HERE.</para>
        /// </summary>
        public const string OfflineLead = "MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE";

        /// <summary>
        /// ⭐⭐ <b>WHAT THE PLAYER WAS ASKING FOR WHEN THE SHIP SAID NO — so the refusal can answer
        /// THAT NOUN and not a different one.</b>
        ///
        /// <para>⛔ <b>THE DEFECT THIS EXISTS TO CLOSE, measured live 2026-08-03.</b> The sentence
        /// used to end <c>…REPAIR ONE TO REACH THE DOORS</c> <b>unconditionally</b>. A player who
        /// typed <c>thaw</c> was told <i>TYPE PODS</i>, typed <c>pods</c>, and was answered with a
        /// clause about DOORS — the wrong noun, at the exact moment they were doing the right thing.
        /// The owner's report was <i>"there is still no way to defreeze others"</i>. One vocabulary,
        /// but the tail must answer the ASK.</para>
        ///
        /// <para><b>ONE VALUE PER NOUN THE PLAYER CAN TYPE, AND NOT ONE PER OP.</b> The console's
        /// ops collapse onto the nouns a player asks ABOUT: the CRYO BAY (<see cref="Pods"/> —
        /// <c>pods</c> and <c>thaw</c>), the DOORS (<see cref="Doors"/> — the <c>doors</c> directory
        /// and the surviving operate handler), the VENTS (<see cref="Vents"/> — the <c>vents</c>
        /// directory), and everything else, which is genuinely just <i>the computer is off</i>
        /// (<see cref="Ship"/>). ⚠️ The older wording of this paragraph said <i>"three values, not
        /// one per op"</i> and gave <i>"splitting further would mean parsing the typed line to guess
        /// what <c>exec</c> was about"</i> as the reason. That reason is about <c>exec</c> and is
        /// unchanged — <c>exec</c> still gets <see cref="Ship"/>, because the line it carries is
        /// free text. It never applied to a DEDICATED TYPED NOUN: a <c>vents</c> op does not have to
        /// guess what it is about, and answering it <i>TO REACH THE DOORS</i> would be precisely the
        /// wrong-noun defect this enum exists to close, one costume along.</para>
        /// </summary>
        public enum Ask : byte
        {
            /// <summary>Reads and writes about the ship at large — <c>sys</c>, <c>exec</c>,
            /// <c>audit</c>, <c>open</c>/<c>set</c> (programs), <c>commission</c>.</summary>
            Ship = 0,
            /// <summary>Remote actuation of the DOORS OD-N put behind the server. (⚠️ The vents OD-N
            /// covers in the same breath now answer to <see cref="Vents"/>, which is a tail and not a
            /// second rule — see that member.)
            ///
            /// <para>⭐ <b>REACHABLE FROM THE SHIPPING PROMPT SINCE THE <c>doors</c> VERB.</b> §13.47
            /// filed this member as words no player could see: its only caller was
            /// <c>GameSession.HandleOperate</c>, and M3-15 had deleted the Room Zoom's OPERATE
            /// affordance, so no shipping client emitted <c>Cmd.operate</c> any more
            /// (<c>client/src/wire/session.js:96</c>). The <c>doors</c> directory op is a SECOND
            /// caller and it IS on the shipping surface: typing <c>doors</c> on a dark ship now
            /// answers <i>…TO REACH THE DOORS</i>, which is the right noun for the ask. The
            /// <c>operate</c> handler still survives until M4-8 and still uses this member.</para></summary>
            Doors = 1,
            /// <summary>The cryo bay — <c>pods</c> and <c>thaw</c>.</summary>
            Pods = 2,
            /// <summary>⭐ The VENTS — the <c>vents</c> directory (owner-ratified second noun,
            /// 2026-08-04). Reached from the shipping prompt, exactly as <see cref="Doors"/> is.
            ///
            /// <para>⛔ <b>IT IS NOT <see cref="Doors"/>, AND THE REASON IS THIS ENUM'S WHOLE
            /// PURPOSE.</b> <see cref="Doors"/>' tail reads <i>TO REACH THE DOORS</i>. A player who
            /// typed <c>vents</c> — on a dead deck, looking for the one machine that can give it
            /// air — being answered with a clause about DOORS is the owner-reported defect
            /// (<c>thaw</c> → <i>TYPE PODS</i> → a clause about DOORS) wearing a fourth costume. The
            /// two members carry the same GATE and different NOUNS, which is the split this type
            /// exists to make.</para></summary>
            Vents = 3,
        }

        /// <summary>The tail clause for one <see cref="Ask"/>. Its own function so the mapping is one
        /// table a test can walk, rather than three literals scattered through a composer.</summary>
        private static string AskWords(Ask ask)
        {
            switch (ask)
            {
                case Ask.Doors: return "TO REACH THE DOORS";
                case Ask.Pods: return "TO REACH THE PODS";
                case Ask.Vents: return "TO REACH THE VENTS";
                default: return "TO BRING MOSS ONLINE";
            }
        }

        /// <summary>
        /// ⭐⭐ <b>WHICH TERMINAL THE SHIP WANTS SERVICED — the noun the offline sentence was missing.</b>
        /// Returns the <see cref="Device"/> a repair would bring into service, or <c>null</c> when the
        /// ship carries no <c>Terminal</c> at all.
        ///
        /// <para><b>THE RULE, AND EVERY TERM OF IT IS A FACT ABOUT WHAT A REPAIR CAN FIX.</b>
        /// <see cref="IsLiveTerminal"/> has two terms — <c>Powered</c> and <c>Condition</c> — and a
        /// REPAIR moves exactly one of them. So:</para>
        /// <list type="number">
        ///   <item><b>Powered first.</b> A powered terminal below <c>maintain</c> is one service away
        ///   from being a server. An unpowered one is not: telling the player to REPAIR it would send
        ///   them to fix a machine whose fault is the grid. Preferring powered is the difference
        ///   between a next step and a wrong step.</item>
        ///   <item><b>Then the highest <c>Condition</c></b> — the one closest to the threshold, i.e.
        ///   the cheapest service. (<c>wear.def</c> tiers a repair by the consumable spent, so
        ///   "closest" is also "most likely to clear the bar in one go".)</item>
        ///   <item><b>Then the lowest <c>Device.Id</c></b> — the tie-break
        ///   <see cref="LiveServer"/> and <see cref="ThawGate.CommissionedConsoleName"/> already use.
        ///   Inherited, not re-decided.</item>
        /// </list>
        ///
        /// <para>⛔ <b><c>Powered</c> ORDERS THE CANDIDATES; IT DOES NOT FILTER THEM — and on a ship
        /// where EVERY terminal is dark that comparison is vacuous, so this names a machine whose
        /// fault is the grid.</b> FILED, not fixed (<c>MECHANICS.md</c> §13.47.8): unreachable on
        /// shipped content (the wreck's <c>term_moss</c> is powered at boot; the three fixture ships
        /// all carry a powered <c>term_hydro</c>), and the honest fix is a SECOND sentence — a new
        /// member of the pinned console family, which is a package. A FILTER would be worse: it
        /// returns <c>null</c>, drops the ship back to <i>REPAIR ONE</i>, and deletes the only noun
        /// the player has.</para>
        ///
        /// <para>⛔ <b>NO NAME LITERAL, for the reason the type header gives.</b> A
        /// <c>Name == "term_moss"</c> here would make the sentence lie on every other ship, which is
        /// the authored-name coupling <c>Simulation.cs:553-555</c> warns about. Pinned as a
        /// derivation, not as the wreck's answer.</para>
        ///
        /// <para>⚠️ <b>ON THE WRECK IT IS THE <c>Condition</c> TERM THAT DECIDES, AND THAT IS
        /// MEASURED.</b> <see cref="Device.Powered"/> is <c>true</c> by FIELD DEFAULT
        /// (<c>Device.cs:107</c>) and only <c>PowerSystem</c> ever clears it — so at plan-build time,
        /// before the first tick, <c>term_nav</c> reads <c>Powered = true</c> despite being off the
        /// flood network, and the two terminals are separated by 0.14 vs 0.03 alone. Once the sim has
        /// ticked, <c>term_nav</c> goes dark and BOTH terms agree. Either way the answer is
        /// <c>term_moss</c> — which is exactly why the <c>Powered</c> term is driven on a FIXTURE
        /// (<c>MossGateTests.ThePOWEREDTerminalIsNamed_EvenWhenTheDarkOneIsHealthier</c>, a flipped
        /// 2×2) and not on this ship: on this ship it is vacuous at tick 0.</para>
        ///
        /// <para>PURE: reads live sim state, mutates nothing, draws no RNG, allocates nothing. It is
        /// never called from a tick path — the refusal is composed on a host thread.</para>
        /// </summary>
        public static Device RepairCandidate(Simulation sim)
        {
            if (sim == null) return null;
            Device best = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Terminal) continue;
                if (best == null) { best = d; continue; }
                if (d.Powered != best.Powered) { if (d.Powered) best = d; continue; }
                if (d.Condition != best.Condition) { if (d.Condition > best.Condition) best = d; continue; }
                if (d.Id < best.Id) best = d;
            }
            return best;
        }

        /// <summary>
        /// ⛔ <b>THE REFUSAL, IN WORDS, AND IT NOW NAMES THE NEXT STEP.</b> The old sentence named
        /// neither WHICH terminal nor WHERE — <i>"REPAIR ONE"</i>, on a ship with two of them, one of
        /// which is on the dead deck behind a pressure frontier. The precedent was two hundred lines
        /// below in this same file: <see cref="NotCommissionedRefusal"/> has named its device since
        /// M3-4.
        ///
        /// <para><b>THE SHAPE:</b> <c>&lt;lead&gt;; REPAIR &lt;NAME&gt; ON DECK &lt;z&gt; AT
        /// &lt;x&gt;,&lt;y&gt; &lt;tail&gt;</c>. Every noun is derived —
        /// <see cref="RepairCandidate"/> for the name, <see cref="Device.Pos"/> for the place,
        /// <paramref name="ask"/> for the tail. Nothing here is authored, so nothing here can go
        /// stale when content moves a terminal.</para>
        ///
        /// <para>⭐ <b>WHY <c>DECK n AT x,y</c> AND NOT A ROOM WORD.</b> Measured, not preferred:
        /// the player-facing ROOM NAME does not exist at this seam. <c>RoomAnchor</c> carries an
        /// internal id (<c>cryobay</c>) and a <see cref="RoomType"/>; the rule that turns those into
        /// a name a player reads (CRYO BAY / ROOM B0) is <c>client/src/ui/decks-model.js</c>'s
        /// <c>displayName</c>, and <see cref="RoomType"/>'s own remarks record that printing the
        /// anchor id at a player is a DEFECT. Mirroring that rule into <c>Sim.Core</c> would be a
        /// FOURTH spelling of a vocabulary the repo already pins in three places — M2-18's
        /// <i>"one player confusion, two surfaces, and they must agree"</i> pointing the wrong way.
        /// <c>DECK n · x,y</c> is instead the MOSS pane's OWN location vocabulary
        /// (<c>client/src/ui/moss-model.js:1166</c>, the <c>sys</c> detail's <c>place</c> column) and
        /// the Overview's readback (<c>overview-model.js:179</c>), it needs no lookup at all, and it
        /// is exact.</para>
        ///
        /// <para>⚠️ <b>THE DEGENERATE ARM KEEPS THE OLD WORDS ON PURPOSE.</b> A ship with no
        /// <c>Terminal</c> aboard has nothing to name, so the sentence falls back to
        /// <i>REPAIR ONE</i> rather than inventing a device. Naming nothing is honest; naming
        /// <c>THE TERMINAL</c> on a ship that has none is not.</para>
        ///
        /// <para>⚠️ <b>ALLOCATES, AND THAT IS NEWLY TRUE OF THIS SENTENCE.</b> It was a <c>const</c>
        /// on the argument that it could reach a tick path. It cannot and never could:
        /// <see cref="SetDoorStateCommand.Execute"/> refuses with a bare <c>return;</c> and renders
        /// no string (its own remarks say so — <i>refuse by predicate, report by predicate</i>). Every
        /// caller is a host surface. <see cref="OfflineLead"/> stays a <c>const</c> for the family
        /// test, which needs a literal.</para>
        /// </summary>
        public static string OfflineRefusal(Simulation sim, Ask ask)
        {
            string tail = AskWords(ask);
            var d = RepairCandidate(sim);
            if (d == null || string.IsNullOrEmpty(d.Name))
                return OfflineLead + "; REPAIR ONE " + tail;

            return OfflineLead + "; REPAIR " + d.Name.ToUpperInvariant()
                 + " ON " + PlaceWords(d.Pos) + " " + tail;
        }

        /// <summary>
        /// ⭐ <b>WHERE A THING IS, IN THE CONSOLE'S OWN LOCATION VOCABULARY — <c>DECK 0 AT 16,7</c>.</b>
        /// Extracted from <see cref="OfflineRefusal"/> when the <c>doors</c> directory needed the same
        /// phrase, so that there is exactly ONE spelling of a place in <c>Sim.Core</c> rather than a
        /// second one that agrees today. (<see cref="OfflineRefusal"/> prefixes the preposition —
        /// <c>… ON DECK 0 AT 1,3 …</c> — because a directory ROW wants the phrase bare.)
        ///
        /// <para>§13.47.3's ruling stands unchanged and is not re-argued here: no ROOM WORD, because
        /// the player-facing room name does not exist at this seam and mirroring
        /// <c>decks-model.js</c>'s <c>displayName</c> into <c>Sim.Core</c> would be a FOURTH spelling
        /// of a vocabulary the repo already pins in three places.</para>
        ///
        /// <para>InvariantCulture on all three coordinates — the dev machine is de-DE.</para>
        /// </summary>
        public static string PlaceWords(Int3 pos)
        {
            var ic = System.Globalization.CultureInfo.InvariantCulture;
            return "DECK " + pos.Z.ToString(ic)
                 + " AT " + pos.X.ToString(ic) + "," + pos.Y.ToString(ic);
        }

        // ═══════════════════════════════════════════════ OD-P — the `doors` directory verb
        //
        // ⛔⛔ THE STALL THIS CLOSES, MEASURED IN LIVE PLAY (thaw-path audit, 2026-08-03).
        // Since OD-N the ship's doors answer ONLY to MOSS, and MOSS addresses a door BY NAME —
        // but NO SURFACE ANYWHERE NAMED ONE. Driven at the shipping prompt: `open` answers
        // UNKNOWN SYSTEM '', `open door` answers NO SUCH DEVICE 'DOOR', and `open door_d0_s1`
        // answers QUEUED OPEN(DOOR_D0_S1). The whole Regolith → Scrap → Parts → ControllerModule
        // chain — the thaw arc's spine, and therefore the opening of the game — sits behind
        // `door_d0_s1` and `door_d0_s2` on the shipping wreck. A player who cannot LEARN a door's
        // name cannot open the game. MOSS had a `pods` directory; it had no `doors`.
        //
        // ⛔ WHAT AUTHORISES THIS IS THE DEFECT, NOT OD-P. Read that row before citing it: it ends
        // "Future MOSS-OS expansion (`ls`, directories) is VISION, not chartered scope — file ideas
        // against M3-15/M3-4, NEVER IMPLEMENT FROM THIS ROW" (docs/ROADMAP.md §5). So this is not an
        // owner mandate being discharged; it is a PLAYTEST-BLOCKING DEFECT being closed, and OD-P is
        // the DESIGN PRECEDENT for the SHAPE of the closure — which is a different, smaller claim:
        //   * OD-P's ruling that "every printable character belongs to the PROMPT; screens are
        //     reached by TYPED COMMANDS only" is why this is a typed verb and not a key or a panel.
        //   * OD-P's standing vision — "MOSS should be the OS of the ship", "part might be an 'ls'
        //     command later, to read directories" — is why a DIRECTORY is the recognisable shape,
        //     with `pods` as the exact in-repo precedent. It also gates OD-N (doors are MOSS's).
        //
        // ⭐⭐ THE OWNER RATIFIED THE SHAPE ON 2026-08-04, AND SANCTIONED EXACTLY ONE MORE NOUN.
        // The paragraph that stood here said: "EXACTLY ONE VERB SHIPS… if you are here to add a
        // noun, take it to the owner first". It was taken to the owner (HANDOVER's owner list,
        // session H) and the ruling is: the typed `doors` shape is RIGHT, and **`vents` is the
        // sanctioned second noun in the SAME shape**. `DescribeVents` below is that noun and
        // nothing else.
        //
        // ⚠️ THE SELF-LIMIT SURVIVES THE RATIFICATION, ONE NOUN LARGER. Two nouns were ruled;
        // `machines`, `crew`, `rooms`, an `ls`, and a generic directory FRAMEWORK were not — and
        // OD-P's row still ends "NEVER IMPLEMENT FROM THIS ROW". So the two composers below are
        // SIBLINGS, not instances: they share `PlaceWords` and `UnnamedRow` (one spelling of a
        // place, one spelling of a nameless row) and nothing else, because their flag columns are
        // about different predicates on different commands. If you are here to add a THIRD noun,
        // take it to the owner first — and do not fold these two into a table on your way past.

        /// <summary>The listing's answer on a ship that carries no <see cref="DeviceKind.Door"/> at
        /// all. A directory that prints NOTHING is M3-13's defect (a screen that says nothing is a
        /// broken verb), so the empty case answers in words. Unreachable on shipped content — all
        /// four authored ships carry doors (wreck 16, grid 64, slice 19, perilune 19, censused at
        /// tick 40) — and driven on a fixture rather than asserted.</summary>
        public const string NoDoorsLine = "NO DOORS ABOARD";

        /// <summary>What a device with no <c>Device.Name</c> prints in a directory's id column. It
        /// cannot be addressed by <c>open</c> at all (the DSL resolves by name), so the honest row
        /// says so rather than fabricating a key the player would then type in vain — these listings
        /// exist precisely to be typed back. No authored ship has one.
        ///
        /// <para>⭐ ONE SPELLING, SHARED BY BOTH DIRECTORIES (<see cref="PlaceWords"/>'s rule): it was
        /// <c>UnnamedDoor</c> until <c>vents</c> needed the identical column, and a second literal
        /// that agrees today is how two vocabularies for one fact start.</para></summary>
        private const string UnnamedRow = "(UNNAMED)";

        /// <summary>
        /// ⭐⭐ <b>EVERY DOOR THE SHIP KNOWS, ONE PER LINE, SO THE NAME <c>open</c> NEEDS IS LEARNABLE
        /// IN THE GAME.</b> A header stating the census, then one row per door:
        /// <code>
        /// DOORS — 16 ABOARD · 2 OPEN · 14 SHUT
        /// DOOR_D0_S0 · DECK 0 AT 5,7 · OPEN
        /// DOOR_D0_S1 · DECK 0 AT 16,7 · SHUT
        /// </code>
        ///
        /// <para><b>ENUMERATED FROM LIVE DEVICE STATE, NEVER FROM THE PLAN.</b> The rows are
        /// <c>sim.Devices.Items</c> filtered by <see cref="DeviceKind.Door"/>. A read of
        /// <c>SlotGridPlanner</c>'s authoring (which is where these names are written) would be right
        /// at boot and wrong the moment a door is built, removed or restored from a save — and
        /// OPEN/SHUT is not a plan fact at all.</para>
        ///
        /// <para><b><see cref="Device.Id"/> ORDER, TAKEN EXPLICITLY.</b> <c>WireFormat.BuildPods</c>'s
        /// rule, for its reason: the order is what the player reads down, and it must not shuffle
        /// because a store compacted.</para>
        ///
        /// <para>⭐ <b>THE LOCK IS A COLUMN, NOT A SECOND VERB.</b>
        /// <see cref="SetDoorStateCommand.Execute"/> computes <c>open &amp;&amp; !IsLocked</c>, so a
        /// LOCKED door answers <c>open</c> by silently staying shut — the <i>invisible feedback is
        /// functional</i> defect exactly. A listing that showed OPEN/SHUT and hid the one flag that
        /// decides whether the verb it teaches will work would be teaching a dead key. (No authored
        /// ship locks a door today; the column is driven on a fixture.)</para>
        ///
        /// <para>⛔ <b>NO POWER COLUMN, and that is measured rather than trimmed.</b>
        /// <see cref="SetDoorStateCommand"/> carries no power gate — a door on a dark deck still
        /// opens — so <c>Powered</c> would be a column that changes nothing about the verb this
        /// listing serves, on a ship where eight of sixteen doors are unpowered. Printing it would
        /// invite the reader to conclude the opposite of the truth.</para>
        ///
        /// <para>ALLOCATES — a host reply to a player keystroke, never a tick path
        /// (<see cref="DescribeCommission"/>'s rule). Every number InvariantCulture; every word
        /// upper case, the console's voice.</para>
        /// </summary>
        public static System.Collections.Generic.List<string> DescribeDoors(Simulation sim)
        {
            var lines = new System.Collections.Generic.List<string>(24);
            var doors = new System.Collections.Generic.List<Device>(24);
            var devices = sim?.Devices?.Items;
            if (devices != null)
                for (int i = 0; i < devices.Count; i++)
                    if (devices[i].Kind == DeviceKind.Door) doors.Add(devices[i]);

            if (doors.Count == 0) { lines.Add(NoDoorsLine); return lines; }
            doors.Sort((a, b) => a.Id.CompareTo(b.Id));

            int open = 0;
            for (int i = 0; i < doors.Count; i++) if (doors[i].IsOpen) open++;

            var ic = System.Globalization.CultureInfo.InvariantCulture;
            lines.Add("DOORS — " + doors.Count.ToString(ic) + " ABOARD · "
                    + open.ToString(ic) + " OPEN · "
                    + (doors.Count - open).ToString(ic) + " SHUT");

            for (int i = 0; i < doors.Count; i++)
            {
                var d = doors[i];
                lines.Add((string.IsNullOrEmpty(d.Name) ? UnnamedRow : d.Name.ToUpperInvariant())
                        + " · " + PlaceWords(d.Pos)
                        + " · " + (d.IsOpen ? "OPEN" : "SHUT")
                        + (d.IsLocked ? " · LOCKED" : ""));
            }
            return lines;
        }

        // ═══════════════════════════════════════ the `vents` directory verb (owner-ratified noun)
        //
        // ⭐⭐ THE OWNER'S RULING, 2026-08-04: the typed `doors` shape is RATIFIED and `vents` is the
        // sanctioned SECOND NOUN in the same shape. This is owner-directed work — it is NOT a third
        // reading of OD-P, whose row still says "never implement from this row".
        //
        // ⛔ WHAT IT IS FOR, AND IT IS NOT THE SAME STALL `doors` CLOSED. OD-N put the ship's vents
        // behind MOSS in the same breath as its doors, and MOSS addresses a vent BY NAME. The wreck's
        // upper deck has exactly one source of air — `vent_d1`, OD-O's dead-board puzzle — and the
        // deck-0 life-support compartment has `vent_ls`, whose whole authored beat is "the player's
        // first act in this compartment is to open it". Both are keys that had to be typed and could
        // not be read. `pods` names the capsules; `doors` names the doors; nothing named a vent.

        /// <summary>The listing's answer on a ship that carries no <see cref="DeviceKind.AirVent"/>
        /// at all — <see cref="NoDoorsLine"/>'s rule, for its reason (M3-13: a screen that says
        /// nothing is a broken verb). Reachable on shipped content in a way the door line is NOT: a
        /// ship can plausibly carry no vent, and small test fixtures do.</summary>
        public const string NoVentsLine = "NO VENTS ABOARD";

        /// <summary>
        /// ⭐ <b>THE DEAD-BOARD COLUMN — <see cref="DescribeDoors"/>' <c>LOCKED</c>, on the predicate
        /// that actually decides a VENT.</b> <see cref="SetDeviceStateCommand.Execute"/> computes
        /// <c>_open.HasValue &amp;&amp; !DeviceFault.BlocksActuation(device)</c>, the same shape as
        /// the door command's <c>open &amp;&amp; !IsLocked</c>: a faulted vent answers the verb this
        /// listing teaches by silently not moving.
        ///
        /// <para>⛔ <b>IT IS DELIBERATELY NOT <see cref="DeviceFault.Refusal"/>.</b> That sentence
        /// (<i>CONTROLLER FAULT — BOARD UNRESPONSIVE</i>) belongs to the ACTUATION verb, is a member
        /// of the pairwise-distinct console-sentence family, and is unchanged by this package. This
        /// is a two-word COLUMN on a directory row — a listing is a READ, and a read must not
        /// impersonate a refusal. It borrows the refusal's noun (the BOARD) so a player who meets
        /// both recognises them as one fact.</para></summary>
        public const string BoardFaultFlag = "BOARD FAULT";

        /// <summary>
        /// ⭐⭐ <b>EVERY VENT THE SHIP KNOWS, ONE PER LINE — <see cref="DescribeDoors"/>' shape, on
        /// the noun the owner sanctioned second (2026-08-04).</b> A header stating the census, then
        /// one row per vent:
        /// <code>
        /// VENTS — 3 ABOARD · 2 OPEN · 1 SHUT
        /// VENT_CRYO · DECK 0 AT 10,1 · OPEN
        /// VENT_LS · DECK 0 AT 35,6 · SHUT
        /// VENT_D1 · DECK 1 AT 10,1 · OPEN · BOARD FAULT
        /// </code>
        /// (the shipping <c>--ship wreck</c>, measured on this tree and pinned verbatim by
        /// <c>VentsVerbTests.TheWreckListingIsPinnedVERBATIM</c> — never transcribed from here)
        ///
        /// <para><b>EVERY STRUCTURAL DECISION IS <see cref="DescribeDoors"/>' AND IS NOT RE-ARGUED
        /// HERE:</b> enumerated from LIVE <c>sim.Devices</c> state and never from the plan (OPEN/SHUT
        /// is not a plan fact at all); <see cref="Device.Id"/> order taken explicitly
        /// (<c>BuildPods</c>' rule — the order is what the player reads down); the census stated in a
        /// header rather than left to be counted; <see cref="UnnamedRow"/> for a nameless row;
        /// <see cref="NoVentsLine"/> for the degenerate arm; allocates, because it is a host reply to
        /// a keystroke and never a tick path; InvariantCulture on every number, upper case on every
        /// word.</para>
        ///
        /// <para>⭐ <b><see cref="DeviceKind.AirVent"/> ONLY — the noun the player typed.</b> A
        /// <see cref="DeviceKind.Scrubber"/> shares this device adapter and shares
        /// <c>ShipSystems</c>' <c>LifeSupportKinds</c> row, so "everything that moves air" was a
        /// real option. It is refused: <c>vents</c> is a NOUN, a scrubber is not a vent, and a
        /// directory that answers with a superset is the sixth trap shape (rows that are all
        /// plausibly right and none of them asked for). Pinned by an exclusion leg.</para>
        ///
        /// <para>⛔ <b>NO POWER AND NO CONDITION COLUMN — the door listing's ruling, and here the
        /// asymmetry it hides is stated out loud rather than left for a reader to trip over.</b>
        /// <see cref="SetDeviceStateCommand"/> gates the shutter on the SHIP (<see cref="IsServerLive"/>)
        /// and the BOARD (<see cref="DeviceFault"/>) and on nothing else, so <c>Powered</c> and
        /// <c>Condition</c> change nothing about the verb this listing teaches — printing them would
        /// invite the reader to conclude the opposite of the truth, exactly as on the doors.
        /// ⚠️ <b>BUT A VENT IS NOT A DOOR ONCE IT IS OPEN:</b> <c>AtmosphereSystem</c> injects only
        /// on <c>IsOpen &amp;&amp; Powered &amp;&amp; IsOperational</c> (and scaled by
        /// <see cref="Device.EffectiveRate"/>), so <c>OPEN</c> here is an honest statement about the
        /// SHUTTER and is not a promise of air. That gap is real, it is not this verb's to close (the
        /// LEDGER and the room's own pressure are where air is answered), and it is FILED rather than
        /// silently columned in.</para>
        /// </summary>
        public static System.Collections.Generic.List<string> DescribeVents(Simulation sim)
        {
            var lines = new System.Collections.Generic.List<string>(8);
            var vents = new System.Collections.Generic.List<Device>(8);
            var devices = sim?.Devices?.Items;
            if (devices != null)
                for (int i = 0; i < devices.Count; i++)
                    if (devices[i].Kind == DeviceKind.AirVent) vents.Add(devices[i]);

            if (vents.Count == 0) { lines.Add(NoVentsLine); return lines; }
            vents.Sort((a, b) => a.Id.CompareTo(b.Id));

            int open = 0;
            for (int i = 0; i < vents.Count; i++) if (vents[i].IsOpen) open++;

            var ic = System.Globalization.CultureInfo.InvariantCulture;
            lines.Add("VENTS — " + vents.Count.ToString(ic) + " ABOARD · "
                    + open.ToString(ic) + " OPEN · "
                    + (vents.Count - open).ToString(ic) + " SHUT");

            for (int i = 0; i < vents.Count; i++)
            {
                var v = vents[i];
                lines.Add((string.IsNullOrEmpty(v.Name) ? UnnamedRow : v.Name.ToUpperInvariant())
                        + " · " + PlaceWords(v.Pos)
                        + " · " + (v.IsOpen ? "OPEN" : "SHUT")
                        // ⭐ THE FLAG IS ASKED OF THE COMMAND'S OWN PREDICATE, not of `v.Faulted`.
                        // `DeviceFault.BlocksActuation` is what `SetDeviceStateCommand` calls; asking
                        // the field here would be a second copy of the rule that agrees only until
                        // the rule grows a term (M3-16's "refuse by predicate, report by predicate").
                        + (DeviceFault.BlocksActuation(v) ? " · " + BoardFaultFlag : ""));
            }
            return lines;
        }

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
        /// <para>⭐ <b>IT TAKES THE <see cref="Simulation"/> NOW, AND BOTH REFUSAL ARMS NEED IT.</b>
        /// <see cref="CommissionRefusal.NoServer"/> renders <see cref="OfflineRefusal"/>, which
        /// resolves a terminal off the ship; <see cref="CommissionRefusal.NoModule"/> appends the
        /// SOURCE clause, which reads the recipe table off <see cref="SimDefs"/>. The verdict stays
        /// <b>numbers, never prose</b> (<see cref="ThawVerdict"/>'s rule) — the sentence is still
        /// composed exactly once, here.</para>
        ///
        /// <para>ALLOCATES — host and test only, never a tick path (the <see cref="ThawGate.Describe"/>
        /// rule, which is why <see cref="OfflineLead"/> stays a <c>const</c>).</para>
        /// </summary>
        public static string DescribeCommission(Simulation sim, in CommissionVerdict v)
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
                    // ⭐ THE CLAUSE THAT JOINS THE TWO SCREENS. Before it, this sentence stated a
                    // shortfall and stopped: "SHIP HAS 0" with no hint that the answer is one screen
                    // away in MOSS's own FABRICATION row. See `SourceClause`.
                    return "COMMISSIONING NEEDS " + v.Cost.ToString(ic) + " " + item
                         + " — SHIP HAS " + v.UnitsAboard.ToString(ic)
                         + SourceClause(sim, CommissionDeviceCommand.Currency);
                case CommissionRefusal.NoServer:
                default:
                    // The SHIP's own sentence, not a second one. The one thing a refusal may never
                    // be is silent, so the default arm answers rather than returning "".
                    // Ask.Ship: the player typed `commission`, and what a repair buys them here is
                    // the computer itself — not a door and not the bay.
                    return OfflineRefusal(sim, Ask.Ship);
            }
        }

        /// <summary>
        /// ⭐⭐ <b>WHERE THE THING THE SHIP HASN'T GOT COMES FROM — derived from the recipe table, not
        /// written down.</b> Returns <c>"; A MACHINE SHOP MAKES THEM FROM 2 PARTS"</c> on the shipped
        /// defs, or <c>""</c> when nothing aboard's recipe produces <paramref name="item"/>.
        ///
        /// <para>⛔ <b>THE DEFECT, measured live 2026-08-03.</b>
        /// <c>COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0</c> is a complete statement of a
        /// shortfall and a complete non-answer to the only question it raises. The fact is ONE SCREEN
        /// AWAY — MOSS's own <c>sys</c> lists a FABRICATION system and the machine shop in it — and a
        /// player who does not already know the crafting chain has no route from the refusal to the
        /// screen. One appended clause joins them.</para>
        ///
        /// <para><b>DERIVED, AND THE DERIVATION IS THE POINT.</b> <c>SimDefs.Recipes</c> is indexed by
        /// <c>(int)DeviceKind</c> (<c>SimDefs.cs:997</c>), so the maker of an item is a SEARCH over
        /// that array, not a literal: re-point <c>ControllerModule</c> at a different station in
        /// <c>content/core/SimDefs/recipes.def</c> and this clause names the new one. That is what
        /// keeps it from becoming the <c>BLOCKED_ORDER_NAMES</c> defect — a hand-maintained mirror
        /// that was right when it was written and silently wrong four packages later.</para>
        ///
        /// <para><b>FIRST MATCH WINS, in <c>DeviceKind</c> order.</b> The shipped table has exactly one
        /// producer per item and there is no second-source concept in the sim; if content ever authors
        /// two, this names the lower-<c>DeviceKind</c> one — the same inherited tie-break shape as
        /// <see cref="LiveServer"/>, and stated so a later reader does not read determinism into an
        /// accident.</para>
        ///
        /// <para>⚠️ <b>NO PLURALISATION AND NO OUTPUT COUNT — <c>MAKES THEM</c>.</b>
        /// <see cref="ThawGate.ItemWords"/>'s rule is that this game does not pluralise, and a clause
        /// carrying <c>OutputCount</c> would have to ("MAKES 1 CONTROLLER MODULE"). The input count IS
        /// carried, because a player pricing the detour needs it and it is the number the recipe row
        /// actually states.</para>
        /// </summary>
        private static string SourceClause(Simulation sim, ItemKind item)
        {
            var defs = sim?.Defs;
            var recipes = defs?.Recipes;
            if (recipes == null) return "";
            for (int i = 0; i < recipes.Length; i++)
            {
                var r = recipes[i];
                if (!r.Defined || r.Output != item) continue;
                var ic = System.Globalization.CultureInfo.InvariantCulture;
                return "; A " + MachineWords((DeviceKind)i) + " MAKES THEM FROM "
                     + r.InputCount.ToString(ic) + " " + ThawGate.ItemWords(r.Input);
            }
            return "";
        }

        /// <summary>
        /// A workstation's <see cref="DeviceKind"/> in the words a refusal sentence uses.
        /// <see cref="ThawGate.ItemWords"/>'s shape one enum over — an explicit arm per member the
        /// shipped recipe table can reach, and a total fallback so a content-authored station still
        /// gets a word rather than an empty one.
        ///
        /// <para>⚠️ <b>IT HAS NO CLIENT MIRROR AND MUST NOT GROW ONE.</b> <c>ItemWords</c> is pinned
        /// against <c>ITEM_WORDS</c> in <c>client/src/wire/messages.js</c> because the wire carries an
        /// <c>ItemKind</c> BYTE and the client spells it. Nothing on the wire carries a
        /// <see cref="DeviceKind"/> that needs spelling in prose — this text crosses as a finished
        /// sentence — so there is exactly one spelling and no seam to pin.</para>
        /// </summary>
        private static string MachineWords(DeviceKind kind)
        {
            switch (kind)
            {
                case DeviceKind.MachineShop: return "MACHINE SHOP";
                case DeviceKind.SalvageRecycler: return "SALVAGE RECYCLER";
                case DeviceKind.Fabricator: return "FABRICATOR";
                default: return kind.ToString().ToUpperInvariant();
            }
        }
    }
}
