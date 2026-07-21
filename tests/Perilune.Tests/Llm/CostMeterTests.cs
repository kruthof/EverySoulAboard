using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using NUnit.Framework;
using Perilune.Llm;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Package L5 — the pure cost meter: per-turn pricing, per-lane and total accounting, the rolling
    /// 60-minute window (fake clock), the budget-guard shed order (Background → Summary →
    /// Dialogue-to-Template), and InvariantCulture money formatting under a comma-decimal locale.
    /// </summary>
    [TestFixture]
    public sealed class CostMeterTests
    {
        private static readonly DateTime T0 = new DateTime(2026, 7, 21, 12, 0, 0, DateTimeKind.Utc);

        // Priced so cost = tokens * 0.001 (1000 $/M). Handy round dollars from small token counts.
        private static Dictionary<string, ModelPrice> Prices() => new Dictionary<string, ModelPrice>
        {
            ["m"] = new ModelPrice(inputPerMillion: 1000m, outputPerMillion: 2000m, cacheReadPerMillion: 100m, cacheWritePerMillion: 1250m),
        };

        private static TurnUsage Usage(int input, int output = 0, int cacheRead = 0, int cacheWrite = 0, string model = "m")
            => new TurnUsage(input, output, cacheRead, cacheWrite, model);

        [Test]
        public void CostOf_UsesTheInjectedPriceTable_IncludingCacheFields()
        {
            var meter = new CostMeter(Prices(), 100m);
            // input 100 * 0.001 + output 50 * 0.002 + cacheRead 200*0.0001 + cacheWrite 40*0.00125
            decimal c = meter.CostOf(Usage(100, 50, 200, 40));
            Assert.That(c, Is.EqualTo(0.1m + 0.1m + 0.02m + 0.05m));
        }

        [Test]
        public void UnknownModel_CostsZero()
        {
            var meter = new CostMeter(Prices(), 100m);
            Assert.That(meter.CostOf(Usage(1000, model: "template")), Is.EqualTo(0m));
        }

        [Test]
        public void Record_AccumulatesPerLaneAndTotal()
        {
            var meter = new CostMeter(Prices(), 100m);
            meter.Record(Usage(100), LlmPriority.Dialogue, T0);      // $0.10
            meter.Record(Usage(200), LlmPriority.Background, T0);    // $0.20
            meter.Record(Usage(300), LlmPriority.Dialogue, T0);      // $0.30

            Assert.That(meter.LaneTotalUsd(LlmPriority.Dialogue), Is.EqualTo(0.40m));
            Assert.That(meter.LaneTotalUsd(LlmPriority.Background), Is.EqualTo(0.20m));
            Assert.That(meter.TotalUsd, Is.EqualTo(0.60m));
        }

        [Test]
        public void CostPerHour_IsTheTrailing60MinuteWindow()
        {
            var meter = new CostMeter(Prices(), 100m);
            meter.Record(Usage(500), LlmPriority.Dialogue, T0);                       // 90 min before query
            meter.Record(Usage(100), LlmPriority.Dialogue, T0.AddMinutes(30));        // 60 min before query (boundary-out)
            meter.Record(Usage(400), LlmPriority.Dialogue, T0.AddMinutes(75));        // 15 min before query

            DateTime now = T0.AddMinutes(90);
            // Only the 15-min-old entry ($0.40) is strictly inside the trailing hour; the T0 and
            // T0+30 entries are 90 and 60 minutes old (the 60-min one falls on the exclusive edge).
            Assert.That(meter.CostPerHourUsd(now), Is.EqualTo(0.40m));
        }

        [Test]
        public void Recommend_ShedsBackgroundFirst()
        {
            var meter = new CostMeter(Prices(), 0.50m);
            meter.Record(Usage(300), LlmPriority.Dialogue, T0);    // 0.30
            meter.Record(Usage(100), LlmPriority.Summary, T0);     // 0.10
            meter.Record(Usage(200), LlmPriority.Background, T0);  // 0.20  → total 0.60 > 0.50
            // Dropping background (0.20) → 0.40 ≤ 0.50.
            Assert.That(meter.Recommend(T0), Is.EqualTo(ShedLevel.Background));
        }

        [Test]
        public void Recommend_EscalatesToSummary_WhenBackgroundAloneIsNotEnough()
        {
            var meter = new CostMeter(Prices(), 0.50m);
            meter.Record(Usage(400), LlmPriority.Dialogue, T0);    // 0.40
            meter.Record(Usage(200), LlmPriority.Summary, T0);     // 0.20
            meter.Record(Usage(100), LlmPriority.Background, T0);  // 0.10  → total 0.70
            // shed bg → 0.60 (>0.50); shed bg+summary → 0.40 (≤0.50)
            Assert.That(meter.Recommend(T0), Is.EqualTo(ShedLevel.Summary));
        }

        [Test]
        public void Recommend_EscalatesToDialogueToTemplate_WhenDialogueAloneBlowsTheCap()
        {
            var meter = new CostMeter(Prices(), 0.50m);
            meter.Record(Usage(600), LlmPriority.Dialogue, T0);    // 0.60 alone > cap
            Assert.That(meter.Recommend(T0), Is.EqualTo(ShedLevel.DialogueToTemplate));
        }

        [Test]
        public void Recommend_None_WhenUnderBudget()
        {
            var meter = new CostMeter(Prices(), 0.50m);
            meter.Record(Usage(100), LlmPriority.Dialogue, T0);
            Assert.That(meter.Recommend(T0), Is.EqualTo(ShedLevel.None));
        }

        [Test]
        public void Recommend_UsesOnlyTheWindow_OldSpendDropsOut()
        {
            var meter = new CostMeter(Prices(), 0.50m);
            meter.Record(Usage(900), LlmPriority.Dialogue, T0);              // $0.90, but 2h old at query
            meter.Record(Usage(100), LlmPriority.Dialogue, T0.AddHours(2));  // $0.10 fresh
            Assert.That(meter.Recommend(T0.AddHours(2)), Is.EqualTo(ShedLevel.None),
                "the old $0.90 has aged out of the hour window");
        }

        [Test]
        public void FormatUsd_IsInvariant_UnderTrTr()
        {
            CultureInfo original = CultureInfo.CurrentCulture;
            try
            {
                CultureInfo.CurrentCulture = new CultureInfo("tr-TR"); // comma decimal separator
                Assert.That(CostMeter.FormatUsd(1.5m), Is.EqualTo("$1.5000"), "dot, not tr-TR comma");
                Assert.That(CostMeter.FormatUsd(0.125m), Is.EqualTo("$0.1250"));
            }
            finally
            {
                CultureInfo.CurrentCulture = original;
            }
        }
    }
}
