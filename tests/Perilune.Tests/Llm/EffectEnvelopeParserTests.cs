using System.Collections.Generic;
using System.Text;
using NUnit.Framework;
using Perilune.Llm;
using Perilune.Llm.Providers;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Package L4 — the JSON-envelope parser in isolation. Covers the happy path (array and
    /// {effects:[...]} shapes), visible-text cleaning, the manifest resolution (index → real target
    /// id; out-of-manifest indices pass through as the raw index so the translator is the guard),
    /// the per-turn cap, and a fuzz corpus: nested/extra fences, unterminated JSON, a 10k-entry
    /// array, non-numeric magnitudes, and unicode — none of which may throw.
    /// </summary>
    [TestFixture]
    public sealed class EffectEnvelopeParserTests
    {
        private static ConversationRequest Caps(params EffectOption[] opts)
        {
            var r = new ConversationRequest { CitizenName = "Okafor" };
            foreach (EffectOption o in opts) r.CapabilitySummary.Add(o);
            return r;
        }

        private static ConversationRequest RevealCaps()
            => Caps(new EffectOption(EffectKind.RevealInfo, 7u, "the cache in D-7"));

        [Test]
        public void Array_Extracted_TextCleaned_IndexResolvedThroughManifest()
        {
            string reply = "Maybe. There's a cache in D-7.\n\n```json\n"
                + "[{\"kind\": \"RevealInfo\", \"target_index\": 0, \"magnitude\": 0}]\n```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, RevealCaps(), 4);

            Assert.That(r.VisibleText, Is.EqualTo("Maybe. There's a cache in D-7."));
            Assert.That(r.VisibleText, Does.Not.Contain("```"));
            Assert.That(r.Effects.Count, Is.EqualTo(1));
            Assert.That(r.Effects[0].Kind, Is.EqualTo(EffectKind.RevealInfo));
            Assert.That(r.Effects[0].TargetId, Is.EqualTo(7u), "index 0 resolved to fact id 7");
        }

        [Test]
        public void ObjectWithEffectsKey_AlsoAccepted()
        {
            string reply = "Fine.\n```json\n{\"effects\":[{\"kind\":\"SetDisposition\",\"target_index\":0,\"magnitude\":3}]}\n```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, Caps(new EffectOption(EffectKind.SetDisposition, 0u, "standing")), 4);
            Assert.That(r.VisibleText, Is.EqualTo("Fine."));
            Assert.That(r.Effects.Count, Is.EqualTo(1));
            Assert.That(r.Effects[0].Kind, Is.EqualTo(EffectKind.SetDisposition));
            Assert.That(r.Effects[0].Magnitude, Is.EqualTo(3f));
        }

        [Test]
        public void NoFence_YieldsReplyAndNoEffects()
        {
            EnvelopeResult r = EffectEnvelopeParser.Parse("Just a spoken line, no actions.", RevealCaps(), 4);
            Assert.That(r.VisibleText, Is.EqualTo("Just a spoken line, no actions."));
            Assert.That(r.Effects.Count, Is.EqualTo(0));
        }

        [Test]
        public void ExtraCodeFenceAfterEffects_StillFindsTheEffectsBlock()
        {
            // A non-JSON code block sits AFTER the effects block: the parser walks fence pairs from
            // the tail, skips the one that isn't an effects array, and uses the json one.
            string reply = "Here.\n```json\n[{\"kind\":\"RevealInfo\",\"target_index\":0,\"magnitude\":0}]\n```\n"
                + "and unrelated: ```echo hi```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, RevealCaps(), 4);
            Assert.That(r.Effects.Count, Is.EqualTo(1));
            Assert.That(r.Effects[0].TargetId, Is.EqualTo(7u));
        }

        [Test]
        public void TwoEffectBlocks_TheTailmostWins()
        {
            string reply = "```json\n[{\"kind\":\"FollowPlayer\",\"target_index\":0,\"magnitude\":1}]\n```\n"
                + "```json\n[{\"kind\":\"RevealInfo\",\"target_index\":0,\"magnitude\":0}]\n```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, RevealCaps(), 4);
            Assert.That(r.Effects.Count, Is.EqualTo(1));
            Assert.That(r.Effects[0].Kind, Is.EqualTo(EffectKind.RevealInfo), "the tail effects block wins");
        }

        [Test]
        public void UnterminatedJson_NoThrow_NoEffects()
        {
            string reply = "Thinking...\n```json\n[{\"kind\": \"RevealInfo\", \"target_ind";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, RevealCaps(), 4);
            Assert.That(r.Effects.Count, Is.EqualTo(0), "a single (unclosed) fence forms no pair");
            Assert.That(r.VisibleText, Does.Contain("Thinking..."));
        }

        [Test]
        public void FencedButInvalidJson_NoThrow_NoEffects_TextNotStripped()
        {
            string reply = "See below.\n```json\n{ this is not json ]\n```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, RevealCaps(), 4);
            Assert.That(r.Effects.Count, Is.EqualTo(0));
            Assert.That(r.VisibleText, Does.Contain("See below."));
        }

        [Test]
        public void OutOfManifestIndex_PassesThrough_AsRawIndex()
        {
            // caps has one entry; the model names index 5. The parser passes it through (raw index as
            // target id) — ConversationService.TryTranslate is the guard that later rejects it.
            string reply = "```json\n[{\"kind\":\"RevealInfo\",\"target_index\":5,\"magnitude\":0}]\n```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, RevealCaps(), 4);
            Assert.That(r.Effects.Count, Is.EqualTo(1));
            Assert.That(r.Effects[0].Kind, Is.EqualTo(EffectKind.RevealInfo));
            Assert.That(r.Effects[0].TargetId, Is.EqualTo(5u), "out-of-range index passes through unresolved");
        }

        [Test]
        public void TenThousandEffects_CappedAtMaxEffects()
        {
            var sb = new StringBuilder("Overkill.\n```json\n[");
            for (int i = 0; i < 10000; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"kind\":\"SetDisposition\",\"target_index\":0,\"magnitude\":1}");
            }
            sb.Append("]\n```");
            EnvelopeResult r = EffectEnvelopeParser.Parse(sb.ToString(), Caps(new EffectOption(EffectKind.SetDisposition, 0u, "x")), 4);
            Assert.That(r.Effects.Count, Is.EqualTo(4), "the per-turn cap holds even against a flood");
        }

        [Test]
        public void NonNumericMagnitude_EntryDropped()
        {
            string reply = "```json\n[{\"kind\":\"RevealInfo\",\"target_index\":0,\"magnitude\":\"lots\"}]\n```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, RevealCaps(), 4);
            Assert.That(r.Effects.Count, Is.EqualTo(0), "a non-numeric magnitude makes the entry invalid");
        }

        [Test]
        public void UnknownKind_EntryDropped_ValidSiblingKept()
        {
            string reply = "```json\n["
                + "{\"kind\":\"Teleport\",\"target_index\":0,\"magnitude\":1},"
                + "{\"kind\":\"RevealInfo\",\"target_index\":0,\"magnitude\":0}]\n```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, RevealCaps(), 4);
            Assert.That(r.Effects.Count, Is.EqualTo(1), "unknown kind dropped, valid sibling kept");
            Assert.That(r.Effects[0].Kind, Is.EqualTo(EffectKind.RevealInfo));
        }

        [Test]
        public void Unicode_PreservedInText_AndEffectParsed()
        {
            string reply = "Café — уборка — 目標 ✦\n```json\n[{\"kind\":\"RevealInfo\",\"target_index\":0,\"magnitude\":0}]\n```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, RevealCaps(), 4);
            Assert.That(r.VisibleText, Is.EqualTo("Café — уборка — 目標 ✦"));
            Assert.That(r.Effects.Count, Is.EqualTo(1));
        }

        [Test]
        public void EmptyEffectsArray_StripsBlock_NoEffects()
        {
            EnvelopeResult r = EffectEnvelopeParser.Parse("Nothing to do.\n```json\n[]\n```", RevealCaps(), 4);
            Assert.That(r.Effects.Count, Is.EqualTo(0));
            Assert.That(r.VisibleText, Is.EqualTo("Nothing to do."), "an empty (but valid) block is still stripped");
        }

        [Test]
        public void MaxEffectsZero_MeansUncapped()
        {
            string reply = "```json\n["
                + "{\"kind\":\"SetDisposition\",\"target_index\":0,\"magnitude\":1},"
                + "{\"kind\":\"SetDisposition\",\"target_index\":0,\"magnitude\":2},"
                + "{\"kind\":\"SetDisposition\",\"target_index\":0,\"magnitude\":3}]\n```";
            EnvelopeResult r = EffectEnvelopeParser.Parse(reply, Caps(new EffectOption(EffectKind.SetDisposition, 0u, "x")), 0);
            Assert.That(r.Effects.Count, Is.EqualTo(3), "cap of 0 is uncapped");
        }
    }
}
