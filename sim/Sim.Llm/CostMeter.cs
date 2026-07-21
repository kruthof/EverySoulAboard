using System;
using System.Collections.Generic;
using System.Globalization;

namespace Perilune.Llm
{
    /// <summary>Per-model token prices in USD per one million tokens (decimal, for exact accounting).
    /// Missing cache prices default to zero.</summary>
    public readonly struct ModelPrice
    {
        public decimal InputPerMillion { get; }
        public decimal OutputPerMillion { get; }
        public decimal CacheReadPerMillion { get; }
        public decimal CacheWritePerMillion { get; }

        public ModelPrice(decimal inputPerMillion, decimal outputPerMillion,
            decimal cacheReadPerMillion = 0m, decimal cacheWritePerMillion = 0m)
        {
            InputPerMillion = inputPerMillion;
            OutputPerMillion = outputPerMillion;
            CacheReadPerMillion = cacheReadPerMillion;
            CacheWritePerMillion = cacheWritePerMillion;
        }
    }

    /// <summary>How the budget guard recommends shedding load when the rolling hourly cost exceeds
    /// the cap — in the fixed order Background → Summary → Dialogue-to-Template (doc §6, §11).</summary>
    public enum ShedLevel
    {
        /// <summary>Under budget — nothing to shed.</summary>
        None = 0,
        /// <summary>Drop background (P2) enrichment jobs.</summary>
        Background = 1,
        /// <summary>Also drop conversation-end summaries (P1).</summary>
        Summary = 2,
        /// <summary>Also route live dialogue (P0) to the offline template backend.</summary>
        DialogueToTemplate = 3,
    }

    /// <summary>
    /// Pure LLM cost accounting (LLM_CITIZENS.md §6, §11). Sums per-turn <see cref="TurnUsage"/> into
    /// per-lane totals and a rolling 60-minute window, and recommends a shed level when the projected
    /// hourly cost exceeds the injected budget cap. It holds NO clock: the host injects every
    /// wall-clock timestamp (into <see cref="Record"/>) and the reference "now" (into the query
    /// methods), which keeps the meter deterministic and testable with a fake clock. All money
    /// formatting is InvariantCulture — the dev machine's de-DE/tr-TR locale is a live culture-bug
    /// canary.
    /// </summary>
    public sealed class CostMeter
    {
        private static readonly TimeSpan Window = TimeSpan.FromMinutes(60);

        private readonly IReadOnlyDictionary<string, ModelPrice> _prices;
        private readonly decimal _budgetPerHour;

        private readonly decimal[] _laneTotals = new decimal[3]; // by LlmPriority
        private decimal _grandTotal;

        // Rolling window, in arrival order (host injects monotonic timestamps).
        private readonly List<Entry> _window = new List<Entry>();

        private readonly struct Entry
        {
            public readonly DateTime Time;
            public readonly decimal Cost;
            public readonly LlmPriority Lane;
            public Entry(DateTime time, decimal cost, LlmPriority lane) { Time = time; Cost = cost; Lane = lane; }
        }

        /// <param name="prices">Per-model price table. A model absent from it costs zero (offline turns).</param>
        /// <param name="budgetPerHourUsd">The hourly spend cap the shed recommendation defends.</param>
        public CostMeter(IReadOnlyDictionary<string, ModelPrice> prices, decimal budgetPerHourUsd)
        {
            _prices = prices ?? new Dictionary<string, ModelPrice>();
            _budgetPerHour = budgetPerHourUsd < 0m ? 0m : budgetPerHourUsd;
        }

        /// <summary>The dollar cost of one turn's usage under the price table — pure, no state change.</summary>
        public decimal CostOf(TurnUsage usage)
        {
            if (usage == null || usage.Model == null || !_prices.TryGetValue(usage.Model, out ModelPrice p))
                return 0m;
            return usage.InputTokens * p.InputPerMillion / 1_000_000m
                 + usage.OutputTokens * p.OutputPerMillion / 1_000_000m
                 + usage.CacheReadTokens * p.CacheReadPerMillion / 1_000_000m
                 + usage.CacheWriteTokens * p.CacheWritePerMillion / 1_000_000m;
        }

        /// <summary>Record one completed turn's usage against a lane, stamped with the host's wall clock.</summary>
        public void Record(TurnUsage usage, LlmPriority lane, DateTime wallClock)
        {
            decimal cost = CostOf(usage);
            _grandTotal += cost;
            _laneTotals[(int)lane] += cost;
            _window.Add(new Entry(wallClock, cost, lane));
            PruneBefore(wallClock - Window);
        }

        /// <summary>Cumulative dollars spent since construction.</summary>
        public decimal TotalUsd => _grandTotal;

        /// <summary>Cumulative dollars spent on one lane.</summary>
        public decimal LaneTotalUsd(LlmPriority lane) => _laneTotals[(int)lane];

        /// <summary>Dollars incurred in the trailing 60 minutes ending at <paramref name="now"/> — the
        /// projected hourly burn rate.</summary>
        public decimal CostPerHourUsd(DateTime now) => WindowCost(now, laneFilter: null);

        /// <summary>
        /// The budget-guard recommendation: which lanes to shed so the trailing-hour cost drops under
        /// the cap. Shedding is escalated in the fixed order Background → Summary → Dialogue-to-Template
        /// using each lane's own share of the window, so we shed exactly as much as the overage requires.
        /// </summary>
        public ShedLevel Recommend(DateTime now)
        {
            decimal bg = WindowCost(now, LlmPriority.Background);
            decimal sm = WindowCost(now, LlmPriority.Summary);
            decimal dl = WindowCost(now, LlmPriority.Dialogue);
            decimal total = bg + sm + dl;

            if (total <= _budgetPerHour) return ShedLevel.None;
            if (total - bg <= _budgetPerHour) return ShedLevel.Background;
            if (total - bg - sm <= _budgetPerHour) return ShedLevel.Summary;
            return ShedLevel.DialogueToTemplate;
        }

        /// <summary>Format a dollar amount for the debug meter — always InvariantCulture ("$0.0000").</summary>
        public static string FormatUsd(decimal amount)
            => "$" + amount.ToString("0.0000", CultureInfo.InvariantCulture);

        private decimal WindowCost(DateTime now, LlmPriority? laneFilter)
        {
            DateTime cutoff = now - Window;
            decimal sum = 0m;
            for (int i = 0; i < _window.Count; i++)
            {
                Entry e = _window[i];
                if (e.Time <= cutoff || e.Time > now) continue;
                if (laneFilter.HasValue && e.Lane != laneFilter.Value) continue;
                sum += e.Cost;
            }
            return sum;
        }

        private void PruneBefore(DateTime cutoff)
        {
            // Timestamps arrive monotonically, so old entries cluster at the front.
            int drop = 0;
            while (drop < _window.Count && _window[drop].Time <= cutoff) drop++;
            if (drop > 0) _window.RemoveRange(0, drop);
        }
    }
}
