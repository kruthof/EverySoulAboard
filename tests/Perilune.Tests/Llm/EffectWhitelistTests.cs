using System;
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using Perilune.Sim;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// The whitelist is a closed vocabulary, enforced at the type level: an
    /// out-of-whitelist mutation ("spawn 1000 steel", "set_stat") is UNREPRESENTABLE —
    /// no such record type or effect-kind exists to construct. This is a compile-surface
    /// assertion via reflection over the effect record set (PLAN.md WS-LLM P1 test #5):
    /// adding a rogue effect makes it fail.
    /// </summary>
    [TestFixture]
    public sealed class EffectWhitelistTests
    {
        private static readonly string[] Whitelist =
        {
            "AgreeTask", "EndConversation", "FollowPlayer",
            "RevealInfo", "SetDisposition", "SetEmotionalState",
        };

        [Test]
        public void ConcreteCitizenEffectRecords_AreExactlyTheWhitelist()
        {
            Type baseType = typeof(CitizenEffect);
            var names = new List<string>();
            foreach (Type t in baseType.Assembly.GetTypes())
            {
                if (t.IsClass && !t.IsAbstract && baseType.IsAssignableFrom(t))
                    names.Add(t.Name);
            }
            names.Sort(StringComparer.Ordinal);

            Assert.That(names, Is.EqualTo(Whitelist),
                "the CitizenEffect vocabulary is closed — no spawn/set-stat effect can exist");
        }

        [Test]
        public void SimEffectKind_EnumMatchesTheWhitelist()
        {
            var names = new List<string>(Enum.GetNames(typeof(EffectKind)));
            names.Remove("None"); // the empty flag
            names.Sort(StringComparer.Ordinal);
            Assert.That(names, Is.EqualTo(Whitelist));
        }

        [Test]
        public void ProposableEffectKinds_AreASubsetOfTheWhitelist()
        {
            // What a backend can even propose is a subset of the sim vocabulary — there is
            // no proposal member outside it (no "GiveResource", no "SetStat").
            foreach (string name in Enum.GetNames(typeof(Perilune.Llm.EffectKind)))
                Assert.That(Array.IndexOf(Whitelist, name), Is.GreaterThanOrEqualTo(0),
                    "proposable kind '" + name + "' is not in the sim whitelist");
        }

        [Test]
        public void EffectPayloads_CarryOnlyBoundedValueTypes_NoSimReferenceEscapeHatch()
        {
            // Every whitelisted effect's constructor parameters are bounded scalars,
            // strings, enums or Int3 — never object/dictionary (an "any value" hatch) and
            // never a live sim type (Simulation/Citizen/CitizenMind). An effect cannot
            // smuggle a reference back into the sim or an unbounded payload.
            var allowed = new HashSet<Type>
            {
                typeof(uint), typeof(int), typeof(float), typeof(bool), typeof(string),
                typeof(Int3), typeof(JobKind),
            };
            Type baseType = typeof(CitizenEffect);
            foreach (Type t in baseType.Assembly.GetTypes())
            {
                if (!t.IsClass || t.IsAbstract || !baseType.IsAssignableFrom(t)) continue;
                foreach (ConstructorInfo ctor in t.GetConstructors())
                    foreach (ParameterInfo p in ctor.GetParameters())
                        Assert.That(allowed.Contains(p.ParameterType), Is.True,
                            t.Name + " parameter '" + p.Name + "' has disallowed type " + p.ParameterType.Name);
            }
        }
    }
}
