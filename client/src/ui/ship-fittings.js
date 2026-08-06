// THE ALL-DECK FITTING SOURCE — what stands on a tile, on ANY deck, from channels that carry EVERY
// deck. PURE: no DOM, no wire access, no clock.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⛔⛔ WHY THIS FILE EXISTS AT ALL, AND IT IS THE FINDING THAT MADE THE SIDE ELEVATION POSSIBLE.
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The plate now draws BOTH DECKS AT ONCE. Every previous version of it drew the compartment
// interiors out of the `frame` channel's glyph cells — and **`frame` carries exactly ONE DECK**:
// `GameSession.RenderFrame` calls `GlyphMapper.Project(_sim, _deck, …)` for the deck the host is
// currently showing and serialises that (`hosts/web/GameSession.cs:2070`, `WireFormat.cs:52`). So a
// two-deck drawing sourced from `frame` would have the active deck furnished and the other one
// empty — not fogged, not "unknown", just wrong.
//
// ⭐ THE WAY OUT IS NOT A HOST CHANGE. Two channels already carry the whole ship:
//
//   `devices` — `[x, y, deck, kind, cond, oper, open, serv, air, spend]` for EVERY tile-resident
//               device on EVERY deck (`GameSession.BuildDevices`, which walks `_sim.Devices.Items`
//               and filters only utility overlays and FOG).
//   `items`   — `[x, y, deck, kind, count]` for every uncarried ground stack on every deck
//               (`GameSession.BuildItems`, same shape, same fog gate).
//
// ⭐⭐ AND THE SUBSTITUTION IS EXACT, MEASURED TILE-FOR-TILE ON THE RUNNING GAME rather than argued.
// On `--ship wreck` (host on :8420, 2026-08-05), the set of tiles the frame's glyphs skin was
// compared against the set these two channels skin, on BOTH decks, through the SAME two registry
// derivations the drawing uses (`itemForDeviceRow` and `itemIdForStockKind`):
//
//     deck 0 — frame 62 fittings, devices+items 62; ONLY-IN-FRAME 0, ONLY-IN-CHANNELS 0, MISMATCH 0
//     deck 1 — frame 24 fittings, devices+items 24; ONLY-IN-FRAME 0, ONLY-IN-CHANNELS 0, MISMATCH 0
//
// Re-measure it; do not quote this paragraph (CLAUDE.md). `ship-fittings.test.js` drives the same
// claim against a fixture, and the live rig re-derives it off the running wire so the equivalence
// cannot rot silently.
//
// ⭐ IT IS ALSO STRICTLY BETTER THAN THE FRAME, not merely equal. `GlyphMapper` pass 5 writes
// `Glyphs.Citizen` OVER the device glyph, so a machine LOST ITS DRAWING the moment a crew member
// stood on it — VR-P4 had to patch around that by reaching into the `devices` channel for exactly
// the occluded tile (`overview-scene.js`'s `itemForDeviceRow(cond.get(...))` arm). Sourcing from
// `devices` directly deletes the whole defect class instead of repairing one instance of it.
//
// ⛔ AND THE FOG INVARIANT SURVIVES, which is the one thing that could have made this a regression.
// Both builders gate on `TileFlags.Explored` before emitting a row, each with a comment naming the
// `GlyphMapper` pass it mirrors (pass 4 for devices, pass 3 for items) and the reason: *"a device in
// the dark emits nothing: shipping it would widen what the player knows."* So a fitting can reach
// this module only through the same gate the projection applies. Read the two builders before
// trusting this sentence.
//
// ⛔⛔ THE ONE PIECE OF ART THE SUBSTITUTION LOSES, MEASURED AND NAMED: **`door-blast`, THE LOCKED
// DOOR.** `GlyphMapper.DeviceGlyph` picks `Glyphs.DoorLocked` (`'X'`) for a `DeviceKind.Door` whose
// `IsLocked` is set (`GlyphMapper.cs:223`) and the registry skins that as `door-blast` — but
// `IsLocked` is NOT on the `devices` channel, and its absence is a decision with a written reason:
// `hosts/web/WireFormat.Devices.cs`'s "WHAT IS DELIBERATELY LEFT OUT" list names it alongside
// `Powered`, `Progress` and `Rate` as *"a DIFFERENT FEATURE (… a door animation …)"*. So a locked
// door draws on the plate as an ordinary `door-sliding`.
//
// A CENSUS OF THE WHOLE LOSS, not an anecdote: of the 35 distinct pieces the glyph table can name,
// 34 are reachable through `itemForDeviceRow` ∪ `itemIdForStockKind` and exactly one — `door-blast`
// — is not. `ship-fittings.test.js` pins that census by NAME, in both directions, so a later lane
// that widens the channel sees the exception disappear and a later lane that loses another piece
// sees a new name arrive.
//
// ⚠️ AND IT IS UN-EXERCISED ON THE SHIPPED SHIP TODAY, WHICH IS A REASON TO WRITE IT DOWN AND NOT A
// REASON TO IGNORE IT: `'X'` (88) appears in NEITHER deck's projected glyph census on `--ship wreck`
// (deck 0 draws 26 distinct codes, deck 1 draws 12, and 88 is in neither). The Level-2 Room Zoom
// still reads the frame and still draws the blast door correctly, so the fact is not lost from the
// game — only from the plate. FILED for the owner: a locked door is a fact about a route, and Level 1
// is where a player looks for routes. Closing it is a one-element append to the `devices` tuple.
//
// ⚠️ WHAT THE FRAME STILL OWNS, AND IT IS ONE THING: **FOG ITSELF.** An unexplored tile is an ABSENCE
// on `devices`/`items` and absence is not distinguishable from "explored and empty". The frame says
// so positively (a fogged cell is blank), so the plate's unsurveyed hatch is derived from the frame
// and is therefore available ONLY for the deck the host is projecting. `surveyedDecks` reports which
// deck that is, the composer records it on the drawing as `data-survey`, and the limit is filed for
// the owner rather than papered over. See `fogTiles` below.

import { itemForDeviceRow, itemIdForStockKind } from './room-model.js';

/**
 * Every fitting on one deck, keyed `"x,y"` → `{itemId, cond, kind, ground}`.
 *
 * A DEVICE WINS A TILE OVER A GROUND STACK, and the precedence is the sim's own: `GlyphMapper` runs
 * pass 3 (items) before pass 4 (devices), so the device is what the projection would have drawn on a
 * tile carrying both. Reversing it here would make the two surfaces disagree about one tile.
 *
 * `cond` is carried through because it is the wear join's input — `items/wear.js` swaps a worn
 * machine for its post-raid twin, and that threshold lives in exactly one place for both surfaces.
 * A ground stack has no condition and carries `undefined`, which is what `buildTileItem` already
 * means by "no wear".
 *
 * `face` is the `devices` channel's quarter-turn byte, carried for the same reason `cond` is: the
 * plate and the Room Zoom must draw one machine with one picture, and the Room Zoom's `standItem`
 * already hands its facing to `buildTileItem`. A ground stack has no facing and carries 0.
 *
 * @param {Array|null} devices `decodeDevices` output — ALL decks
 * @param {Array|null} items   `decodeItems` output — ALL decks
 * @param {number} deck
 * @returns {Map<string,{itemId:string, cond:number|undefined, kind:number, ground:boolean,
 *                       face:number}>}
 */
export function deckFittings(devices, items, deck) {
  const out = new Map();
  const z = deck | 0;
  // ⚠️ A ROW WITH NO POSITION IS NOT A ROW AT (0,0). `{}` coerces to `deck 0, kind 0, x 0, y 0`,
  // which `itemForDeviceRow` skins as a DOOR — so a malformed message would have planted a door in
  // the corner of deck 0 on every ship. Measured, from this module's own tolerance test.
  const placed = (r) => !!r && Number.isFinite(r.x) && Number.isFinite(r.y);
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!placed(it) || (it.deck | 0) !== z) continue;
    const itemId = itemIdForStockKind(it.kind);
    // A kind nothing skins (`MetalOre`, or a byte from a newer host) draws nothing here rather than
    // a debug chip: at plate scale an unknown-glyph placeholder is 4 px of noise, and the Room Zoom
    // is where an unrecognised stack is worth naming.
    if (!itemId) continue;
    out.set(it.x + ',' + it.y, { itemId, cond: undefined, kind: it.kind | 0, ground: true, face: 0 });
  }
  for (const d of (Array.isArray(devices) ? devices : [])) {
    if (!placed(d) || (d.deck | 0) !== z) continue;
    const itemId = itemForDeviceRow(d);
    if (!itemId) continue;
    out.set(d.x + ',' + d.y, {
      itemId, cond: d.cond, kind: d.kind | 0, ground: false,
      // ⭐ THE FACING BYTE, CARRIED SO THE PLATE AND THE ROOM DRAW ONE PICTURE. `Device.Facing` is a
      // two-bit quarter-turn on the `devices` channel (`WireFormat.Devices.cs`); the Room Zoom passes
      // it to `buildTileItem` and so must the plate's `fittingLayer`, or a turned bench is turned in
      // the room and unturned on the plate. NORMALISED HERE, ONCE: a host that never sends the field
      // (`undefined`) and a host that sends garbage both land on a legal 0..3, so no drawing code
      // downstream has to guess what a missing facing means.
      face: d.face === undefined ? 0 : ((d.face | 0) & 3),
    });
  }
  return out;
}

/**
 * The `"x,y"` keys of every tile on `deck` the FRAME says is unexplored — the only fog signal the
 * client has, and it exists for one deck at a time (see the module header).
 *
 * A cell is fogged when the frame has no tuple for it at all, or when its glyph is the blank the
 * projection writes for a tile outside `TileFlags.Explored`.
 *
 * @param {{deck:number,w:number,h:number,cells:Array}|null} frame
 * @param {number} deck
 * @returns {Set<string>|null} null when this deck has no frame — "the client cannot answer", which
 *   is deliberately NOT the same value as an empty set ("nothing here is fogged").
 */
export function fogTiles(frame, deck) {
  if (!frame || (frame.deck | 0) !== (deck | 0) || !Array.isArray(frame.cells)) return null;
  const out = new Set();
  const w = frame.w | 0, h = frame.h | 0;
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const cell = frame.cells[ty * w + tx];
      if (!Array.isArray(cell) || cell[0] === FOG_CODE || cell[0] === 0) out.add(tx + ',' + ty);
    }
  }
  return out;
}

/** The glyph a fogged tile projects as — a space. `GlyphMapper`'s fog gate writes it in pass 1. */
export const FOG_CODE = 32;

/**
 * Is this compartment UNSURVEYED — i.e. does the ship know nothing about what is inside it?
 *
 * ⛔ THE PREDICATE IS "EVERY TILE FOGGED", NOT "ANY". A compartment the crew has walked half of is a
 * compartment the player has seen; hatching it out would DELETE information the ship already has.
 * The design's hatched cross-box (`data-dc-tpl="526"`, the `#dmgb` 45° oxblood hatch plus the two
 * drawn diagonals) is for the hold nobody has opened.
 *
 * ⚠️ ON `--ship wreck` THIS IS FALSE FOR EVERY COMPARTMENT ON BOTH DECKS, MEASURED: all sixteen read
 * `fogged 0/96`. So the hatch does not fire on the shipped ship today, and its only instrument is
 * `overview-scene.test.js`'s fixture — which is stated here so a later lane does not read a live
 * screenshot without the hatch as evidence that the hatch works.
 *
 * @param {Set<string>|null} fog `fogTiles` output — null (no frame for this deck) ⇒ false, because
 *   "we cannot answer" must never render as "unexplored".
 */
export function slotUnsurveyed(fog, rect) {
  if (!(fog instanceof Set) || !rect || !(rect.w > 0) || !(rect.h > 0)) return false;
  for (let ty = rect.y; ty < rect.y + rect.h; ty++) {
    for (let tx = rect.x; tx < rect.x + rect.w; tx++) {
      if (!fog.has(tx + ',' + ty)) return false;
    }
  }
  return true;
}

/**
 * Which decks the client can answer the FOG question for — i.e. which deck the host is projecting.
 * At most one today. Exported so the composer can stamp it on the drawing and a test can pin that
 * the plate never claims to know more than it does.
 */
export function surveyedDecks(frame) {
  return frame && Number.isFinite(frame.deck) ? [frame.deck | 0] : [];
}
