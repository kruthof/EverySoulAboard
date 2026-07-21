using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// The render inputs and rendered text for one eulogy (VISION "deaths produce eulogies
    /// delivered by the closest friend, referencing REAL shared memories"). Host-readable
    /// so the later L6 background job can build an LLM prose prompt from ONLY real memories —
    /// it must never invent a memory, so it reads <see cref="MemoryLines"/> (verbatim entries
    /// pulled from the friend's real mind) and the two speakers, and nothing else.
    ///
    /// This record is transient host-facing state, NOT sim-canonical: the eulogy's canonical
    /// effects are the <see cref="HistoryKind.Eulogy"/> history entry (HIST-saved/hashed) and
    /// the grief memories (MEMS-saved/hashed). The record is not saved and does not enter any
    /// hash — a reload rebuilds it only as future deaths occur (like the mind store itself,
    /// which is host-owned).
    /// </summary>
    public sealed class EulogyRecord
    {
        public long Tick;
        public uint DeadId;
        public string DeadName;

        /// <summary>The mourner (closest living friend), or 0 for the ship's-log fallback.</summary>
        public uint FriendId;
        public string FriendName;

        /// <summary>The verbatim shared-memory lines quoted (0–3), each a REAL entry in the
        /// friend's mind — the anti-hallucination contract for the prose upgrade.</summary>
        public IReadOnlyList<string> MemoryLines;

        /// <summary>The deterministic template eulogy — also the history entry's text.</summary>
        public string Text;
    }

    /// <summary>
    /// Eulogy renderer (WS-NARRATIVE N5): on a <see cref="CitizenDiedEvent"/> it finds the
    /// dead's closest living friend, gathers the memories they genuinely SHARED, and writes an
    /// immediate deterministic eulogy — in the friend's voice, quoting 1–3 real memory lines —
    /// into the ship's <see cref="HistorySystem"/> (a <see cref="HistoryKind.Eulogy"/> entry,
    /// hence into the Chronicle). It also lays down grief: 0.9 importance to the mourner, 0.5
    /// broadcast to the rest of the crew. There is NO LLM dependency here — the prose upgrade
    /// is a later L6 job that reads <see cref="EulogyRecord"/> and builds a prompt from only
    /// the real memory lines this system already selected.
    ///
    /// CLOSEST FRIEND: argmax over living citizens of the SocialSystem opinion held TOWARD the
    /// dead (<c>GetOpinion(living, dead)</c>). Only a STRICTLY POSITIVE opinion counts as a
    /// friend; ties resolve to the lowest citizen id (deterministic). If no living citizen felt
    /// positively about the dead — the sole survivor died, or there are no edges — there is no
    /// mourner and the eulogy degrades to a ship's-log line. The opinion edges survive the
    /// dead's removal from the store (SocialSystem never prunes them), so the lookup still works
    /// one tick after the death.
    ///
    /// SHARED MEMORY rule (documented, deterministic): a friend memory <c>m</c> is "shared" with
    /// the dead when EITHER its text names the dead (references them — e.g. an argument/bond line
    /// carries the other party's name) OR the dead's mind holds a memory at the SAME tick
    /// (they co-experienced one event — a bond, an argument, an alarm they both heard). Candidates
    /// rank by importance desc, then tick desc (most recent), then insertion order; the top 3 are
    /// quoted VERBATIM, so every quoted fragment is provably a real memory in a real mind.
    ///
    /// REGISTRATION: host-registered after <see cref="MemorySystem"/> (both after the event
    /// publishers), exactly like MemorySystem itself — a contract request; it is not in the
    /// pure-sim <see cref="SystemStack"/>, so the determinism pin is untouched. It is not an
    /// <see cref="IStatefulSystem"/>: its canonical writes ride the HIST + MEMS chapters, so it
    /// folds into no hash of its own. <see cref="IntervalTicks"/> is 1 because the event bus is
    /// double-buffered per tick — a coarser sampler would miss the death. Quiet ticks (no death)
    /// read an empty span and allocate nothing.
    /// </summary>
    public sealed class EulogySystem : ISimSystem
    {
        public string Name => "Eulogy";
        public int IntervalTicks => 1;

        public const float GriefFriendImportance = 0.9f;
        public const float GriefBroadcastImportance = 0.5f;
        public const int MaxQuotedLines = 3;
        private const string GriefTag = "grief";

        private readonly MindState _minds;
        private readonly SocialSystem _social;
        private readonly HistorySystem _history;

        /// <summary>Every eulogy rendered this session, in order — host-readable for the prose
        /// upgrade and the chronicle/HUD. Transient (not saved/hashed).</summary>
        public readonly List<EulogyRecord> Records = new List<EulogyRecord>();

        /// <summary>The most recent eulogy, or null.</summary>
        public EulogyRecord Last => Records.Count > 0 ? Records[Records.Count - 1] : null;

        public EulogySystem(MindState minds, SocialSystem social, HistorySystem history)
        {
            _minds = minds ?? throw new System.ArgumentNullException(nameof(minds));
            _social = social ?? throw new System.ArgumentNullException(nameof(social));
            _history = history ?? throw new System.ArgumentNullException(nameof(history));
        }

        public void Tick(Simulation sim)
        {
            var deaths = sim.Events.Read<CitizenDiedEvent>();
            for (int i = 0; i < deaths.Length; i++)
                BuildEulogy(sim, deaths[i]);
        }

        private void BuildEulogy(Simulation sim, in CitizenDiedEvent death)
        {
            long tick = sim.TickCount;
            string deadName = !string.IsNullOrEmpty(death.Name) ? death.Name : "a crew member";

            Citizen friend = ClosestFriend(sim, death.CitizenId);

            if (friend == null)
            {
                // No mourner: the ship keeps the only record. Still a grief broadcast — the
                // crew (if any) registers the loss even without a close bond to the dead.
                string logText = $"The ship's log records the passing of {deadName}. " +
                                 "No one was near enough to grieve.";
                _history.Record(tick, logText, HistoryKind.Eulogy, death.CitizenId);
                BroadcastGrief(sim, deadName, exceptId: 0);
                Records.Add(new EulogyRecord
                {
                    Tick = tick,
                    DeadId = death.CitizenId,
                    DeadName = deadName,
                    FriendId = 0,
                    FriendName = "",
                    MemoryLines = System.Array.Empty<string>(),
                    Text = logText,
                });
                return;
            }

            string friendName = !string.IsNullOrEmpty(friend.Name) ? friend.Name : "a shipmate";
            var lines = CollectSharedLines(death.CitizenId, friend.Id, death.Name);
            string text = RenderEulogy(friendName, deadName, lines);

            _history.Record(tick, text, HistoryKind.Eulogy, death.CitizenId, friend.Id);

            // Grief: the mourner carries it hardest (0.9); everyone else registers the loss (0.5).
            WriteGrief(friend.Id, $"I said goodbye to {deadName}.", GriefFriendImportance, tick);
            BroadcastGrief(sim, deadName, exceptId: friend.Id);

            Records.Add(new EulogyRecord
            {
                Tick = tick,
                DeadId = death.CitizenId,
                DeadName = deadName,
                FriendId = friend.Id,
                FriendName = friendName,
                MemoryLines = lines,
                Text = text,
            });
        }

        /// <summary>Living citizen with the highest STRICTLY-POSITIVE opinion toward the dead;
        /// ties broken by lowest id; null when none felt positively about them.</summary>
        private Citizen ClosestFriend(Simulation sim, uint deadId)
        {
            Citizen best = null;
            float bestOpinion = 0f; // strictly-positive gate: a 0/negative regard is no friend
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.Id == deadId) continue;
                float o = _social.GetOpinion(c.Id, deadId);
                if (o > bestOpinion || (best != null && o == bestOpinion && c.Id < best.Id))
                {
                    bestOpinion = o;
                    best = c;
                }
            }
            return best;
        }

        /// <summary>The verbatim friend-memory lines shared with the dead (see class note).</summary>
        private List<string> CollectSharedLines(uint deadId, uint friendId, string deadName)
        {
            var lines = new List<string>();
            if (!_minds.Minds.TryGet(friendId, out var friendMind)) return lines;

            // Same-tick co-experience: the ticks at which the dead's mind holds a memory.
            HashSet<long> deadTicks = null;
            if (_minds.Minds.TryGet(deadId, out var deadMind))
            {
                deadTicks = new HashSet<long>();
                var de = deadMind.Memory.Episodic;
                for (int i = 0; i < de.Count; i++) deadTicks.Add(de[i].Tick);
            }

            bool hasName = !string.IsNullOrEmpty(deadName);
            var candidates = new List<MemoryEntry>();
            var episodic = friendMind.Memory.Episodic;
            for (int i = 0; i < episodic.Count; i++)
            {
                var m = episodic[i];
                bool namesDead = hasName && m.Text != null &&
                                 m.Text.IndexOf(deadName, System.StringComparison.Ordinal) >= 0;
                bool coExperienced = deadTicks != null && deadTicks.Contains(m.Tick);
                if (namesDead || coExperienced) candidates.Add(m);
            }

            // Rank: importance desc, then tick desc (most recent), then insertion order (stable).
            candidates.Sort((a, b) =>
            {
                int byImp = b.Importance.CompareTo(a.Importance);
                if (byImp != 0) return byImp;
                return b.Tick.CompareTo(a.Tick);
            });

            int take = candidates.Count < MaxQuotedLines ? candidates.Count : MaxQuotedLines;
            for (int i = 0; i < take; i++) lines.Add(candidates[i].Text ?? "");
            return lines;
        }

        /// <summary>Friend's voice; quotes the real shared lines verbatim, or names the silence.</summary>
        private static string RenderEulogy(string friendName, string deadName, List<string> lines)
        {
            if (lines.Count == 0)
                return $"{friendName} stood for {deadName}, and had no words — only the silence of the watch.";

            var sb = new System.Text.StringBuilder();
            sb.Append(friendName).Append(" spoke for ").Append(deadName).Append(". ");
            for (int i = 0; i < lines.Count; i++)
            {
                sb.Append('"').Append(lines[i]).Append('"');
                if (i < lines.Count - 1) sb.Append(' ');
            }
            return sb.ToString();
        }

        private void BroadcastGrief(Simulation sim, string deadName, uint exceptId)
        {
            string text = $"We buried {deadName}.";
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.Id == exceptId) continue;
                WriteGrief(c.Id, text, GriefBroadcastImportance, sim.TickCount);
            }
        }

        private void WriteGrief(uint citizenId, string text, float importance, long tick)
        {
            if (!_minds.Minds.TryGet(citizenId, out var mind)) return;
            mind.Memory.Add(new MemoryEntry
            {
                Tick = tick,
                Text = text,
                Importance = importance,
                Tag = GriefTag,
            });
        }
    }
}
