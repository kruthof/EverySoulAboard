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
   assembled prefix is only ~970 input tokens on Haiku. Haiku 4.5's minimum cacheable prefix is **4096
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
