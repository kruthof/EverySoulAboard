using System;
using System.Collections.Generic;
using Moonbase.Glyph;
using Moonbase.Sim;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// The vocabulary is the single source of truth for glyphs; these guard it against a
    /// new DeviceKind/ItemKind silently rendering as '?' or two kinds colliding on one
    /// glyph. Intentional shares (Conduit/Pipe = '~') are whitelisted, not tolerated
    /// blanket.
    /// </summary>
    public class GlyphVocabularyTests
    {
        [Test]
        public void EveryDeviceKindHasAGlyph()
        {
            foreach (DeviceKind kind in Enum.GetValues(typeof(DeviceKind)))
                Assert.That(Glyphs.ForDevice(kind), Is.Not.EqualTo('?'),
                    $"DeviceKind.{kind} has no glyph");
        }

        [Test]
        public void EveryItemKindHasAGlyph()
        {
            foreach (ItemKind kind in Enum.GetValues(typeof(ItemKind)))
                Assert.That(Glyphs.ForItem(kind), Is.Not.EqualTo('?'),
                    $"ItemKind.{kind} has no glyph");
        }

        [Test]
        public void DeviceGlyphCollisionsAreOnlyTheConduitPipeShare()
        {
            var byGlyph = new Dictionary<char, List<DeviceKind>>();
            foreach (DeviceKind kind in Enum.GetValues(typeof(DeviceKind)))
            {
                char g = Glyphs.ForDevice(kind);
                if (!byGlyph.TryGetValue(g, out var list)) byGlyph[g] = list = new List<DeviceKind>();
                list.Add(kind);
            }

            foreach (var pair in byGlyph)
            {
                if (pair.Value.Count == 1) continue;
                // The only permitted collision: the service-tray lines Conduit and Pipe.
                CollectionAssert.AreEquivalent(
                    new[] { DeviceKind.Conduit, DeviceKind.Pipe }, pair.Value,
                    $"unexpected glyph collision on '{pair.Key}'");
            }
        }

        [Test]
        public void ItemGlyphsAreAllDistinct()
        {
            var seen = new Dictionary<char, ItemKind>();
            foreach (ItemKind kind in Enum.GetValues(typeof(ItemKind)))
            {
                char g = Glyphs.ForItem(kind);
                Assert.That(seen.ContainsKey(g), Is.False,
                    $"ItemKind.{kind} and ItemKind.{(seen.TryGetValue(g, out var k) ? k : default)} share '{g}'");
                seen[g] = kind;
            }
        }
    }
}
