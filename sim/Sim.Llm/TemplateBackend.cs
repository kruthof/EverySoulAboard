using System;
using System.Collections.Generic;

namespace Moonbase.Llm
{
    /// <summary>
    /// Player-utterance intents recognized by the offline template backend
    /// (LLM_CITIZENS.md §8). Public so tests and UI hints can inspect routing.
    /// </summary>
    public enum Intent
    {
        Unknown,
        Greet,
        AskRaid,
        AskSecret,
        RequestFollow,
        RequestWork,
        Insult,
        Thanks,
        Farewell,
    }

    /// <summary>
    /// Fully offline IChatBackend (LLM_CITIZENS.md §8, v0 step 4). Keyword/intent
    /// matching over the player utterance routes into per-intent line pools with
    /// {name} substitution, trait-keyed variants, and curt prefixes at low mood.
    /// Line selection is a deterministic hash of (citizenName + utterance) —
    /// never Random — so replays and tests are stable. Effects are only ever
    /// emitted when the matching kind appears in the request's CapabilitySummary
    /// (the whitelist contract); this backend doubles as the ground-truth harness
    /// for the effect pipeline and the runtime failover target (§10).
    /// </summary>
    public sealed class TemplateBackend : IChatBackend
    {
        // ------------------------------------------------------------------
        // Intent classification
        // ------------------------------------------------------------------

        private static readonly string[] InsultWords =
        {
            "stupid", "idiot", "useless", "worthless", "pathetic", "coward",
            "incompetent", "hate you", "shut up", "waste of air",
        };

        private static readonly string[] FarewellWords =
        {
            "bye", "goodbye", "farewell", "see you", "gotta go", "got to go",
            "i'm done", "that's all",
        };

        private static readonly string[] SecretWords =
        {
            "secret", "secrets", "hiding", "what do you know", "know anything",
            "tell me something", "cache", "confess",
        };

        private static readonly string[] RaidWords =
        {
            "raid", "lien", "attack", "what happened", "backstory", "your story",
            "your past", "before all this", "lost anyone", "survive",
        };

        private static readonly string[] FollowWords =
        {
            "follow", "come with", "with me", "join me", "stick with",
        };

        private static readonly string[] WorkWords =
        {
            "work", "job", "task", "help", "assist", "lend a hand", "duty", "shift",
        };

        private static readonly string[] ThanksWords =
        {
            "thank", "thanks", "appreciate", "grateful",
        };

        private static readonly string[] GreetWords =
        {
            "hello", "hi", "hey", "greetings", "howdy", "good morning",
            "good evening", "morning", "evening", "yo",
        };

        /// <summary>
        /// Classify a raw player utterance. Lowercased word-boundary contains-matching;
        /// priority order resolves mixed signals (an insult wins over a greeting).
        /// </summary>
        public static Intent ClassifyIntent(string utterance)
        {
            if (string.IsNullOrEmpty(utterance)) return Intent.Unknown;
            string text = utterance.ToLowerInvariant();

            if (MatchesAny(text, InsultWords)) return Intent.Insult;
            if (MatchesAny(text, FarewellWords)) return Intent.Farewell;
            if (MatchesAny(text, SecretWords)) return Intent.AskSecret;
            if (MatchesAny(text, RaidWords)) return Intent.AskRaid;
            if (MatchesAny(text, FollowWords)) return Intent.RequestFollow;
            if (MatchesAny(text, WorkWords)) return Intent.RequestWork;
            if (MatchesAny(text, ThanksWords)) return Intent.Thanks;
            if (MatchesAny(text, GreetWords)) return Intent.Greet;
            return Intent.Unknown;
        }

        private static bool MatchesAny(string text, string[] keywords)
        {
            for (int i = 0; i < keywords.Length; i++)
            {
                if (ContainsWord(text, keywords[i])) return true;
            }
            return false;
        }

        /// <summary>
        /// Contains-check bounded by non-letter/digit characters on both sides, so
        /// "hi" matches "hi there" but not "this". Phrases with spaces work too.
        /// </summary>
        private static bool ContainsWord(string text, string word)
        {
            int idx = 0;
            while (idx <= text.Length - word.Length &&
                   (idx = text.IndexOf(word, idx, StringComparison.Ordinal)) >= 0)
            {
                bool leftOk = idx == 0 || !char.IsLetterOrDigit(text[idx - 1]);
                int end = idx + word.Length;
                bool rightOk = end >= text.Length || !char.IsLetterOrDigit(text[end]);
                if (leftOk && rightOk) return true;
                idx++;
            }
            return false;
        }

        // ------------------------------------------------------------------
        // Line pools
        // ------------------------------------------------------------------

        /// <summary>Internal pool keys; finer-grained than Intent (accept vs. refuse variants).</summary>
        private enum PoolKey
        {
            Greet, AskRaid, AskSecretReveal, AskSecretNoFact,
            FollowAccept, FollowRefuse, WorkAccept, WorkRefuse,
            Insult, Thanks, Farewell, Fallback,
        }

        private static readonly Dictionary<PoolKey, string[]> GenericPools = new Dictionary<PoolKey, string[]>
        {
            [PoolKey.Greet] = new[]
            {
                "Hey. Good to see a friendly face down here.",
                "Hello. Something on your mind?",
                "Oh — hi. Didn't hear you come in.",
                "Name's {name}, in case you forgot. What do you need?",
            },
            [PoolKey.AskRaid] = new[]
            {
                "The raid... I don't talk about it much. We lost good people when the Lien hit us.",
                "One minute it was a normal shift, the next the alarms wouldn't stop. I still hear them.",
                "I made it to the shelter. Not everyone did. That's the whole story.",
            },
            [PoolKey.AskSecretReveal] = new[]
            {
                "Alright... you didn't hear this from me, but there's something you should know.",
                "I suppose you've earned this. Listen close.",
                "Fine. I'll tell you — but keep it between us.",
            },
            [PoolKey.AskSecretNoFact] = new[]
            {
                "If I knew anything worth telling, you'd be the third to hear it.",
                "Secrets? Down here everybody knows everybody's business. I've got nothing for you.",
                "Nothing you'd care about. My head's mostly checklists and ration math.",
            },
            [PoolKey.FollowAccept] = new[]
            {
                "Alright. Lead the way, I'll keep up.",
                "Fine, I'll come along. Better than staring at these walls.",
                "You want company? Sure. Walk slow.",
            },
            [PoolKey.FollowRefuse] = new[]
            {
                "I can't leave my post right now. Ask me another time.",
                "Not now. Things here won't watch themselves.",
                "I'd rather stay put, if it's all the same to you.",
            },
            [PoolKey.WorkAccept] = new[]
            {
                "Alright, I'll take it on. Put it on my slate.",
                "Fine — I'll handle it. Someone has to.",
                "Consider it done. Or at least attempted.",
            },
            [PoolKey.WorkRefuse] = new[]
            {
                "My hands are full already. Find someone idle.",
                "Can't take on more right now, sorry.",
                "Ask the duty roster, not me. I'm stretched thin.",
            },
            [PoolKey.Insult] = new[]
            {
                "Charming. Say that again and we're done talking.",
                "Right. I'll remember that next time you need something.",
                "You kiss the airlock with that mouth?",
            },
            [PoolKey.Thanks] = new[]
            {
                "Don't mention it. Really — don't, people will expect things.",
                "You're welcome. It's nice to be noticed.",
                "Any time. We look out for each other down here.",
            },
            [PoolKey.Farewell] = new[]
            {
                "Take care out there.",
                "Later. Keep your suit sealed.",
                "Goodbye. Don't be a stranger.",
            },
            [PoolKey.Fallback] = new[]
            {
                "Hm. Not sure what you're getting at.",
                "You've lost me. Try that again in plain words?",
                "That's... a thought. Was there something you needed, though?",
            },
        };

        /// <summary>Trait-conditioned variants; first matching trait wins, else generic pool.</summary>
        private static readonly Dictionary<(PoolKey, string), string[]> TraitPools = new Dictionary<(PoolKey, string), string[]>
        {
            [(PoolKey.Greet, "sardonic")] = new[]
            {
                "Well, look who remembered I exist.",
                "A visit. To what do I owe the honor.",
                "Hello, hello. Come to count us again?",
            },
            [(PoolKey.AskRaid, "sardonic")] = new[]
            {
                "Ah yes, story time. Ship got hit, people died, we ran. Great campfire material.",
                "You want the tour of my worst day? Short version: the Lien came and took everything not bolted down.",
            },
            [(PoolKey.Insult, "sardonic")] = new[]
            {
                "Wow. Devastating. Truly, I am undone.",
                "Sure, add it to the pile. The pile is load-bearing at this point.",
            },
            [(PoolKey.FollowRefuse, "cowardly")] = new[]
            {
                "Out there? With you? No. No no no. I'm staying where the doors seal.",
                "I don't go past the inner bulkhead. Ever. Please stop asking.",
            },
            [(PoolKey.AskRaid, "cowardly")] = new[]
            {
                "Don't make me relive it. I hid. That's what I did — I hid, and it worked.",
            },
            [(PoolKey.Thanks, "devout")] = new[]
            {
                "Thank the void that watches, not me. I only did my part.",
                "We are kept, all of us. But... you're welcome.",
            },
        };

        /// <summary>Prepended when Mood &lt; CurtMoodThreshold.</summary>
        private static readonly string[] CurtPrefixes =
        {
            "Make it quick.",
            "What. I'm not in the mood.",
            "Hurry it up.",
        };

        public const float CurtMoodThreshold = -20f;

        // ------------------------------------------------------------------
        // IChatBackend
        // ------------------------------------------------------------------

        public ChatResult Respond(ConversationRequest request, string playerUtterance)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            string utterance = playerUtterance ?? string.Empty;
            Intent intent = ClassifyIntent(utterance);

            var effects = new List<ProposedEffect>();
            PoolKey pool;
            string revealLabel = null;

            switch (intent)
            {
                case Intent.Greet:
                    pool = PoolKey.Greet;
                    break;

                case Intent.AskRaid:
                    pool = PoolKey.AskRaid;
                    break;

                case Intent.AskSecret:
                    if (TryFindOption(request, EffectKind.RevealInfo, out EffectOption reveal))
                    {
                        pool = PoolKey.AskSecretReveal;
                        revealLabel = reveal.Label;
                        effects.Add(new ProposedEffect(EffectKind.RevealInfo, reveal.TargetId, 0f));
                        if (TryFindOption(request, EffectKind.SetDisposition, out EffectOption warmDisp))
                        {
                            effects.Add(new ProposedEffect(EffectKind.SetDisposition, warmDisp.TargetId, 2f));
                        }
                    }
                    else
                    {
                        pool = PoolKey.AskSecretNoFact;
                    }
                    break;

                case Intent.RequestFollow:
                    if (TryFindOption(request, EffectKind.FollowPlayer, out EffectOption follow))
                    {
                        pool = PoolKey.FollowAccept;
                        effects.Add(new ProposedEffect(EffectKind.FollowPlayer, follow.TargetId, 1f));
                    }
                    else
                    {
                        pool = PoolKey.FollowRefuse;
                    }
                    break;

                case Intent.RequestWork:
                    if (TryFindOption(request, EffectKind.AgreeTask, out EffectOption task))
                    {
                        pool = PoolKey.WorkAccept;
                        effects.Add(new ProposedEffect(EffectKind.AgreeTask, task.TargetId, 0f));
                    }
                    else
                    {
                        pool = PoolKey.WorkRefuse;
                    }
                    break;

                case Intent.Insult:
                    pool = PoolKey.Insult;
                    if (TryFindOption(request, EffectKind.SetDisposition, out EffectOption hurtDisp))
                    {
                        effects.Add(new ProposedEffect(EffectKind.SetDisposition, hurtDisp.TargetId, -8f));
                    }
                    break;

                case Intent.Thanks:
                    pool = PoolKey.Thanks;
                    break;

                case Intent.Farewell:
                    pool = PoolKey.Farewell;
                    if (TryFindOption(request, EffectKind.EndConversation, out EffectOption end))
                    {
                        effects.Add(new ProposedEffect(EffectKind.EndConversation, end.TargetId, 0f));
                    }
                    break;

                default:
                    pool = PoolKey.Fallback;
                    break;
            }

            string reply = ComposeReply(pool, request, utterance);
            if (!string.IsNullOrEmpty(revealLabel))
            {
                reply = reply + " " + revealLabel;
            }
            return new ChatResult(reply, effects);
        }

        // ------------------------------------------------------------------
        // Line selection
        // ------------------------------------------------------------------

        private static string ComposeReply(PoolKey pool, ConversationRequest request, string utterance)
        {
            string[] lines = SelectPool(pool, request.Traits);
            uint hash = Fnv1a((request.CitizenName ?? string.Empty) + "\u0001" + utterance);
            string line = lines[(int)(hash % (uint)lines.Length)];
            line = line.Replace("{name}", request.CitizenName ?? string.Empty);

            if (request.Mood < CurtMoodThreshold)
            {
                string prefix = CurtPrefixes[(int)(hash % (uint)CurtPrefixes.Length)];
                line = prefix + " " + line;
            }
            return line;
        }

        private static string[] SelectPool(PoolKey pool, List<string> traits)
        {
            if (traits != null)
            {
                for (int i = 0; i < traits.Count; i++)
                {
                    string trait = traits[i];
                    if (trait == null) continue;
                    if (TraitPools.TryGetValue((pool, trait.ToLowerInvariant()), out string[] variant))
                    {
                        return variant;
                    }
                }
            }
            return GenericPools[pool];
        }

        /// <summary>First capability option of the given kind, in manifest order.</summary>
        private static bool TryFindOption(ConversationRequest request, EffectKind kind, out EffectOption option)
        {
            List<EffectOption> caps = request.CapabilitySummary;
            if (caps != null)
            {
                for (int i = 0; i < caps.Count; i++)
                {
                    EffectOption candidate = caps[i];
                    if (candidate != null && candidate.Kind == kind)
                    {
                        option = candidate;
                        return true;
                    }
                }
            }
            option = null;
            return false;
        }

        /// <summary>FNV-1a over UTF-16 code units. Stable across runs/platforms; never Random.</summary>
        private static uint Fnv1a(string s)
        {
            uint h = 2166136261u;
            for (int i = 0; i < s.Length; i++)
            {
                h ^= s[i];
                h *= 16777619u;
            }
            return h;
        }
    }
}
