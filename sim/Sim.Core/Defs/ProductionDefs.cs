using System;

namespace Perilune.Sim
{
    /// <summary>
    /// One side of a production node: an <see cref="ItemKind"/> and the whole units of it
    /// consumed (input port) or produced (output port) per completed batch. Perilune has no
    /// fractional stacks (ECONOMY.md §11), so conversion LOSS is expressed as the integer
    /// input:output RATIO and nothing else — <c>Scrap:20 → Regolith:17</c> is exactly 85 %,
    /// on every machine, forever.
    ///
    /// There is deliberately NO fractional yield multiplier (W0-5 review, B4). A float yield
    /// with integer stacks has to round, and <c>floor(n·y)/n = y</c> only when <c>n·y</c> is
    /// integral: 0.85 needs an out_count that is a multiple of 20, ECONOMY.md §10's 0.93
    /// reclaimer needs a multiple of 100, and a single node-level yield yields a DIFFERENT
    /// effective rate per output port. Integer ratios are exact, culture-free, float-free,
    /// statically checkable at parse, and force the author to state the batch size the
    /// rounding was going to impose anyway.
    /// </summary>
    public readonly struct ProductionPort
    {
        public readonly ItemKind Kind;
        public readonly int Count;

        public ProductionPort(ItemKind kind, int count)
        {
            Kind = kind;
            Count = count;
        }
    }

    /// <summary>
    /// One node of the conversion graph (ECONOMY.md §4): "this station turns these input
    /// stacks into these output stacks, in this much work-time".
    ///
    /// This is the shape <see cref="RecipeDef"/> could not express (SimDefs.Recipes is
    /// <c>new RecipeDef[Machines.Length]</c> indexed by <c>(int)DeviceKind</c>, so it is
    /// single-input, single-output, and one row per station — a second bill on the same
    /// station OVERWRITES the first). A node is keyed by its own <see cref="Id"/>, so two
    /// nodes on one station coexist; <see cref="Station"/> is an ordinary field, not the key.
    ///
    /// DETERMINISM: <see cref="Inputs"/>/<see cref="Outputs"/> are arrays, iterated in
    /// index order — that order is the canonical scan order for staging, fetching and
    /// consumption, exactly as tiles scan z,y,x. Never reorder them at runtime. Every field
    /// is an integer or an enum: this table contains no float at all, so ECONOMY-PLAN §4's
    /// trap 7 (float accumulation order) and trap 10 (InvariantCulture) do not reach it.
    ///
    /// INVARIANT the consumers rely on: no <see cref="ItemKind"/> appears twice within
    /// <see cref="Inputs"/>, nor twice within <see cref="Outputs"/>. The parser refuses such
    /// a row (W0-5 review, B1) — without that, one staged stack satisfies two ports'
    /// staging checks, the first port drains it, and the batch runs anyway: matter created.
    /// </summary>
    public readonly struct ProductionNode
    {
        /// <summary>Node key: unique within the table, stable across packs. A later row with
        /// the same id REPLACES the earlier one in place (the .def overlay contract) rather
        /// than appending, so a pack can retune a core node without changing table order.</summary>
        public readonly string Id;

        /// <summary>The workstation kind this node runs on. NOT the table key — several
        /// nodes may name the same station (that is the whole point of the redesign).</summary>
        public readonly DeviceKind Station;

        /// <summary>Seconds of work per batch (BASE value; the tick count is derived at use as
        /// <c>WorkSeconds × Simulation.TicksPerSecond</c>, mirroring <see cref="RecipeDef"/>).
        /// Bounded to [1, <see cref="MaxWorkSeconds"/>] at parse: <c>Progress += 1f /
        /// WorkSeconds</c> divides by it, and the derived tick count must not overflow int.</summary>
        public readonly int WorkSeconds;

        /// <summary>Input ports, consumed together when a batch starts. Never null and never
        /// empty for a parsed node; no kind repeats.</summary>
        public readonly ProductionPort[] Inputs;

        /// <summary>Output ports, all spawned when the batch completes. May be EMPTY: a node
        /// with no outputs is a pure sink — ECONOMY.md §5 S7 "vent the carbonate, gone
        /// forever". No kind repeats.</summary>
        public readonly ProductionPort[] Outputs;

        /// <summary>Upper bound on <see cref="WorkSeconds"/> — one sim-day of continuous work
        /// at one bench. Well under <c>int.MaxValue / Simulation.TicksPerSecond</c>, so the
        /// derived tick count can never overflow and turn a station into a silent input
        /// shredder (W0-5 review, N3).</summary>
        public const int MaxWorkSeconds = 86_400;

        /// <summary>Upper bound on any single port's <see cref="ProductionPort.Count"/>, for
        /// the same reason <see cref="MaxWorkSeconds"/> exists: unit counts feed <c>int</c>
        /// accumulators (<c>StagedUnits</c>, <c>CountFreeMaterial</c>, every ship-wide item
        /// total), and an unbounded port count wraps them silently — <c>Parts:2000000000</c>
        /// reaches 6e9 units after three batches, which is 1,705,032,704 in an int (W0-5
        /// review, N3b). 10,000 is two orders of magnitude above the largest batch any
        /// designed ratio needs (ECONOMY.md §10's 0.93 reclaimer wants multiples of 100).</summary>
        public const int MaxPortCount = 10_000;

        public ProductionNode(string id, DeviceKind station, int workSeconds,
                              ProductionPort[] inputs, ProductionPort[] outputs)
        {
            RequireNoRepeatedKind(inputs, "inputs");
            RequireNoRepeatedKind(outputs, "outputs");
            Id = id;
            Station = station;
            WorkSeconds = workSeconds;
            Inputs = inputs;
            Outputs = outputs;
        }

        /// <summary>
        /// The no-repeated-kind invariant, enforced at the TYPE boundary rather than only in
        /// the text parser (W0-5 review, item 2). The parser is the only caller today, but
        /// this container exists precisely so a future lane can build nodes programmatically,
        /// and a node built in code with <c>[Scrap:1, Scrap:1]</c> makes the sim create matter
        /// (one staged unit satisfies both ports' staging checks; port 0 drains it; the batch
        /// runs anyway — measured 1 Scrap in, 1 Parts out on a 2-Scrap bill).
        ///
        /// Throwing is safe here: construction is parse/authoring time, never a tick path.
        /// </summary>
        private static void RequireNoRepeatedKind(ProductionPort[] ports, string side)
        {
            if (ports == null) return;
            for (int i = 0; i < ports.Length; i++)
                for (int j = 0; j < i; j++)
                    if (ports[j].Kind == ports[i].Kind)
                        throw new ArgumentException(
                            "ProductionNode " + side + " names " + ports[i].Kind + " twice. Staging is "
                            + "counted per KIND while consumption is per PORT, so a repeated kind lets "
                            + "one stack satisfy two ports and the batch creates matter.", side);
        }
    }

    /// <summary>
    /// The <c>[production]</c> node table: the conversion graph as data (W0-5).
    ///
    /// It lives BESIDE <see cref="SimDefs.Recipes"/>, never replacing it. Shipped content
    /// declares ZERO nodes, so every shipped station still runs its legacy
    /// <see cref="RecipeDef"/> — see <see cref="TryGetBill"/>, the one additive lookup
    /// <see cref="CraftingSystem"/> goes through. That keeps W0-5 behaviour-free while
    /// giving the E-PROD lane a container the designed graph actually fits.
    ///
    /// ORDER IS SIGNIFICANT, unlike <c>[machines]</c>/<c>[recipes]</c>: the table is an
    /// ordered list (row order = file order, files Ordinal-sorted by the host), the
    /// checksum folds it in that order, and <see cref="TryGetBill"/> resolves a station's
    /// bill by ORDINAL within that order.
    /// </summary>
    public sealed class ProductionDefs
    {
        /// <summary>Every declared node, in table order. Empty in shipped content.
        /// Never null after <see cref="SimDefs.CreateDefault"/> or a parse.</summary>
        public ProductionNode[] Nodes;

        /// <summary>How many nodes name <paramref name="station"/>. Zero ⇒ the station falls
        /// back to its legacy <see cref="SimDefs.Recipes"/> row. More than one ⇒ only ordinal
        /// 0 ever runs (see <see cref="TryGetBill"/>); the parser warns when that happens.</summary>
        public int CountFor(DeviceKind station)
        {
            if (Nodes == null) return 0;
            int n = 0;
            for (int i = 0; i < Nodes.Length; i++) if (Nodes[i].Station == station) n++;
            return n;
        }

        /// <summary>The <paramref name="ordinal"/>-th node (table order) declared on
        /// <paramref name="station"/>. False when there is no such node.</summary>
        public bool TryGetNode(DeviceKind station, int ordinal, out ProductionNode node)
        {
            if (Nodes != null && ordinal >= 0)
            {
                int seen = 0;
                for (int i = 0; i < Nodes.Length; i++)
                {
                    if (Nodes[i].Station != station) continue;
                    if (seen == ordinal) { node = Nodes[i]; return true; }
                    seen++;
                }
            }
            node = default;
            return false;
        }

        /// <summary>
        /// THE additive lookup (W0-5): a station prefers its <c>[production]</c> bill and
        /// FALLS BACK to the legacy <see cref="SimDefs.Recipes"/> array.
        ///
        /// Provisional selection policy: <b>ordinal 0</b> — the first node in table order
        /// declared on this station. Choosing among several bills on one station needs
        /// per-station state (which bill is mid-batch, quotas, priorities) and therefore a
        /// save chapter, which is E-PROD's <c>PROD</c> blob, not W0-5's. Rows beyond
        /// ordinal 0 are parsed, checksummed and reachable via <see cref="TryGetNode"/>
        /// but are NOT selected here — the parser emits a problem line saying so, and
        /// MECHANICS.md §13.12 records it.
        ///
        /// Zero-alloc: an <c>out</c> struct over arrays that already exist.
        /// </summary>
        public static bool TryGetBill(SimDefs defs, DeviceKind station, out ProductionBill bill)
        {
            if (defs.Production != null && defs.Production.TryGetNode(station, 0, out var node))
            {
                bill = new ProductionBill(node);
                return true;
            }
            var legacy = defs.Recipes[(int)station];
            bill = new ProductionBill(legacy);
            return legacy.Defined;
        }
    }

    /// <summary>
    /// What <see cref="CraftingSystem"/> actually runs: either a <c>[production]</c>
    /// <see cref="ProductionNode"/> or a legacy <see cref="RecipeDef"/>, behind one
    /// port-indexed surface. A readonly struct over already-allocated arrays — pass it
    /// <c>in</c>; constructing one allocates nothing, so the 1 Hz crafting pass stays
    /// zero-alloc.
    ///
    /// The legacy projection is exactly one input port and one output port, which is what
    /// makes "shipped values ≡ today" checkable by inspection.
    /// </summary>
    public readonly struct ProductionBill
    {
        private readonly ProductionNode _node;   // Inputs != null ⇒ this is a graph node
        private readonly RecipeDef _legacy;

        public ProductionBill(in ProductionNode node) { _node = node; _legacy = default; }
        public ProductionBill(in RecipeDef legacy) { _node = default; _legacy = legacy; }

        /// <summary>True when this bill came from the <c>[production]</c> table rather than
        /// the legacy array. The tripwire the tests assert on.</summary>
        public bool IsGraphNode => _node.Inputs != null;

        /// <summary>Is there a bill at all? (A non-crafting DeviceKind has neither.)</summary>
        public bool Defined => IsGraphNode || _legacy.Defined;

        public string Id => IsGraphNode ? _node.Id : "(legacy)";
        public int WorkSeconds => IsGraphNode ? _node.WorkSeconds : _legacy.WorkSeconds;

        public int InputPortCount => IsGraphNode ? _node.Inputs.Length : 1;
        public ProductionPort Input(int i) =>
            IsGraphNode ? _node.Inputs[i] : new ProductionPort(_legacy.Input, _legacy.InputCount);

        public int OutputPortCount => IsGraphNode ? _node.Outputs.Length : 1;
        public ProductionPort Output(int i) =>
            IsGraphNode ? _node.Outputs[i] : new ProductionPort(_legacy.Output, _legacy.OutputCount);
    }
}
