using System.Text;
using Perilune.Sim;

namespace Perilune.Web
{
    /// <summary>
    /// ⭐⭐ D2 (2026-08-02) — <b>THE `alerts` CHANNEL: ONE DERIVED LINE THAT NAMES A CAPSULE BEFORE
    /// ITS PRICE RISES.</b>
    ///
    /// <para><b>THE DEFECT IT CLOSES.</b> The M3 milestone demo (finding D2) watched the thaw ladder
    /// decay under the player: Mbeki's capsule went <c>2 PARTS</c> → <c>1 CONTROLLER MODULE</c>
    /// inside 100 sim-minutes and <b>the ship said nothing at all</b>. The owner's ruling
    /// (2026-08-02) was to keep the decay as a feature, slow it, and SURFACE it. The slowing is
    /// <c>ThawGate</c>'s re-scaled band table plus the wreck's re-authored capsule conditions; this
    /// file is the surfacing.</para>
    ///
    /// <para>⛔ <b>WHY THIS IS NOT A CHRONICLE EVENT, MEASURED RATHER THAN PREFERRED.</b> The same
    /// demo's finding D6 is that the Chronicle is a <b>200-entry ring drowned in brownout spam</b> —
    /// a real event posted there is evicted before a player ever opens the MOSS console to read it.
    /// An announcement in a log that eats itself is indistinguishable from silence, which is the
    /// thing being fixed. ⇒ <b>DERIVED PER RENDER FROM LIVE SIM STATE, ALWAYS VISIBLE WHILE IT IS
    /// TRUE</b>, exactly like <see cref="EndingBanner"/>: no event, no queue, no expiry, nothing to
    /// miss by looking away.</para>
    ///
    /// <para>⛔ <b>AND IT IS A SIBLING OF THE ENDING BAR, NOT A SECOND SENTENCE INSIDE IT.</b>
    /// <c>WireFormat.Ending.cs</c>'s own header forbids growth (<i>"this is not an ending screen and
    /// must not grow into one"</i>, OD-M item 4 = A) and <b>M5-1 owns the ending</b>. Sharing that
    /// channel would also have made the two facts mutually exclusive, and they are not: a ship whose
    /// crew is dying is precisely the ship whose capsules are decaying unattended.</para>
    ///
    /// <para>⭐ <b>THIS BAR IS A DELIBERATE PRE-PAYMENT ON M5-2 / T17 — THE ALERT STACK.</b> It is
    /// named <c>alerts</c> (plural) and its payload is <c>{"type":"alerts","text":"…"}</c> for that
    /// reason: when M5-2 arrives it should REPLACE the single <c>text</c> field with a list and keep
    /// the channel, the client cache and the Overview slot. D2 ships exactly ONE alert — the
    /// capsule-decay warning — because that is the one the demo proved the game needs, and a stack
    /// with one row in it is a stack nobody can design against. <b>M5-2: start here.</b></para>
    ///
    /// <para><b>WHY A SEPARATE <c>partial</c> FILE</b> — <c>WireFormat.cs</c> is a spine file
    /// (CLAUDE.md) and this package leaves it at ZERO DIFF; <c>WireFormat.Pods.cs</c> (M3-4) and
    /// <c>WireFormat.Ending.cs</c> (M3-5) set the precedent, and a partial shares the class's private
    /// helpers (<c>AppendString</c>) so nothing is duplicated to buy the separation.</para>
    ///
    /// <para><b>A VIEW CHANNEL.</b> It reads sim state and writes none, publishes no event and draws
    /// no RNG — <c>GameSession.cs:1862-1863</c>'s rule: view channels move no determinism hash. The
    /// five pins are unexposed by construction, and that is measured, not argued (see this lane's
    /// report).</para>
    /// </summary>
    public static partial class WireFormat
    {
        /// <summary>
        /// <c>{"type":"alerts","text":"…"}</c>. <c>text</c> is empty when the ship has nothing to
        /// warn about — the client hides the bar on the empty string, so "all quiet" is a state the
        /// channel EXPRESSES rather than an absence the client has to infer from a channel that
        /// stopped arriving (the <see cref="Ending"/> rule, verbatim).
        ///
        /// <para>⚠️ No <c>over</c>-style code rides beside it, and that IS the difference from
        /// <see cref="Ending"/>: there is one alert kind today, so a code would carry no
        /// information. M5-2 adds one per row when there is more than one row to tell apart —
        /// <i>a code with no sentence is unrenderable and a sentence with no code is unstylable</i>
        /// bites when there are two things to style, not one.</para>
        /// </summary>
        public static string Alerts(string text)
        {
            var sb = new StringBuilder(96);
            sb.Append("{\"type\":\"alerts\",\"text\":");
            AppendString(sb, text ?? "");
            sb.Append('}');
            return sb.ToString();
        }

        /// <summary>
        /// ⭐ THE LINE, DERIVED FROM THE SIM AND FROM NOTHING CACHED. Pure: reads live state,
        /// mutates nothing, allocates only the string it returns (and only when there is one).
        ///
        /// <para><b>THE SIM PICKS THE CAPSULE, THIS PICKS THE WORDS.</b>
        /// <c>ThawGate.CapsuleNearestToRungCrossing</c> owns "which capsule, and is it close
        /// enough" — it reads the SAME <c>BandFloors</c> array <c>ThawGate.RungOf</c> prices the
        /// thaw from, so the warning can never name an edge the price does not have. A host-side
        /// scan with its own copy of the band edges would be the second authority this repo keeps
        /// deleting.</para>
        ///
        /// <para><b>NEAREST-TO-CROSSING, ONE LINE.</b> Several capsules can be inside the margin at
        /// once (they wear at the same rate, so on the shipped wreck they arrive in a queue rather
        /// than a crowd); the bar names the one about to cross and the <b>POD BAY</b> — MOSS
        /// <c>pods</c>, typed — is the detail view that lists all seven with their prices.</para>
        ///
        /// <para><b>NO POSSESSIVE, ON PURPOSE.</b> <c>… — MBEKI — THAW PRICE RISES SOON</c> uses the
        /// em-dash apposition <see cref="ThawGate.Describe"/> already uses (<c>THAW ACCEPTED —
        /// OZAWA — 4 min</c>) rather than <c>MBEKI'S</c>: a possessive needs a rule for names ending
        /// in <c>s</c>, and this repo's stated position on exactly that class of table is <i>"NO
        /// PLURALISATION, on purpose … a pluralisation table would be a second place for the
        /// vocabulary to drift"</i>. ALL CAPS matches the surface it lands on (the Overview's own
        /// islands — LEDGER, HOLD, the ORDERS bar, the ENDING bar).</para>
        /// </summary>
        public static string DecayAlert(Simulation sim)
        {
            if (sim == null) return "";
            var pod = ThawGate.CapsuleNearestToRungCrossing(sim, out _);
            if (pod == null) return "";
            string who = CryoSystem.SleeperName(pod.Name ?? "").ToUpperInvariant();
            return who.Length == 0
                ? "CAPSULE DECAYING — A THAW PRICE RISES SOON"
                : "CAPSULE DECAYING — " + who + " — THAW PRICE RISES SOON";
        }
    }
}
