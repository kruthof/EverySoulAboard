using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Perilune.Dsl;
using Perilune.Glyph;
using Perilune.Sim;

namespace Perilune.Web
{
    /// <summary>
    /// The web skin's wire authority — PURE (state in, compact-JSON string out; no sockets,
    /// no sim mutation), so every payload is unit- and golden-testable without a server.
    /// The browser owns the LOOK; this layer only ships the SEMANTIC ids the GlyphMapper
    /// produced (glyph char code, GlyphColor byte, GlyphAttr byte) exactly as AnsiPaint ships
    /// them to the terminal. A hand-rolled JSON writer (repo culture — no System.Text.Json
    /// dependency, full control of shape) keeps every number InvariantCulture, so a frame
    /// serializes byte-for-byte identically on any machine/locale.
    ///
    /// Message shapes (all one-line, no whitespace):
    ///   frame   {"type":"frame","deck":0,"lens":"none","w":64,"h":20,"cells":[[g,f,b,a],...]}
    ///   metrics {"type":"metrics","day":..,"dayFrac":..,"power":..,...}
    ///   log     {"type":"log","lines":["..",".."]}
    ///   legend  {"type":"legend","lines":[...]}
    ///   inspect {"type":"inspect","lines":[...]}
    ///   status  {"type":"status","text":"..","speed":"1x","paused":false}
    ///   chat    {"type":"chat","sid":..,"ev":"start|delta|line|effect|end", ...per-ev fields}
    ///   citizen {"type":"citizen","cid":..,"name":"..","role":"..","mood":"..","traits":[..],"portrait":".."}
    ///   device  {"type":"device","kind":"terminal","tid":".."}
    ///   roster  {"type":"roster","crew":[{"cid":..,"name":"..","role":"..","mood":"..","morale":0.8,
    ///            "task":"..","portrait":"..","deck":0,"x":3,"y":4},..]}
    /// cells is a FLAT row-major array (index = y*w + x), length == w*h — the browser rebuilds
    /// the grid. glyph is the char's code point; fg/bg/attr are the raw enum bytes.
    /// </summary>
    public static class WireFormat
    {
        private static readonly CultureInfo Ic = CultureInfo.InvariantCulture;

        /// <summary>Serialize one projected deck. <paramref name="lensName"/> is the lowercase
        /// lens label (browser matches the legend to it). <paramref name="crew"/> lists the
        /// visible crew on this deck as (x, y, pv, cid) — pv is a stable per-citizen
        /// portrait/sprite variant so each crew member keeps their face, cid is the citizen's
        /// sim entity id so the client can address them (talk/select). The tuple is
        /// append-only: [x,y,pv] grew a 4th cid element. The session only includes citizens
        /// whose projected tile actually shows '@' (fog-gated upstream), so the wire never
        /// leaks an unexplored position.</summary>
        public static string Frame(GlyphBuffer map, int deck, string lensName, int selX, int selY,
                                   IReadOnlyList<(int X, int Y, int Pv, uint Cid)> crew = null)
        {
            var sb = new StringBuilder(map.Width * map.Height * 12 + 64);
            sb.Append("{\"type\":\"frame\",\"deck\":").Append(deck.ToString(Ic));
            sb.Append(",\"lens\":");
            AppendString(sb, lensName);
            sb.Append(",\"w\":").Append(map.Width.ToString(Ic));
            sb.Append(",\"h\":").Append(map.Height.ToString(Ic));
            // Selected crew tile on this deck (client draws the reticle); omitted when none.
            if (selX >= 0) sb.Append(",\"sel\":[").Append(selX.ToString(Ic)).Append(',').Append(selY.ToString(Ic)).Append(']');
            if (crew != null && crew.Count > 0)
            {
                sb.Append(",\"crew\":[");
                for (int i = 0; i < crew.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    sb.Append('[').Append(crew[i].X.ToString(Ic))
                      .Append(',').Append(crew[i].Y.ToString(Ic))
                      .Append(',').Append(crew[i].Pv.ToString(Ic))
                      .Append(',').Append(crew[i].Cid.ToString(Ic)).Append(']');
                }
                sb.Append(']');
            }
            sb.Append(",\"cells\":[");
            bool first = true;
            for (int y = 0; y < map.Height; y++)
            {
                for (int x = 0; x < map.Width; x++)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    var c = map[x, y];
                    sb.Append('[').Append(((int)c.Glyph).ToString(Ic))
                      .Append(',').Append(((int)c.Fg).ToString(Ic))
                      .Append(',').Append(((int)c.Bg).ToString(Ic))
                      .Append(',').Append(((int)c.Attr).ToString(Ic))
                      .Append(']');
                }
            }
            sb.Append("]}");
            return sb.ToString();
        }

        /// <summary>Serialize the sidebar snapshot. Fractions are 0..1; Co2Ppm is raw ppm.</summary>
        public static string Metrics(ShipMetricsSnapshot m)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"metrics\"");
            sb.Append(",\"day\":").Append(m.Day.ToString(Ic));
            Field(sb, "dayFrac", m.DayFraction);
            Field(sb, "power", m.Power);
            Field(sb, "oxygen", m.Oxygen);
            Field(sb, "co2ppm", m.Co2Ppm);
            Field(sb, "water", m.Water);
            Field(sb, "food", m.Food);
            Field(sb, "heat", m.Heat);
            Field(sb, "structural", m.Structural);
            Field(sb, "morale", m.Morale);
            sb.Append('}');
            return sb.ToString();
        }

        public static string Log(IReadOnlyList<string> lines) => Lines("log", lines);
        public static string Legend(IReadOnlyList<string> lines) => Lines("legend", lines);
        public static string Inspect(IReadOnlyList<string> lines) => Lines("inspect", lines);

        /// <summary>Top status strip: transient hint + speed label + paused flag.</summary>
        public static string Status(string text, string speedLabel, bool paused)
        {
            var sb = new StringBuilder(96);
            sb.Append("{\"type\":\"status\",\"text\":");
            AppendString(sb, text ?? "");
            sb.Append(",\"speed\":");
            AppendString(sb, speedLabel ?? "");
            sb.Append(",\"paused\":").Append(paused ? "true" : "false");
            sb.Append('}');
            return sb.ToString();
        }

        // ------------------------------------------------------------------- dialogue (W1)

        /// <summary>
        /// One dialogue event on conversation <paramref name="sid"/>. Only the fields relevant
        /// to <paramref name="ev"/> are emitted, so a payload never carries a null placeholder:
        ///   start  → cid, name   (the crew member the conversation opened with)
        ///   delta  → seq, text   (a streamed token chunk, ordered by seq)
        ///   line   → who, text   (a completed line; who is "player"|"crew"|a speaker id)
        ///   effect → text        (a human-readable applied-effect note)
        ///   end    → reason      (why the conversation closed: "done"|"unavailable"|..)
        /// The header (type, sid, ev) is always present. All strings are JSON-escaped.
        /// </summary>
        public static string ChatStart(int sid, uint cid, string name)
        {
            var sb = ChatHeader(sid, "start");
            sb.Append(",\"cid\":").Append(cid.ToString(Ic));
            sb.Append(",\"name\":"); AppendString(sb, name ?? "");
            return sb.Append('}').ToString();
        }

        public static string ChatDelta(int sid, int seq, string text)
        {
            var sb = ChatHeader(sid, "delta");
            sb.Append(",\"seq\":").Append(seq.ToString(Ic));
            sb.Append(",\"text\":"); AppendString(sb, text ?? "");
            return sb.Append('}').ToString();
        }

        public static string ChatLine(int sid, string who, string text)
        {
            var sb = ChatHeader(sid, "line");
            sb.Append(",\"who\":"); AppendString(sb, who ?? "");
            sb.Append(",\"text\":"); AppendString(sb, text ?? "");
            return sb.Append('}').ToString();
        }

        public static string ChatEffect(int sid, string text)
        {
            var sb = ChatHeader(sid, "effect");
            sb.Append(",\"text\":"); AppendString(sb, text ?? "");
            return sb.Append('}').ToString();
        }

        public static string ChatEnd(int sid, string reason)
        {
            var sb = ChatHeader(sid, "end");
            sb.Append(",\"reason\":"); AppendString(sb, reason ?? "");
            return sb.Append('}').ToString();
        }

        private static StringBuilder ChatHeader(int sid, string ev)
        {
            var sb = new StringBuilder(96);
            sb.Append("{\"type\":\"chat\",\"sid\":").Append(sid.ToString(Ic));
            sb.Append(",\"ev\":\"").Append(ev).Append('"');
            return sb;
        }

        /// <summary>Crew identity card for the inspector. <paramref name="role"/>/<paramref name="mood"/>
        /// and <paramref name="traits"/> come from the citizen's mind persona when the host has one,
        /// else empty. <paramref name="portrait"/> is a stable per-citizen face id ("" when unknown).</summary>
        public static string Citizen(uint cid, string name, string role, string mood,
                                     IReadOnlyList<string> traits, string portrait)
        {
            var sb = new StringBuilder(160);
            sb.Append("{\"type\":\"citizen\",\"cid\":").Append(cid.ToString(Ic));
            sb.Append(",\"name\":"); AppendString(sb, name ?? "");
            sb.Append(",\"role\":"); AppendString(sb, role ?? "");
            sb.Append(",\"mood\":"); AppendString(sb, mood ?? "");
            sb.Append(",\"traits\":[");
            if (traits != null)
                for (int i = 0; i < traits.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    AppendString(sb, traits[i]);
                }
            sb.Append(']');
            sb.Append(",\"portrait\":"); AppendString(sb, portrait ?? "");
            return sb.Append('}').ToString();
        }

        /// <summary>
        /// One crew member's row in the roster channel — identity + wellbeing + whereabouts,
        /// so the client can render a crew-watch list without clicking each pawn. The player
        /// always knows their own crew: the roster is NOT fog-gated (positions of living crew
        /// are ship's-intercom knowledge), unlike the frame crew tuple which stays projection-
        /// gated. All strings may be empty; Morale is 0..1.
        /// </summary>
        public readonly struct RosterEntry
        {
            public readonly uint Cid;
            public readonly string Name, Role, Mood, Task, Portrait;
            public readonly float Morale;
            public readonly int Deck, X, Y;

            public RosterEntry(uint cid, string name, string role, string mood, string task,
                               string portrait, float morale, int deck, int x, int y)
            {
                Cid = cid; Name = name; Role = role; Mood = mood; Task = task;
                Portrait = portrait; Morale = morale; Deck = deck; X = x; Y = y;
            }
        }

        /// <summary>Serialize the crew roster (see <see cref="RosterEntry"/>). A cached state
        /// channel like frame/metrics: rebuilt each render, deduped by the session.</summary>
        public static string Roster(IReadOnlyList<RosterEntry> crew)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"roster\",\"crew\":[");
            if (crew != null)
                for (int i = 0; i < crew.Count; i++)
                {
                    var e = crew[i];
                    if (i > 0) sb.Append(',');
                    sb.Append("{\"cid\":").Append(e.Cid.ToString(Ic));
                    sb.Append(",\"name\":"); AppendString(sb, e.Name ?? "");
                    sb.Append(",\"role\":"); AppendString(sb, e.Role ?? "");
                    sb.Append(",\"mood\":"); AppendString(sb, e.Mood ?? "");
                    sb.Append(",\"morale\":").Append(Num(e.Morale));
                    sb.Append(",\"task\":"); AppendString(sb, e.Task ?? "");
                    sb.Append(",\"portrait\":"); AppendString(sb, e.Portrait ?? "");
                    sb.Append(",\"deck\":").Append(e.Deck.ToString(Ic));
                    sb.Append(",\"x\":").Append(e.X.ToString(Ic));
                    sb.Append(",\"y\":").Append(e.Y.ToString(Ic));
                    sb.Append('}');
                }
            sb.Append("]}");
            return sb.ToString();
        }

        /// <summary>An interactable device the player selected — v0 carries the MOSS-addressable
        /// terminal id so the client can open its program panel.</summary>
        public static string Device(string kind, string tid)
        {
            var sb = new StringBuilder(64);
            sb.Append("{\"type\":\"device\",\"kind\":"); AppendString(sb, kind ?? "");
            sb.Append(",\"tid\":"); AppendString(sb, tid ?? "");
            return sb.Append('}').ToString();
        }

        // ------------------------------------------------------------------- llm status (L6)

        /// <summary>
        /// The live conversation-runtime status strip (L6): which backend is answering,
        /// whether it is degraded (running on the offline fallback), the rolling hourly cost
        /// (InvariantCulture, never locale-comma), and the dispatch queue depths (turns in
        /// flight + says waiting behind an in-flight turn). Broadcast periodically from
        /// Render(); a cheap, unconditional strip the client shows in the HUD.
        ///   {"type":"llmstatus","backend":"template","degraded":false,"costPerHour":0,"inflight":0,"queued":0}
        /// </summary>
        public static string LlmStatus(string backend, bool degraded, decimal costPerHour, int inflight, int queued)
        {
            var sb = new StringBuilder(96);
            sb.Append("{\"type\":\"llmstatus\",\"backend\":");
            AppendString(sb, backend ?? "");
            sb.Append(",\"degraded\":").Append(degraded ? "true" : "false");
            sb.Append(",\"costPerHour\":").Append(NumDecimal(costPerHour));
            sb.Append(",\"inflight\":").Append(inflight.ToString(Ic));
            sb.Append(",\"queued\":").Append(queued.ToString(Ic));
            return sb.Append('}').ToString();
        }

        // ------------------------------------------------------------------- chronicle (L6)

        /// <summary>
        /// The ship's log over the wire (L6): Chronicle.Render output as a day list. Each day
        /// carries its index, the display headline (LLM prose override when present, else the
        /// deterministic template headline), and every rendered line for that day.
        ///   {"type":"chron","days":[{"day":0,"headline":"..","lines":["..",".."]},..]}
        /// Sent on demand (a `chron` command) or when a day boundary rolls over.
        /// </summary>
        public static string Chronicle(IReadOnlyList<ChronicleDay> days)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"chron\",\"days\":[");
            if (days != null)
            {
                for (int d = 0; d < days.Count; d++)
                {
                    if (d > 0) sb.Append(',');
                    var day = days[d];
                    sb.Append("{\"day\":").Append(day.Day.ToString(Ic));
                    sb.Append(",\"headline\":"); AppendString(sb, day.Display ?? "");
                    sb.Append(",\"lines\":[");
                    var lines = day.Lines;
                    if (lines != null)
                        for (int i = 0; i < lines.Count; i++)
                        {
                            if (i > 0) sb.Append(',');
                            AppendString(sb, lines[i]);
                        }
                    sb.Append("]}");
                }
            }
            sb.Append("]}");
            return sb.ToString();
        }

        // ------------------------------------------------------------------- light (W2)

        /// <summary>Serialize one deck's per-tile light grid (from LightMapper) as run-length
        /// pairs over the row-major tiles: {"type":"light","deck":..,"w":..,"h":..,"rle":[[state,count],..]}.
        /// The client expands the runs to w*h; states are the append-only LightState bytes.</summary>
        public static string Light(int deck, int w, int h, byte[] states)
        {
            var sb = new StringBuilder(128);
            sb.Append("{\"type\":\"light\",\"deck\":").Append(deck.ToString(Ic));
            sb.Append(",\"w\":").Append(w.ToString(Ic));
            sb.Append(",\"h\":").Append(h.ToString(Ic));
            sb.Append(",\"rle\":[");
            int total = w * h;
            if (states != null && states.Length < total) total = states.Length;
            bool first = true;
            int run = 0;
            byte cur = 0;
            for (int i = 0; i < total; i++)
            {
                byte s = states[i];
                if (run == 0) { cur = s; run = 1; }
                else if (s == cur) { run++; }
                else
                {
                    if (!first) sb.Append(','); first = false;
                    sb.Append('[').Append(((int)cur).ToString(Ic)).Append(',').Append(run.ToString(Ic)).Append(']');
                    cur = s; run = 1;
                }
            }
            if (run > 0)
            {
                if (!first) sb.Append(',');
                sb.Append('[').Append(((int)cur).ToString(Ic)).Append(',').Append(run.ToString(Ic)).Append(']');
            }
            sb.Append("]}");
            return sb.ToString();
        }

        // ------------------------------------------------------------------- MOSS (W3)
        //
        // The MOSS terminal bridge. Ops the client sends: "open" (server replies source +
        // diag), "set" (server replies diag), "audit" (server replies audit). "dryrun" is
        // RESERVED for a future compile-only-preview op — not implemented here.
        //   source  {"type":"moss","ev":"source","tid":"..","text":"..","hash":N}
        //   diag    {"type":"moss","ev":"diag","tid":"..","ok":bool,"diags":[[line,col,sev,"msg"],..]}
        //   audit   {"type":"moss","ev":"audit","tid":"..","lines":[[tick,"text"],..]}
        //   rterror {"type":"moss","ev":"rterror","tid":"..","text":".."}
        // line/col are 1-based; sev is "error"|"warning"; hash is the FNV-1a32 of the source
        // (== the runtime's saved SourceHash), emitted unsigned so client and sim agree.

        public static string MossSource(string tid, string text)
        {
            uint hash = (uint)ScriptRuntime.Fnv1a32(text ?? "");
            var sb = MossHeader(tid, "source");
            sb.Append(",\"text\":"); AppendString(sb, text ?? "");
            sb.Append(",\"hash\":").Append(hash.ToString(Ic));
            return sb.Append('}').ToString();
        }

        public static string MossDiag(string tid, IReadOnlyList<Diagnostic> diags)
        {
            bool ok = true;
            if (diags != null)
                for (int i = 0; i < diags.Count; i++)
                    if (diags[i].Severity == DiagnosticSeverity.Error) { ok = false; break; }

            var sb = MossHeader(tid, "diag");
            sb.Append(",\"ok\":").Append(ok ? "true" : "false");
            sb.Append(",\"diags\":[");
            if (diags != null)
                for (int i = 0; i < diags.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var d = diags[i];
                    sb.Append('[').Append(d.Line.ToString(Ic))
                      .Append(',').Append(d.Col.ToString(Ic))
                      .Append(',');
                    AppendString(sb, d.Severity == DiagnosticSeverity.Error ? "error" : "warning");
                    sb.Append(',');
                    AppendString(sb, d.Message ?? "");
                    sb.Append(']');
                }
            sb.Append(']');
            return sb.Append('}').ToString();
        }

        public static string MossAudit(string tid, IReadOnlyList<(long Tick, string Text)> lines)
        {
            var sb = MossHeader(tid, "audit");
            sb.Append(",\"lines\":[");
            if (lines != null)
                for (int i = 0; i < lines.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    sb.Append('[').Append(lines[i].Tick.ToString(Ic)).Append(',');
                    AppendString(sb, lines[i].Text ?? "");
                    sb.Append(']');
                }
            sb.Append(']');
            return sb.Append('}').ToString();
        }

        public static string MossRuntimeError(string tid, string text)
        {
            var sb = MossHeader(tid, "rterror");
            sb.Append(",\"text\":"); AppendString(sb, text ?? "");
            return sb.Append('}').ToString();
        }

        private static StringBuilder MossHeader(string tid, string ev)
        {
            var sb = new StringBuilder(128);
            sb.Append("{\"type\":\"moss\",\"ev\":\"").Append(ev).Append("\",\"tid\":");
            AppendString(sb, tid ?? "");
            return sb;
        }

        private static string Lines(string type, IReadOnlyList<string> lines)
        {
            var sb = new StringBuilder(128);
            sb.Append("{\"type\":\"").Append(type).Append("\",\"lines\":[");
            if (lines != null)
            {
                for (int i = 0; i < lines.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    AppendString(sb, lines[i]);
                }
            }
            sb.Append("]}");
            return sb.ToString();
        }

        private static void Field(StringBuilder sb, string key, double value)
        {
            sb.Append(",\"").Append(key).Append("\":").Append(Num(value));
        }

        /// <summary>Fixed-shape InvariantCulture number: up to 4 decimals, trimmed, never
        /// exponential/locale-comma — so a payload is byte-stable across machines.</summary>
        private static string Num(double value)
        {
            // Clamp tiny denormals/NaN to a stable 0 so serialization never emits "NaN".
            if (double.IsNaN(value) || double.IsInfinity(value)) return "0";
            return value.ToString("0.####", Ic);
        }

        /// <summary>Fixed-shape InvariantCulture decimal (money, up to 4 places, trimmed) — the
        /// same byte-stable discipline as <see cref="Num"/> but exact for cost accounting.</summary>
        private static string NumDecimal(decimal value) => value.ToString("0.####", Ic);

        /// <summary>Append a JSON-escaped string literal (quotes included).</summary>
        private static void AppendString(StringBuilder sb, string s)
        {
            sb.Append('"');
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", Ic));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }
}
