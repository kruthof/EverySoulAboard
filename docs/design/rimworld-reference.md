# RimWorld reference — how the game we are analogising to actually works

> **Written 2026-07-29** for PERILUNE / *Every Soul Aboard*, on the owner's binding directive:
> *"you should make all decisions in analogue to how it is implemented in RimWorld."*

---

## HOW TO USE THIS FILE

**What this is.** A factual reference on RimWorld's mechanics, so that a lane told "do what RimWorld
does" does not have to re-derive RimWorld from memory. Several lanes have already done that, and it
is precisely how a wrong assumption gets baked into a hashed, saved field that then costs a
determinism re-pin to correct.

**What this is NOT.**
- It is **not a design document for Perilune.** Nothing here is a decision. §8 names collisions
  between RimWorld's model and Perilune's; it deliberately does **not** resolve them. Resolutions
  belong to the owner.
- It is **not a spec.** No section here is implementable as written. It describes another game.
- It is **not exhaustive.** §1–§3 are deep because that is what is being built now. §4–§6 are
  deliberately shallow. §7 is short and is the most load-bearing section per word.

**How to cite it.** Cite the section, and **re-verify anything you are about to encode into a hashed
or saved field.** A number in this file is evidence about *RimWorld 1.6 as of July 2026*, measured by
one agent on one day. It is not evidence about Perilune, and this project's own house rule —
*"a count you did not measure yourself is not evidence, even when the doc states it"* — applies to
this file exactly as it applies to `CLAUDE.md`.

**Provenance convention.** Every load-bearing claim carries its source inline:

| marker | meaning |
|---|---|
| **[src]** | read out of the decompiled game source (see below). Highest confidence. |
| **[wiki]** | rimworldwiki.com. The live site is behind Cloudflare and returns **403** to tooling; two routes work — the **Wayback Machine** (`archive.org/wayback/available?url=…` then `curl` the snapshot) and the reader proxy **`https://r.jina.ai/https://rimworldwiki.com/wiki/PAGE`**. Both were used; see the appendix. |
| ⚠️ **UNVERIFIED** | I could not confirm it. What I believe and why I could not confirm it is stated inline. Treat as a lead, not a fact. |

**Two independent research passes were run** — one reading the decompiled source and the wiki's Work /
Drafting / Bill / Stockpile / Menus pages, one reading the wiki's Need / Mood / Mental break / Skills /
Health family through a different fetch route. **Where they overlapped they agreed on every number**
(base mood 32; break thresholds 35/20/5; break MTB 10/3/0.7 days; passion 35 %/100 %/150 %; the skill
decay table; catharsis +40; the schedule thresholds). The one rule confirmed *twice by different
evidence* — source and wiki — is flagged ⭐ in §3.5, because it is the rule most likely to be
mis-ported.

### Version targeted

| | |
|---|---|
| **Game version described** | **RimWorld 1.6** — current PC version **1.6.4633**, released 4 Nov 2025 [wiki, [Version history](https://rimworldwiki.com/wiki/Version_history)] |
| **Source read** | `Chillu1/RimWorldDecompiled`, commit tagged **`v1.6.9438.38202`** (2026-05-20). RimWorld's EULA permits decompilation for personal use; the repo states this. `9438.38202` is the assembly version, `1.6.4633` the display version. |
| **DLC in existence** | Royalty (1.1), Ideology (1.3), Biotech (1.4), Anomaly (1.5), **Odyssey (1.6)**. Base-game vs DLC is flagged wherever it matters. |
| ⭐ **Read §8.4 first if you are doing anything atmospheric** | **Odyssey (1.6) added orbital maps, gravships and a full vacuum/pressurisation model.** RimWorld is no longer only a planet-surface game, and this repo's working assumption that *"RimWorld has no analogue for a ship in vacuum"* is **false as of July 2025**. |
| **Where 1.5 → 1.6 matters** | Flagged inline. Most of §1–§3 has been stable since ~1.0; the *work priority domain* and *tie-break formula* have not changed in any version I could find evidence of. |

### Tick conversions — every duration in this file uses these

| | |
|---|---|
| **60 ticks = 1 real second** at 1× speed | **Verified four independent times** in the wiki's own parenthetical conversions: `10,000 ticks (2.78 mins)` [Drafting], `3,000 ticks (50 secs)`, `1,200 ticks (20 secs)`, `300 ticks (5 secs)` [Vacuum]. |
| **2 500 ticks = 1 in-game hour**; **60 000 ticks = 1 in-game day** | ⚠️ **DERIVED, not directly cited.** 24 × 2 500 = 60 000, which is 1 000 real seconds ≈ 16.7 real minutes per in-game day — the well-known figure, but I did not read it off a page. Every "half a day" / "in-game hour" claim below rests on it. |

> ### ⚠️ The five things most likely to be got wrong from memory
>
> If you read nothing else, read these. Each is marked in place with **⚠️ CORRECTS**.
>
> 1. **§1.5 — a new colonist does NOT arrive with everything enabled.** Only its **top 6 work types by
>    average relevant skill** are switched on, **plus the 6 `alwaysStartActive` ones** (Firefighter,
>    Patient, PatientBedRest, BasicWorker, **Hauling, Cleaning**). Everything else is blank. The
>    default *value* is 3; the default *grid* is skill-shaped and differs per pawn.
> 2. **§1.3 — ties do NOT break "left to right".** They break on `WorkTypeDef.naturalPriority`. Left-to-right
>    is a correct *prediction* because the columns are sorted by the same key; it is not the rule.
>    (And **no two vanilla work types share a value**, so the tie case never arises in the base game.)
> 3. **§5.1 — passion multipliers are 35 % / 100 % / 150 %, not ×1 / ×1.5 / ×2.** No passion is a
>    **65 % penalty** against the reference case, not a neutral baseline.
> 4. **§8.4 — RimWorld has vacuum, pressurisation and ships (Odyssey, 1.6, July 2025), and it GATES
>    WORK ON AIR AT THE DISPATCHER, exactly as Perilune does.** The gate is not in
>    `PawnCanUseWorkGiver` — it is in **region danger + `MaxPathDanger`**, threaded through the same
>    scan. Autonomous work does not enter vacuum. What RimWorld adds on top is a **four-rung override
>    ladder** Perilune does not have — and the same mechanism **also grades temperature**.
> 5. **§6.1 — capability gating IS partly numeric.** `CapableOf` is `GetLevel(c) > c.minForCapable`,
>    a real threshold on the job-assignment path (vanilla `Moving = 0.15`) — sitting *under* a smooth
>    efficiency curve, not replacing it.
>
> ### ⛔ AND A WARNING ABOUT THIS FILE'S OWN FAILURE MODE
>
> The first draft of this document was reviewed adversarially. **§1–§3 held line for line. Every
> single error was in the same shape: an ABSOLUTE NEGATIVE that overstated a true finding** — *"the
> only seam", "nothing reads it", "no job is refused", "no numeric gate anywhere", "there is no
> precedent"*. **In three cases the cited source contained the correctly-qualified sentence and the
> qualifier was dropped in transcription.**
>
> That failure mode is uniquely damaging in a reference, because **a lane told "RimWorld has no X"
> will not go looking for X.** Every absolute negative in this file has since been re-verified or
> qualified. **If you find one that is not carrying a citation or a caveat, distrust it** — and
> please do not add one.

---

# §1 — THE WORK TAB

**This is the highest-value section in the file.** Perilune's work-priority grid is being built now,
and OD-A makes it a *prerequisite* rather than a lane.

## 1.1 The two modes

The Work tab (hotkey **F1** [wiki]) has a single toggle labelled **"Manual priorities"**.

| mode | toggle | what a cell shows | what it means |
|---|---|---|---|
| **Standard** (default) | red ✗ | a checkbox — green check or empty | colonist does this work type, or does not |
| **Manual** | green ✓ | a number **1–4**, or blank | colonist does this work type at that priority, or not at all |

[wiki, [Work](https://rimworldwiki.com/wiki/Work)]

**⚠️ CORRECTS A COMMON MISREADING — standard mode is not a different data model, it is a read-time
override of the same one.** [src, `RimWorld/Pawn_WorkSettings.cs:160-169`]

```csharp
public int GetPriority(WorkTypeDef w)
{
    int num = priorities[w];
    if (pawn.RaceProps.Humanlike && num > 0 && !Find.PlaySettings.useWorkPriorities)
    {
        return 3;
    }
    return num;
}
```

The stored value is **always** an `int` in `0..4`. In standard mode every *enabled* work type reads
back as **3**, and the checkbox is exactly the predicate `GetPriority(w) > 0`
[src, `Pawn_WorkSettings.cs:171-175`]. Consequences a lane will care about:

- The player's manual numbers are **not destroyed** by toggling back to standard mode. Toggle to
  manual again and they return.
- `useWorkPriorities` is a **global player setting** (`Find.PlaySettings`), not per-pawn.
- Un-checking a box in standard mode calls `Disable(w)` → `SetPriority(w, 0)`, which **is**
  destructive: the stored number becomes 0 [src, `:177-181`].

## 1.2 The priority domain — which end is highest

**1 is the highest priority. 4 is the lowest. 0 means "do not do this at all".** [src]

```csharp
public const int LowestPriority = 4;
public const int DefaultPriority = 3;
```
[src, `Pawn_WorkSettings.cs:20-22`]

| stored value | UI | meaning |
|---|---|---|
| `0` | **blank cell** (manual mode) / **unchecked box** (standard mode) | will never be done autonomously |
| `1` | `1` | highest — done before all lower numbers |
| `2` | `2` | |
| `3` | `3` | the default |
| `4` | `4` | lowest |
| — | **cell absent entirely** | **incapable** (see §1.6). Not a priority value. |

`SetPriority` handles its two bad inputs **asymmetrically**, and the difference is worth reading
[src, `:140-158`]:

| bad input | what happens |
|---|---|
| **non-zero priority on an incapable work type** | `Log.Error(…)` **and `return`** — the write is **refused** [src, `:143-147`] |
| **priority outside `0..4`** | `Log.Message(…)` — a *message*, not an error — and **execution falls through: `priorities[w] = priority` at `:152` runs unconditionally. The out-of-range value IS STORED.** |

⇒ **`0..4` is a convention the UI honours, not an invariant the setter enforces.** A mod or a hand-
edited save can hold a priority of 9, and §1.3's sort key will still order it sensibly. This matters
for anyone reasoning about what a *saved* priority field can legally contain.

**"Blank" and "disabled" are the same stored value (0), but "incapable" is a different thing
entirely** — see §1.6. This distinction is the one most often lost in re-derivation.

**Absolute, not weighted.** *All* available work at priority 1 is done before *any* work at priority 2
[wiki]. The wiki states the consequence bluntly, and it is worth quoting because it is a design
choice, not an accident:

> "If Hauling is set to 1, then a colonist will haul every single object, even those halfway across
> the map, before doing the rest of their tasks. **They have no regard for efficiency.**" [wiki]

## 1.3 How ties break

**⚠️ CORRECTS THE WIKI.** The wiki says *"For tasks with the same priority, tasks on the left will be
performed first"* [wiki]. That is the *observable outcome*, not the rule. The actual rule is a sort
key [src, `Pawn_WorkSettings.cs:225-229`]:

```csharp
wtsByPrio.InsertionSort(delegate(WorkTypeDef a, WorkTypeDef b)
{
    float value = a.naturalPriority + (4 - GetPriority(a)) * 100000;
    return ((float)(b.naturalPriority + (4 - GetPriority(b)) * 100000)).CompareTo(value);
});
```

Read this carefully, because three separate facts fall out of it:

1. **Sorted descending** — higher key first.
2. **The player's number dominates, by a factor of 100 000.** `naturalPriority` is constrained to
   `0..10000` [src, `Verse/WorkTypeDef.cs:95-99`], so the `× 100000` term can never be overcome. The
   player's priority is a **strict** partition, not a weighting.
3. **The tie-break is `naturalPriority`, a per-`WorkTypeDef` integer from XML** — not screen position.
   The tab's column order is *also* `naturalPriority`-ordered, which is why "left is first" is a
   correct prediction. It is a *coincidence of two orderings sharing one key*, and a lane that
   implements "left-to-right" as the rule will have implemented the display, not the model.

**`InsertionSort` is a stable sort**, so work types with equal `naturalPriority` *and* equal player
priority retain `DefDatabase` (i.e. XML load) order. ✅ **SETTLED in review: no two vanilla work types
share a `naturalPriority`** (§1.7's table), so **the stable-sort tie case does not arise in the base
game at all.** It is reachable only with mods, which is exactly why a mod-added work type must pick an
unused value.

### Within one work type: `priorityInType`, and the closest-target rule

A work type is a **list of work givers**, ordered by `WorkGiverDef.priorityInType` **descending**
[src, `Verse/WorkTypeDef.cs:101-111`]. The wiki states the player-facing form: *"Tasks higher on the
list will be prioritized over tasks lower on the list in the same work-type"* [wiki], and the Work
page lists every work giver per work type in that order.

The job scan then does something subtler than "first giver wins"
[src, `RimWorld/JobGiver_Work.cs:82-88, 235-264`]:

```csharp
if (workGiver.def.priorityInType != num && bestTargetOfLastPriority.IsValid)
{
    break;
}
```

Work givers **at the same `priorityInType`** are treated as one group; the scan keeps the *closest*
valid target across the whole group, and only stops once `priorityInType` changes *and* it has
something. Within a group, "closest" is `GenClosest.ClosestThingReachable` — **reachability-checked,
region-expanding, max distance 9999** [src, `:150`], not straight-line.

⇒ **"Colonists prefer closer jobs" is true only inside one work-giver priority group.** Across work
types, or across `priorityInType` bands, distance is irrelevant — a priority-1 job on the far side of
the map beats a priority-2 job underfoot, always.

## 1.4 Emergency work givers — a second scan the wiki does not describe

`WorkGiverDef` carries an `emergency` flag, and a pawn keeps **two** cached ordered lists:
`WorkGiversInOrderEmergency` and `WorkGiversInOrderNormal`
[src, `Pawn_WorkSettings.cs:230-255`]. `JobGiver_Work` is instantiated **twice** in the think tree with
`emergency` true and false [src, `JobGiver_Work.cs:10, 78`], and the emergency node sits earlier.

The split rule: let `num` be the **best (lowest) priority number the pawn has assigned to any work
type that owns at least one non-emergency work giver** [src, `Pawn_WorkSettings.cs:211-224`]. Then a
work giver goes in the **emergency** list iff it is flagged `emergency` **and** its work type's
priority `<= num`; otherwise it goes in the normal list [src, `:237, 250`].

⇒ An emergency work giver only gets its early scan **if the player has it at least as urgent as their
most urgent ordinary work.** Set Firefight to 4 while Hauling is 1 and firefighting loses its
emergency status entirely.

✅ **SETTLED in review — there are exactly THREE `emergency` work givers out of 83:**
`FightFires`, `PatientGoToBedEmergencyTreatment`, `DoctorTendEmergency`.
⚠️ **Carry the version caveat:** the reviewer's defs source is a **2018 mirror (`0.19.2009`)**, not
1.6. Treat as strong corroboration, **not a 1.6 citation** — anyone with the game installed settles it
in thirty seconds at `Data/Core/Defs/WorkGiverDefs/`.

## 1.5 The default for a newly arrived colonist

**⚠️ CORRECTS THE WIKI, AND THIS IS THE SINGLE MOST LIKELY THING TO BE GOT WRONG FROM MEMORY.**

The common belief — including the belief this repo would most likely have encoded — is *"a new
colonist arrives with every work type they are capable of enabled, at priority 3."* **That is false.**

[src, `Pawn_WorkSettings.cs:89-129`]:

```csharp
public void EnableAndInitialize()
{
    if (priorities == null) { priorities = new DefMap<WorkTypeDef, int>(); }
    priorities.SetAll(0);
    int num = 0;
    foreach (WorkTypeDef item in from w in DefDatabase<WorkTypeDef>.AllDefs
        where !w.alwaysStartActive && !pawn.WorkTypeIsDisabled(w)
        orderby pawn.skills?.AverageOfRelevantSkillsFor(w) ?? 1f descending
        select w)
    {
        SetPriority(item, 3);
        num++;
        if (LimitInitialActiveWorks && num >= 6) { break; }
    }
    foreach (WorkTypeDef item2 in DefDatabase<WorkTypeDef>.AllDefs.Where((WorkTypeDef w) => w.alwaysStartActive))
    {
        if (!pawn.WorkTypeIsDisabled(item2)) { SetPriority(item2, 3); }
    }
    // ... Biotech mech overrides ...
    // then: Disable() every work type in pawn.GetDisabledWorkTypes()
}
```

The algorithm, stated plainly:

| step | rule | source |
|---|---|---|
| 1 | **Everything starts at 0** (blank / off). | `:95` |
| 2 | Take all work types that are **not `alwaysStartActive`** and **not disabled for this pawn**, ordered by **the pawn's average of that work type's relevant skills, descending**. | `:97-100` |
| 3 | Set the **first 6** of those to priority **3**. `MaxInitialActiveWorks = 6`. | `:24, 102-107` |
| 4 | Then set **every `alwaysStartActive` work type** the pawn is capable of to **3**, regardless of the cap. | `:109-115` |
| 5 | Finally, `Disable()` (→ 0) every work type in `pawn.GetDisabledWorkTypes()`. | `:124-128` |

So:

- **The default value is 3** — that part of the folk belief is right, and it is a named constant
  (`DefaultPriority = 3`).
- **But only ~6 skill-chosen work types are on**, plus the always-active ones. The *rest are blank*.
  A brand-new colonist arrives **mostly switched off**, with their best six specialisms enabled.
- **The default DOES differ by capability and by skill** — it is a function of
  `AverageOfRelevantSkillsFor(w)`. Two colonists arriving on the same tick get different grids.
- `LimitInitialActiveWorks` is `!pawn.RaceProps.IsMechanoid` [src, `:54`] — **mechanoids are not
  capped at 6**, and Biotech mechs then get explicit per-work-type priorities from their race def
  [src, `:116-123`].

✅ **SETTLED in review — `alwaysStartActive` is SIX work types, not the four I guessed:**
**`Firefighter`, `Patient`, `PatientBedRest`, `BasicWorker`, `Hauling`, `Cleaning`.** The two I missed
are **Hauling and Cleaning** — the two "dumb labour" types, which makes sense: a colony where nobody
hauls is a colony where nothing works, regardless of anyone's skills.

⇒ **The arithmetic is therefore 6 skill-ranked + 6 always-active = up to 12 work types enabled**, not
6 + 4. A pawn incapable of Dumb Labor gets fewer.
⚠️ **Version caveat as §1.4:** the defs source is a **2018 mirror (`0.19.2009`)**. Strong
corroboration, not a 1.6 citation.

## 1.6 Incapable vs disabled

These are **different**, they render differently, and only one of them is a priority value.

| | **Disabled (priority 0)** | **Incapable** |
|---|---|---|
| stored as | `priorities[w] == 0` | not stored on the pawn at all — derived from backstory / trait / title / slave status / ideoligious role [wiki] |
| renders as | blank cell (manual) / unchecked box (standard) | **no cell at all** — the box is absent [wiki] |
| player can change it | **yes** | **no.** `SetPriority` refuses and logs an error [src, `Pawn_WorkSettings.cs:143-147`] |
| where the player reads why | nowhere — it is just their own setting | pawn's **Bio tab → "Incapable Of"**; hovering shows the *source* [wiki] |
| survives a load | yes | re-applied on load: `PostLoadInit` calls `Disable()` for every currently-disabled work type [src, `:70-78`] |

**Incapabilities stack from multiple sources** and are expressed as **`WorkTags`**, not work types —
a coarser grain. A pawn is "incapable of" one of [wiki]:

`Animals` · `Artistic` · `Caring` · `Cleaning` · `Cooking` · `Crafting` · `Dumb Labor` ·
`Firefighting` · `Hauling` · `Intellectual` · `Mining` · `Plants` · `Skilled Labor` · `Social` ·
`Violent`

Notable semantics [wiki]:
- **Dumb Labor** = Hauling, Rearming, Refueling, Loading, Cremating, Cleaning. It does **not** prevent
  hauling *as part of another job* — a builder incapable of hauling still carries its own materials.
- **Skilled Labor** is enormous: brewing, butchery, cooking, construction, deconstruction, mining,
  growing, harvesting, plant-cutting, crafting, smithing, tailoring, repair, drilling, fabrication,
  machining, refining, smelting, stonecutting, drug production.
- **Violent** blocks all combat, hunting, wardening, slaughtering, executions — and even *equipping*
  non-damaging weapons. A non-violent pawn can still be **drafted**.
- **Incapable ≠ skill 0.** A skill-0 pawn *will* do the work, just slowly and badly. An incapable pawn
  never will [wiki].
- **The player cannot override it**, but the *game* can, in narrow cases: a pawn incapable of plant
  work can still fell a tree if it is ordered as **construction** work via Architect → Orders. In such
  exceptions the pawn is treated as skill 0 [wiki].
- **Slavery is special** — it *replaces* all other incapabilities with its own [wiki].

The engine-side gate that actually stops the job is `PawnCanUseWorkGiver`
[src, `JobGiver_Work.cs:268-295`], which checks, in order: `nonColonistsCanDo`,
`pawn.WorkTagIsDisabled(giver.def.workTags)`, `pawn.WorkTypeIsDisabled(giver.def.workType)`,
`giver.ShouldSkip(pawn)`, `giver.MissingRequiredCapacity(pawn)`, and `canBeDoneByMechs`.
**`MissingRequiredCapacity` is the health-capacity gate** (§6) — a pawn with no manipulation cannot
craft even at priority 1.

## 1.7 Column order, and whether the player can reorder it

**The player cannot reorder work-type columns in vanilla.** ⚠️ **UNVERIFIED-BY-SOURCE, but strongly
evidenced**: the order is `naturalPriority` from `WorkTypeDef` XML [src, `Verse/WorkTypeDef.cs:28`],
which is not player-editable, and no reorder affordance appears anywhere in the wiki's Work page
[wiki]. The existence and popularity of the **Work Tab** mod (Fluffy) and **Personal Work
Categories**, whose headline features are reordering and per-work-giver priorities, is corroborating
evidence that vanilla does neither. I did not find a source file for the tab UI.

**The shipped order, left to right** — this is the row order of the wiki's "Work types" table
[wiki, Work].

✅ **THE PROVENANCE CAVEAT THAT STOOD HERE IS DISCHARGED.** The first draft flagged as an *inference*
that the wiki's table is in Work-tab column order. Review obtained the vanilla `naturalPriority`
values and **the order matches across all 20 shared rows.** The inference was correct; the table below
is the tab order.

**The `naturalPriority` values** (descending = left to right; **no two are equal**, which is what
settles §1.3's tie case):

| work type | `naturalPriority` |
|---|---|
| Firefighter | **1400** |
| Patient | 1350 |
| Doctor | 1300 |
| PatientBedRest | 1250 |
| BasicWorker | 1200 |
| Warden | 1150 |
| Handling | 1100 |
| Cooking | 1050 |
| Hunting | 1000 |
| Construction | 950 |
| Growing | 900 |
| Mining | 850 |
| PlantCutting | 800 |
| Smithing | 750 |
| Tailoring | 700 |
| Art | 650 |
| Crafting | 600 |
| Hauling | 500 |
| Cleaning | 400 |
| Research | **100** |

⚠️ **VERSION CAVEAT, carry it if you quote the numbers.** This table comes from a **2018 defs mirror
(`0.19.2009`)**, not from 1.6. Its credibility rests on three independent checks: the **order** matches
the current wiki exactly across all 20 shared rows; the gaps are a regular 50 with deliberate jumps at
the bottom; and a modder-quoted custom value of **1310** slots exactly between Doctor 1300 and Patient
1350, which is what a modder wanting "just above Doctor" would pick. **Treat as strong corroboration,
NOT a 1.6 citation.** The 1.6-only rows (Childcare, Fish, Dark study) are absent from it — which is
also why §1.7's Childcare-position caveat below still stands. Anyone with the game installed settles
the whole thing in thirty seconds at `Data/Core/Defs/WorkTypeDefs/WorkTypes.xml`.

⇒ Note what the *spread* tells you: 1400 down to 100 is well inside the `0..10000` legal range
[src, `Verse/WorkTypeDef.cs:95-99`] and **utterly dwarfed by §1.3's `× 100000`** — confirming by
arithmetic, not just by reading, that the player's 1–4 can never be overridden by a tie-break.

| # | work type | relevant skill | work tag category | notes |
|---|---|---|---|---|
| 1 | **Firefight** | none | Firefighting | home area only |
| 2 | **Patient** | none | none | go to a medical bed for treatment |
| 3 | **Doctor** | Medical | Caring (+ Social for visiting) | also auto-rescues downed colonists |
| 4 | **Bed rest** | none | none | rest in bed to heal injuries; distinct from sleep |
| 5 | **Childcare** | Social | Caring, Social | **Biotech DLC**. ⚠️ position uncertain — see below |
| 6 | **Basic** | none | none | flick switches, release prisoners, open containers |
| 7 | **Warden** | Social | none | prisoners: feed, chat, recruit, convert, execute |
| 8 | **Handle** | Animals | Animals | tame, train, milk, shear, slaughter |
| 9 | **Cook** | Cooking | Skilled labor | meals, butchery, brewing |
| 10 | **Hunt** | Shooting + Animals | Violent | requires a ranged weapon |
| 11 | **Construct** | Construction | Skilled labor | build, deconstruct, repair, smooth, roofs, floors |
| 12 | **Grow** | Plants | Skilled labor | sow, harvest, replant |
| 13 | **Mine** | Mining | Skilled labor | mine, deep drill |
| 14 | **Plant cut** | Plants | Dumb labor | cut marked plants, fell trees, extract trees |
| 15 | **Smith** | Crafting | Skilled labor | smithy, machining, fabrication, mech repair |
| 16 | **Tailor** | Crafting | Skilled labor | tailor bench |
| 17 | **Art** | Artistic | Artistic | sculpture, painting, floor paint |
| 18 | **Craft** | Crafting (Cooking for drug cooking; Intellectual for synthesis) | Skilled labor / Intellectual | crafting spot, refinery, stonecutting, smelting, drugs |
| 19 | **Fish** | Animals | Animals | **1.6 base game** |
| 20 | **Haul** | none | Dumb labor | the largest work-giver list in the game |
| 21 | **Clean** | none | Dumb labor | filth, snow, pollution |
| 22 | **Dark study** | Intellectual | Intellectual | **Anomaly DLC** |
| 23 | **Research** | Intellectual | Intellectual | research bench, scanners, xenogerms |

⚠️ **Childcare's position in this list is explicitly uncertain.** The wiki page carries a stub banner
reading *"Reason: Add Childcare work in the right place"* [wiki] — i.e. the wiki editors themselves
flag that row as possibly misplaced. Do not treat row 5 as load-bearing.

*(The `naturalPriority` integers are given above, with their version caveat.)*

## 1.8 How a pawn actually chooses its next job

This is the part most worth reading twice, because **RimWorld does not re-scan every tick, and a
Perilune lane that assumes it does will build a dispatcher RimWorld does not have.**

### When a scan happens

| trigger | what runs | source |
|---|---|---|
| **The current job ends** (any reason) | `EndCurrentJob` → `TryFindAndStartJob()` → full think-tree walk | `Verse.AI/Pawn_JobTracker.cs:419-472, 602-624` |
| **`curJob == null` on a tick interval** | `TryFindAndStartJob()` | `:197-204` |
| **Every 30 ticks** (`pawn.IsHashIntervalTick(30, delta)`) | the **constant** think tree only — the small always-on tree for urgent reactions. It can force-interrupt with `JobCondition.InterruptForced`. | `:138-155` |
| **Job expiry** (`curJob.expiryInterval`) | `EndCurrentJob(Succeeded)` or `CheckForJobOverride()` per `checkOverrideOnExpire` | `:156-194` |
| **Explicit override calls** (a need crossing a threshold, a work type being disabled, drafting) | `CheckForJobOverride()` — a full think-tree walk that starts the result with `JobCondition.InterruptOptional` | `:571-591` |

⇒ **A working pawn normally finishes its job before reconsidering.** The wiki states the
player-visible form of this twice, independently:

> "Pawns will continue their current task until finished. Only then will a colonist check their
> schedule and work tabs for other possible assignments." [wiki, [Schedule/Menus](https://rimworldwiki.com/wiki/Menus)]

> "Pawns will continue their current work task until finished, so that the need percentages may fall
> below the threshold, but when looking for the next task the schedule thresholds will be in effect.
> **The current work task can be manually ended by drafting and undrafting the pawn.**" [wiki]

**There is a loop-breaker.** If a pawn starts **10 jobs in 10 ticks**, the tracker fires
`TryStartErrorRecoverJob` and logs *"started 10 jobs in 10 ticks"*
[src, `Pawn_JobTracker.cs:223-237`]; there is a second, per-tick guard at
`jobsGivenThisTick > 10` [src, `:267-276`]. RimWorld ships with an explicit anti-thrash device at the
dispatcher, and it produces a visible error rather than degrading silently.

### What the scan does

`JobGiver_Work.TryIssueJobPackage` [src, `JobGiver_Work.cs:49-266`]:

1. If this is the **emergency** node and the pawn has a live *prioritised* order (§2.2), re-issue that
   first, marking `job.playerForced = true`. If nothing can be produced from it, **clear** the
   prioritisation [src, `:55-77`].
2. Walk `WorkGiversInOrderNormal` (or `...Emergency`) in order [src, `:78-84`].
3. For each work giver, `PawnCanUseWorkGiver` (§1.6) gates it [src, `:89-92`].
4. `NonScanJob(pawn)` — a giver that needs no target (e.g. "go to a bench") returns immediately
   [src, `:95-103`].
5. Otherwise scan for the **closest reachable non-forbidden valid target** — things
   (`ClosestThingReachable`, 9999 max, region-limited before falling back to global) and/or cells
   [src, `:104-181`]. A giver may declare itself `Prioritized`, in which case a per-target
   `GetPriority` score beats distance, with distance as the tie-break [src, `:188-201`].
6. **Group by `priorityInType`**: keep the best target seen; break out only when `priorityInType`
   changes *and* a target exists [src, `:85-88, 263`].
7. **First group that yields a job wins.** There is no cross-work-type comparison, no cost model, no
   lookahead.

**One nicety worth knowing, because it is exactly the kind of thing a lane invents from scratch:**
`TryOpportunisticJob` [src, `Pawn_JobTracker.cs:626-740`]. When a pawn is about to walk somewhere for
a job, it may pick up a haulable *on the way*, but only under a tight geometric budget: the detour
target must be within **30 tiles**, within **half** the trip distance, and the total
pawn→item→store→destination must not exceed **1.7×** the direct distance; store→destination ≤ **50**
tiles and ≤ **0.6×**; the direct trip itself must be ≥ **3** tiles; both legs must be within **25
regions**. Excluded when drafted, downed, burning, in a mental state, rebelling, or when the job is
`playerForced`.

---

# §2 — JOBS, DESIGNATIONS AND THE ORDER LOOP

## 2.1 Designation vs direct order

RimWorld separates **a request made to the world** from **a command given to a person**. The
separation is total: a designation names no pawn, and a direct order names no work type.

| | **Designation** | **Direct order** |
|---|---|---|
| addressed to | a **tile or thing** | a **named pawn** |
| stored on | the map's `DesignationManager`, as a `Designation` [src, `Verse/DesignationManager.cs`] | the pawn (`mindState.priorityWork`, `jobs.jobQueue`, `drafter`) |
| picked up by | whichever capable pawn's work scan reaches it first | that pawn, immediately |
| persists | until satisfied or cancelled | see §2.2/§2.3 |
| survives the pawn dying | **yes** | no |

**The shipped designation kinds** [src, `RimWorld/DesignationDefOf.cs`] — this is the complete
`DefOf` list, i.e. the ones the engine references by name:

`Haul` · `Mine` · `MineVein` · `Deconstruct` · `Uninstall` · `CutPlant` · `HarvestPlant` · `Hunt` ·
`SmoothFloor` · `RemoveFloor` · `RemoveFoundation` · `SmoothWall` · `Flick` · `Plan` · `Strip` ·
`Slaughter` · `Tame` · `Open` · `EjectFuel` · `ReleaseAnimalToWild` · `ExtractTree` ·
`PaintBuilding` · `PaintFloor` · `RemovePaintBuilding` · `RemovePaintFloor` · `ExtractSkull` ·
`FillIn`

Three of these are worth naming for Perilune's purposes:

- **`Plan`** is a designation that *nothing works on* — a pure drawing tool for the player. RimWorld
  ships a paint-a-plan verb whose only consumer is the player's own eyes.
- **`Flick`** is a designation for "toggle this switch" — the analogue of Perilune's OPERATE, and
  RimWorld routes it through the **designation + Basic work type** path rather than making it an
  instantaneous player verb.
- **`Haul`** exists as an explicit designation *as well as* the automatic stockpile-driven hauling.

**Un-designating exists and is first-class.** Architect → Orders → **Cancel** removes designations and
blueprints; the hotkey is bound as `KeyBindingDefOf.Designator_Cancel` and is reused for "clear
prioritised work" [src, `Verse/PriorityWork.cs:94`].

## 2.2 "Prioritise" — right-click → *Prioritise doing X*

**This is the mechanic OD-A's "right-click prioritise override" is an analogue of. Read it exactly.**

**How it is issued.** Select **one** colonist, right-click a target (blueprint, thing, tile, pawn),
choose from the context menu [wiki]. If no menu appears, that colonist can do nothing with that
target — *try another colonist* [wiki]. **Multiple orders chain with Shift**, and the queue is shown
on the pawn's inspect pane [wiki].

**What it sets** [src, `Verse/PriorityWork.cs`]: a three-field record on the pawn's mind state —
`prioritizedCell` (an `IntVec3`), `prioritizedWorkGiver` (a `WorkGiverDef`), and `prioritizeTick`.
It is **saved state** (`ExposeData`, `:48-53`).

**How long it holds — a hard timeout of 30 000 ticks** [src, `:17, 25`]:

```csharp
private const int Timeout = 30000;
public bool IsPrioritized => prioritizedCell.IsValid
    && Find.TickManager.TicksGame < prioritizeTick + 30000;   // else Clear()
```

| in | value |
|---|---|
| ticks | **30 000** |
| in-game time | **half an in-game day** (1 day = 60 000 ticks) |
| real time at 1× speed | **~8 min 20 s** (60 ticks/s) |

**What breaks it:**
- the timeout above — and `IsPrioritized` **clears itself** on read once expired [src, `:29`];
- the emergency scan finding no producible job from the prioritised work giver — it calls `Clear()`
  [src, `JobGiver_Work.cs:76`];
- **drafting** (§2.3) — *"Forced work will also be cancelled"* [wiki];
- the player clicking the **"Clear prioritised work"** gizmo, which also clears the whole job queue
  and ends the current forced job with `JobCondition.InterruptForced`
  [src, `PriorityWork.cs:81-96`];
- the work type being disabled *while the job runs* — but **only if the job was not player-forced**
  [src, `Pawn_JobTracker.cs:112-120`]:
  ```csharp
  if (curJob != null && curJob.workGiverDef != null && curJob.workGiverDef.workType == wType
      && (flag || !curJob.playerForced))
  { EndCurrentJob(JobCondition.InterruptForced); }
  ```
  where `flag` is `pawn.WorkTypeIsDisabled(wType)` — i.e. **incapability wins even over a player
  order; a player's own priority-0 setting does not.**

**Does it override the work grid?** **Partially, and the distinction matters.**
- It **does** override the *priority number* and the *scan order*: the prioritised work giver is tried
  first, out of band, by the emergency node [src, `JobGiver_Work.cs:55-77`].
- It **does NOT** override *disabled* or *incapable*. `GiverTryGiveJobPrioritized` calls
  `PawnCanUseWorkGiver` first and returns null if it fails [src, `:306-311`]. The wiki says the same
  in player terms: *"A colonist can be directed to immediately perform a task, **but only if it's a
  work type they're assigned to**"* [wiki].

  ⚠️ **UNVERIFIED nuance**: `PawnCanUseWorkGiver` checks `WorkTypeIsDisabled` (incapability), **not**
  `GetPriority(w) == 0` (player-blanked). The wiki's "only if it's a work type they're assigned to"
  and the source's check are therefore *not obviously the same claim*. I believe the wiki is
  describing the fact that the **right-click menu itself** does not offer options for work the pawn is
  not assigned to, i.e. the gate is in the UI rather than in `GiverTryGiveJobPrioritized`. I could
  not read the context-menu source to confirm. **Do not encode either reading without checking.**

**Does it override physical impossibility? No.** The prioritised path is the *same* work giver code:
`HasJobOnThing` / `HasJobOnCell` must still return true, the target must not be forbidden, and the
job must still be constructible [src, `:322-348`]. RimWorld's answer to an impossible order is a
**refusal at the point of the click** — the context menu greys the entry and states the reason
(*"Cannot operate (need material)"* is the wiki's own example for a surgery bill [wiki]). It does
**not** accept the order and then fail silently.

> **This is the single most transferable fact in §2 for Perilune.** RimWorld makes the refusal
> *synchronous with the click and legible in the menu*. Perilune's `WorksiteSafety.CanStageWorkerAt`
> refuses **asynchronously and silently** (§8.3).

## 2.3 Drafting

**What it is:** RimWorld's combat mode and its precise-positioning mode. Hotkey **R**, or the
crossed-swords gizmo [wiki].

**Who can be drafted:** any capable colonist — *including one incapable of violence, and including an
unarmed one* — plus slaves and friendly mechanoids. **Not** the downed, the immobile, or a pawn in a
mental break [wiki].

**What it suspends** [wiki]:
- **All work.** A drafted pawn cannot haul, construct, or do any work type.
- **All needs.** *"Drafted pawns will remain at their assigned place, **ignoring their needs
  entirely**."* They will starve or collapse in place rather than leave.
- **Zone restrictions** and the **threat response** setting.
- **Forced/prioritised work** (§2.2).
- Whatever they were doing, **immediately** — including sleep.

**What still runs:**
- **Fire.** *"The effects of fire take precedence over drafting"* — a burning pawn runs wildly
  regardless [wiki].
- **Mental breaks**, which also *end* the draft [wiki].
- Downing ends the draft [wiki].
- A drafted pawn can still eat and take drugs **on the player's explicit order**, equip/drop gear,
  repair damaged buildings, and (uniquely) **arrest**, **rescue and place downed pawns anywhere**,
  **tend anywhere with or without medicine**, and **douse fires outside the home area** [wiki].

**Auto-undraft: 10 000 ticks** with no threats and no orders [wiki] — 1/6 of an in-game day, ~2 min
46 s real at 1×. (Version history: *"B19/1.0 — Increased delay before auto-undraft by 20%"* [wiki].)

**Work-progress semantics on interruption, stated exactly** [wiki]:

> "Any work progress they've made that is **represented by a yellow progress bar will be lost**,
> while **pausable work such as crafting and construction will not be**."

**And the deliberate side-effect the community relies on** [wiki]:

> "Allowed areas, need fulfillment, and work priorities will be re-assessed once the pawn is
> undrafted. **This can be useful to force pawns to reconsider their next action without having to
> wait for the next natural breakpoint.**"

⇒ RimWorld's answer to "the pawn won't re-evaluate" is *draft, undraft* — a player-side idiom that
exists **because** §1.8's "finish the job first" rule is real and is not patched around.

## 2.4 Job interruption and pre-emption

`JobCondition` is the vocabulary of *why a job ended* [src, `Verse.AI/JobCondition.cs`]:

| value | meaning |
|---|---|
| `None = 0` | (unset — warns if a job starts over another with this) |
| `Ongoing = 1` | |
| `Succeeded = 2` | |
| `Incompletable = 4` | |
| `InterruptOptional = 8` | a *soft* pre-emption — used by `CheckForJobOverride` |
| `InterruptForced = 0x10` | a *hard* pre-emption — drafting, forced work, work type disabled |
| `QueuedNoLongerValid = 0x20` | |
| `Errored = 0x40` / `ErroredPather = 0x80` | recovery paths; an errored job starts a 250-tick `Wait` [src, `Pawn_JobTracker.cs:450-453`] |

### ⭐ `Danger` — the OTHER half of the vocabulary, and the half this document originally missed

`JobCondition` says *why a job ended*. **`Danger` says what a pawn is willing to walk through to
start one**, and it is threaded through the *same* scan `JobCondition` never touches. Its absence from
the first draft of this file is the direct cause of the biggest error in it (§8.4).

```csharp
public enum Danger : byte { Unspecified, None, Some, Deadly }
```
[src, `Verse/Danger.cs`]

**Where it comes from — a region's danger is computed per pawn** [src, `Verse/Region.cs:433-436`]:

```csharp
Danger danger = (value2.Includes(temperature) ? Danger.None
               : (value2.ExpandedBy(80f).Includes(temperature) ? Danger.Some : Danger.Deadly));
if (room.Vacuum > 0.5f && p.ConcernedByVacuum) { danger = Danger.Deadly; }
```

So **temperature is graded** (inside the pawn's `SafeTemperatureRange` → `None`; within ±80 °C of it →
`Some`; beyond → `Deadly`) and **vacuum is binary and always `Deadly`** above 50 %.

**What a pawn will tolerate** [src, `Verse/DangerUtility.cs:7-25`]:

| condition | `NormalMaxDanger` |
|---|---|
| `pawn.CurJob.playerForced` | **`Deadly`** |
| `FloatMenuMakerMap.makingFor == pawn` (the right-click menu is being *built* for this pawn) | **`Deadly`** |
| player faction, with a minor temperature injury and a safe room available | `None` |
| **anything else, including an ordinary working colonist** | **`Some`** |

⇒ **An ordinary autonomous colonist tolerates `Some` and refuses `Deadly`.** That single line is the
whole of §8.4.

The `FloatMenuMakerMap.makingFor` clause is quietly elegant and worth carrying: **the right-click menu
is built with the danger ceiling already raised**, which is *why* the menu offers you the job in a
deadly room — the menu and the resulting forced job agree by construction, rather than by a
duplicated rule.

**Two grades of pre-emption is the design.** `CheckForJobOverride(minPriority)` will only swap the
job if the new think result's node priority is `>= minPriority` [src, `:581`] — so a caller can say
*"interrupt only for something at least this urgent."* This is exactly the seam Perilune's spike found
missing (§8.5).

**Carried items on interruption.** `StartJob` takes a `keepCarryingThingOverride`; `CleanupCurrentJob`
releases reservations. On drafting the pawn *drops* held items and carried pawns *"to make use of
their weapon"* — with a documented exception for babies (carried the first time, dropped on a
re-draft) [wiki].

**Reservations.** Targets are reserved through a per-map `reservationManager`; a job's reservations
are made in `TryMakePreToilReservations` before the job runs and released on cleanup
[src, `Pawn_JobTracker.cs:345-400, 475-500`]. `FirstRespectedReserver` is what stops two pawns
converging on one item [src, `:700`]. ⇒ **RimWorld's answer to double-claiming is a reservation
manager, not a scan-order convention.**

## 2.5 Stockpiles, zones and hauling

**Storage priority is a 6-value enum** [src, `RimWorld/StoragePriority.cs`]:

```csharp
public enum StoragePriority : byte
{ Unstored, Low, Normal, Preferred, Important, Critical }
```

`Unstored` is not a player choice — it is "on the floor". **Five player-selectable levels**, and
`Normal` is the default for a new stockpile. ⚠️ **UNVERIFIED that `Normal` is the default** — it is the
consistent assumption in the wiki's worked example [wiki, Stockpile], but I did not read the
`Zone_Stockpile` constructor.

**How hauling picks a destination** [wiki, Stockpile]:

> "Items are brought to stockpiles with **higher priority that have available space**. Haulers will
> even **move items already in a stockpile** that can be moved to a higher priority one."

The engine form is `StoreUtility.TryFindBestBetterStorageFor(item, pawn, map, currentPriority, ...)`
[src, seen in use at `Pawn_JobTracker.cs:707`] — a hauler only acts when a **strictly better**
destination exists than the item's current one, which is what stops infinite shuffling between equal
stockpiles.

**Note the deliberate absence:** there is **no route, no network, no logistics graph, and no
throughput model.** A haul is a single pawn walking to one item and carrying it to one cell.

**Zone semantics** [wiki, Stockpile]:
- Drawing over an existing stockpile **expands** it; walls and workbenches are silently excluded from
  the drawn rect.
- Items already lying on newly-zoned tiles become part of the stockpile **even if the filter
  disallows them**.
- Removal is a separate **Shrink Zones** tool.

**Filters** are per-stockpile: an item allow-list, plus **hit-points** and **quality** range sliders
[wiki].

**Allowed areas** are a separate concept from stockpiles: up to **8** player-created areas (plus the
Home area), assigned per colonist in the Schedule tab, restricting *where the colonist may go*
[wiki, Menus]. A colonist will only work inside its allowed area, but *may traverse* disallowed tiles
to reach an allowed island [wiki, Work → Notes].

## 2.6 Bills at workstations

**Bills are attempted top-down** [wiki, [Bill](https://rimworldwiki.com/wiki/Bill)]. A bill is skipped
— not failed — when any of these hold [wiki]:

- ingredients unavailable at all, or outside the bill's **ingredient radius**;
- the pawn lacks the requisite skill, or falls outside the bill's **allowed skill band**;
- the pawn is excluded by the bill's **worker restriction** (a named pawn, a pawn type, a band);
- the bill is **suspended** (manually, or by its own satisfaction condition);
- the bill produces an authored item (one with quality) and **another pawn** left an unfinished item
  on it — only the original author may resume.

> "**If no bills can be performed, the pawn will not work that bench.**" [wiki]

⇒ **An unsatisfiable bill is a silent skip, not an error and not a queue stall.** The player is
informed by a separate alert system, not by the bill.

**Repeat modes** — three, and they are `Def`s, i.e. extensible [src, `RimWorld/BillRepeatModeDefOf.cs`]:

| mode | wiki label | behaviour |
|---|---|---|
| `RepeatCount` | *Do X times* | counts down; remaining shown |
| `TargetCount` | *Do until you have X* | counts **stockpiled** stock only; has *Pause when satisfied* and *Unpause at: x* |
| `Forever` | *Do forever* | stops only when materials run out |

**The `TargetCount` counting rule is a genuine trap and RimWorld documents it as one:** items *not in
a stockpile are not counted* [wiki]. Pairing *Drop on floor* with *Do until you have X* over-produces
forever unless a stockpile is drawn under the worker's feet.

**Product destination** — three options: *Take to best stockpile* / *Drop on floor* / *Take to X* (a
named stockpile or storage group, **regardless of priority**) [wiki].

**Ingredient radius** is a per-bill maximum distance for fetching ingredients [wiki]. ⚠️ **UNVERIFIED**
what the default radius is, or whether the default is "unlimited"; the wiki describes the control but
gives no number.

---

# §3 — AUTONOMY VS CONTROL

> Perilune's binding statement of its own target is *order → pawn does it → the world changes*, and
> *"this balance between control and autonomy."* This section is the concrete answer to what that
> balance is in RimWorld.

## 3.1 The escalation ladder

RimWorld gives the player **five rungs**, and they are genuinely different in kind, not in degree:

| rung | instrument | addressed to | how long it lasts | overrides |
|---|---|---|---|---|
| 0 | **Do nothing** | — | forever | — |
| 1 | **The work grid** (§1) | *a pawn's disposition* | until changed | nothing — it is the baseline |
| 2 | **A designation** (§2.1) | *the world* | until satisfied or cancelled | nothing — it only creates work |
| 3 | **Prioritise** (§2.2) | *one named pawn, one target* | **30 000 ticks / half a day**, or until broken | the grid's ordering, **not** capability |
| 4 | **Draft** (§2.3) | *one named pawn, absolutely* | until undrafted or **10 000 ticks** idle | work, needs, zones, threat response |

Two properties of this ladder are worth stating explicitly, because they are the design:

- **Each rung is more specific AND more temporary.** The permanent instrument (the grid) is the least
  specific; the absolute instrument (draft) expires in under three real minutes. **RimWorld does not
  offer a permanent per-pawn per-target order at all.**
- **No rung overrides capability.** Incapability is not a strong preference; it is a wall, at every
  rung including draft (a non-violent drafted pawn will not fight).

## 3.2 What a colonist does WITHOUT being told

Everything below happens with the player having issued no order at all. This is the large half.

| behaviour | notes | source |
|---|---|---|
| **Take work from the grid**, in priority order, closest-target-within-group | the whole of §1 | [src] |
| **Eat** when hunger crosses the schedule's threshold | 30 % under most schedule blocks | [wiki, Menus] |
| **Sleep** when rest crosses the threshold — and **collapse and sleep on the ground** at 0 % regardless of schedule, waking at 20 % | | [wiki, Menus] |
| **Seek recreation** below the schedule's threshold (35 % under *Anything*) | | [wiki, Menus] |
| **Go to a medical bed** when ill or injured | the `Patient` and `Bed rest` **work types** — self-care is modelled as *work the pawn does on itself* | [wiki, Work] |
| **Rescue downed colonists** | part of `Doctor`; not a separate order | [wiki, Work] |
| **Haul opportunistically en route** to another job, inside a tight detour budget | §1.8 | [src] |
| **Wear and swap apparel**, take drugs per policy, read per policy | the **Assign** tab is a *policy* surface, not an order surface | [wiki, Menus] |
| **Socialise, form and break relationships, start social fights** | | [wiki] |
| **Have mental breaks** | §4 | [wiki] |
| **Flee fire; run wildly while burning** | overrides even drafting | [wiki, Drafting] |
| ⭐ **REFUSE TO WALK INTO DANGER** — a region over 50 % vacuum, or beyond ±80 °C of the pawn's safe band, is simply not reachable for autonomous work | **the most important row in this table**, and the one the first draft of this file missed entirely. §2.4, §8.4 | [src, `Region.cs:433-436`; `DangerUtility.cs:7-25`; `WorkGiver_Scanner.cs:30-33`] |
| ⭐ **WALK BACK OUT OF VACUUM** once actually taking damage — `JobGiver_FindOxygen` BFS-searches for the nearest room under 50 % vacuum and goes there | **suppressed by a player-forced job now or queued**, so the player can order a colonist to stay and suffocate. Odyssey only. §8.4 | [src, `RimWorld/JobGiver_FindOxygen.cs`; `PawnUtility.cs:378-390`] |
| **Batch cleaning and harvesting** for efficiency | an engine-side optimisation the player never sees | [wiki, Work → Notes] |

## 3.3 What ONLY happens when told

| requires | why |
|---|---|
| **Mining, deconstruction, harvesting, tree-felling, hunting, taming, slaughter, stripping, smoothing, painting, uninstalling** | all are **designations** — the work does not exist until the player paints it |
| **Building anything** | a blueprint is a designation |
| **Crafting anything** | requires a **bill** on a bench |
| **Arresting, rescuing to a chosen spot, tending in the field, dousing fire outside the home area** | require **drafting** [wiki] |
| **Going to a specific tile** | requires drafting, or a prioritise on a job at that tile |
| **Where things are stored** | requires a stockpile zone; with none, everything stays where it falls |
| **Research topic** | player-chosen |
| **Recruiting, converting, executing prisoners** | player-chosen per prisoner |

⇒ **The dividing line is clean and is worth naming: a colonist will maintain itself and the colony's
existing state without being told, and will change the world only when told.** Every world-changing
verb is a designation, a bill, or a draft.

## 3.4 What a colonist does with NOTHING to do

The wiki's Schedule table footnote is exact [wiki, Menus]:

> "This is the last check, if it fails a pawn will go **'Idle'** until something changes. **Idle pawns
> slowly wander within safe temperature.**"

So: **a labelled "Idle" state, plus a bounded temperature-aware wander.** Not a hidden state, not a
freeze in place — the player is shown that the pawn has nothing to do, and the pawn keeps moving.

⚠️ **UNVERIFIED**: the wander radius, the tick cadence of the wander, and whether idle pawns preferentially
seek a gather spot. The class names `JobGiver_WanderColony` and `JobGiver_IdleJoy` are widely cited in
modding discussion but I did not read either file, and the Humanlike think-tree XML is not in the
decompiled repo (it is XML, not C#) and I could not find a mirror.

## 3.5 The schedule grid — the only *time* instrument

24 hourly slots per colonist, one of five assignments each [wiki, Menus]. It is worth tabulating
because **the schedule is how RimWorld expresses "I want work to beat needs", and it does so with
thresholds, not with a priority number.**

| assignment | works unless… | notes |
|---|---|---|
| **Anything** | recreation < 35 %, food < 30 %, rest < 30 %, or psyfocus below target | won't wake a sleeping pawn |
| **Work** | **food < 30 % only** — ignores rest and recreation entirely | wakes a sleeping pawn. Rest hitting 0 still collapses them; they wake at 20 % |
| **Recreation** | recreation < 95 %, food < 30 %, rest < 30 %, psyfocus | won't wake a sleeping pawn |
| **Sleep** | food < 30 %, rest < 75 % | **will recreate if no jobs remain**. Wakes at rest 100 %, or food < 12.5 % |
| **Meditate** (Royalty DLC) | food < 30 %, rest < 15 % | counts as Solitary recreation; wakes a sleeping pawn |

The engine implements this as a **think-node priority on `JobGiver_Work` itself**
[src, `JobGiver_Work.cs:19-47`]:

| current time assignment | `JobGiver_Work.GetPriority` |
|---|---|
| `Work` | **9.0** |
| `Anything` | **5.5** |
| `Sleep` | **3.0** |
| `Joy` | **2.0** |
| `Meditate` | **2.0** |

⇒ **The schedule does not switch behaviour on and off; it changes where work sits relative to needs in
one ordered think tree.** That is a materially different design from "a shift roster", and it is the
mechanism that makes `CheckForJobOverride(minPriority)` (§2.4) meaningful.

**The need-check priority order, when a pawn does look for its next task:**
**Eat ▸ Sleep ▸ Meditate ▸ Recreate ▸ Work ▸ Recreate (again)** — and *"this is the last check, if it
fails a pawn will go Idle"* [wiki, Menus].

> ### ⭐ THE SINGLE MOST IMPORTANT BEHAVIOURAL RULE IN §3, and it was confirmed twice independently
>
> **Needs do NOT interrupt a job in progress. The need check is a job-SELECTION filter, evaluated
> between jobs.**
>
> - From the source: a pawn re-walks the think tree on `EndCurrentJob` / `curJob == null`; the only
>   periodic poll is the *constant* tree every 30 ticks (§1.8) [src].
> - From the wiki, independently: *"pawns will continue their current work task until finished, **so
>   that the need percentages may fall below the threshold**, but when looking for the next task the
>   schedule thresholds will be in effect"* [wiki, Schedule].
>
> ⇒ A hungry RimWorld colonist finishes its wall before it eats. That is why *draft-undraft* is the
> community's universal "make it reconsider" idiom (§2.3), and it is the behaviour a Perilune
> pre-emption seam would be choosing to keep or break.

⚠️ **UNVERIFIED**: the corresponding think-node priorities for the *need* satisfiers (eat, sleep, joy).
Without the Humanlike think-tree XML I can state RimWorld's work-side numbers but not what they are
being compared against. **Do not infer the needs' numbers from these.**

---

# §4 — NEEDS, MOOD AND THE MENTAL-BREAK LADDER

Kept deliberately shallow — Perilune has no mood system and OD-B parks the economy. What follows is
what a lane would need to *decide* whether to build one, not to build it.

## 4.1 The needs

| need | base game / DLC | notes |
|---|---|---|
| **Food** | base | drives hunger; failure → malnutrition → death |
| **Rest** | base | failure → collapse where standing |
| **Recreation** (Joy) | base | fed by joy activities, which have *kinds* and tire of repetition |
| **Comfort** | base | driven by what the pawn is sitting/lying on |
| **Beauty** | base | driven by the surroundings' beauty stat |
| **Outdoors / Indoors** | base | trait-gated in both directions |
| **Room size (Space)** | base | cramped-interior thought |
| **Chemical** (per-drug) | base | appears only once addicted |
| **Mood** | base | **not an input — an output**, computed from thoughts |
| Suppression, Authority, Psyfocus, Learning, Sleep(baby), KillThirst, Deathrest, Blood… | Royalty / Ideology / Biotech / Anomaly | DLC-only |

## 4.2 Mood — the numbers, verified

Mood is a **0–100 % bar** in the Needs tab
[wiki, [Mood](https://rimworldwiki.com/wiki/Mood)]. Two quantities, and the distinction is the
mechanic:

| | |
|---|---|
| **Mood target** | the instantaneous sum of every thought the pawn holds, added to a difficulty-set **base mood**. Moves *immediately*. Shown as a white triangle. |
| **Mood** | the blue bar, which **chases** the target at a **maximum of +12 per in-game hour rising and −8 per in-game hour falling**. |

⇒ **RimWorld deliberately rate-limits mood, and asymmetrically — it falls slower than it rises.** A
fixed cause does not produce an instant effect; the player gets time to react. **While a pawn is
asleep or unconscious the bar is frozen and break risk is paused** [wiki, Mood].

**Base mood by difficulty** [wiki, Mood]:

| difficulty | base mood |
|---|---|
| Peaceful | 42 |
| Community builder | 42 |
| Adventure story | 37 |
| **Strive to survive** (the default) | **32** |
| Blood and dust | 27 |
| Losing is Fun | 22 |

**The mental-break ladder** [wiki, Mood; [Mental break](https://rimworldwiki.com/wiki/Mental_break)]:

| tier | default threshold | in-game mood label | mean time to break below it |
|---|---|---|---|
| **Minor** | **35 %** | "Stressed" | **10 days** |
| **Major** | **20 %** | "On edge" | **3 days** |
| **Extreme** | **5 %** | "About to break" | **0.7 days** |

The three are **derived, not independent**: major = **4/7** of minor, extreme = **1/7** of minor
[wiki, Mental break]. Traits shift the minor threshold (Steadfast down, Nervous up) and stack
additively; **the minor threshold is clamped to 1 %–50 %** [wiki, Mental break].

⇒ **Three tiers, one tunable.** A lane copying this should copy the *derivation*, not three numbers:
RimWorld exposes one per-pawn stat and computes the other two.

**Break mechanics worth knowing:** a broken pawn's name turns green, the player has **no control**,
and the break ends by expiry, by **arrest**, by beating them down, or by a psycast. Afterwards the
pawn gains **"catharsis": +40 mood for 2.5 days** — an explicit anti-death-spiral device, and it has
been observed to stack to +70 and +93 [wiki, Mental break]. **To break at all, a pawn must be awake
and able to move** [wiki, Mood].

**Trait modifiers to the threshold** — additive, and the minor threshold is clamped to **1 %–50 %**
[wiki, [Mental Break Threshold](https://rimworldwiki.com/wiki/Mental_Break_Threshold)]:

| trait | offset to the minor threshold | resulting minor / major / extreme |
|---|---|---|
| *(none)* | — | **35 / 20 / 5** |
| Iron-willed | **−18 %** | 17 / 10 / 2 |
| Steadfast | −9 % | 26 / 15 / 4 |
| Nervous | +8 % | 43 / 25 / 6 |
| Neurotic | +8 % | 43 / 25 / 6 |
| Very neurotic | +14 % | 49 / 28 / 7 |
| Volatile | **+15 %** | 50 / 29 / 7 |
| Too smart | +12 % | 47 / 27 / 7 |

⚠️ **Sanguine / Optimist / Pessimist / Depressive do NOT move the threshold** — they are flat permanent
*mood* offsets (**+12 / +6 / −6 / −12**) [wiki, Trait]. This is a distinction that reads backwards from
the trait names, and it is worth carrying: RimWorld separates *"how happy is this pawn"* from
*"how much unhappiness can this pawn take"* into two independent axes.

⚠️ Version note: **the derivation changed in 1.1.** Before that, major/minor were locked to base + 15 %
/ + 30 % over a 5 % base, so thresholds could only move 4 % total — Iron-willed was far weaker
[wiki, Mental break].

## 4.4 Need thresholds — the bands, verified

**Food / Saturation** [wiki, [Saturation](https://rimworldwiki.com/wiki/Saturation)]. ⚠️ **The
labels are Fed / Hungry / Ravenously Hungry / Malnourished** — not the commonly written "Urgently
hungry / Starving".

| label | saturation | mood | immunity gain |
|---|---|---|---|
| Fed | > 25 % | — | ×100 % |
| Hungry | 12.5 – 25 % | **−6** | ×100 % |
| Ravenously Hungry | 0 – 12.5 % | **−12** | ×90 % |
| Malnourished | 0 % | **−20** | ×70 % |

An adult baseline human consumes **1.6 nutrition/day** against a max of **1.0**, i.e. ~2 simple meals.
From full, a human takes **22.5 in-game hours to reach 0 %**, then accrues malnutrition at **2 %/hour**
— **up to 72.5 hours from full to death**.

**Rest** [wiki, [Rest](https://rimworldwiki.com/wiki/Rest)]:

| label | rest | mood | immunity |
|---|---|---|---|
| Rested | ≥ 28 % | — | ×100 % |
| Drowsy | 14 – 28 % | −6 | ×96 % |
| Tired | 1 – 14 % | −12 | ×92 % |
| Exhausted | ≤ 1 % | **−18** | ×80 % |

**Rest effectiveness by bed** — ground/sleeping spot **0.8**, bedroll 0.95, bed **1.0**, royal bed 1.05,
× a quality multiplier running awful **0.86** → normal **1.0** → legendary **1.6**. 0 → 100 % takes
**10.5 in-game hours** at effectiveness 1.0.

⇒ **A pawn can be awake ~70.6 % of the day** at unmodified rest rate in a normal bed. **Rest affects
mood and immunity only — no work or combat stat.**

**Recreation** [wiki, [Recreation](https://rimworldwiki.com/wiki/Recreation)] — note the **dead band**:
nothing fires between 30 % and 69 %.

| recreation | mood |
|---|---|
| 85 – 100 % | **+10** |
| 70 – 85 % | +5 |
| **30 – 69 %** | **0 (dead band)** |
| 15 – 30 % | −5 |
| 0 – 15 % | −10 |
| 0 % | **−20** |

And the fall rate **decelerates** as it empties: 2.5 %/h down to 30 %, then 1.75 %/h, then 1 %/h —
**51.6 hours from full to starved.** Recreation also carries a **tolerance** mechanic: repeating one
of the 10 recreation types builds tolerance at **2/3 of the gain**, a pawn becomes *bored* of a type
above 50 % tolerance and un-bored below 30 %, and **tolerance decays more slowly as the colony gets
richer** (18 %/day at extremely low expectations → 7 %/day at sky-high).

⚠️ **There is no "Space" need** — room size is delivered as *situation thoughts* (Confined −10,
Cramped −5, Spacious +5), not a bar [wiki, Thoughts].

⚠️ **And the biggest single mood term is wealth.** *Expectations* runs **+30** at zero colony wealth
down to **0** at 308 000 and **−12** with a royal title [wiki, Thoughts]. ⇒ **Getting richer makes
every colonist unhappier by up to 30 mood.** That is a deliberate difficulty ratchet, not a bug, and
it has no Perilune analogue.

⚠️ **UNVERIFIED**: the Chemical need's percentage cut-offs (the wiki's table would not render), and
the exact arithmetic of a thought's "Stacking Multiplier" column (the values are published; the
operation is never stated in prose).

## 4.3 The one structural fact worth carrying

**Mood is not a need the player manages; it is a rate-limited readout of a stack of expiring
"thoughts."** Needs feed thoughts, thoughts sum to a *target*, the bar chases the target, and the bar
is compared against three derived per-pawn thresholds. There is no mood *setting*, no morale command,
and no direct lever — every mood change is the consequence of a world state the player changed for
some other reason.

⇒ This is the opposite shape from Perilune's `Citizen.Mood`, which is a closed-form instantaneous
function of four needs with no history, no rate limit and no consumers (§8.6).

---

# §5 — SKILLS, TRAITS, BACKSTORIES

Also deliberately shallow. Perilune has **no** skill model at all (§8.2), so this section exists to
say what would be adopted, not how.

## 5.1 Skills

**Twelve skills, levels 0–20** [wiki, [Skills](https://rimworldwiki.com/wiki/Skills)]: **Animals,
Artistic, Construction, Cooking, Crafting, Intellectual, Medical, Melee, Mining, Plants, Shooting,
Social.** There is no character level — skills level independently.

Each level carries a **name**, shown in the UI, running "Barely heard of it" (0) → "Solid
Professional" (9) → "Expert" (12) → "Legendary Master" (20) [wiki, Skills].

### Passion — ⚠️ CORRECTS A WIDELY-QUOTED NUMBER

**Three states, and the multipliers are 35 % / 100 % / 150 %** [wiki, Skills]:

| passion | UI | XP multiplier | mood while doing related work |
|---|---|---|---|
| **none** (the most common) | — | **35 %** | — |
| **Interested** | one flame 🔥 | **100 %** | **+8** ("Minor passion for my work") |
| **Burning** | two flames 🔥🔥 | **150 %** | **+14** ("Burning passion for my work") |

⚠️ **The commonly-repeated figures ×1.0 / ×1.5 / ×2.0 are wrong.** The baseline is **no passion at
35 %**, and one flame is the **100 %** reference case — the wiki says so explicitly: *"all XP values
listed assume an 'Interested' 🔥 passion with a 100 % Learning Speed. Note that this is **not** the
'default' rate; 'no passion' with 35 % XP gain is far more common."* ⇒ **A passion is not a bonus; the
absence of one is a 65 % penalty.** That is a materially different design statement.

Passion is shown in the Work tab cell as small flames, alongside a **skill-brightness outline** — red
(worst) → white → bright yellow (best) — and the tab plays *"a crunching sound […] when you assign a
pawn to a work type which they won't do well due to low skill"* [wiki, Work].

Passion is **essentially fixed for life** — adults cannot gain or lose it; children can gain one at a
growth moment, and Biotech Skill Aptitude xenogenes can move it [wiki, Skills].

### XP and its cap

```
Real XP gained = Global Learning Factor × Passion Multiplier × Base XP gained
```
[wiki, Skills]

**Global Learning Factor** defaults to 100 %; offsets sum onto the base, then factors multiply
[wiki, [Global Learning Factor](https://rimworldwiki.com/wiki/Global_Learning_Factor)]. The
trait-driven ones are large: **Too smart +75 %, Fast learner +75 %, Slow learner −75 %** (offsets);
**Slow study gene ×50 %** (a factor). Combined with passion, a burning-passion fast learner earns
**262.5 %** where a passionless slow learner earns **8.75 %** — a **30× spread between two colonists
doing the same job.**

- XP is **mostly per unit time**, not per task completed — so **working faster does not earn more XP**.
  Some tasks (doctoring a wound) give a lump sum instead [wiki, Skills].
- **Some work gives no XP at all**: smelting, stonecutting, cleaning, feeding incapacitated pawns
  [wiki, Skills].
- **Soft cap: 4 000 net XP per day per skill**; beyond it, further gains are multiplied by **20 %**.
  The cap resets a few seconds after midnight, and passive losses net against gains [wiki, Skills].

### Skill decay ("rusting") — ⚠️ ALSO NOT WHAT IS USUALLY QUOTED

**Decay starts above level 10 and is a function of level ONLY — it is not affected by skill use, and
passion does not prevent it** [wiki, Skills]. Gained XP simply nets against the loss.

| level | total XP | decay (XP/day) |
|---|---|---|
| 0–9 | 0 – 45 000 | **0** |
| 10 | 55 000 | 30 |
| 11 | 67 000 | 60 |
| 12 | 81 000 | 120 |
| 13 | 97 000 | 180 |
| 14 | 115 000 | 300 |
| 15 | 135 000 | 540 |
| 16 | 157 000 | 840 |
| 17 | 181 000 | 1 200 |
| 18 | 207 000 | 1 800 |
| 19 | 235 000 | 2 400 |
| 20 | 265 000 | 3 600 |

**A level is lost only after XP falls to 0 and then a further 1 000 below** — an explicit hysteresis
band added in 1.2.2753 *"to stop pawns from quickly leveling up and down around a threshold"*
[wiki, Skills]. **Great memory** halves decay; **Perfect memory** (Anomaly creepjoiners) removes it.

⇒ **Three deliberate design statements here worth carrying:** decay is **level-driven, not
disuse-driven**; the level boundary has **hysteresis**, not a bare threshold; and the decay curve is
steep enough at the top that **level 20 is only reachable by a pawn doing one thing exclusively**.

### How skill maps to output — two verified worked examples

| | |
|---|---|
| **Construction speed** | base **50 %** at skill 0, **+15 % additively per level** [wiki, Skills] |
| **Construction success** | base **75 %**, **+~3 % per level**, reaching **100 % at level 8** [wiki, Skills]. A botch wastes resources and **restarts the job**. |
| **Crafting** | quality **only** — *"the speed of production for these tasks is unrelated to Crafting level"* [wiki, Skills] |
| **Cooking** | skill 8 unlocks every recipe, 9 reaches minimum food-poison chance, 10 maxes butchery efficiency; above that, **speed only** [wiki, Skills] |

⇒ **Skill does not do one thing.** For Construction it is speed *and* failure; for Crafting it is
quality *only*; for Cooking it is unlock-then-speed. A single "skill → work speed" multiplier is not
the RimWorld model.

**Every skill-driven stat is published in one shape:** `stat = base + bonus × skillLevel`, then
multiplied by capacity factors and Global Work Speed [wiki, Skills]. A sample:

| stat | base | per level | @0 | @20 |
|---|---|---|---|---|
| Construction Speed | 0.30 | 0.0875 | 30 % | 205 % |
| Mining Speed | 0.04 | 0.12 | 4 % | **244 %** |
| Plant Work Speed | 0.08 | 0.115 | 8 % | 238 % |
| Research Speed | 0.08 | 0.115 | 8 % | 238 % |
| Medical Tend Quality | 0.20 | 0.10 | 20 % | 220 % |
| Medical Tend Speed | 0.40 | 0.06 | 40 % | 160 % |

⚠️ **CORRECTS the Skills page's own prose**, which says construction is *"50 % base, +15 % per
level"*. That contradicts the Construction Speed stat page **and the Base/Bonus table on the same
Skills page**. **Use 30 % + 8.75 %/level** — corroborated three ways (stat page, Skills table, and the
published per-level figures 30 % @ 0, 100 % @ 8, 205 % @ 20).

**Construct Success Chance** (the botch roll) at 100 % Manipulation: **75 % at level 0, 100 % from
level 8** — steps of +5 pp for levels 0→2 then +2.5 pp for 2→8
[wiki, [Construct Success Chance](https://rimworldwiki.com/wiki/Construct_Success_Chance)]. A botch
**wastes resources and restarts the job.**

### Skill → quality: the roll, and a structural fact worth carrying

Quality is rolled **once, at job completion** [wiki, [Quality](https://rimworldwiki.com/wiki/Quality)]:

| skill | awful | poor | normal | good | excellent | masterwork | avg. value |
|---|---|---|---|---|---|---|---|
| 0 | **64.6 %** | 30.2 % | 5.0 % | 0.2 % | — | — | ×0.60 |
| **6** | 1.0 % | 24.3 % | **52.1 %** | 20.4 % | 2.2 % | 0.02 % | **×1.00** |
| 10 | 0.02 % | 3.3 % | 40.2 % | 43.8 % | 12.2 % | 0.4 % | ×1.17 |
| **20** | — | 0.01 % | 2.4 % | 37.4 % | **50.6 %** | **9.5 %** | ×1.49 |

Three facts that are design, not tuning:
1. **Legendary can never be rolled naturally, at any level.** It requires an Inspired Creativity
   inspiration or an Ideology Production specialist.
2. **Level 6 is where a crafter stops destroying value** (average value multiplier reaches ×1.00).
3. **Because the roll is at completion, a low-skill pawn can do the bulk of a *build* and a master can
   finish it** — but *not* for crafted items or art, which bind an author to the unfinished work
   (§2.6).

⚠️ **UNVERIFIED**: the Global Learning Factor's full offset/factor list beyond the traits named above.

## 5.2 How skills gate work — the part that IS verified

**Skill never gates *whether*, only *how well*.** [wiki, Work]

> "This is distinct from characters with a skill level of 0 in a skill. At level 0, a pawn is still
> capable of performing the task, they will just be extremely slow, ineffective, inefficient, and have
> an increased chance of failure."

The only *gating* uses of skill are player-authored: a **bill's allowed-skill band** (§2.6), and the
**initial work-grid assignment** (§1.5), which is skill-ranked.

## 5.3 Traits and backstories

**What forbids work is not a skill — it is a `WorkTag`**, and the sources are: **backstory** (childhood
+ adulthood), **trait**, **royal title**, **slave status**, and **ideoligious role** [wiki, Work].
They **stack**, and the wiki warns the combination can leave a pawn *"incapable of practically
everything"* [wiki]. Traits and incapabilities also interact: *"a 'non-violent' colonist will never
have the brawler trait"* [wiki].

**Trait counts and permanence** [wiki, [Trait](https://rimworldwiki.com/wiki/Trait)]:

- **Only humans have traits. Most humans have 1–3**, plus a possible "extra" sexuality trait.
- **Adults cannot gain new traits, and there is no way to remove one.** Children gain one per growth
  moment (birthdays 7, 10, 13); babies have none.
- **Pyromaniac → incapable of firefighting** is confirmed [wiki, Trait], and it is the canonical
  example.

**The generator refuses self-contradiction, and the rules are worth reading as design** — a trait is
excluded at generation if it [wiki, Trait]:
- conflicts with a trait the pawn already has, or is prohibited by its pawn kind / backstories;
- **would disable a work type required by the pawn's "pawn kind"**;
- **requires a work type already disabled for the pawn**;
- would push the pawn's **minor mental break threshold above 50 %**.

⇒ **Incapability is checked bidirectionally at character generation.** RimWorld will not produce a
medieval lord who is incapable of the only two things a medieval lord may do. That is a *content
validity rule*, not a runtime rule, and it is what stops §1.6's "incapable of practically everything"
case from being common.

⚠️ **UNVERIFIED**: the full trait→WorkTag map beyond Pyromaniac, and which backstories disable what.

---

# §6 — HEALTH AND INJURY

The shallowest section, by instruction. What a colony sim needs to know:

- **Bodies are trees of parts**, each with its own hit points; damage lands on a part, and destroying
  a part removes what it does.
- **Capacities** are the abstraction layer between parts and behaviour: Consciousness, Manipulation,
  Moving, Sight, Hearing, Talking, Breathing, Blood filtration, Blood pumping, Metabolism. Work,
  speed and success all scale off capacities, not off parts directly.
- **Capacities gate work at the dispatcher.** `WorkGiver.MissingRequiredCapacity(pawn)` is checked in
  `PawnCanUseWorkGiver` [src, `JobGiver_Work.cs:286-289`] — so a pawn with destroyed hands is refused
  crafting work *by the scan*, not by a per-job check. **This is the verified structural fact in §6**
  and it is the one that matters for §1: RimWorld's capability gate is *one predicate on the work
  giver*, evaluated per-scan, and it composes with incapability rather than duplicating it.
- **Downed vs dead** are different states, and **downed has three verified causes**
  [wiki, [Downed](https://rimworldwiki.com/wiki/Downed)], listed in the wiki's own order of severity:

  | cause | threshold |
  |---|---|
  | **Unconsciousness** | Consciousness **< 30 %** (and > 0 %) |
  | **Pain shock** | Pain reaches the pawn's **Pain Shock Threshold** (a per-pawn stat; most pawns are below 90 %) |
  | **Incapacitated** | Moving capacity **≤ 15 %** |

  A downed pawn drops carried items and weapons but keeps worn apparel; is **rescued to a bed by the
  `Doctor` work type automatically** [wiki, Work]; and since 1.5.4062 **crawls** toward a bed or away
  from danger [wiki, Downed]. Note the design: **downing is derived from capacities, not from an HP
  bar** — there is no hit-point pool for a pawn.
- **Blood loss** [wiki, [Blood loss](https://rimworldwiki.com/wiki/Blood_loss)]: −10 % Consciousness at
  **15 %**, −20 % at **30 %**, −40 % at **45 %**, and at **60 %** Consciousness is *capped at 10 %* —
  i.e. **downed at 60 %** via the consciousness rule above, **dead at 100 %**. Blood regenerates at a
  flat **33.3 %/day**, and **regeneration stops entirely while the pawn is still bleeding.**
- **Tending stops bleeding always, immediately, regardless of quality or medicine.** What better
  medicine buys is *more wounds treated per tend* and a better *healing rate* and *infection roll* —
  not a better chance of stopping the bleed [wiki, [Injury](https://rimworldwiki.com/wiki/Injury)].
- **Infection races immunity.** Both tracks run 0 → 1.00; first to arrive wins. Untended infection
  **+0.84/day** (dead in under 1.19 days); tending subtracts up to **−0.53/day**; base immunity gain
  **+0.644/day** [wiki, [Infection](https://rimworldwiki.com/wiki/Infection)].
  ⚠️ **Tend quality does NOT affect immunity gain** — it only slows the disease. And
  **room cleanliness does NOT affect tend quality** — it affects the *infection roll*
  [wiki, [Doctoring](https://rimworldwiki.com/wiki/Doctoring)]. Both are counter-intuitive and both are
  stated explicitly by the wiki.

## §6.1 ⭐ Capability gating: TWO mechanisms, and the second one IS a numeric threshold

> ⚠️ **THIS SECTION WAS WRONG IN THE FIRST DRAFT AND IS NOW CORRECTED FROM SOURCE.** It claimed the
> capacity gate was a *presence* test and that no numeric threshold existed. Both were false — and it
> left open a question it already had the means to answer. Both fixed below.

RimWorld has **two** gates on "may this pawn do this work", and it keeps them strictly separate.

### Gate 1 — `WorkTag`: categorical, binary, permanent

From **traits, backstories, royal titles, slave status, ideoligious role** (§1.6). Not a number, not
degradable, not overridable by the player. Checked as `pawn.WorkTagIsDisabled(giver.def.workTags)`
[src, `JobGiver_Work.cs:274-277`].

### Gate 2 — `minForCapable`: a genuine numeric threshold

```csharp
public bool CapableOf(PawnCapacityDef capacity)
{
    return GetLevel(capacity) > capacity.minForCapable;
}
```
[src, `Verse/PawnCapacitiesHandler.cs:78-81`] · `public float minForCapable;` [src, `Verse/PawnCapacityDef.cs:37`]

It reaches the work scan directly [src, `RimWorld/WorkGiver.cs:20-30`]:

```csharp
public PawnCapacityDef MissingRequiredCapacity(Pawn pawn)
{
    for (int i = 0; i < def.requiredCapacities.Count; i++)
        if (!pawn.health.capacities.CapableOf(def.requiredCapacities[i]))
            return def.requiredCapacities[i];
    return null;
}
```
— called from `PawnCanUseWorkGiver` [src, `JobGiver_Work.cs:286-289`].

⇒ **`GetLevel(c) > c.minForCapable` is a numeric fitness threshold gating job assignment.** It is a
strict `>`, so **a capacity sitting exactly at `minForCapable` is NOT capable**; and because
`minForCapable` is a `float` field defaulting to `0`, **a capacity at 0 % fails for every capacity** —
`0 > 0` is false.

✅ **This settles the first draft's own most-wanted open question** (*"does a 0 % capacity forbid
specific work outright?"*): **yes** — and by the general rule, not by a special case.

⚠️ **The one published `minForCapable` value: `Moving = 0.15`.** Version-caveated as §1.4/§1.5/§1.7
(2018 defs mirror, `0.19.2009`) — but it **cross-corroborates against source read this run**: it is
the same 0.15 as the *"Incapacitated: Moving capacity is 15 % or less"* downing threshold cited above
from an entirely independent page. Two routes, one number.

`CapableOf` is used well beyond work: hauling [src, `Verse.AI/HaulAIUtility.cs:85`], mental-state
eligibility [src, `Verse.AI/MentalStateWorker.cs:46`], caravan carrying, book reading, pawn
generation, and as a **live job-fail condition** [src, `Verse.AI/ToilFailConditions.cs:312`] that ends
a running job `Incompletable` the moment the capacity drops.

### Between the gates: continuous degradation

Below the threshold nothing is refused — **capacity loss degrades work smoothly through stat
weights.** A pawn at 20 % Manipulation is a very slow crafter, not a forbidden one. Every work stat is
`(weight, max)` pairs against Manipulation / Sight / Consciousness / Moving: Construction Speed is
`Manipulation (1.0, no max) × Sight (0.2, cap 1.0)`; Medical Tend Quality is
`Manipulation (1.0, cap 1.4) × Sight (0.7, cap 1.4)` [wiki, per-capacity pages].

> ⇒ **The shape worth carrying: a categorical allow-list, ONE low numeric floor per capacity, and a
> smooth efficiency curve in between — with the floor set low enough (0.15 for Moving) that it catches
> only pawns already effectively incapacitated.** The threshold is a *safety net under the curve*, not
> a competence bar. Whether Perilune wants that shape is not a question this document answers.

⚠️ **UNVERIFIED**: the `minForCapable` values for capacities other than Moving, and which capacities
each work giver lists in `requiredCapacities` (both are XML).

⚠️ Also **UNVERIFIED**: per-body-part hit points beyond the representative set, bleed-rate units, and
the `body_size_factor` (published only as an image).

---

# §7 — WHAT RIMWORLD DELIBERATELY DOES *NOT* DO

⭐ **This is the most useful section per word in the file.** This project's named failure mode is
building machinery nobody asked for. Every entry below is a place a sophisticated designer would
expect complexity and RimWorld refuses it.

**1. There is no per-job, per-building or per-target priority.** Priority is stored as
`DefMap<WorkTypeDef, int>` [src, `Pawn_WorkSettings.cs:12`] — **one number per pawn per work type, and
nothing finer.** You cannot say "this wall before that wall", "this bench before that bench", or "mine
here before there". The only per-target instrument is *prioritise*, which is temporary (§2.2). Whole
popular mods exist to add per-work-giver priorities; vanilla has resisted for a decade.

**2. There are only four priority levels.** `LowestPriority = 4` [src, `:20`]. Not 9, not 100, not a
float. The Work Tab mod's headline setting is `MaxPriority = 9`, which tells you both that people want
more and that vanilla says no.

**3. There is no cost model, no lookahead, and no scheduling.** The scan is *first work giver that
yields anything, closest target within its group* (§1.8). A pawn never compares "this 4-hour job vs
that 10-minute one", never batches by location, never considers what another pawn is about to do
(beyond reservations), and never plans a route. The wiki says it outright: *"They have no regard for
efficiency."*

**4. There is no per-task fatigue and no work-specific exhaustion.** Rest is one global need that
decays on a clock. Mining does not tire a pawn more than research. ⚠️ **UNVERIFIED as an absolute** —
I did not read `Need_Rest`, and Biotech/Royalty add mechanics (e.g. deathrest) that complicate it —
but nothing in the work system I read carries a per-job energy cost.

**5. There is no logistics network.** No routes, no carts, no conveyors, no throughput, no capacity
graph. Hauling is *one pawn, one stack, one destination*, chosen by "is there a strictly
higher-priority stockpile with space" (§2.5). Storage priority is a **6-value enum with 5
player-selectable levels** (§2.5), not a number.

**6. There is no scheduling beyond 24 hourly slots × 5 assignment types.** No shift patterns, no
multi-day rotations, no per-work-type time windows, no "night shift for the mining team". And the
schedule does not command — it moves one number in a think tree (§3.5).

**7. There is no permanent per-pawn task assignment.** *Prioritise* times out in half a day; drafting
times out in 10 000 ticks. If you want a pawn to keep doing something, you express it in the grid — at
work-type granularity — or you keep clicking. This is a refusal, and it is load-bearing: it forces the
player's intent back into the coarse, durable instrument.

**8. Impossible orders are refused at the click, not accepted and dropped.** The right-click menu
simply does not offer what cannot be done, and states the reason where it is close (*"Cannot operate
(need material)"*). There is no "accepted, then silently never progresses" state for a direct order.
(Designations *can* sit unsatisfiable — but a designation was never a promise to a person.)
**And the offer and the acceptance are held together by construction, not by a duplicated rule:**
`NormalMaxDanger` returns `Deadly` both when a job is `playerForced` **and** while
`FloatMenuMakerMap.makingFor == p` [src, `Verse/DangerUtility.cs:7-25`] — the menu is built under
exactly the tolerance the resulting job will run under (§2.4). Target validity is enforced in the
work giver on the same pass (§8.4's `GrowerSow`/`PlantSeed`).

**9. There is no undo stack and no order history.** Cancel is a designator you paint with, not an undo.

**10. Rooms are derived, not authored.** RimWorld computes rooms from walls for stats (beauty,
cleanliness, impressiveness, temperature) — the player never names or allocates one. Temperature is a
per-room scalar, and **so is vacuum**: **one map, one Z, roofs are a boolean-ish overlay.**

**11. There is no ordered queue UI.** Shift-click chains jobs onto a pawn's queue and the inspect pane
shows it, but there is no re-ordering, no saving, no templating [wiki].

**12. Anti-thrash is a visible error, not a silent smoother.** Ten jobs in ten ticks logs a named error
and forces a recovery job [src, `Pawn_JobTracker.cs:223-237`]. RimWorld chose *loud and diagnosable*
over *quietly damped*.

**13. Atmosphere is ONE SCALAR, even in the DLC built for it.** Odyssey (1.6) added vacuum, airtight
rooms and oxygen pumps — and modelled the whole thing as **a single "vacuum %" per cell, uniform
across a room** [wiki, Vacuum]. **No oxygen, no CO₂, no nitrogen, no partial pressures, no gas
transport model.** RimWorld had every reason to build a chemistry and did not. (§8.4.)

**14. Worker safety is ONE model, not one model per hazard.** Vacuum, temperature and everything else
that can kill a pawn en route collapse into **one 4-value enum on a region** (`Danger`), compared
against **one per-pawn tolerance** (`MaxPathDanger`), threaded through **one scan** (§2.4, §8.4). No
separate air-safety subsystem, no duration-awareness, and no "is this job worth the risk" arithmetic —
the only per-job dial is a single enum override.
⚠️ **Qualified, because a bare "no per-hazard rule" would be false:** two work givers *do* test vacuum
directly (`WorkGiver_GrowerSow.cs:51`, `WorkGiver_PlantSeed.cs:30, 52`). Those are **target validity**
— *the plant would die there* — not worker safety, and RimWorld keeps the two in separate mechanisms
even though both say "not in vacuum" (§8.4).
⚠️ *The first draft of this file said "atmosphere does not gate work". That was **false** — see the
warning box at the top.*

**15. Skill decay is level-driven, not disuse-driven, and nothing about it is per-pawn-managed.**
No training schedules, no practice assignments, no "keep this pawn sharp" instrument. A pawn above
level 10 leaks XP on a fixed curve and the only counter is doing the work. (§5.1.)

**16. There is no *per-work-type* capability tuning.** RimWorld has exactly **two** gates — a
categorical `WorkTag` allow-list, and a **single numeric threshold per capacity** (`minForCapable`,
§6.1) shared by every work giver that requires that capacity. There is **no** per-work-type minimum,
no "you need Manipulation ≥ 0.6 to smith but ≥ 0.3 to cook", and no player-facing dial for either.
⚠️ *The first draft said "there is no numeric capability gate … no 'fitness ≥ X' rule anywhere". That
was **false** — see §6.1.*

---

# §8 — WHAT PERILUNE ALREADY DOES DIFFERENTLY

**This section names collisions. It does not resolve them.** Every one of these is a place where the
instruction *"do what RimWorld does"* runs out, and the resolution is the owner's. Repo facts here are
`file:line`-cited from `lane/rimworld-ref` at `f9e4dbc`.

## 8.1 Perilune has one dispatcher with no priority dimension — and FIVE `JobKind`s that bypass it

`JobSystem.TryAssign` (`sim/Sim.Core/Jobs/JobSystem.cs:261-314`) is a **single global nearest-job
argmin**: sum candidates across sources, take the Manhattan-nearest, `TryClaim`, retry on refusal. The
only ordering that exists is **job-source registration order as a distance tie-break** — `Dig`, `Haul`,
`Build`, `Deconstruct` (`JobSystem.cs:71-80`), and the class comment says so explicitly: *"THE SOURCE
PRIORITY ORDER […] is not a preference, it is a tie-break."*

And **FIVE of the twelve `JobKind`s never reach the dispatcher** — the first draft said four and
omitted `Flee` [`sim/Sim.Core/Entities/Citizen.cs:125-140`]:

| `JobKind` | issued by | note |
|---|---|---|
| `Eat = 4`, `Drink = 5` | `SustenanceSystem` | push-dispatched |
| `Craft = 6` | `CraftingSystem` | push-dispatched |
| `Maintain = 7` | `MaintenanceSystem` | push-dispatched |
| **`Flee = 10`** | **`SafetySystem`** | **omitted from the first draft.** Its own source comment is the reason it matters: *"not None, so no dispatcher recruits a fleeing crew until it has recovered in safe air"* — it is a **suppression** channel as well as a job. |

All are registered after `JobSystem` (`docs/MECHANICS.md:959-975`).

**`Flee`'s omission was not cosmetic**: it is Perilune's `JobGiver_FindOxygen` (§8.4), and leaving it
out of the bypass list is what made §8.4's original "the consequence never lands on the dispatcher"
error look consistent.

> **⚠️ COLLISION, re-grounded now that §8.4 is corrected.** RimWorld's priority grid works because
> **one node in one think tree issues all work** (`JobGiver_Work`); everything else in the tree is a
> *need* or a *reaction*, not a work source. And §8.4 shows that same single issuance point is also
> where RimWorld hangs its **per-work-giver danger tolerance** — `MaxPathDanger` is a method on
> `WorkGiver`, resolved at exactly the moment the grid is consulted.
>
> ⇒ **The collision is sharper than first written: Perilune's five entry sites leave NO SINGLE PLACE
> to hang EITHER a priority OR a danger tolerance.** Both of RimWorld's per-job dials live on the same
> seam, and Perilune has that seam five times over.
>
> The measured consequence is already on record: a grid built inside `TryAssign` is **byte-identical
> to baseline** for the owner's own case, because `MaintenanceSystem.Tick` frees and re-claims the
> same pawn *inside one tick* (`MachineWearSystem.cs:175-178, 289-293, 366`) and `JobSystem` saw the
> pawn idle on **zero** of 54 450 ticks. **A RimWorld-analogue grid presupposes a RimWorld-analogue
> single issuance point. That refactor is the collision, and it is not named in OD-A.**

## 8.2 Perilune has no skill, no work type, and no capability model

Re-measured on `f9e4dbc` for this revision, because the first draft's version of this paragraph
overstated one of its five greps:

| term | `sim/` | `hosts/` | `client/src` |
|---|---|---|---|
| `Skill` | **0** | 0 | 0 |
| `WorkType` | **0** | 0 | 0 |
| `Prioriti` (`Prioritise`/`Prioritize`) | **0** | 0 | 0 |
| `Forbid` | **0** | 0 | 0 |
| **`Draft`** | 0 | 0 | ⚠️ **18 — and none of them are drafting.** They are the MOSS terminal editor's `editDraft` / `histDraft` / `program.draft` (`client/src/ui/moss-model.js:25, 180, 403, 416`, …). |

`Priority` hits only the LLM request queue, `PowerSystem` brownout tiers, and doc comments about
registration order. `git log --oneline -- '*Skill*' '*Priority*' '*WorkType*' '*Assign*'` returns
**0 commits of 602**.

⇒ **Four of five terms really are zero across all three trees; the fifth was a bad grep.** The
substantive claim survives — *there is no drafting concept in Perilune* — but it survives as
"18 hits, all unrelated", not as "zero".

> **⚠️ COLLISION.** §1 is a document about a grid whose **rows are work types** and whose **cells are
> gated by capability**. Perilune has neither axis. Adopting §1 means inventing both, and §1.5's
> default algorithm — *rank work types by the pawn's average relevant skill, enable the top six* —
> **cannot be ported until a skill model exists.**
>
> ⚠️ **CORRECTION: the fictional role model is NOT unread.** The first draft said
> `PersonaSheet.RoleNow` is *"saved and hashed, and nothing reads it"*. It is read in at least four
> places, and one of them is player-visible: **`client/src/theme/warm-tokens.js:247-260` holds a
> `ROLE_MATCHERS` table that maps `RoleNow` phrases** (`'life-support'`, `'hydroponic'`, `'reactor'`,
> `'damage control'`, `'medic'`, `'helm'`, `'stores'`, `'comms'`…) **to crew hues via `roleHue()`** —
> the crew are already coloured by their role on screen. It is also written by the authored ships
> (`AuthoredShips.cs:583, 609, 635, 661`) and round-tripped through `CitizenMemory.cs:553, 585`.
>
> ⇒ **The true statement is narrower and more useful: `RoleNow` is a free-text phrase with a
> presentation consumer and no mechanical one.** Whether it becomes the capability axis is an owner
> decision — but a lane doing so should know it is repurposing a field the renderer already reads,
> not claiming an unused one.

## 8.3 The refusal is asynchronous where RimWorld's is synchronous — and it has more seams than first written

`WorksiteSafety.CanStageWorkerAt` (`sim/Sim.Core/Systems/SafetySystem.cs:125-128`) refuses to stage a
worker on a tile that is not breathable — and **"unbreathable" includes thermal**
(`SafetySystem.cs:11-20`: pressure < 5 kPa, ppO₂ < 16 kPa, CO₂ > 40 000 ppm, **temp > 45 °C or
< −10 °C**). A fully pressurised, perfectly breathable but *freezing* room refuses **all** work.

> ⚠️ **TWO CORRECTIONS TO THE FIRST DRAFT, and the first is an object lesson in how this file went
> wrong.**
>
> **(1) "The refusal's only seam" was false — and the qualifier was in my own cited source.**
> `JobContext.cs:64` reads *"`CanStageWorkerAt` is asked here and NOWHERE ELSE **in the job board**"*.
> **I dropped "in the job board."** Measured on `f9e4dbc`, the predicate is called at **seven** sites:
>
> | site | role |
> |---|---|
> | `sim/Sim.Core/Jobs/JobContext.cs:80` | the job-board seam — dig, build, deconstruct |
> | **`sim/Sim.Core/Systems/MachineWearSystem.cs:599`** | **a second SIM seam** — maintenance item staging |
> | **`sim/Sim.Core/Systems/MachineWearSystem.cs:631`** | **a third** — the adjacent-tile probe |
> | `hosts/web/GameSession.cs:2310` | the `blocked` channel's air probe |
> | `hosts/scenario/Program.cs:599, 627, 647` | the measurement harness |
>
> **(2) "With nothing anywhere saying why" was false, and my own text contradicted it three lines
> later.** The `blocked` channel **already consumes this predicate**:
> `WireFormat.Blocked.cs:43` maps `CanStageWorkerAt(sim, neighbour)` ⇒ `ReasonAir`, fed from
> `GameSession.cs:2310`, drawn by `client/src/ui/blocked-overlay.js`. The refusal **is** surfaced
> today, on the standard surface, with a reason code.

> **⚠️ THE COLLISION THAT SURVIVES — and it is narrower and truer than the one first written.**
> RimWorld refuses an impossible order **at the click**: the context menu does not offer what cannot be
> done, and states the reason where it is close (§2.2, §7-8). Perilune accepts the order and surfaces
> the refusal **afterwards, on a separate channel the player must be looking at.**
>
> ⇒ **The gap is SYNCHRONY, not silence.** A "prioritise" verb built as a RimWorld analogue inherits
> RimWorld's promise — *if the affordance was offered, the job will be attempted* — and §8.4 shows how
> RimWorld keeps it: `FloatMenuMakerMap.makingFor` raises the danger ceiling **while the menu is being
> built**, so the offer and the acceptance are one rule. Perilune has no equivalent binding between
> what a palette tool offers and what `CanStageWorkerAt` will accept.
>
> Whether that binding is worth building is an owner decision. `SafetySystem.cs:96-100` records the
> current cost as *accepted, not patched*.

## 8.4 ⭐ RIMWORLD SHIPPED A VACUUM SHIP SIM IN 2025 — and it gates work on air, just like we do

> ⚠️ **THE FIRST DRAFT OF THIS SECTION REACHED THE OPPOSITE CONCLUSION AND WAS WRONG.** It said
> *"vacuum does not gate work in RimWorld; there is no `CanStageWorkerAt` equivalent"*. **There is
> one.** It is not in `PawnCanUseWorkGiver`, which is where the first pass looked — it is in **region
> danger threaded through the path search**. The correction reverses the section's advice.

The **Odyssey DLC (1.6, July 2025)** added orbital maps, **gravships**, and a full
vacuum/pressurisation model. RimWorld is no longer only a planet-surface game, and *"RimWorld has no
analogue for a ship in vacuum"* is **false as of 1.6**.

[wiki, [Vacuum](https://rimworldwiki.com/wiki/Vacuum) — Odyssey DLC]:

| mechanic | RimWorld 1.6 (Odyssey) | Perilune |
|---|---|---|
| **representation** | **one scalar per cell: "vacuum %", 0 % = fully pressurised, 100 % = fully depressurised.** *"All tiles within a room share the same vacuum level."* | per-room **moles of O₂ / CO₂ / N₂ + temperature**, with partial pressures |
| **gas species** | **none.** No oxygen, no CO₂, no nitrogen — one number | three species, ppO₂ and CO₂-ppm thresholds |
| **on planet maps** | *"Vacuum is never a consideration on planet-bound maps."* | n/a |
| **airtightness** | fully enclosed by airtight buildings, entirely roofed, no Space gaps; walls/doors airtight iff **metallic** | rooms are flood-filled; a region touching Void or the map edge becomes **room 0, the vacuum sink** |
| **repressurising** | **oxygen pumps**, archean trees, immovable found **life support units** | `AirVent` (currently injects from an unmodelled reserve and refuses to vent outward) |
| **doors** | doors/vents exchange vacuum when open; powered **vac barriers** pass pawns while holding pressure | doors, with an open/closed conduction and flow term |
| **player readout** | toggleable **vacuum overlay** red→green, per-tile figure, in-room dust effect scaling with level | the `blocked` channel; no atmosphere overlay |
| **vertical** | **none — one map, one Z.** Roofs are the only third dimension | decks are real, and gas does not cross them |

### ⭐ THE SEAM — and RimWorld makes the SAME choice Perilune did

**Autonomous work does not enter vacuum. RimWorld refuses at the dispatcher.** The mechanism is §2.4's
`Danger`, and it lands in the job scan in four steps:

| # | step | source |
|---|---|---|
| 1 | A room over 50 % vacuum makes its region **`Danger.Deadly`** for any pawn `ConcernedByVacuum` | `Verse/Region.cs:434-436` |
| 2 | An ordinary player colonist's ceiling is **`Danger.Some`** | `Verse/DangerUtility.cs:7-25` |
| 3 | `WorkGiver_Scanner.MaxPathDanger` defaults to exactly that ceiling | `RimWorld/WorkGiver_Scanner.cs:30-33` |
| 4 | The scan threads it into every `ClosestThingReachable` / `CanReach` / `TraverseParms` | `RimWorld/JobGiver_Work.cs:121, 150, 165, 192, 205` |

⇒ **A vacuum room is simply not reachable for autonomous work.** Same outcome as
`WorksiteSafety.CanStageWorkerAt`; different location in the pipeline (path search rather than
staging-tile choice).

### What RimWorld builds ON TOP — a four-rung override ladder

This is the transferable part, and it is what Perilune does not have.

| rung | mechanism | effect |
|---|---|---|
| **1. Per-work-giver override** | **24 of 83 work givers override `MaxPathDanger`** — repair, firefight, construction delivery + finish frames, rescue, tend, feed patient/baby, haul, haul-to-portal, merge, mine, deep drill, flick, strip, hunt, load transporters, operate scanner, plant cut, repair mech, take-to-bed-to-operate, administer hemogen | **23 return `Danger.Deadly`** — *"this job is worth dying for; go anyway."* |
| ⚠️ **the 24th is the interesting one** | **`WorkGiver_DoBill` returns `Danger.Some`** — *below* the `Deadly` that `NormalMaxDanger` grants a forced job | ⇒ **a bill is the one job a player CANNOT force into a deadly room by prioritising it.** RimWorld ships an override that goes *down*. |
| **2. `playerForced`** | `NormalMaxDanger` returns `Deadly` when `pawn.CurJob.playerForced` | the player's direct order overrides the refusal — §2.2 |
| **3. Menu/job agreement** | `FloatMenuMakerMap.makingFor == p` also returns `Deadly` | **the right-click menu is built with the ceiling already raised**, so the menu offers exactly what the forced job will accept. One rule, not two. |
| **4. Self-rescue** | **`RimWorld/JobGiver_FindOxygen.cs`** | see below |

### ⭐ `JobGiver_FindOxygen` — the piece the first draft missed entirely

A dedicated think-node that walks a pawn **out** of vacuum [src, `RimWorld/JobGiver_FindOxygen.cs`].
Its guard sequence is the design, in order:

```csharp
if (!ModsConfig.OdysseyActive)                     return null;
if (PawnUtility.PlayerForcedJobNowOrSoon(pawn))    return null;   // ⇐ the player wins
if (!pawn.ConcernedByVacuum)                       return null;
if (!…TryGetHediff(HediffDefOf.VacuumExposure, out var h) || h.CurStageIndex < 1) return null;
…
if (vacuum < 0.5f)                                 return null;
Region region = ClosestOxygenatedRegion(…);        // BFS for a room with Vacuum < 0.5
return JobMaker.MakeJob(JobDefOf.GotoOxygenatedArea, cell2);
```

Three things worth carrying:
- **It is suppressed by `PlayerForcedJobNowOrSoon`** [src, `RimWorld/PawnUtility.cs:378-390`] — which
  reads the current job **and the job queue**, so a *queued* forced job also suppresses self-rescue.
  **The player can order a colonist to stay and suffocate**, and RimWorld implements that deliberately
  as one clause.
- It waits for **`CurStageIndex >= 1`** — the pawn must actually be taking damage, not merely be in a
  dangerous room. It is a *recovery* behaviour, not an avoidance one; avoidance is rung 0 above.
- It **guesses the destination of the current job** (`GuessJobDestination`) and evaluates the vacuum
  *there*, not underfoot — so a pawn walking *into* vacuum bails early.

⇒ **This is Perilune's `JobKind.Flee` / `SafetySystem`, and the two were arrived at independently.**

> ### ⚠️ THE COLLISION, RESTATED CORRECTLY
>
> The first draft said RimWorld accepts the order and harms the pawn while Perilune refuses silently,
> and concluded that the directive pointed *away* from `WorksiteSafety`. **That was backwards.**
>
> **Both games refuse autonomous work in unbreathable air at the dispatcher.** Perilune's
> `WorksiteSafety.CanStageWorkerAt` is the RimWorld-analogous choice and the directive points **toward
> keeping it.** What Perilune lacks is everything RimWorld stacks on top:
>
> 1. a **per-work-giver danger tolerance** (repair goes anyway; a bill never does);
> 2. a **`playerForced` bypass**, so a direct order can override the refusal;
> 3. **menu/job agreement**, so the affordance offered and the job accepted share one rule;
> 4. a **suppressible self-rescue** — Perilune has `JobKind.Flee`, but nothing gives the player's
>    order precedence over it.
>
> ⛔ **These are named, not proposed.** Which of the four rungs Perilune should have, and whether the
> `blocked` channel is the right surface for the refusal, are **owner decisions**. This document stops
> here.

### Two further asymmetries — and one claimed asymmetry that was FALSE

1. ⚠️ **RETRACTED: "there is no temperature precedent."** The first draft claimed RimWorld never
   couples temperature to job eligibility. **False** — it is the *same line* as vacuum
   [src, `Verse/Region.cs:433`]: inside the pawn's `SafeTemperatureRange` → `Danger.None`; within
   `ExpandedBy(80f)` → `Danger.Some`; beyond → **`Danger.Deadly`**, feeding the same scan.
   ⇒ **There IS a temperature precedent. The real difference is that RimWorld's is GRADED and
   per-pawn** (`SafeTemperatureRange` varies with apparel, traits and genes) **where Perilune's is a
   binary global literal** (`SafetySystem.cs:11-20`: temp > 45 °C or < −10 °C). That is a much more
   interesting collision than the one first written, and it is a live design question, not a gap.
2. **RimWorld's atmosphere is one scalar; Perilune's is a chemistry.** ppO₂ < 16 kPa and
   CO₂ > 40 000 ppm are distinctions RimWorld does not make. A lane told "model air like RimWorld"
   would be told to **delete two of the three gas species**.
3. **Perilune has decks; RimWorld has one Z.** Perilune has no vertical gas term (every gas path binds
   a single Z — `AtmosphereSystem.cs:211, 219-222, 337, 343`; `RoomState.cs:275-293`), so a room can
   never span decks; the wreck's eight deck-1 halls peak at **0.000 kPa forever** and the owner's
   decision is **ship it filed**. RimWorld offers no guidance here because it never had the problem.

### Target-validity vs worker-safety — a distinction RimWorld draws and we should notice

Two work givers refuse on vacuum **directly**, not through `Danger`:
`WorkGiver_GrowerSow.cs:51` (`if (c.GetVacuum(pawn.Map) >= 0.5f) return null;`) and
`WorkGiver_PlantSeed.cs:30, 52` — the latter with a **`plant.vacuumResistant` exemption**.

⇒ These are **target validity** (*a plant would die there*), not **worker safety** (*the pawn would
die getting there*). RimWorld keeps the two in separate mechanisms even though both say "not in
vacuum": safety is generic and lives in the path search; validity is per-work-giver and lives in the
giver. It strengthens §7-8 — the refusal is at the point the job is *considered*, either way, and
never as a silent stall.


### And RimWorld's ship is a *region of the map*, not a vessel

Worth one paragraph because it is the structural answer to "what is a ship, in a tile game"
[wiki, [Gravship](https://rimworldwiki.com/wiki/Gravship) — Odyssey DLC]:

A gravship is **not a separate object with an interior**. It is a **grav engine** plus a contiguous
region of **gravship substructure** (which acts as the ship's floor) on an ordinary map. *"Anything
built on the connected substructure will be considered part of the ship and brought along upon
launch."* The bounds are a **tile budget and a radius**, not a hull: 500 substructure tiles within
**19 tiles** of the grav engine, extensible with grav field extenders (+250 each, **max 2 000 tiles**,
6 extenders). Anything outside the supported budget **is left behind on launch, including anyone
standing on it.** There is **no weight limit** and no crew cap. Minimum flightworthy set: grav engine,
substructure, pilot console, one chemfuel tank, one thruster. Travel costs **10 chemfuel per world
tile, minimum 50**.

> ⇒ **RimWorld solved "the map is a ship" by keeping the map and marking a subset of it.** No decks, no
> vessel entity, no separate coordinate space — the ship is a *selection*. Perilune's `World` is a
> stack of `ZLevel`s and the ship *is* the world. **These are not variants of one idea**, and a lane
> reading "make it work like a RimWorld ship" is being pointed at a fundamentally different topology.

⚠️ **UNVERIFIED**: how the launch/landing transition works, what happens to atmosphere across it, and
whether rooms/vacuum are recomputed on arrival. **A lane doing serious ship-design work should read
`rimworldwiki.com/wiki/Gravship`, `/Vacuum` and `/Odyssey` in full — this is now a directly comparable
shipped commercial game and, as far as this repo's docs show, nobody in this project has read it.**

## 8.5 Perilune has no `JobCondition`, no reservation manager surface, and no two-grade pre-emption

RimWorld distinguishes `InterruptOptional` from `InterruptForced`, and `CheckForJobOverride(minPriority)`
lets a caller demand a minimum urgency before swapping a job (§2.4). Perilune's spike measured that
**pre-emption is the cheapest and safest leg** (zero lines in `sim/`, all four hard interrupt cases
measured safe) and that what is unbuilt is **holding** a pawn on an ordered job.

> **⚠️ COLLISION, in Perilune's favour for once.** §2.4 is close to a specification of the missing
> seam, and it costs RimWorld two enum values and one `float minPriority` parameter. But note what
> makes it work there: **`playerForced` is a field on the job**, checked at three separate places
> (`Pawn_JobTracker.cs:116`, `JobGiver_Work.cs:66`, `PriorityWork.cs:77-89`). Perilune's `Job` has no
> such field, and adding one to `Citizen`/job state is a **hashed-field change and a pin move**.

## 8.6 Mood: computed instantaneously, with ONE consumer — and that consumer's gate is stuck open

`Citizen.Mood` is recomputed from scratch every pass with **no history**
(`NeedsSystem.cs:156-167`): `20 − 40·Hunger − 30·Thirst − 25·Fatigue − 60·Suffocation`, range
−135..+20 — *not* a percentage. There is **no `Thought` type, no thought stack, no mood modifiers, and
no mental-break state**. And because `Fatigue` has **no reducer** (`Bed` is inert furniture), mood is
permanently ≤ −5 for every crew member from day 1 onward.

> ⚠️ **CORRECTION: "nothing consumes it" was false, and the true finding is worse.** Mood has exactly
> one consumer — the social argument gate (`sim/Sim.Core/Social/SocialSystem.cs:147-149`):
>
> ```csharp
> float lowMood = a.Mood < b.Mood ? a.Mood : b.Mood;
> if (lowMood < defs.ArgumentMoodThreshold && opinionAB <= defs.ArgumentOpinionCeiling
>     && _roll.NextFloat() < defs.ArgumentChancePerPass)
> ```
>
> And `content/core/SimDefs/social.def:36` sets **`argument_mood_threshold = 0`**.
>
> ⇒ **Combine the two facts this section already had.** Mood is permanently ≤ −5 for everyone, and the
> gate fires below 0. **The argument gate is therefore permanently OPEN on every pair of crew, for the
> whole game.** The only thing standing between the crew and a continuous argument stream is
> `ArgumentOpinionCeiling` and a dice roll. **The mood term contributes nothing because it is always
> true — the same shape as the `ShipMetrics.Food` clamp in `CLAUDE.md`'s E0-8 record, where a term
> that is always saturated reads as if it were doing work.**
>
> This is a live, filed-nowhere property of the shipping game. **It is not a design proposal and it is
> not for this document to resolve.**

> **⚠️ COLLISION.** §4.3: RimWorld's mood is a *rate-limited stack of expiring thoughts* chased by a
> bar and compared against three derived thresholds. Perilune's is a closed-form instantaneous
> function with one boolean consumer. They are not the same object wearing different numbers, and
> *"make mood work like RimWorld's"* is a request to build a thought system, an expiry model, a rate
> limiter and a break ladder — not to retune four coefficients.

## 8.7 MOSS has no RimWorld analogue, and it commands devices only

MOSS (`sim/Sim.Dsl`) is a budgeted, deterministic, **saved** automation DSL whose writes go through
the command inbox and land at the next tick boundary. It addresses **devices and room anchors only**;
**rooms have no commands** (`DeviceAdapters.cs:130-134`), and it **can never command a pawn**.

> **⚠️ COLLISION.** RimWorld's nearest equivalents are all **declarative, bounded and player-facing**:
> `DrugPolicy`, `FoodPolicy`, `ReadingPolicy` and `Policy` [src, `RimWorld/Policy.cs` and siblings],
> bills (§2.6), auto-slaughter thresholds, and allowed areas. Each is a *table the player fills in*,
> never a program the player writes.
>
> **The search behind that claim, stated so it can be checked** (per Appendix B): across all 9 257
> decompiled files, `*Script*` matches only Unity's generated `MonoScriptTypes` and the **quest**
> system (`QuestScriptDef`, `QuestNode_SubScript`) — content authoring, not player authoring;
> `*Interpreter*` matches **nothing**; `*Automat*` matches an automatic styling-station job and a
> pause mode. ⇒ **There is no player-authored execution surface in vanilla RimWorld** — a claim about
> *this decompile*, made by *that* search.
>
> If a work-priority grid and MOSS ever need to interact — *"MOSS raises Repair to priority 1 when
> pressure drops"* — **§1 offers no guidance, because this is a question RimWorld's design never
> poses.**

## 8.8 LLM crew conversation has no RimWorld analogue either, and the boundary is already drawn

The LLM emits **only** `CitizenEffect` records, validated at tick boundaries. The complete vocabulary
is six kinds (`sim/Sim.Core/Effects/CitizenEffects.cs:89-99`): `SetDisposition`, `SetEmotionalState`,
`AgreeTask`, `RevealInfo`, `FollowPlayer`, `EndConversation`. **Exactly one of them writes hashed sim
state** — `AgreeTask`, and it is restricted to `JobKind.Dig` on an already-`Designated` debris tile.

> **⚠️ COLLISION, and it is narrow but real.** `AgreeTask` is the only seam found by which anything
> other than the player or a sim system creates work, and it is hard-wired to one `JobKind`. A
> RimWorld-shaped work grid makes "which pawn does what" a *player* setting. A talking crew makes it,
> at least rhetorically, a *negotiation*.
>
> ⚠️ **Qualify this rather than overstate it: RimWorld pawns DO decline, constantly — they just never
> negotiate.** Incapability refuses (§1.6), capacity thresholds refuse (§6.1), danger refuses (§2.4),
> mental breaks remove player control outright (§4.2), and a colonist below its break threshold for
> long enough **leaves the colony** [wiki, Mood]. What RimWorld has no vocabulary for is a refusal the
> player can **argue with** — every refusal there is a rule, evaluated silently, with no channel back.
> **That, specifically, is the thing §1 cannot advise on.**

## 8.9 Determinism makes RimWorld's cheapest moves expensive here

RimWorld adds behaviour by dropping a `Comp` or a `WorkGiverDef` onto a def; nothing is pinned.
Perilune folds **every saved field** into `Simulation.StateHash()` (`Simulation.cs:280-393`), and the
ritual for one new hashed field is a single commit carrying default + parser key + save version branch
+ checksum fold + round-trip test + **a re-measured pin in `ci.sh` and `CLAUDE.md`**.

> **⚠️ COLLISION, and it is why this file exists.** A work-priority grid is, in RimWorld,
> `DefMap<WorkTypeDef, int>` per pawn — *n* small integers of saved state per colonist. In Perilune
> that is **new hashed per-citizen state**, i.e. a pin move on all five pins, a save-version branch,
> and a round-trip test. **The design question "how many priority levels" is, here, also a question
> about how many bits get folded into `02257f5bce961570`.** §1.2's answer — 0..4, three bits — is
> worth knowing *before* the field is designed, not after.

---

## APPENDIX — sources used

| what | how |
|---|---|
| **RimWorld source, v1.6.9438.38202** | `Chillu1/RimWorldDecompiled`. ⭐ **DOWNLOAD THE WHOLE REPO AND GREP IT LOCALLY** — `curl -sL -o m.zip https://github.com/Chillu1/RimWorldDecompiled/archive/refs/heads/master.zip && unzip -qq m.zip` gives **9 257 `.cs` files, 52 MB, in about ten seconds.** The first draft of this file fetched files one at a time by guessed path and **that is precisely why it missed `Danger`, `JobGiver_FindOxygen` and `minForCapable`** — you cannot grep for a mechanism whose name you do not already know. |
| **Files read (2nd pass, all verified locally)** | `Pawn_WorkSettings.cs` · `JobGiver_Work.cs` · `Pawn_JobTracker.cs` · `PriorityWork.cs` · `WorkTypeDef.cs` · `WorkGiverDef.cs` · `WorkGiver.cs` · `WorkGiver_Scanner.cs` · **`Verse/Danger.cs`** · **`Verse/DangerUtility.cs`** · **`Verse/Region.cs`** · **`RimWorld/JobGiver_FindOxygen.cs`** · **`Verse/PawnCapacitiesHandler.cs`** · **`Verse/PawnCapacityDef.cs`** · `PawnUtility.cs` · `WorkGiver_GrowerSow.cs` · `WorkGiver_PlantSeed.cs` · `DesignationDefOf.cs` · `StoragePriority.cs` · `JobCondition.cs` · `BillRepeatModeDefOf.cs` · `Pawn_DraftController.cs` |
| **RimWorld Wiki** | [Work](https://rimworldwiki.com/wiki/Work) · [Drafting](https://rimworldwiki.com/wiki/Drafting) · [Stockpile](https://rimworldwiki.com/wiki/Stockpile) · [Bill](https://rimworldwiki.com/wiki/Bill) · [Menus](https://rimworldwiki.com/wiki/Menus) · [Mood](https://rimworldwiki.com/wiki/Mood) · [Mental break](https://rimworldwiki.com/wiki/Mental_break) · [Mental Break Threshold](https://rimworldwiki.com/wiki/Mental_Break_Threshold) · [Skills](https://rimworldwiki.com/wiki/Skills) · [Trait](https://rimworldwiki.com/wiki/Trait) · [Saturation](https://rimworldwiki.com/wiki/Saturation) · [Rest](https://rimworldwiki.com/wiki/Rest) · [Recreation](https://rimworldwiki.com/wiki/Recreation) · [Thoughts](https://rimworldwiki.com/wiki/Thoughts) · [Downed](https://rimworldwiki.com/wiki/Downed) · [Blood loss](https://rimworldwiki.com/wiki/Blood_loss) · [Infection](https://rimworldwiki.com/wiki/Infection) · [Doctoring](https://rimworldwiki.com/wiki/Doctoring) · [Quality](https://rimworldwiki.com/wiki/Quality) · [Vacuum](https://rimworldwiki.com/wiki/Vacuum) · **[Gravship](https://rimworldwiki.com/wiki/Gravship)** · [Version history](https://rimworldwiki.com/wiki/Version_history) |
| ⚠️ **Correction to the first draft's own appendix** | It listed Gravship/Odyssey as **"not read"** while §8.4 carried a paragraph of Gravship numbers cited `[wiki, Gravship]`. **The Gravship page WAS read** (on a third attempt, after two network failures) and every number in that paragraph was independently verified in review. The "not read" row was simply wrong and has been removed. **Odyssey** remains unread. |
| **⚠️ Wiki access note — this cost real time twice, do not rediscover it** | The live wiki returns **HTTP 403** (Cloudflare) to `WebFetch` *and* to `curl`, including `?action=raw`. `WebFetch` is *separately* **blocked from `web.archive.org`** in this harness. **Two routes work:** (1) `curl "http://archive.org/wayback/available?url=rimworldwiki.com/wiki/PAGE"` for a snapshot URL, then `curl -sL` it and strip the HTML locally; (2) the reader proxy `https://r.jina.ai/https://rimworldwiki.com/wiki/PAGE`. ⚠️ **Route 1 fails intermittently on network errors — RETRY BEFORE CONCLUDING A PAGE IS UNAVAILABLE.** Review reported route 2 working for **every** page including the two this run first recorded as failed. |
| **Vanilla defs (XML) are NOT in the decompile repo** | `naturalPriority` (§1.7), `alwaysStartActive` (§1.5), the `emergency` flags (§1.4) and `minForCapable` (§6.1) all live in `Data/Core/Defs/`. The values quoted in this file come from a **2018 mirror (`0.19.2009`)** and are marked with a version caveat every time. **Anyone with the game installed settles all four in about a minute.** |
| **Perilune repo** | `CLAUDE.md`, `docs/HANDOVER.md`, `docs/MECHANICS.md`, and `sim/` / `hosts/` / `client/src` at `f9e4dbc`, cited `file:line` inline in §8. Every §8 grep was **re-measured** for this revision. |

---

## APPENDIX B — the review, and what it says about how to write a reference

This document took a **send-back** on independent review. The shape of that review is worth recording,
because it is more transferable than any single fact above.

**§1–§3 held line for line** under an adversarial pass that had *more* search power than the first
draft (the reviewer downloaded the full decompile and grepped locally, rather than fetching pages by
guessed path). `EnableAndInitialize`, the `× 100000` dominance, the passion multipliers, the emergency
split, the anti-thrash limits, the skill-decay table, the mental-break family, and the correction of
the wiki on Construction speed were all confirmed — several verbatim. Both of the first draft's
**labelled inferences** were settled **in its favour**.

> ### ⛔ AND YET EVERY SINGLE ERROR WAS THE SAME ERROR: AN ABSOLUTE NEGATIVE.
>
> *"the only seam" · "nothing reads it" · "nothing consumes it" · "zero across three trees" ·
> "no job is refused" · "no numeric gate anywhere" · "there is no precedent" · "does not gate work".*
>
> **In three cases the cited source contained the correctly-qualified sentence and the qualifier was
> dropped in transcription.** `JobContext.cs:64` says *"asked here and nowhere else **in the job
> board**"*; the draft wrote *"the only seam"*.

**Why this is uniquely dangerous in a reference and not merely sloppy:** a positive claim that is too
strong invites checking — someone will go and look. **A negative claim that is too strong forecloses
checking.** A lane told *"RimWorld has no X"* will not go looking for X, and the error propagates
silently into whatever gets built. Three of the four blockers in this revision were of exactly that
form, and the largest — §8.4 — had the document recommending the **opposite** of what RimWorld does.

**The mechanical countermeasure, applied to this file and recommended to the next:** before writing
any sentence of the form *"there is no X"*, *"nothing does Y"*, or *"the only Z"*, **name the search
that would have found a counter-example and run it.** If you cannot name the search, write the
qualified form instead — *"no X in `<the specific place I looked>`"*. The qualified form is what the
sources in this file consistently said; the absolute form is what got transcribed.

**One further note, because it cuts the other way.** The reviewer's own report contained the same
class of over-generalisation in miniature: it listed `WorkGiver_DoBill` among the work givers that
*"override `MaxPathDanger` to `Deadly`"*. **It overrides to `Danger.Some`** — the opposite direction,
and a genuinely interesting fact (§8.4) that the summary flattened. Verified against source this run.
⇒ **Verify the review too. The discipline is the point, not the authority.**
