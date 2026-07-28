# `docs/design/shots/` — rendered evidence, for the owner to judge

Pictures of the running game, committed so there is a **path in the tree** to hand over. Every
assertion in `client/test/` reads a string; only a person looking at a screen can say whether the art
is right. The owner judges the art (memory: *Review seams, not art*), so the art has to be reachable
without re-running anything.

Regenerate with the tool named beside each set — never hand-edit, never crop by hand.

---

## `door-*` — the door package (2026-07-27)

Tool: **`client/tools/door-shot.mjs`**. Live `--ship grid` host, real Chrome over CDP, real pointer
clicks. The door is shut over the wire (`{"cmd":"click"}` → `GameSession.ContextAction` toggles it),
which is the same projected `'+'` a player gets from the DOOR tool — `BuildSystem.cs:226`: *"the door
starts closed"*.

| file | what it shows |
|---|---|
| `door-1-BEFORE-closed-crop.png` | **THE BUG.** MEDBAY, deck 0. A shut door renders as the VS-Z-25 dashed box with a raw `+` in it. Captured with `sliding-door`'s glyph reverted to `null`, i.e. the state that shipped. |
| `door-2-AFTER-closed-crop.png` | **THE FIX.** MESS, deck 0. The same tile draws the `sliding-door` leaf — steel, lit centre strip — seated in the wall gap. |
| `door-3-BEFORE-roomzoom.png` | the whole Room Zoom for the BEFORE crop, so the chip is seen in context |
| `door-4-AFTER-roomzoom.png` | the whole Room Zoom for the AFTER crop |
| `door-5-AFTER-open-doorway.png` | the **OPEN** doorway, drawing nothing — deliberate (`NO_DEVICE_GLYPH_ART`). Closed draws a leaf, open draws a hole, so shut-vs-open stays legible. |
| `door-6-AFTER-overview.png` | Level-1, where an unskinned glyph was not a chip but **silently absent** |

### Two things these pictures do NOT show — read before quoting them

- **The LOCKED state (`'X'` → `blast-door`) is not photographed.** No wire verb locks a door, so it is
  reachable only from the TUI or the MOSS/DSL adapters. It is pinned by a driven test against the
  real DOM; that proves the markup, not the look. **The choice of `blast-door` for locked and
  `sliding-door` for closed is an agent's aesthetic call and has had no owner review.**
- **A ground stack sharing a door tile** is proven by driven test only. Producing it live would need
  a haul to land on a door tile.

### The Level-1 change, measured at boot rather than argued

`--ship grid` **deck 1** boots with three CLOSED doors — (38,7), (16,10), (38,10) — so the Overview
gains **three** door pieces immediately: furniture tiles **26 → 29**, drawn at `tileSize * 1.7`.
**Deck 0 gains nothing at boot** (57 → 57): all eight of its doors boot open. Both measured against a
live host, not computed.

⚠️ All three of deck 1's closed doors sit in **unoccupied halls** (blank `anchorName`), and
`roomTileRect` refuses a blank anchor — so at boot the number of closed doors in a room the player can
**enter** is **zero**. The Level-2 case is reached by a player gesture: shutting a door, or building
one. "8 in-rect doors, 3 closed" is a statement about *rect geometry*, which is what it was measured
to refute; it is not a statement about what a player sees at Level 2 on a fresh save.
