# PERILUNE Client UI — RELATIONS TAB SPEC (v1, 2026-07-21)

The interaction + visual contract for the RELATIONS tab: a crew-relationship web that swaps the
ship viewport. A sibling of `perilune-game-ui.{interaction,visual}-spec.md`; it inherits their
tokens, type scale and states, and adds only what the relations view introduces. Requirements are
numbered **IX-R** (interaction) and **VS-R** (visual) for review reference. One behavior per
requirement. Where this spec and a sibling conflict, this spec is final for the relations surface.

Ground truth for data shapes: the RELATIONS wire channel (below) and `relations-model.js` (pure,
node-tested). Selection reuses the ONE existing crew-selection mechanism (`selectedCrewCid` /
`crewRowClick`), so CREW WATCH, the web, and the READOUT stay in lockstep.

---

## 0. Wire channel (the data contract)

The host emits a cached state channel `relations` (WireFormat.Relations / GameSession.BuildRelations),
snapshot-replayed on connect alongside `roster`, rebuilt each render and deduped:

```
{"type":"relations","edges":[[fromCid,toCid,opinion,tier,note,secret],...]}
```

- **DIRECTED** edges: one per living, named `SocialSystem` opinion (dead/unnamed excluded). `opinion`
  is the int-rounded directed regard (−100..100); `tier` is the directed `RelationType` byte
  (informational — the client derives the MUTUAL tier itself); `note` is the authored relationship
  note ("" for emergent edges); `secret` marks a concealed bond.
- MUTUAL regard does **not** exist sim-side — it is derived client-side from the two directions.
- **Not fog-gated** (same deliberate rule as roster): the player always knows their own crew.
- **Secret-bypass design note:** the relationship-level `secret` flag on this wire deliberately
  bypasses the dialogue `RevealDifficulty` gate. The relations view is the player's omniscient eye
  over the crew's bonds (matching the mock's dashed-edge legend). Personal secrets
  (`Persona.Secrets`) stay OFF the wire — only the relationship-level flag ships. The flag is
  host-owned, UNHASHED persona state (`PersonaSheet.RelationshipSecrets`), so authoring it moves no
  StateHash (the slice tick-3000 golden `d1710ab6a1fe50ce` is unmoved).

---

## 1. Interaction (IX-R)

| # | Requirement |
|---|---|
| **IX-R1** | A `RELATIONS` tab joins the bottom-bar tab row after `CHRONICLE` (BUILD · CREW · MOSS · CHRONICLE · RELATIONS), active-state styled exactly like the others (amber selected trio). Activating it swaps the center ship viewport for the relations overlay; **any other tab returns the ship view**. The ship canvas + composeScene/executors are never touched — the overlay simply covers them. Switching to it inherits the standard tab-switch armed-tool disarm (`nextArmedTool {t:'tab'}`). |
| **IX-R2** | Selection is the ONE shared mechanism. Clicking a node selects that crew via the same `crewRowClick` flow a CREW WATCH row uses (same-deck → click fresh tile; cross-deck → deck-switch + pending click). The focused crew is `selectedRosterEntry(frame, roster)` — CREW WATCH row click, pawn click, and node click all converge on it. Selection loss clears the web focus. |
| **IX-R3** | The `relations` message latches (`_relations`); it re-renders the web when the tab is active and refreshes the READOUT (its regard sections are relations-derived). The web also re-renders on selection change (frame) and tab open. |
| **IX-R4** | Nodes ring in **roster order** (deterministic, host order — no client sort), n ≥ 2 (the layout degrades gracefully to n = 0/1). Node 0 sits at the top; the ring proceeds clockwise (`ringLayout`, pure). |
| **IX-R5** | Edges are the deduped MUTUAL lines: two directed wire edges collapse to one drawn line (`drawnEdges`, keyed a<b by cid). Line color = mutual tier; dashed = `secret` (OR of the two directions). |
| **IX-R6** | **Draw gate:** an unfocused pair draws only when EITHER direction has a note OR \|opinion\| ≥ 10 (`DRAW_MIN`) — pure-neutral strangers stay invisible (8 crew = 28 pairs; don't render noise). **Focused override:** ALL of the focused crew's edges highlight, even weak/note-less ones. |
| **IX-R7** | While RELATIONS is active and a crew is focused, the READOUT keeps its normal glance content (name · role · mood · traits · task · morale) and the `[T]`/`[M]`/`BIOGRAPHY` controls, then gains two directed sections: **THEIR REGARD FOR OTHERS** (outgoing, rows `→ NAME  +N`) and **HOW OTHERS SEE {SURNAME}** (incoming, rows `NAME →  +N`), each with the relationship note beneath. Rows sort by \|opinion\| desc, then cid asc (`regardRows`, pure). Empty state: `No recorded regard.` / `No one has recorded regard.` |
| **IX-R8** | A focused edge shows a small boxed uppercase tag at its midpoint. Tag text = the focused crew's OUTGOING note toward the other, else the incoming note, else the mutual-tier word (`focusTag`, pure) — a note-less emergent edge degrades to the tier word, never a hole. |
| **IX-R9** | No new command is sent by the tab: `relations` is a pushed channel (snapshot on connect + render). Node clicks reuse existing `Cmd.deck`/`Cmd.click` only. |

## 2. Mutual-tier mapping (the classifier)

`mutualTier(aToB, bToA)` averages the two directed opinions (a **missing direction counts as 0**)
and bands the result. Rails chosen so the authored slice reads well:

| tier | rail | edge color | authored-slice pairs that land here |
|---|---|---|---|
| **close** | avg ≥ **45** | `--good` (green) | Amara↔Nadia (65/65 → 65), Amara↔Priya (40/62 → 51) |
| **warm** | avg ≥ **15** | `--amber-2` | Dmitri↔Tomas (40/40), Salif↔Nadia (25/32 → 28.5), Tomas↔Wei (38/38), Grace↔Wei (35/35), Priya↔Grace (30/30) |
| **hostile** | avg ≤ **−15** | `--bad-txt` (rust) | Dmitri↔Salif (−40/−40) |
| **neutral** | otherwise | `--txt-dim` | (none authored; emergent proximity edges) |

Boundaries are inclusive (45/15/−15). This reads as: **Amara is the emotional hub** (two green
bonds), the crew is broadly warm, and the ship's one open feud (Dmitri↔Salif) is the single rust
line. Neutral is reserved for weak emergent edges.

## 3. Visual (VS-R)

- **VS-R1** — Overlay: `.relations-view` is `position:absolute; inset:14px; z-index:6` inside
  `.stage` (aligned to the canvas frame), opaque `--bg-void` with the same `0 0 0 1px --ln-hair`
  hairline as the canvas. Column layout: title (top) · SVG (flex) · legend (bottom).
- **VS-R2** — Title: `--fs-label` style (10px/.18em uppercase, `--txt-faint`), text
  `RELATIONS — {n} SOULS · CLICK A NAME TO FOCUS`.
- **VS-R3** — SVG (`viewBox 0 0 1000 640`, `xMidYMid meet`). Ellipse `cx 500 cy 300 rx 372 ry 232`.
- **VS-R4** — Node: a circular badge (r 24) filled with the crew's CREW-WATCH hue (`crewHue`, VS-6),
  2-letter initials in `--txt-onacc` (700), surname beneath in small-caps `--txt-hi`. The focused
  node gets a bright ring (`--txt-peak`) and amber surname.
- **VS-R5** — Edge stroke by mutual tier: close `--good`, warm `--amber-2`, neutral `--txt-dim`,
  hostile `--bad-txt`; `secret` → `stroke-dasharray:7 5`. Unfocused edges sit at ~.55 opacity;
  when a crew is focused, non-focused edges recede to ~.2. **Focused edges brighten to full opacity
  and thicken to 3.5px, retaining their tier hue.** *(Deliberate refinement of the mock's uniform
  amber-orange highlight: the authored slice has a genuine hostile edge (Dmitri↔Salif), so keeping
  the tier hue under focus preserves the color's meaning rather than flattening every focused bond
  to amber. The boxed tag + persistent legend still carry the label.)*
- **VS-R6** — Tag: a boxed uppercase label (`--bg-bar` fill, `--ln-chip` border, `--amber-3` text,
  mono) centered on the focused edge midpoint.
- **VS-R7** — Legend row (bottom-left inside the overlay): `— CLOSE — WARM — NEUTRAL — HOSTILE ⋯
  SECRET` as colored swatches (a hairline per tier; the SECRET swatch is dashed).
- **VS-R8** — READOUT regard rows: signed values right-aligned, **positive green (`--good`),
  negative rust (`--bad-txt`)**, zero dim; the note renders beneath in dim 9px uppercase micro-text.
  Sections are separated by the standard dashed `--ln-hair` divider (VS-25 grammar).
- **VS-R9** — No new tokens, no external libraries: hand-rolled SVG/DOM only, all colors from the
  VS-1 palette. Reduced-motion is unaffected (the web has no animation).

## 4. Secret authoring (recorded decision)

Exactly **one** pair is marked `Secret` in the authored slice: **Nadia Hassan ↔ Salif Camara**
(both directed edges). Grounded in the written notes — Salif's *"she stitched his burns; he owes
her"* (a life-debt) and Nadia's *"her most frequent patient; fond of him"* (concealed fondness),
with Nadia characterized as the crew's keeper of secrets. It stays concealed while Dmitri publicly
blames Salif for the aft breach. No new pair invented, no `Opinion` float changed, no `Nudge` call
added — opinions are hashed; the `Secret` flag is unhashed persona state, so the slice tick-3000
golden is unmoved.
