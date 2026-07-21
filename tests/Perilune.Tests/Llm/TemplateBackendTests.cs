using System.Collections.Generic;
using NUnit.Framework;
using Perilune.Llm;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// The offline template backend: intent routing (≥5 intents), trait/mood
    /// conditioning, and — crucially — effects emitted ONLY when the matching kind is in
    /// the capability manifest, exactly as a tool-using model is constrained by the enum
    /// schema. Deterministic given (persona, manifest, text).
    /// </summary>
    [TestFixture]
    public sealed class TemplateBackendTests
    {
        private static ConversationRequest Request(float mood = 0f, params EffectOption[] caps)
        {
            var req = new ConversationRequest
            {
                CitizenName = "Okafor",
                Mood = mood,
                Traits = new List<string> { "sardonic" },
            };
            if (caps != null) req.CapabilitySummary.AddRange(caps);
            return req;
        }

        [TestCase("hey there", Intent.Greet)]
        [TestCase("what happened during the raid?", Intent.AskRaid)]
        [TestCase("got any secrets?", Intent.AskSecret)]
        [TestCase("come with me", Intent.RequestFollow)]
        [TestCase("can you help with this task?", Intent.RequestWork)]
        [TestCase("you're useless", Intent.Insult)]
        [TestCase("thanks a lot", Intent.Thanks)]
        [TestCase("goodbye", Intent.Farewell)]
        [TestCase("the flux capacitor hums", Intent.Unknown)]
        public void ClassifyIntent_RoutesKeywords(string text, Intent expected)
        {
            Assert.That(TemplateBackend.ClassifyIntent(text), Is.EqualTo(expected));
        }

        [Test]
        public void AskSecret_EmitsRevealInfo_OnlyWhenWhitelisted()
        {
            var backend = new TemplateBackend();

            ChatResult withCap = backend.Respond(
                Request(0f, new EffectOption(EffectKind.RevealInfo, 7u, "the cache in D-7")),
                "do you have any secrets?");
            Assert.That(HasKind(withCap, EffectKind.RevealInfo), Is.True);

            ChatResult noCap = backend.Respond(Request(0f), "do you have any secrets?");
            Assert.That(HasKind(noCap, EffectKind.RevealInfo), Is.False,
                "no reveal when the manifest offers none — the whitelist gates it");
        }

        [Test]
        public void Insult_EmitsNegativeDisposition_WhenWhitelisted()
        {
            var backend = new TemplateBackend();
            ChatResult r = backend.Respond(
                Request(0f, new EffectOption(EffectKind.SetDisposition, 0u, "standing")),
                "you are pathetic");

            ProposedEffect disp = null;
            foreach (ProposedEffect e in r.Effects)
                if (e.Kind == EffectKind.SetDisposition) disp = e;
            Assert.That(disp, Is.Not.Null);
            Assert.That(disp.Magnitude, Is.LessThan(0f), "an insult lowers standing");
        }

        [Test]
        public void LowMood_PrependsCurtPrefix()
        {
            var backend = new TemplateBackend();
            ChatResult r = backend.Respond(Request(-50f), "hello");
            Assert.That(r.ReplyText.Length, Is.GreaterThan(0));
            // Curt prefixes end with a period and lead the line; a plain greeting would not
            // start with "Make it quick." / "Hurry it up." / "What. I'm not in the mood."
            bool curt = r.ReplyText.StartsWith("Make it quick.", System.StringComparison.Ordinal)
                     || r.ReplyText.StartsWith("Hurry it up.", System.StringComparison.Ordinal)
                     || r.ReplyText.StartsWith("What. I'm not in the mood.", System.StringComparison.Ordinal);
            Assert.That(curt, Is.True, "low mood should turn the reply curt");
        }

        [Test]
        public void Respond_IsDeterministic()
        {
            var backend = new TemplateBackend();
            var caps = new EffectOption(EffectKind.RevealInfo, 7u, "the cache");
            ChatResult a = backend.Respond(Request(0f, caps), "any secrets to share?");
            ChatResult b = backend.Respond(Request(0f, caps), "any secrets to share?");
            Assert.That(b.ReplyText, Is.EqualTo(a.ReplyText));
            Assert.That(b.Effects.Count, Is.EqualTo(a.Effects.Count));
        }

        [Test]
        public void Caps_ReportOfflineNonStreamingNoTools()
        {
            BackendCapabilities caps = new TemplateBackend().Caps;
            Assert.That(caps.Name, Is.EqualTo("template"));
            Assert.That(caps.SupportsStreaming, Is.False);
            Assert.That(caps.SupportsTools, Is.False);
            Assert.That(caps.MaxEffects, Is.GreaterThan(0));
        }

        private static bool HasKind(ChatResult r, EffectKind kind)
        {
            foreach (ProposedEffect e in r.Effects)
                if (e.Kind == kind) return true;
            return false;
        }
    }
}
