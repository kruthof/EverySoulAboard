# PERILUNE — User-Journey Review (AAA polish pass)

*2026-07-23. A five-phase review of the shipped warm-SVG two-level UI, one reviewer per phase
(onboarding · build/economy · crew & social · systems/MOSS · navigation/IA & visual), each held to a
RimWorld / Frostpunk / Prison Architect / CK bar. This is the roadmap that sits behind the six
immediate fixes landed on `lane/ui-polish` (pause affordance, interactive speed, NOMINAL clarity +
click-to-MOSS, Overview LLM chip, the enlarged crew DOSSIER, ESC-closes-BIO).*

---

## The through-line

The pieces meet the bar; the **product** does not yet. Every reviewer, independently, landed on the
same shape: individually the surfaces are handsome and honestly-built (the SVG schematic, the MOSS
ledger, the reconciliation rework, the warm palette), but the game **narrates nothing, closes no
loops, and reads as several good screens rather than one designed thing.** A new player is dropped
into a beautiful silent room with no goal, no first action, and no way to see the one resource that
gates building or the rich inner life the sim already models for every crew member.

Three cross-cutting failures explain most of the findings:

1. **Silence.** No onboarding, no goal, no "what do I do next," no controls surface on the default
   view, and near-zero tooltips. The marquee hook — *talk to a living crew* — is never stated and its
   button boots disabled.
2. **Invisibility.** The sim models far more than the UI shows. Regolith (the build currency), crew
   needs/morale/affinity/backstory/memory, work completion, and idle-for-lack-of-work all tick
   underneath and are never surfaced — so honest design boundaries (the boot-window economy, the CO₂
   transport bug) read as *broken game* instead of *state to reason about*.
3. **Dead ends.** The alarm chip, sensor-log lines, and lens washes don't hand off to anything; ESC
   over a floating card fell through to the browser; tabs teleport between two visual generations with
   no transition. Nothing connects "something is wrong" → "here it is" → "here's what I do."

---

## Prioritized roadmap

Severity is cross-journey and player-impact-ranked. **✅ = shipped on `lane/ui-polish` in this pass.**

### P0 — the experience reads as broken without these
- **Boot onboarding.** A one-time, dismissible intro that states the premise in one line ("Your crew
  are living minds — click one and press **T** to talk") and names the two verbs (talk, build). Reuse
  the existing `#s-nudge` coach-mark infra; gate on a `localStorage` first-run flag. *(onboarding P0)*
- **Surface the build currency.** Add `matter`/`regolith` to the `metrics` wire message and a
  persistent STORES chip in the Overview top bar (red/pulse at 0). This alone turns the "can't build"
  dead-end from *broken* into *resource-gated*. *(build P0)*
- **A closed diagnostic loop.** Make the caution chip a button that opens MOSS focused on the failing
  system ✅ *(chip→MOSS jump landed; system-focus still to wire)*; make sensor-log lines clickable to
  locate; give each shipped fault (CO₂/hydro/thermal) at least one player-actionable response. *(systems P0)*
- **Decouple the master alarm from unfixable conditions.** The CO₂ bug pins the chip to MASTER CAUTION
  from ~day 1, so NOMINAL is never seen and the alarm is calibrated out. Add latching/acknowledge or
  rate-of-change gating so a persistent, unresolvable condition demotes to a steady CAUTION. *(systems P0)*

### P1 — the hook and the loops are under-sold
- **Widen the `citizen` wire to a real dossier payload** — needs, morale, affinity/trust, values/fears,
  backstory, top-k episodic memories (all already modelled in `sim/Sim.Core/Citizens/*`, all outside
  `StateHash` so determinism is untouched). The enlarged DOSSIER UI ✅ is built and shows these as
  clearly-badged **◇ SAMPLE** today; this is the follow-up that makes them live. *(crew P0/P1)*
- **Put morale + needs in the SELECTED readout**, not just CREW WATCH. Morale is the one always-present
  affect signal and is currently absent from both inspection surfaces. *(crew P0)*
- **Surface the LLM backend on the Overview** ✅ *(landed — the `◈ BACKEND` chip; echo it in the
  dialogue header next).* *(crew P1)*
- **Give the dialogue window an identity** — portrait, name, role, emotion, and an affinity/trust read,
  so talking is visibly *with a person whose regard for you moves*. *(crew P1)*
- **"Can't build because X" feedback + hover ghost + drag-to-build.** Every rejected placement is a
  silent no-op today; the +ADD ROOM toast even confirms a possible no-op. Pre-check the target and show
  a red/green ghost before commit; confirm the room-picker only on the next `decks` frame. *(build P1)*
- **Surface the boot-window dead-end.** IDLE count in the CREW WATCH header, route
  `ConstructionCompletedEvent` into the sensor log, and a "BUILD STALLED — NO MATTER" caution when
  designations starve. *(build P1)*
- **Controls/help on the default surface.** The only hotkey legend is CSS-hidden on the Overview; port
  it into the command bar and add `title=` tooltips to chips, deck rail, and lens buttons. *(onboarding P1)*
- **Lens legend + kill the dead H₂O lens.** Add a per-lens scale/legend; the water lens paints nothing
  (no per-room H₂O) — grey it out or remove until wired. *(systems P1)*
- **One visual system across tabs + surface transitions.** RELATIONS/CHRONICLE drop to the v1 console
  skin with an instant hard-cut; reskin them into the warm system (or at minimum crossfade the
  boundary), and unify floating-panel material with the Overview glass. *(nav P1)*
- **ESC-closes-BIO** ✅ *(landed — the `dossier` rung; consolidate `overviewEscape`/room-zoom's private
  capture listener into one ESC authority next).* *(nav P1)*
- **CHRONICLE dead button** — wire it or give it a real disabled state; today it looks live and does
  nothing. *(nav P1)*

### P2 — texture & consistency
- Prove the ship is alive on the first frame (a patrol walk, a boot sensor-log line, a ticking clock).
- Room clickability affordance (per-target cursors + `.pl-room:hover` "▸ ENTER"); Room Zoom is the
  flagship interaction and has no signposting. *(nav P2)*
- Carry a minimal tab bar into Room Zoom (can't reach CREW/MOSS without ESC-ing out). *(nav P2)*
- +ADD ROOM: one-line description + cost/requirement per room type (13 undifferentiated free/instant
  choices today). *(build P2)*
- Economy consistency: furniture is free+instant while walls cost matter+labour. *(build P2)*
- MOSS honesty prose is engineer-voiced — move the long caveats behind a `[?]`, shorten
  "DERIVATION UNDOCUMENTED" to an in-fiction line; add an `LS`/`DEVICES` command for the prompt. *(systems P2)*
- Namespace-collision cleanup: `--amber-1` is redefined across `styles.css` and `warm.css`. *(nav P2)*
- One deck-navigation metaphor across both levels (rail vs breadcrumb vs minimap today). *(nav P2)*

---

## What's already strong (don't re-litigate)
- The in-place reconciliation rework killed the flicker/click-swallow bugs; buttons survive repaints.
- The MOSS ledger is genuinely AAA — monospace-grid stability, `-1`→`—` sentinels that never fabricate
  a zero, OFFLINE-with-reason, row-ID-stable selection.
- The warm palette + SVG schematic (seeded starfield, per-material floors, occupancy glow-pools) are
  high-quality and well-documented.
- Honest empty/deferred states everywhere; `prefers-reduced-motion` respected throughout.
- Booting *running* and *populated* is the correct first-run world state — the gap is narration, not
  the world.

---

## Data reality for the DOSSIER follow-up (real vs. toy)
From the sim source, so the wire-widening doesn't invent anything:
- **Real, ticking, not yet on the wire:** `Citizen.Health/Hunger/Thirst/Fatigue/Suffocation/Mood`,
  `CitizenMind.AffinityToPlayer/TrustToPlayer/Emotion`, `Memory.Episodic` (120 scored entries),
  `Persona.Values[2]/Fears[2]/RaidBackstory/SpeechStyle/Secrets[]` (with `RevealedToPlayer` gating).
- **Real and already on other channels:** morale (roster), directed relationships (`relations` →
  `regardRows`) — both now joined into the DOSSIER via `hud.enrichCitizen`.
- **Does NOT exist — never fabricate:** there is **no skill system** and **no body-part/injury model**
  (health is a single scalar). The DOSSIER deliberately omits both.

*Per-phase full reports were produced by the review agents and condensed here; key file references live
inline in each bullet's source tag.*
