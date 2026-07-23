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
    ///   citizen {"type":"citizen","cid":..,"name":"..","role":"..","mood":"..","traits":[..],"portrait":"..","log":[[who,text],..]}
    ///   device  {"type":"device","kind":"terminal","tid":".."}
    ///   roster  {"type":"roster","crew":[{"cid":..,"name":"..","role":"..","mood":"..","morale":0.8,
    ///            "task":"..","portrait":"..","deck":0,"x":3,"y":4,"traits":["..",".."]},..]}
    ///   designs {"type":"designs","cells":[[x,y,deck,kind],..]}   (pending build ghosts; kind 0 wall / 1 door)
    ///   terminals {"type":"terminals","list":[[tid,deck,x,y],..]} (MOSS terminal directory)
    ///   relations {"type":"relations","edges":[[fromCid,toCid,opinion,tier,note,secret],..]}
    ///   systems {"type":"systems","hull":"..","day":..,"uptime":..,"rows":[[id,label,load,state,faultDay,faultText,advisory],..]}
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
        /// else empty. <paramref name="portrait"/> is a stable per-citizen face id ("" when unknown).
        /// <paramref name="log"/> is the durable-within-run conversation log (B3, APPEND-ONLY trailing
        /// field): [who,text] pairs, oldest first, who = "you" (player) | "crew"; always emitted (empty
        /// array when none) so the shape is stable.</summary>
        public static string Citizen(uint cid, string name, string role, string mood,
                                     IReadOnlyList<string> traits, string portrait,
                                     IReadOnlyList<(string Who, string Text)> log = null)
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
            sb.Append(",\"log\":[");
            if (log != null)
                for (int i = 0; i < log.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    sb.Append('[');
                    AppendString(sb, log[i].Who ?? "");
                    sb.Append(',');
                    AppendString(sb, log[i].Text ?? "");
                    sb.Append(']');
                }
            sb.Append(']');
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
            // Persona traits (APPEND-ONLY trailing field): the CREW tab's TRAITS column. Host-owned
            // mind-persona knowledge, same source as the citizen card; empty when the mind is absent.
            public readonly IReadOnlyList<string> Traits;

            public RosterEntry(uint cid, string name, string role, string mood, string task,
                               string portrait, float morale, int deck, int x, int y,
                               IReadOnlyList<string> traits = null)
            {
                Cid = cid; Name = name; Role = role; Mood = mood; Task = task;
                Portrait = portrait; Morale = morale; Deck = deck; X = x; Y = y;
                Traits = traits;
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
                    // APPEND-ONLY trailing field: persona traits (CREW tab TRAITS column).
                    sb.Append(",\"traits\":[");
                    var traits = e.Traits;
                    if (traits != null)
                        for (int t = 0; t < traits.Count; t++)
                        {
                            if (t > 0) sb.Append(',');
                            AppendString(sb, traits[t] ?? "");
                        }
                    sb.Append(']');
                    sb.Append('}');
                }
            sb.Append("]}");
            return sb.ToString();
        }

        // ------------------------------------------------------------------- build designations (BUILD ghosts)

        /// <summary>
        /// One pending build designation on the designs wire — a wall/door the sim has NOT yet
        /// built. The client renders a persistent ghost marker (dashed tile outline) on the
        /// matching deck until the designation resolves (built or cancelled), at which point it
        /// drops off this authoritative channel. <see cref="Kind"/> is the append-only
        /// <see cref="Perilune.Sim.BuildKind"/> byte (0 wall, 1 door). Read-only host mirror of
        /// <see cref="Perilune.Sim.BuildSystem.Pending"/> — no sim mutation, no RNG.
        /// <para><see cref="Delivered"/>/<see cref="Required"/> are the site's material ledger
        /// (APPEND-ONLY tuple elements 5 and 6): a site with nothing delivered and nobody hauling
        /// is starved, and a starved ghost used to look exactly like one under active construction.</para>
        /// </summary>
        public readonly struct Design
        {
            public readonly int X, Y, Deck;
            public readonly byte Kind;
            public readonly int Delivered, Required;
            public Design(int x, int y, int deck, byte kind, int delivered = 0, int required = 0)
            { X = x; Y = y; Deck = deck; Kind = kind; Delivered = delivered; Required = required; }
        }

        /// <summary>Serialize the pending-designation graph (see <see cref="Design"/>). A cached
        /// state channel like roster: rebuilt each render, deduped by the session; the client
        /// filters to the shown deck. Each entry is a compact tuple
        /// [x, y, deck, kind, delivered, required] — the last two are APPEND-ONLY additions, so a
        /// reader that only knows the first four elements is unaffected.
        ///   {"type":"designs","cells":[[3,4,0,0,1,2],..]}</summary>
        public static string Designs(IReadOnlyList<Design> designs)
        {
            var sb = new StringBuilder(128);
            sb.Append("{\"type\":\"designs\",\"cells\":[");
            if (designs != null)
                for (int i = 0; i < designs.Count; i++)
                {
                    var d = designs[i];
                    if (i > 0) sb.Append(',');
                    sb.Append('[').Append(d.X.ToString(Ic))
                      .Append(',').Append(d.Y.ToString(Ic))
                      .Append(',').Append(d.Deck.ToString(Ic))
                      .Append(',').Append(((int)d.Kind).ToString(Ic))
                      // APPEND-ONLY trailing elements: the material ledger.
                      .Append(',').Append(d.Delivered.ToString(Ic))
                      .Append(',').Append(d.Required.ToString(Ic)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }

        // ------------------------------------------------------------------- terminals (MOSS tab list)

        /// <summary>Serialize the ship's MOSS terminals as a cached state channel — one entry per
        /// terminal device, [tid, deck, x, y]. The MOSS tab lists these so a player can open a
        /// terminal's IDE without hunting the deck for a console tile. Read-only host mirror of the
        /// terminal <see cref="Perilune.Sim.Device"/>s; strings JSON-escaped, numbers InvariantCulture.
        ///   {"type":"terminals","list":[["term_bridge",0,3,4],..]}</summary>
        public static string Terminals(IReadOnlyList<(string Tid, int Deck, int X, int Y)> terminals)
        {
            var sb = new StringBuilder(128);
            sb.Append("{\"type\":\"terminals\",\"list\":[");
            if (terminals != null)
                for (int i = 0; i < terminals.Count; i++)
                {
                    var t = terminals[i];
                    if (i > 0) sb.Append(',');
                    sb.Append('[');
                    AppendString(sb, t.Tid ?? "");
                    sb.Append(',').Append(t.Deck.ToString(Ic))
                      .Append(',').Append(t.X.ToString(Ic))
                      .Append(',').Append(t.Y.ToString(Ic)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }

        // ------------------------------------------------------------------- relations (RELATIONS web)

        /// <summary>
        /// One DIRECTED relationship edge on the relations wire — how <see cref="From"/> regards
        /// <see cref="To"/>: the rounded opinion (−100..100), the classified directed tier
        /// (<see cref="Perilune.Sim.RelationType"/> as a byte), an optional relationship note ("" when
        /// none), and whether the bond is CONCEALED. Names resolve client-side via the cid-keyed
        /// roster; the client dedups the two directions to one drawn line and derives the MUTUAL
        /// tier + colour itself. The <see cref="Secret"/> flag on this wire deliberately bypasses
        /// the dialogue RevealDifficulty gate — the relations view is the player's omniscient eye
        /// (matching the mock's dashed-edge legend). Personal Persona.Secrets stay OFF the wire;
        /// only this relationship-level flag ships.
        /// </summary>
        public readonly struct RelationEdge
        {
            public readonly uint From, To;
            public readonly int Opinion;
            public readonly byte Tier;
            public readonly string Note;
            public readonly bool Secret;

            public RelationEdge(uint from, uint to, int opinion, byte tier, string note, bool secret)
            {
                From = from; To = to; Opinion = opinion; Tier = tier; Note = note; Secret = secret;
            }
        }

        /// <summary>Serialize the directed relationship graph (see <see cref="RelationEdge"/>). A
        /// cached state channel like roster: rebuilt each render, deduped by the session. Both
        /// directions ship as-is; the client collapses them to one line and classifies the mutual
        /// tier. Each edge is a compact tuple [from, to, opinion, tier, note, secret].</summary>
        public static string Relations(IReadOnlyList<RelationEdge> edges)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"relations\",\"edges\":[");
            if (edges != null)
                for (int i = 0; i < edges.Count; i++)
                {
                    var e = edges[i];
                    if (i > 0) sb.Append(',');
                    sb.Append('[').Append(e.From.ToString(Ic))
                      .Append(',').Append(e.To.ToString(Ic))
                      .Append(',').Append(e.Opinion.ToString(Ic))
                      .Append(',').Append(((int)e.Tier).ToString(Ic))
                      .Append(',');
                    AppendString(sb, e.Note ?? "");
                    sb.Append(',').Append(e.Secret ? "true" : "false").Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }

        // ------------------------------------------------------------------- systems (MOSS ledger)

        /// <summary>
        /// The MOSS phosphor ledger as a cached state channel
        /// (`docs/design/perilune-moss-terminal.spec.md` §1.1) — rebuilt each render, deduped and
        /// snapshot-replayed on connect, alongside roster / designs / terminals / relations. Not
        /// fog-gated: a ship's own telemetry is fixed crew knowledge, the same deliberate rule as
        /// the roster.
        ///
        /// <para><paramref name="hull"/> is the ship designation — a deterministic NAME derived
        /// from the world seed (<see cref="Perilune.Sim.ShipSystems.HullDesignation"/>), not a
        /// gauge, so DA-M1 does not apply to it.</para>
        ///
        /// <para><c>uptime</c> ships as the RAW tick count and the client formats it. The host
        /// deliberately never sends a preformatted duration: that is a culture bug waiting to
        /// happen on this de-DE dev machine, and the client already owns every other format
        /// decision on this screen.</para>
        ///
        /// <para>Each row is a compact tuple
        /// <c>[id, label, load, state, faultDay, faultText, advisory]</c>. <c>load</c> is 0..100 or
        /// the <b>-1</b> "no meaningful load" sentinel; <c>state</c> is the append-only
        /// <see cref="Perilune.Sim.ShipSystemState"/> byte; <c>faultDay</c> is -1 for none (and
        /// <c>faultText</c> is then ""). Row order is the HOST's fixed presentation order, never a
        /// client sort — same rule as the relations ring.</para>
        /// </summary>
        public static string Systems(string hull, in ShipSystemsReport report)
        {
            var sb = new StringBuilder(1024);
            sb.Append("{\"type\":\"systems\",\"hull\":");
            AppendString(sb, hull ?? "");
            sb.Append(",\"day\":").Append(report.Day.ToString(Ic));
            sb.Append(",\"uptime\":").Append(report.Uptime.ToString(Ic));
            sb.Append(",\"rows\":[");
            var rows = report.Rows;
            if (rows != null)
                for (int i = 0; i < rows.Count; i++)
                {
                    var r = rows[i];
                    if (i > 0) sb.Append(',');
                    sb.Append('[');
                    AppendString(sb, r.Id ?? "");
                    sb.Append(',');
                    AppendString(sb, r.Label ?? "");
                    sb.Append(',').Append(r.Load.ToString(Ic))
                      .Append(',').Append(((int)r.State).ToString(Ic))
                      .Append(',').Append(r.FaultDay.ToString(Ic))
                      .Append(',');
                    AppendString(sb, r.FaultText ?? "");
                    sb.Append(',');
                    AppendString(sb, r.Advisory ?? "");
                    sb.Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }

        // ------------------------------------------------------------------- decks / rooms / decor (warm-SVG view channels)
        //
        // Three VIEW-ONLY cached state channels the warm SVG Overview / Room-Zoom consume
        // (docs/design/perilune-wire-channels.spec.md). Like systems/roster they are rebuilt each
        // render, deduped and snapshot-replayed, and NOT fog-gated. They move NO determinism hash:
        // decks/rooms are a pure read of RoomState/Room derived props; decor is inert (view-only).
        //   decks {"type":"decks","decks":[{"deck":N,"slots":[[idx,x,y,w,h,"anchor",roomType,occ,act],..]},..]}
        //   rooms {"type":"rooms","rooms":[["anchor",deck,o2,co2ppm,pressureKPa,tempK,tileCount],..]}
        //   decor {"type":"decor","items":[[deck,x,y,"itemId",yawDeg,variant],..]}

        /// <summary>One 2×4 compartment slot on the <c>decks</c> channel. Geometry
        /// (<see cref="X"/>/<see cref="Y"/>/<see cref="W"/>/<see cref="H"/>, tile rect in
        /// frame/click space) and <see cref="RoomType"/> come from the plan's authoring slot grid;
        /// <see cref="AnchorName"/>/<see cref="Occupied"/>/<see cref="Active"/> are DERIVED from live
        /// <see cref="Perilune.Sim.RoomState"/> each render — <see cref="AnchorName"/> is BLANK for an
        /// empty (airless) hall, never the plan's authored anchor. The tuple
        /// [slotIndex, x, y, w, h, anchorName, roomType, occupied, active] is append-only.</summary>
        public readonly struct DeckSlot
        {
            public readonly int SlotIndex, X, Y, W, H;
            public readonly string AnchorName;
            public readonly byte RoomType;
            public readonly bool Occupied, Active;

            public DeckSlot(int slotIndex, int x, int y, int w, int h, string anchorName,
                            byte roomType, bool occupied, bool active)
            {
                SlotIndex = slotIndex; X = x; Y = y; W = w; H = h;
                AnchorName = anchorName; RoomType = roomType; Occupied = occupied; Active = active;
            }
        }

        /// <summary>One deck's compartment grid on the <c>decks</c> channel — its deck index and its
        /// slot tuples in a fixed host order (row-major over the 2×4 grid; never a client sort).</summary>
        public readonly struct DeckEntry
        {
            public readonly int Deck;
            public readonly IReadOnlyList<DeckSlot> Slots;
            public DeckEntry(int deck, IReadOnlyList<DeckSlot> slots) { Deck = deck; Slots = slots; }
        }

        /// <summary>Serialize the per-deck compartment grid (see <see cref="DeckEntry"/>). A cached
        /// state channel like roster: rebuilt each render, deduped by the session.</summary>
        public static string Decks(IReadOnlyList<DeckEntry> decks)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"decks\",\"decks\":[");
            if (decks != null)
                for (int d = 0; d < decks.Count; d++)
                {
                    if (d > 0) sb.Append(',');
                    var entry = decks[d];
                    sb.Append("{\"deck\":").Append(entry.Deck.ToString(Ic)).Append(",\"slots\":[");
                    var slots = entry.Slots;
                    if (slots != null)
                        for (int s = 0; s < slots.Count; s++)
                        {
                            if (s > 0) sb.Append(',');
                            var t = slots[s];
                            sb.Append('[').Append(t.SlotIndex.ToString(Ic))
                              .Append(',').Append(t.X.ToString(Ic))
                              .Append(',').Append(t.Y.ToString(Ic))
                              .Append(',').Append(t.W.ToString(Ic))
                              .Append(',').Append(t.H.ToString(Ic))
                              .Append(',');
                            AppendString(sb, t.AnchorName ?? "");
                            sb.Append(',').Append(((int)t.RoomType).ToString(Ic))
                              .Append(',').Append(t.Occupied ? "true" : "false")
                              .Append(',').Append(t.Active ? "true" : "false").Append(']');
                        }
                    sb.Append("]}");
                }
            sb.Append("]}");
            return sb.ToString();
        }

        /// <summary>One room's derived atmosphere on the <c>rooms</c> channel — RAW <see cref="Perilune.Sim.Room"/>
        /// derived properties (fraction stays a fraction, ppm stays ppm, K stays K); ALL display
        /// formatting (%, °C, rounding) is the client's job. The tuple
        /// [anchorName, deck, o2, co2ppm, pressureKPa, tempK, tileCount] is append-only.</summary>
        public readonly struct RoomTuple
        {
            public readonly string AnchorName;
            public readonly int Deck;
            public readonly double O2, Co2Ppm, PressureKPa, TempK;
            public readonly int TileCount;

            public RoomTuple(string anchorName, int deck, double o2, double co2ppm,
                             double pressureKPa, double tempK, int tileCount)
            {
                AnchorName = anchorName; Deck = deck; O2 = o2; Co2Ppm = co2ppm;
                PressureKPa = pressureKPa; TempK = tempK; TileCount = tileCount;
            }
        }

        /// <summary>Serialize the per-room atmosphere (see <see cref="RoomTuple"/>). A cached state
        /// channel like roster; numbers InvariantCulture. Row order is a host decision, never a
        /// client sort.</summary>
        public static string Rooms(IReadOnlyList<RoomTuple> rooms)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"rooms\",\"rooms\":[");
            if (rooms != null)
                for (int i = 0; i < rooms.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var r = rooms[i];
                    sb.Append('[');
                    AppendString(sb, r.AnchorName ?? "");
                    sb.Append(',').Append(r.Deck.ToString(Ic))
                      .Append(',').Append(Num(r.O2))
                      .Append(',').Append(Num(r.Co2Ppm))
                      .Append(',').Append(Num(r.PressureKPa))
                      .Append(',').Append(Num(r.TempK))
                      .Append(',').Append(r.TileCount.ToString(Ic)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }

        /// <summary>One cosmetic, view-only furniture placement on the <c>decor</c> channel — inert
        /// exactly as <c>DeviceLayout.Entry.YawDeg</c> is (the sim never reads it). The tuple
        /// [deck, x, y, itemId, yawDeg, variant] is append-only.</summary>
        public readonly struct DecorItem
        {
            public readonly int Deck, X, Y;
            public readonly string ItemId;
            public readonly int YawDeg, Variant;
            public DecorItem(int deck, int x, int y, string itemId, int yawDeg, int variant)
            { Deck = deck; X = x; Y = y; ItemId = itemId; YawDeg = yawDeg; Variant = variant; }
        }

        /// <summary>Serialize the cosmetic decor layer (see <see cref="DecorItem"/>). A cached state
        /// channel like roster; NEVER folded into any determinism hash. Typically empty until an
        /// authored decor set exists — the empty channel still ships so a reconnecting client is
        /// caught up (snapshot-replay).</summary>
        public static string Decor(IReadOnlyList<DecorItem> items)
        {
            var sb = new StringBuilder(128);
            sb.Append("{\"type\":\"decor\",\"items\":[");
            if (items != null)
                for (int i = 0; i < items.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var d = items[i];
                    sb.Append('[').Append(d.Deck.ToString(Ic))
                      .Append(',').Append(d.X.ToString(Ic))
                      .Append(',').Append(d.Y.ToString(Ic))
                      .Append(',');
                    AppendString(sb, d.ItemId ?? "");
                    sb.Append(',').Append(d.YawDeg.ToString(Ic))
                      .Append(',').Append(d.Variant.ToString(Ic)).Append(']');
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
        // diag), "set" (server replies diag), "audit" (server replies audit), "sys" (server
        // replies one row's device breakdown) and "exec" (server runs one prompt line).
        // "dryrun" is RESERVED for a future compile-only-preview op — not implemented here.
        //   source  {"type":"moss","ev":"source","tid":"..","text":"..","hash":N}
        //   diag    {"type":"moss","ev":"diag","tid":"..","ok":bool,"diags":[[line,col,sev,"msg"],..]}
        //   audit   {"type":"moss","ev":"audit","tid":"..","lines":[[tick,"text"],..]}
        //   rterror {"type":"moss","ev":"rterror","tid":"..","text":".."}
        //   sys     {"type":"moss","ev":"sys","tid":"..","derivation":"..","devices":[[..],..]}
        //   exec    {"type":"moss","ev":"exec","tid":"..","ok":bool,"lines":[[stream,"text"],..]}
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

        /// <summary>
        /// SYSTEM DETAIL for one ledger row (spec §1.2) — fetched on demand, never pushed: a
        /// per-device breakdown would re-send on every condition tick and dwarf the ledger.
        ///   {"type":"moss","ev":"sys","tid":"reactor","derivation":"..",
        ///    "devices":[[name,kind,condition,powered,rate,deck,x,y,note],..]}
        /// <c>kind</c> is the append-only <see cref="Perilune.Sim.DeviceKind"/> byte; condition and
        /// rate are percent ints 0..100 (the sim holds 0..1 floats and
        /// <see cref="Perilune.Sim.ShipSystems"/> rounds once, AwayFromZero); powered is 0|1.
        ///
        /// <para><c>derivation</c> is an APPEND-ONLY top-level field carrying the row's plain-prose
        /// DERIVATION note (IX-M22). It ships from the host on purpose: the note states how THIS
        /// code computed the row and what the proxy's limits are, and a client-side copy would be
        /// free to drift out of truth from the derivation it describes — precisely the failure
        /// DA-M3 exists to prevent. A reader that ignores the field is unaffected.</para>
        /// </summary>
        public static string MossSys(string tid, IReadOnlyList<ShipSystemDevice> devices, string derivation)
        {
            var sb = MossHeader(tid, "sys");
            sb.Append(",\"derivation\":"); AppendString(sb, derivation ?? "");
            sb.Append(",\"devices\":[");
            if (devices != null)
                for (int i = 0; i < devices.Count; i++)
                {
                    var d = devices[i];
                    if (i > 0) sb.Append(',');
                    sb.Append('[');
                    AppendString(sb, d.Name ?? "");
                    sb.Append(',').Append(((int)d.Kind).ToString(Ic))
                      .Append(',').Append(d.Condition.ToString(Ic))
                      .Append(',').Append(d.Powered ? "1" : "0")
                      .Append(',').Append(d.Rate.ToString(Ic))
                      .Append(',').Append(d.Deck.ToString(Ic))
                      .Append(',').Append(d.X.ToString(Ic))
                      .Append(',').Append(d.Y.ToString(Ic))
                      .Append(',');
                    AppendString(sb, d.Note ?? "");
                    sb.Append(']');
                }
            sb.Append(']');
            return sb.Append('}').ToString();
        }

        /// <summary>
        /// The command-prompt reply (spec §1.3):
        ///   {"type":"moss","ev":"exec","tid":"@console","ok":true,"lines":[[stream,"text"],..]}
        /// <c>stream</c> is 0 echo · 1 output · 2 error. <c>ok</c> is false when the line did not
        /// parse or the target did not resolve — a malformed line is ALWAYS a typed error reply,
        /// never an exception and never a silent no-op (IX-M42).
        /// </summary>
        public static string MossExec(string tid, bool ok, IReadOnlyList<(int Stream, string Text)> lines)
        {
            var sb = MossHeader(tid, "exec");
            sb.Append(",\"ok\":").Append(ok ? "true" : "false");
            sb.Append(",\"lines\":[");
            if (lines != null)
                for (int i = 0; i < lines.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    sb.Append('[').Append(lines[i].Stream.ToString(Ic)).Append(',');
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
