using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using Moonbase.Sim;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>Regression for the live de-DE bug: under a comma-decimal locale,
    /// <c>float.Parse("0.5")</c> yields 5. The parser must pin InvariantCulture so
    /// "0.5" is one-half regardless of the ambient culture.</summary>
    public class DefsCultureTests
    {
        [Test]
        public void ParsesDotDecimalUnderGermanLocale()
        {
            var previous = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                var problems = new List<string>();
                var d = DefsParser.Parse(new[] { ("t.def", "[sustenance]\ndrink_liters = 0.5\n") }, problems);
                Assert.That(problems, Is.Empty);
                Assert.That(d.Sustenance.DrinkLiters, Is.EqualTo(0.5f));
            }
            finally
            {
                Thread.CurrentThread.CurrentCulture = previous;
            }
        }

        [Test]
        public void ParsesDoubleAndInt_UnderGermanLocale()
        {
            var previous = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                var problems = new List<string>();
                var d = DefsParser.Parse(new[] { ("t.def", "[thermal]\nhull_loss_w_per_k_per_tile = 0.09\n[citizen]\nticks_per_tile = 7\n") }, problems);
                Assert.That(problems, Is.Empty);
                Assert.That(d.Thermal.HullLossWPerKelvinPerTile, Is.EqualTo(0.09));
                Assert.That(d.Citizen.TicksPerTile, Is.EqualTo(7));
            }
            finally
            {
                Thread.CurrentThread.CurrentCulture = previous;
            }
        }
    }
}
