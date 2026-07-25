# Two-tier debris + per-person skill trees — design note

> **Status: DESIGN ONLY. Nothing built, nothing decided.** Origin: a conversation with Garvin on
> 2026-07-23, immediately after E0-3 landed. This note records the idea, checks it against the
> existing design authorities, and marks the open forks. It does **not** block E0-4.
>
> Authorities this must not contradict: `docs/ECONOMY.md` (economic design authority),
> `docs/ECONOMY-PLAN.md` §E0-5 and §E2, `docs/VISION.md`. Where this note disagrees with them, the
> authority wins until Garvin says otherwise — the disagreements are called out explicitly below.

## 1. The idea, as proposed

Unused rooms across the decks are not empty — they hold **wreckage**, in two tiers:

1. **Simple debris** — rubble anyone can clear and haul. Feeds early-game construction.
2. **Dead machinery** — old units that no longer work, which must be *disassembled* rather than
   swept. Skill-gated. Yields better material for better products.

And the skill gate is **per-person progression**, not a global tech tree.

## 2. What already exists (so this is mostly connection, not construction)

Most of the machinery is built or briefed. The idea's real contribution is **wiring three existing
things to each other** and **placing content where there is none**.

| piece | where | state |
|---|---|---|
| `TileDefs.Debris = 3` | `TileDefs.cs:37,44` | built — `walkable: false, blocksGas: true`; glyph `%`, colour `#96795a` |
| the item ladder | `ItemStack.cs:3-12` | built — `Regolith`(0) *"debris spoil from cleared sections"* → `Scrap`(4) *"salvage input"* → `Parts`(5) → `ControllerModule`(6) |
| dig + haul verbs | E0-3 | **landed** — the player can designate rubble and zone a stockpile |
| deconstruct/strip | `ECONOMY-PLAN.md` §E0-5 | briefed — *"50 % wall recovery, `Parts × condition` on devices"* |
| `Device.Condition` | `Device.cs:67,76` | built — `1=pristine..0=wrecked`; `IsOperational` = `Condition >= FailBelow`; renders `Broken` below it |
| skills + `Procedure` | `ECONOMY-PLAN.md` §E2 | briefed — skills as **new hashed `Citizen` state**; yield/defect modulated by skill *and* held `Procedure` |
| empty hall slots | `SlotGridPlanner.cs:103,110` | built — `RoomType.None` slots boot **sealed** (`IsOpen = !empty`), airless, with an `+ADD ROOM` chip |

**So tier 1 already works end to end** (rubble → `Regolith` → walls), and **tier 2 is E0-5 + E2
meeting each other**. Nothing here needs a new economy.

## 3. The genuinely new part: put the wreckage in the empty slots

This is the piece with no prior art in any plan, and it is the cheapest thing in this note.

> **UPDATE 2026-07-25 — §3 is LANDED, in part, by WP-1 of the console-retirement programme**
> (`docs/design/perilune-console-retirement.plan.md`). `--ship grid` now boots three wrecked deck-1
> halls (60 debris tiles), a `ClearAllDebris` goal and eight crew; the "zero debris / no goal /
> three crew" statements below are the *pre-WP-1* record. Two departures from this note, both
> measured rather than argued, are written into the amended paragraphs: the wrecked halls are
> **not** all left sealed and airless, and the change moved **no pin**. The dead-machinery half of
> §3 (devices at `Condition <= FailBelow`) is still unbuilt — `DeviceSpec` carries no condition
> field.

**The problem it solves.** `--ship grid` — the ship that carries the AAA Overview and Room Zoom —
had **zero debris tiles anywhere** (verified by grep over its builder; fixed in WP-1). Its unused
slots were just sealed empty halls. Meanwhile `--ship slice`, which has the 48-tile aft debris
field, the eight crew and the `ClearAllDebris` goal, **cannot show the Overview at all**
(`GameSession.cs:1150` *"Empty on ships with no slot grid"*). The content and the good UI were on
different ships. This was the blocking asymmetry behind E0-3's surface decision.

**What changes.** Some `RoomType.None` slots boot **wreck-filled** rather than merely empty:
debris tiles inside the compartment, and a few dead devices (`Condition` at or below `FailBelow`)
among them.

⚠️ **"The slot stays sealed and airless, exactly as now" does not survive contact with the sim, and
WP-1 did not do it.** A sealed hall's door is not walkable (`PathService`: *"door tiles walkable
only when open+unlocked"*), so every debris tile behind one is unreachable and the dig board is
inert even when designated — the slice learned exactly this with `door_aft`. And an *airless*
compartment is worse than an unreachable one: a crew member who does get in drops the job and runs
(`SafetySystem` / `JobKind.Flee`, E0-2), so the wreck would be permanently undiggable and a
`ClearAllDebris` goal over it permanently unreachable. WP-1 therefore authors one wreck **open and
pressurised** (the live collapse, designated at boot) and leaves the other two sealed as the
*player's* work, reachable through `＋ADD ROOM`, which opens the door and fills the compartment as
a side effect of commissioning it. Wreck-filling the airless decks 2..7, which this note's spirit
invites, would have produced debris that looks identical in a screenshot and can never be dug.

**Why it is worth doing beyond fixing the gap:**

- The empty halls get a **diegetic reason to be empty** — currently they are just unbuilt space
  with a `+ADD ROOM` chip, which reads as a menu rather than a ship.
- Work **spreads across decks** instead of concentrating in one aft corner, which exercises the
  ladder pathing and gives the deck rail a purpose.
- The early game becomes **"reclaim your own ship"** rather than "build from nothing" — better
  fiction, and it front-loads a material source before any external supply exists.
- It costs **level data only**: no new systems, no new item kinds, no art (debris already renders).

**Sequencing.** Cheap and additive. ⚠️ **CORRECTED 2026-07-25 (WP-1, measured):** this paragraph
used to read *"it changes generated ship layout ⇒ it moves the scenario pin and the tick-3000
goldens"*. **That is wrong when the change is confined to `PeriluneGrid()`, and it was never
measured.** WP-1 wreck-filled three grid halls, added a goal and went from three crew to eight —
crew fields *are* hashed, so this is a strictly stronger change than debris alone — and **all five
pins came back byte-identical**: scenario `00e0a2dadb8e5076`, tick-3000 `4be2e77864fb7409`, slice
`1f8f2225ee568de9`, defs-defaults `5a471d12643b64f9`, defs-rules `3f23ce5bd40283c8`.

The reason is that **no golden covers the grid ship**: the scenario pin is a seed-42 *procedural*
ship (`ci.sh`), `perilune_tick3000_hash.txt` is `Perilune()`, `slice_tick3000_hash.txt` is the
slice, and the defs checksums are defs. The grid ship's only test surface is
`AddRoomCommandTests` + WP-1's own `GridWreckTests`, neither of which pins a hash. A pin move
would have come from touching `Perilune()`, the procedural generator, or a `.def` field — none of
which grid-ship level data does. **The pin ritual is not on this work's critical path; a `.def`
field would be.**

## 4. Tier 2: what "disassembly" should mean

E0-5 already specifies `Parts × condition` on device deconstruction. The proposal adds that the
*worker* matters. That is E2's yield/defect model, applied to a new consumer:

> **Yield and defect, not quality tiers.** Sketch: unskilled + no procedure → 55 % yield, 20 %
> defect; skilled + procedure → 105 % yield, 1 % defect. A **defective Part installs normally and
> then fails early**. — `ECONOMY.md`

So a dead reclaimer stripped by a novice returns mostly `Scrap` and some defective `Parts`; the
same unit stripped by the specialist returns `Parts` that hold. **No new mechanism is required.**

### ⚠️ Collision: "higher quality products" as an item tier is already rejected

`ECONOMY.md` non-goals:

> **No item quality tiers.** Use yield % and defect chance on the recipe, and `Condition` on the
> device — both already exist. *Quality tiers multiply the item table by seven and every UI that
> touches items, for a signal we get more cheaply and more diegetically from defects that fail
> later.*

The **intent** of the proposal survives intact — skilled disassembly does produce materially
better outcomes — but it must be expressed as **yield % and defect chance**, not as a quality
field on `ItemStack`. Recommend keeping the non-goal.

## 5. Per-person skill trees

### 5.1 The proposal is on the right side of the line the docs draw

`ECONOMY.md` rejects a **research tree**, and the stated reason is precise:

> **No research tree or research queue.** Knowledge is found and taught. *A tech tree is a global,
> un-losable unlock — the exact opposite of knowledge-as-mortality.*

The objection is to **global** and **un-losable**. A tree that lives on a person and dies with them
is neither. Per-person progression is compatible with the pillar as written.

### 5.2 But there is a second ditch on the other side

> **Knowledge alone is a stat modifier** — RimWorld skills with extra steps, invisible without a
> ledger to move. Nobody in the genre makes knowledge a *losable, teachable, documentable,
> lootable* economic input. RimWorld has skills (a number on a pawn) and research (a global unlock
> that cannot be lost).

The design is threading between a global tech tree and a pawn stat card. What keeps a per-person
tree out of the second ditch is **not the tree** — it is the three properties E2 already commits
to, and they are the load-bearing part:

- **losable** — she dies, the branch dies
- **teachable** — at the cost of the teacher's *hours*, i.e. real labour off the ledger
- **documentable** — a `Procedure` is a physical object, lootable and burnable, and *"the only way
  knowledge outlives its holder"* (`ECONOMY.md` T4)

### 5.3 Recommendation: the tree is a VIEW, never an allocation minigame

**The reservation is about shape, not existence.** A classic tree implies player-directed point
spending — you *choose* nodes. That quietly contradicts *"knowledge is found and taught"*: you
should not decide to know the reclaimer, you should learn it because someone taught you or because
you read the procedure they wrote. Point-spending is precisely the RimWorld-ish move the pillar is
trying to avoid.

**Proposed shape.** Nodes light up from exactly three sources, and never from a currency:

1. **doing the work** (accumulated practice at that domain)
2. **being taught** (a holder spends hours; both are occupied)
3. **reading a `Procedure`** (a document, which can be looted or burned)

This keeps everything a tree is actually good for:

- A specialist becomes **legible**. *"Okonkwo owns the entire reclaimer branch"* reads far better
  than *"Okonkwo: Machining 14"*, and it is the same underlying state.
- Her death leaves a **visibly dark region** someone must walk back through — the drama the pillar
  is reaching for, rendered rather than described.
- Cost is **a UI surface over E2's existing scalars + Procedures**, not a new economy.

### 5.4 How it pays off the debris idea

The branch gates **which wreckage a crew can profitably take apart**. Clearing the ship stops
being a chore and becomes a progression curve:

- **rubble** — anyone, immediately; yields `Regolith`
- **simple fixtures** — modest practice; yields `Scrap`
- **dead machinery** — the specialist, or a `Procedure` in someone's hands; yields `Parts` that
  hold rather than `Parts` that fail in a week

The player then faces the decision `ECONOMY.md` §2 names as the whole point:

> *this compartment is worth 400 kg of stock; taking it apart costs six days of Okonkwo's hands,
> and she is the only person who knows the reclaimer.*

## 6. Open forks — NOT decided here

1. **Does a skill tree ship at all, or do E2's scalars + `Procedure` suffice?** The tree is a
   presentation win, not a mechanical one. It may be right to ship E2 headless first and add the
   tree view only if specialists read as illegible in play.
2. **Node granularity** — a handful of broad domains, or per-machine-family branches? Per-family
   is more legible and more losable; it is also more authoring.
3. **Is practice alone enough to light a node,** or must every node be taught/read? "Practice
   only" risks a grind; "taught only" risks a dead start with no teacher aboard.
4. **How much of the grid ship boots wrecked?** Too little and it is set dressing; too much and
   the early game is a cleanup queue. Needs the A1 busy-ness measurement (E0-8) to tune against.
5. **Do dead devices in wrecked slots count toward the mass ledger from tick 0?** They should — but
   that interacts with E0-8's `MassLedger`, so decide it there, not here.
6. **Skills are hashed `Citizen` state** (E2 says so explicitly) ⇒ any of this moves determinism
   pins and needs the full def/save/hash ritual. Not a fork, a cost note.

## 7. Suggested sequencing

Nothing here is urgent, and none of it should preempt the E0 line.

- **Now:** nothing. E0-4 (stockpile zones) is next and is unaffected.
- **With E0-5 (deconstruct):** the tier-2 *mechanism* lands for free — `Parts × condition` is
  already its brief. Do **not** add skills yet.
- **Standalone, any time:** wreck-fill some grid-ship slots (§3). Cheap, high value, moves pins;
  its own commit. This is the piece worth doing soonest.
- **With E2 (people matter):** skills modulate disassembly yield/defect (§4). Ship headless.
- **After E2, only if needed:** the tree *view* (§5.3).
