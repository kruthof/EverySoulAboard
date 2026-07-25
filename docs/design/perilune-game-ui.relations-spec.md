# PERILUNE Client UI — RELATIONS TAB SPEC (v1, 2026-07-21)

The interaction + visual contract for the RELATIONS tab: a crew-relationship web that replaces the
ship view. **Amended 2026-07-25 by console-retirement WP-7** — v1 built it as a *viewport swap*
inside the console `.stage`; it is now a body-level takeover (`body.relations-open`) like MOSS,
because the overlay form un-hid the deprecated console on the standard ship. IX-R1, IX-R3, IX-R7 and
VS-R1/R2/R7/R8 carry the amendment inline; every data/derivation clause is unchanged. A sibling of
`perilune-game-ui.{interaction,visual}-spec.md`; it inherits their
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
| **IX-R1** | A `RELATIONS` tab appears in the tab row (bottom-bar console: BUILD · CREW · MOSS · CHRONICLE · RELATIONS; Overview command bar: BUILD · CREW · RELATIONS · MOSS · CHRONICLE), active-state styled exactly like the others (amber selected trio). Activating it replaces the whole game window with the RELATIONS surface; **any other tab returns the ship view**. The ship canvas + composeScene/executors are never touched — the takeover simply is not drawing them. Switching to it inherits the standard tab-switch armed-tool disarm (`nextArmedTool {t:'tab'}`). **Amended by console-retirement WP-7 (2026-07-25):** this was originally a *viewport* swap — an overlay inside the console `.stage`. That made it depend on the console being the surface, and on the standard ship (`--ship grid`) selecting it dropped `body.overview-open` and put the entire deprecated console back on screen over the modern game. It is now a **body-level takeover** with its own switch, `body.relations-open`, exactly like MOSS; precedence is MOSS > Room Zoom > RELATIONS > Overview > console. |
| **IX-R2** | Selection is the ONE shared mechanism. Clicking a node selects that crew via the same `crewRowClick` flow a CREW WATCH row uses (same-deck → click fresh tile; cross-deck → deck-switch + pending click). The focused crew is `selectedRosterEntry(frame, roster)` — CREW WATCH row click, pawn click, and node click all converge on it. Selection loss clears the web focus. |
| **IX-R3** | The `relations` message latches (`_relations` in hud.js, read back through `getRelations()`); the surface repaints off the shared ship-update notification, so the web and its readout follow the message, the selection (frame) and tab open alike. |
| **IX-R4** | Nodes ring in **roster order** (deterministic, host order — no client sort), n ≥ 2 (the layout degrades gracefully to n = 0/1). Node 0 sits at the top; the ring proceeds clockwise (`ringLayout`, pure). |
| **IX-R5** | Edges are the deduped MUTUAL lines: two directed wire edges collapse to one drawn line (`drawnEdges`, keyed a<b by cid). Line color = mutual tier; dashed = `secret` (OR of the two directions). |
| **IX-R6** | **Draw gate:** an unfocused pair draws only when EITHER direction has a note OR \|opinion\| ≥ 10 (`DRAW_MIN`) — pure-neutral strangers stay invisible (8 crew = 28 pairs; don't render noise). **Focused override:** ALL of the focused crew's edges highlight, even weak/note-less ones. |
| **IX-R7** | While RELATIONS is active and a crew is focused, the READOUT shows who is focused (name · role · mood) and two directed sections: **THEIR REGARD FOR OTHERS** (outgoing, rows `→ NAME  +N`) and **HOW OTHERS SEE {SURNAME}** (incoming, rows `NAME →  +N`), each with the relationship note beneath. Rows sort by \|opinion\| desc, then cid asc (`regardRows`, pure). Empty state: `No recorded regard.` / `No one has recorded regard.` **Amended by WP-7:** the sections used to be appended to the *console* READOUT, which the takeover now hides; they live in the RELATIONS surface's own readout island, with the same derivation and the same `.rr-*` markup. The `[T]`/`[M]`/`BIOGRAPHY` controls are not carried over — they belong to the ship surface, and the same directed data is reachable there through the DOSSIER's RELATIONSHIPS block (`enrichCitizen`). |
| **IX-R8** | A focused edge shows a small boxed uppercase tag at its midpoint. Tag text = the focused crew's OUTGOING note toward the other, else the incoming note, else the mutual-tier word (`focusTag`, pure) — a note-less emergent edge degrades to the tier word, never a hole. |
| **IX-R9** | No new command is sent by the tab: `relations` is a pushed channel (snapshot on connect + render). Node clicks reuse existing `Cmd.deck`/`Cmd.click` only. |
| **IX-R10** | **Escape exits the RELATIONS view.** The Escape priority stack (interaction-spec IX-13) gains a final rung *after* dialogue-close: when no tool is armed and no dialogue is open, if the RELATIONS tab is active Escape switches back to the **BUILD** tab, restoring the ship viewport (`setTab('build')`) — else no-op. Order is invariant: armed tool → open dialogue → relations-exit → nothing. The rung is the pure `escapeTarget({armed, dialogueOpen, relationsActive})` in `console-model.js` (node-tested); `hud.handleEscape` performs the returned action. Fixes relations gate finding L2 (Escape had no way out of the relations swap). |

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

- **VS-R1** — Surface: `#relations-view` is `position:fixed; inset:0; z-index:15`, shown by
  `body.relations-open` (which puts `.app` and `#overview-view` at `display:none`) and hidden by
  `body.moss-open` / `body.roomzoom-open`. Full-bleed `--void-gradient` field with floating `.hud`
  glass islands, the same language as the Overview and the Room Zoom (VS-O-53 / VS-Z-37): topbar with
  the title + `[ESC] CLOSE` (top) · CREW list (left) · SVG web (centre) · regard readout (right) ·
  legend (bottom-centre). *Superseded (WP-7): it was `position:absolute; inset:14px; z-index:6`
  inside `.stage`, opaque `--bg-void` with a `0 0 0 1px --ln-hair` hairline, laid out as title · SVG ·
  legend. That home is what tied the surface to the console shell — see IX-R1.*
- **VS-R2** — Title: uppercase label text `RELATIONS — {n} SOULS · CLICK A NAME TO FOCUS`, carried
  in the topbar island beside `MSV PERILUNE` (11px/.08em, `--ink-mute`) rather than as a standalone
  `--fs-label` line above the SVG — WP-7 moved it onto the warm chrome; the string is unchanged.
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
- **VS-R7** — Legend row, its own `.hud` island at bottom-centre (WP-7; it was bottom-left inside
  the overlay): `— CLOSE — WARM — NEUTRAL — HOSTILE ⋯ SECRET` as colored swatches (a hairline per
  tier; the SECRET swatch is dashed).
- **VS-R8** — Regard rows (`.rr-*`, now in the surface's own readout island — see IX-R7): signed
  values right-aligned, **positive green (`--good`), negative rust (`--bad-txt`)**, zero dim; the note
  renders beneath in dim 9px uppercase micro-text. Sections are separated by the standard dashed
  divider (VS-25 grammar). The rules live in the RELATIONS section of `styles.css`, not the console
  readout block, so the console's deletion cannot take them.
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
