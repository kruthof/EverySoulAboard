using System.Text;
using Perilune.Sim;

namespace Perilune.Web
{
    /// <summary>
    /// ⭐ M3-5 — <b>THE `ending` CHANNEL: ONE LINE, AND IT IS THE WHOLE PLAYER-FACING CLAIM.</b>
    ///
    /// <para>Two sentences, never more, and the surface shows at most one at a time:</para>
    /// <list type="bullet">
    /// <item><b>the grace</b> — every soul is down and a capsule is counting down. Without this the
    /// player watches their last pawn die and then stares at a still ship for four minutes; the
    /// charter's own words are <i>"if the grace is silent the player believes the game ended and
    /// quits"</i>. The Chronicle line that names both people arrives when the capsule OPENS, and
    /// the Chronicle lives on the MOSS console — so on the standard surface this banner is the only
    /// thing between the death and the wake.</item>
    /// <item><b>the ending</b> — <c>CryoSystem.RunEnded</c>. The lose state, said out loud.</item>
    /// </list>
    ///
    /// <para>⛔ <b>THIS IS NOT AN ENDING SCREEN AND MUST NOT GROW INTO ONE.</b> OD-M item 4 = A:
    /// M3-5 ships the sim state + the Chronicle lines + a one-line banner; <b>M5-1 owns THE
    /// ENDING</b> and builds the screen. A screen here would duplicate M5-1; nothing here would
    /// leave the loss silent, which is the failure this package exists to close.</para>
    ///
    /// <para><b>WHY A SEPARATE <c>partial</c> FILE</b> — <c>WireFormat.cs</c> is a spine file
    /// (CLAUDE.md), and M3-4's <c>WireFormat.Pods.cs</c> set the precedent: a partial shares the
    /// class's private helpers (<c>AppendString</c>) so nothing is duplicated to buy the
    /// separation.</para>
    /// </summary>
    public static partial class WireFormat
    {
        /// <summary>
        /// <c>{"type":"ending","text":"…","over":false}</c>. <c>text</c> is empty when the run is
        /// ordinary — the client hides the bar on the empty string, so "nothing to say" is a state
        /// the channel can express rather than an absence the client has to infer from a channel
        /// that stopped arriving.
        ///
        /// <para><c>over</c> rides beside the text rather than being inferred from it, for the
        /// <see cref="MossPods"/> rule this repo already keeps: <i>a code with no sentence is
        /// unrenderable and a sentence with no code is unstylable</i>. The client styles the ending
        /// differently from the grace, and it must not have to match on prose to do it.</para>
        /// </summary>
        public static string Ending(string text, bool over)
        {
            var sb = new StringBuilder(96);
            sb.Append("{\"type\":\"ending\",\"text\":");
            AppendString(sb, text ?? "");
            sb.Append(",\"over\":").Append(over ? "true" : "false");
            sb.Append('}');
            return sb.ToString();
        }

        /// <summary>
        /// ⭐ THE LINE, DERIVED FROM THE SIM AND FROM NOTHING CACHED. Pure: reads live state,
        /// mutates nothing, allocates only the string it returns (and only when there is one).
        ///
        /// <para><b>THE THREE ANSWERS.</b> <c>RunEnded</c> ⇒ the ending. Nobody alive and a capsule
        /// cycling ⇒ the grace, naming the sleeper the ship elected. Anything else ⇒ <c>""</c>.</para>
        ///
        /// <para>⚠️ <b>IT ASKS THE SIM WHICH CAPSULE, IT DOES NOT GUESS.</b> The pod is
        /// <c>CryoSystem.GraceCapsuleId</c> — the capsule the ship elected, or, when the player had
        /// already PAID for a cycle at the moment the crew hit zero (in which case the reprieve is
        /// deliberately not spent and there is no elected id), the capsule that is counting. The
        /// sim resolves that precedence because only it knows what the reprieve did; a host-side
        /// scan for "the pod that is cycling" would name the wrong person whenever both are true,
        /// and reading only the elected id would go SILENT in the paid-cycle case — a dead ship, a
        /// capsule counting down and a blank screen.</para>
        ///
        /// <para>ALL CAPS matches the surface it lands on (the Overview's own islands — LEDGER,
        /// HOLD, the ORDERS bar). The occupant name comes from <c>CryoSystem.SleeperName</c>, the
        /// sim's own inverse of the <c>"pod_" + who</c> authoring convention, never a second copy of
        /// it.</para>
        /// </summary>
        public static string EndingBanner(Simulation sim)
        {
            var cryo = CryoSystem.Of(sim);
            if (cryo == null) return "";
            if (cryo.RunEnded) return "EVERY SOUL ABOARD IS DEAD — THE RUN IS OVER.";
            uint graceId = cryo.GraceCapsuleId(sim);
            if (graceId == 0) return "";

            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var pod = devices[i];
                if (pod.Id != graceId) continue;
                string who = CryoSystem.SleeperName(pod.Name ?? "").ToUpperInvariant();
                return who.Length == 0
                    ? "ALL HANDS DOWN — THE SHIP IS WAKING A SLEEPER."
                    : "ALL HANDS DOWN — THE SHIP IS WAKING " + who + ".";
            }
            return "";
        }

        /// <summary>Is the run over? Kept beside <see cref="EndingBanner"/> so the host never reads
        /// the flag through one seam and the sentence through another.</summary>
        public static bool RunIsOver(Simulation sim)
        {
            var cryo = CryoSystem.Of(sim);
            return cryo != null && cryo.RunEnded;
        }
    }
}
