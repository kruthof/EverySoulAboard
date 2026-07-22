# P2 Live-Provider Smoke — Results

**Date:** 2026-07-21
**Verb:** `dotnet run --project hosts/scenario -- llm-smoke --backend all`
**Ship:** authored slice (`AuthoredShips.PeriluneSlice()` + `PopulateSlice` — real minds, secrets, relationships)
**Citizen:** Amara Okonkwo (life-support lead; carries a real off-manifest secret backed by a fact)
**Conversation:** 3 scripted turns — greeting → ask-about-secret → goodbye — driven through
`ConversationService.PrepareTurn` / streamed `IChatBackend.SendAsync` / `CompleteTurn`.

This lane spends real money (cents) and is **env-gated**: the verb is never referenced by `ci.sh`
or the test suite. Keys are read from the repo-root `.env` (`claude_key` / `openai_key`) via
`LlmSettings.LoadFromEnvironment`; every stdout line is routed through a scrubber that replaces any
provider key with `***` (defense in depth on top of the adapters, which put the key only on the
auth header, never the request body). No key material appears in this document.

## Per-backend outcome

| Backend | Model (reported) | Streamed? | Usage populated? | cache_read growth | Effects | 3-turn cost | Extrapolated $/hr |
|---|---|---|---|---|---|---|---|
| anthropic | `claude-haiku-4-5-20251001` | **yes** — 8/7/6 text deltas per turn (incremental) | yes (input/output) | **no — flat at 0** (see finding) | none proposed | $0.0043 | ~$0.65/hr |
| openai-compat | `gpt-4o-mini-2024-07-18` | no — 1 TextDelta/turn (see finding) | yes (input/output) | flat at 0 | none proposed | $0.0002 | ~$0.12/hr |
| ollama | — | — | — | — | — | SKIPPED | server not running at `http://localhost:11434` |

**Exit code: 0** (2 backends completed; 1 skipped). Cost-meter running total **$0.0045**; budget cap $0.50/hr.

Price table (the shipped table, per 1M tokens, from `docs/legacy/LLM_CITIZENS.md` §11 + the standard
cache multipliers — cache read ~0.1× input, cache write ~1.25× input for the 5-min TTL):
haiku-4-5 $1/$5, sonnet-5 $3/$15, opus-4-8 $5/$25, gpt-4o-mini $0.15/$0.60. The verb prefix-maps a
dated snapshot id (`gpt-4o-mini-2024-07-18`) onto its base row, so the OpenAI turn priced correctly.

## Sanitized transcript highlights

**Anthropic (claude-haiku-4-5), turn 2 — ask-about-secret:**
> *pauses mid-check of a nutrient line, hands stilling* — You're asking me to inventory my survival
> instincts. *turns to face you, eyes steady* — I did what the ship needed. What I needed. There's a
> difference between lying and not advertising. *returns attention to the lines* — Ask me what you
> actually want to know.

Amara guards her secret in character but does **not** emit a `propose_effect` tool call.

**OpenAI (gpt-4o-mini), turn 2 — ask-about-secret:**
> I... might have set aside some seed stock and rations. Just in case. Thought it wise to keep a backup.

gpt-4o-mini confesses the seed-stock cache **in prose** — matching the authored secret — but likewise
emits no structured effect. So the authored persona/secret data reached the wire correctly on both
providers; neither model chose to encode a `RevealInfo` effect this run.

## Verification against the smoke's goals

- **Streaming incremental (Anthropic):** confirmed — 6–8 `text_delta` events per turn arrived and
  printed as a typewriter; not a single buffered blob.
- **Usage fields populated:** yes on both backends (input/output tokens). Anthropic ~970 input,
  77–108 output per turn; OpenAI ~415 input, 14–26 output.
- **Effects only from the manifest:** trivially satisfied — zero effects proposed by either model, so
  nothing to whitelist. The `CompleteTurn` manifest gate was exercised (dispatched: none).
- **Cost meter counts:** yes — per-turn cost, running total, and trailing-hour projection all report.

## Provider-shape findings (the point of the smoke)

1. **cache_read never grows — the prefix is below the cacheable minimum.** The `PromptBuilder` sets
   two `cache_control: ephemeral` breakpoints (global-system, per-conversation persona), but the slice's
   assembled prefix is only ~970 input tokens on Haiku. Haiku 4.5's minimum cacheable prefix is **2048
   tokens**, so the breakpoints silently never engage: `cache_creation_input_tokens` and
   `cache_read_input_tokens` are **0 on all three turns**. This is not a bug in the adapter — the
   Anthropic Messages API accepts the breakpoints and just doesn't cache a sub-minimum prefix. The
   "prefix-stability paying off" the fixtures anticipated would only show once the persona/context/memory
   prompt (or a threaded transcript) pushes the cached prefix past ~4K tokens. **Reported, not fixed** —
   the fix is content/prompt-size, outside the smoke lane's write paths.

2. **Only the Anthropic adapter surfaces token-level deltas.** `OpenAiCompatBackend` (and by the same
   design `OllamaBackend`) accumulates the entire reply over the HTTP stream and emits it as **one**
   `TextDelta` at the end, because the effect-envelope (`EffectEnvelopeParser`) sits at the tail of the
   reply and must be parsed against the full text before the visible turn can be emitted. So at the
   `ChatDelta` layer the OpenAI/Ollama turn is single-shot (`deltas: 2 total (1 text)`), even though the
   underlying SSE was incremental. This is documented behavior of those adapters, confirmed live —
   token-level typewriter is an Anthropic-adapter property today. **Working as designed; noted for the
   web/TUI skins that render deltas.**

3. **No SSE-shape drift from L3's fixtures.** The Anthropic `message_start` / `content_block_delta`
   (`text_delta`) / `message_delta` / `message_stop` event sequence parsed cleanly, model id and usage
   read from `message_start` + `message_delta` exactly as the adapter expects. The strict `propose_effect`
   tool (with `strict:true`, `additionalProperties:false`) was accepted — no 400. No drift to fix.

## Reproduce

```
# .env (gitignored) must sit at the repo root with claude_key / openai_key.
dotnet run --project hosts/scenario -- llm-smoke --backend all
# or a single backend:
dotnet run --project hosts/scenario -- llm-smoke --backend anthropic
```

---

## Follow-up run — 2026-07-21 (post prompt-style rework)

**Why:** the playtest-feedback round rewrote `GlobalSystemBlock` (plain first-person spoken
lines, simple English, no stage directions, and an explicit "a reveal/agreement/goodbye must
ALSO call `propose_effect`" instruction). This run validates it live. Three runs total this
session (~$0.015): `--backend all`, then two `--backend anthropic` samples.

**Headline: the effect-elicitation gap (finding "models don't structure the reveal" above) is
CLOSED on Anthropic.** On the ask-about-secret turn Haiku 4.5 now proposes
`RevealInfo(target=1)` + `SetDisposition(+0.2)` — both accepted and dispatched
manifest-bound — and proposes `EndConversation` on the goodbye turn. The spoken lines came
out plain and short ("I'm awake. That's what matters. The grow bays need checking. …
I've been thawing them slow so the seals don't crack.").

Residuals, honestly noted:

1. **Occasional first-person action narration.** One sampled turn opened with "I look at you
   steady and quiet for a moment." before the (excellent) spoken reveal. A stricter wording
   variant ("if a listener could not HEAR it, leave it out") was sampled once and did WORSE —
   it produced a fully out-of-character planning line ("The player is gracefully ending the
   conversation. Amara would accept this…") — so the shipped wording stands and further prompt
   iteration needs multi-sample evaluation, not single smokes. Haiku-class variance is real.
2. **gpt-4o-mini still proposes no effects** and flatly denies the secret ("I don't have
   anything hidden from you. I swear it.") — in-character and plain, but no reveal, no tool
   call. The elicitation win is provider-dependent; OpenAI-side prompt work remains open.
3. **cache_read still flat at 0** — unchanged; the prefix is still under Haiku's 2048-token
   cacheable minimum (finding 1 above stands).

Cost meter across the session's runs stayed ~$0.005/run; budget cap untouched.

---

## Ollama / mistral run — 2026-07-22 (the third provider, first time live)

**Why:** Ollama had never been exercised — the P2 run above SKIPPED it ("server not running")
and the adapter had only ever seen canned fixtures. `ollama` 0.32.1 + `mistral:latest`
(7.2B, Q4_K_M, 32k native context) installed locally. **Total spend: $0.00** — the whole
run is local, which is the point.

| Backend | Model | Streamed? | Usage | Effects proposed | 3-turn cost | Wall |
|---|---|---|---|---|---|---|
| ollama | `mistral` | single-shot by adapter design (see finding 2 above) | yes (`prompt_eval_count` / `eval_count`, ~1300 in / 60 out per turn) | **RevealInfo (turn 2), EndConversation (turn 3)** — both accepted, manifest-bound | **$0.0000** | 7.7 s |

(That run was made with a prompt rewrite that was subsequently **reverted** — see the
correction below. The effects it shows come from the parser rule, which shipped; a re-run on
the final build reproduces the `RevealInfo` and drops the turn-3 `EndConversation`.)

Turn 2, ask-about-secret:
> I have... some supplies stored away. But they were never logged. It's nothing vital to our
> survival, just seeds and rations. I kept them behind the hydroponics bay, if you need to look.
>
> → `RevealInfo(target=1, mag=0)` proposed, accepted and dispatched.

Plain, first-person, no stage directions, no meta — the prompt rework holds on a 7B local model.

### The finding: the shipped pipeline yielded ~ZERO effects, and why

The **first** run on this hardware proposed no effects at all across three turns — the same
symptom the P2 run recorded for OpenAI. It is not model reluctance.

> **Correction, same day.** An earlier version of this section reported a 0/12 → 10/12 prompt
> A/B and credited a prompt rewrite as "the single biggest lever". Both were wrong, and the
> independent gate caught it. Those numbers came from a hand-written approximation of the
> prompt (2 capability rows instead of 6, no `[SHIP]` block, a `temperature` the adapter never
> sends) and scored "well-formed JSON" rather than "survives `TryTranslate`". Re-measured
> against `ProviderPrompt.BuildMessages` byte-for-byte, n=64, scored to the sim: the prompt
> rewrite added **p = 0.22 of nothing**, and it was reverted. **The parser rule is the whole
> effect.** The numbers below are the re-measurement. The lesson is in HANDOVER's review
> lessons: measure the bytes the game actually sends, and score to the sim, not to the JSON.

Measured on the real prompt, on one textbook `RevealInfo` turn, n=64, counting only effects
that would reach the sim through `ConversationService.TryTranslate`:

| pipeline | usable effects |
|---|---|
| as shipped before this change | **1 / 64** |
| **+ the omitted-magnitude rule** (what ships now) | **29 / 64** |

The cause is one bug, in the parser. Models emit `{"kind":"RevealInfo","target_index":0}` —
correct in every way except `magnitude`, which `ConversationService.TryTranslate` *never reads*
for that kind. `TryEntry` required it and silently dropped the entry. Under the old prompt
**every single envelope mistral emitted omitted magnitude**, and it still picked the right row
unaided — so the reveal was lost every time, in the parser, after the model got it right.

Now an **omitted** magnitude is forgiven for `RevealInfo` and `AgreeTask`; it stays required
for `SetDisposition` and `FollowPlayer`, where the number is the entire decision, and a
**present but non-numeric** magnitude stays fatal for every kind.

### The price of that leniency, and the two gates on it

Forgiving an omission also lets *spurious* effects through that the strict rule was silently
eating. Measured on four turns where nothing should fire (greeting, a question the `[SHIP]`
block answers, one it does not, small talk), n=24 each — this is the measurement the first
attempt at this work never made:

| | no-op turns firing an effect |
|---|---|
| before | **0 / 96** |
| lenient, ungated | 18 / 96 (18.8%) |
| **as shipped (both gates below)** | **7 / 96 (7.3%)** |

Two gates hold that down, and neither is about magnitude semantics:

1. **`EndConversation` is excluded from the forgiveness**, though it satisfies the "never reads
   the number" test. `ConversationHub.cs:371` treats a dispatched EndConversation as
   authoritative and ends the session, so a spurious one has the crew member **hang up on a
   player who only said hello**. Forgiving it fired on 11/24 turns where the player had just
   asked for work and 11/96 no-op turns, against no measured legitimate use. A missed goodbye
   costs one click; a false one costs the conversation.
2. **The row must be the kind the model claimed.** The tool path has always enforced this
   (`AnthropicBackend.cs:412` rejects on `opt.Kind != kind`); the envelope path never did, and
   the leniency turned that from theory into a live hole — `{"kind":"AgreeTask","target_index":0}`
   aimed at a `SetDisposition` row resolves to `TargetId 0` and passes `TryTranslate`'s bounds
   check, putting a crew member to work off a line about warmth.

**Residual, recorded not smoothed over: 7.3% of no-op turns still fire something** (mostly
`RevealInfo` burning an authored secret the player never hears — `EffectValidator.ApplyReveal`
marks it revealed either way). That is the honest cost of the 1/64 → 29/64 gain, it is a
7B-model property more than a code one, and it is **not** something the strict rule solved
either — the strict rule just failed in the other direction, 64 times out of 64.

This is a large part of the standing "effect elicitation is unsolved" backlog item, and it
benefits the OpenAI-compat path too — **re-run `--backend openai` to measure it**; that has
not been done.

### Native tool calling: measured and deliberately NOT used

Ollama reports `capabilities:["tools"]` for mistral, and `legacy/LLM_CITIZENS.md` §7 assumes
the adapter would translate our tool definitions. Measured over 8 turns with a real `tools`
array: **0/8 produced `message.tool_calls`.** The model instead wrote `propose_effect({...})`
into the visible prose — strictly worse than the envelope, since the player would see it.
`OllamaBackend.Caps.supportsTools` stays **false**. Re-measure before believing the
advertisement for any other local model.

### Residency hints (`keep_alive`, `num_ctx`)

Both server defaults are wrong for a conversational game and both fail **silently**:
`OLLAMA_KEEP_ALIVE=5m` unloads the weights between conversations, so the next line pays a
full 4.4 GB model load inside ConversationHub's 60 s per-request budget; and an over-long
prompt is truncated from the FRONT — the system rules and persona block — with no error.
`OllamaConfig` now sends `keep_alive: "30m"` and `options.num_ctx: 8192` (the prompt measured
~1300 tokens/turn and grows with the transcript). Pass null to defer to a tuned local install.

### Reproduce

```
brew install ollama && brew services start ollama
ollama pull mistral
dotnet run --project hosts/scenario -- llm-smoke --backend ollama    # $0.00
```

With a local server serving the model, the web host now auto-routes to it ahead of any cloud
key (local-first) — boot prints `dialogue backend: ollama/mistral`.
