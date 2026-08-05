// THE WEAR JOIN — the ONE place in the client where a device's CONDITION chooses its art.
//
// `client/src/items/wrecked.js` has held 70 post-raid twins plus 2 cryo capsules since the wreck
// start, drawn and reachable by nothing; `hosts/web/WireFormat.Devices.cs` has carried each device's
// `Condition` since the `devices` channel. This module is the seam between them, and it is the whole
// of the seam: both SVG surfaces call `buildTileItem` and neither imports `wrecked.js`.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ ONE HOME, AND THAT IS THE POINT RATHER THAN TIDINESS. The device-sprite defect (HANDOVER §4l)
// was a glyph→art table HAND-MIRRORED into `overview-scene.js` and `room-model.js`: two copies with
// comments saying they mirrored each other, one of them missing three kinds, and the food loop and
// the MOSS terminal drawing dashed boxes with raw letters in the shipping game for as long as it
// took an owner to photograph it. A second copy of "below what condition does a tile wear its twin?"
// would produce the same thing in a subtler costume: one surface showing a machine as wrecked and
// the other showing it intact, with every test green because each file agrees with itself.
// `client/test/wrecked.test.js` pins this structurally — `wear.js` is the only module outside
// `items/` that may name the wrecked set.
//
// ⚠️ IT NEVER ASKS WHAT A GLYPH RESOLVES TO — the SIXTH TRAP SHAPE (CLAUDE.md). `GLYPH_SUBSTITUTE`
// exists so a device can wear ANOTHER piece's art, and it is not homogeneous in registry `kind`
// (5 `functional` rows, 1 `cosmetic` — `'*'` Light borrows `wall-lamp`). A predicate over the
// BORROWED row's `kind` is therefore not a fact about the tile; one shipped, and DEMOLISH was dead
// on every lamp on `--ship grid` with the suite green before AND after the fix. `buildTileItem`
// takes an itemId and a condition byte and reads neither `kind` nor any glyph: a Light wearing
// `wall-lamp`'s art gets `wall-lamp`'s twin, which is the correct answer to "the art on this tile,
// wrecked".
//
// ⚠️ AND IT DOES NOT KEY OFF THE WIRE'S `kind` BYTE EITHER, WHICH IS THE ROAD NOT TAKEN AND IS
// WORTH THE PARAGRAPH. `WireFormat.Devices.cs` carries the raw `DeviceKind`, and its own header
// suggests the wrecked-sprite join "should derive its table from `ITEMS`". Deriving
// `DeviceKind → itemId` from `ITEMS` is possible and it is NOT A FUNCTION: `DeviceKind.Door` is
// claimed by `sliding-door`, `airlock` AND `blast-door`; `DeviceKind.CryoPod` by `capsule-sealed`
// and `capsule-open`; and `DeviceKind.Battery` by `cell-sound`, `cell-spent` AND `battery-bank`.
// A kind-keyed join would have to pick one of each arbitrarily — and the capsules are precisely the
// pieces the wreck start exists to put on screen, so it would fail on its own headline case.
//
// ⚠️ THE CRYO NAMES IN THAT SENTENCE MOVED ON 2026-08-05 and the old ones are worth keeping in view,
// because a reader who greps for them will find two rows that look like the answer and are not:
// `cryo-capsule-occupied` / `cryo-capsule-open` (`items/cryo.js`) held `'K'` / `'k'` until the
// owner's "Capsules and cells" catalogue section landed, and now sit at `glyph: null` beside
// `battery-bank` as registered-but-unreached warm art. They are still `deviceKind: 'CryoPod'`, which
// is exactly why they still make this argument true — three of the rows in the two lists above draw
// nothing a player can reach, and a kind-keyed join could not tell them from the three that do.
//
// ⚠️ AND BATTERY IS THE SHARPEST CASE OF THE THREE, BECAUSE IT IS NOT A STATE-GLYPH KIND AT ALL.
// Door and CryoPod are multi-piece because `GlyphMapper.DeviceGlyph` gives them several chars.
// `Glyphs.ForDevice(Battery)` is the single arm `'B'`, and `cell-spent` is reached ONLY through this
// module — `WRECKED['cell-sound']`, chosen by the `cond` byte below. So for a Battery the kind byte
// carries no way to choose at all, which is the road-not-taken argument at its strongest.
//
// What separates the multi-glyph pieces is STATE, and state reaches the client as the projected
// glyph (`GlyphMapper.DeviceGlyph` returns `'K'` occupied / `'k'` open, `'+'`/`'/'`/`'X'` for a
// door). The surfaces already resolve art from the glyph; this module leaves that untouched and adds
// only the wear question. The non-functionality is not an assumption —
// `deviceKindsWithSeveralPieces()` measures it off `ITEMS` and the test asserts it is non-empty, so
// if the registry ever became one-piece-per-kind the argument would fail loudly instead of rotting.
//
// PURE. No DOM, no clock, no randomness — same inputs ⇒ byte-identical output, the same contract
// every builder in this directory holds.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { ITEMS, ITEM_IDS, buildItem } from './index.js';
import { WRECKED, buildWrecked } from './wrecked.js';

/**
 * THE THRESHOLD, AS A CONDITION AND NOT AS A WIRE BYTE — `wear.wreck_threshold` in
 * `content/core/SimDefs/wear.def`, mirrored here as a rendering decision.
 *
 * WHY 0.25 AND NOT A NUMBER OF THIS MODULE'S OWN. Below it the SIM ITSELF changes what a machine is:
 * `MaintenanceSystem` refuses an empty-handed jury-rig at recruitment (a wrecked machine can no
 * longer be wished better), the fourth `swarf_service_condition` rung is the only repair offered,
 * and `DeconstructSystem` pays `Swarf` instead of `Parts`. So the art changes exactly where the
 * RULES change, and a player who learns to read the picture has learnt something true. Any other
 * number would put the picture and the rules out of step, and the picture is the only teacher the
 * wreck start has.
 *
 * AGAINST THE ART'S OWN BADGES, which is the other half of the justification. The mock badges every
 * twin with a remaining-condition percentage and the whole set sits in **0 %–35 %** (`AIRLOCK` 1 %
 * … `CREAM TILE FLOOR` 33 %; read off `wrecked.js`'s `state` column, which
 * `client/test/wrecked.test.js` proves against the committed spec). 0.25 sits INSIDE that band, so
 * every tile wearing a twin is at a condition the twin plausibly depicts. Choosing the band's top
 * (0.35) would show ruined art on a machine the sim still repairs for free; choosing 0.10 would
 * leave a third of the paintings unreachable.
 *
 * ⚠️ IT IS A RENDERING DECISION AND NOT A SECOND AUTHORITY, and the difference matters. The client
 * must never re-derive a RULE — `oper` rides the wire precisely because `IsOperational`'s failure
 * threshold is PER KIND and lives in `machines.def`, so a client comparing `cond` to one number of
 * its own would be wrong for 14 of 26 kinds. "Which picture" is not that: it is a uniform question
 * about paintings, there is one picture per row, and no sim behaviour reads it. If `wear.def` ever
 * moves the floor, the art follows one edit later and nothing is silently wrong in the meantime —
 * a machine simply keeps its clean picture a little past the cliff.
 */
export const WRECK_THRESHOLD = 0.25;

/**
 * The same threshold on the `devices` channel's own scale — `0 = wrecked … 255 = pristine`.
 * DERIVED from `WRECK_THRESHOLD`, never written as `64`, so the two cannot drift.
 *
 * ⚠️ THE QUANTISATION IS NOT EXACT AND SAYING SO IS THE HONEST FORM.
 *
 * ⛔ AND THE FIRST VERSION OF THIS PARAGRAPH GOT THE ARITHMETIC WRONG BY A WHOLE BYTE, IN THE
 * FLATTERING DIRECTION. It is quoted rather than deleted because the mistake is instructive: it read
 * *"byte 64 covers roughly `[0.2471, 0.2510]` — a `cond < 64` test is really `Condition < 0.2471` at
 * the boundary, about 0.2 % of a machine's life below the def."* `[0.2471, 0.2510]` is
 * `[63/255, 64/255]` — the gap between two byte VALUES — and that is not byte 64's PRE-IMAGE under
 * half-up rounding. So the published boundary sat a full byte on the wrong side of the real cliff:
 * the comment implied a machine at `Condition 0.248` is drawn intact, and it is drawn WRECKED.
 *
 * THE ACTUAL NUMBERS, from `WireFormat.ConditionByte` = `(int)(c * 255 + 0.5)`:
 *   • byte 64's pre-image is `[63.5/255, 64.5/255)` = **[0.249020, 0.252941)**
 *   • `cond < 64` is exactly **`Condition < 63.5/255 = 0.2490196`**
 *   • the sim's own rule is `Condition < 0.25` (`wear.wreck_threshold`)
 *   ⇒ the two disagree on exactly **[0.249020, 0.25)** — width **0.00098, i.e. 0.098 % of a
 *     machine's life** — and the client is LATE there: a machine in that sliver is already below the
 *     sim's floor and still wearing its clean picture.
 *
 * There is no spelling that removes this — a byte has 256 states and the def is a float — and the
 * alternative (putting the float on the wire) was rejected by the channel for reasons that still
 * hold. What stops the number rotting again is that it is now PINNED rather than published loose:
 * `wear-join.test.js` asserts the boundary and the band exactly, and `DevicesDeltaTests` ties this
 * constant to the def through the HOST'S OWN encoder instead of a JS restatement of it.
 */
export const WRECK_COND_BYTE = Math.round(WRECK_THRESHOLD * 255);

/**
 * Does this `devices`-channel condition byte mean "wear the wrecked twin"? PURE, TOLERANT.
 *
 * ⚠️ ANYTHING THAT IS NOT A NUMBER IS "NOT WRECKED", DELIBERATELY. `null` is what
 * `deviceConditionAt` returns for a tile with no device on it, and `undefined` is what a surface
 * passes when it has no `devices` message yet (first frames, a reconnect, a host too old to send
 * the channel). Every one of those means "I do not know", and the honest picture for "I do not know"
 * is the INTACT one: showing a ship as wrecked because a message has not arrived would be a lie the
 * player cannot distinguish from a raid.
 */
export function isWreckedCond(cond) {
  return typeof cond === 'number' && Number.isFinite(cond) && cond < WRECK_COND_BYTE;
}

/**
 * Does `itemId` have a wrecked twin to wear? PURE, TOLERANT — `false` for an unknown id and for the
 * rows in `NO_WRECKED_TWIN` (`swarf` today).
 */
export function hasWreckedTwin(itemId) {
  return typeof itemId === 'string' && WRECKED[itemId] !== undefined;
}

/**
 * ⇒ THE ENTRY POINT BOTH SURFACES CALL. Build the art for a tile: the piece, or its post-raid twin
 * when the `devices` channel says the machine on that tile is at or below the wreck floor.
 *
 * A DROP-IN FOR `buildItem`, deliberately: same `(itemId, opts)` contract, same tolerance (unknown
 * id ⇒ the neutral placeholder, never a throw), one extra argument. A surface that forgets to pass
 * `cond` renders exactly what it rendered before this module existed, which is the correct failure
 * mode for a package that only ever ADDS a state.
 *
 * @param {string} itemId  a registry id — whatever the surface already resolved from the glyph
 * @param {object} [opts]  forwarded verbatim: `{ w, h, idPrefix, index, state }`
 * @param {number|null|undefined} [cond]  the `devices` channel's `cond` byte for this tile
 * @returns {string} an SVG `<g>…</g>` fragment
 */
export function buildTileItem(itemId, opts = {}, cond = undefined) {
  if (isWreckedCond(cond) && hasWreckedTwin(itemId)) return buildWrecked(itemId, opts);
  return buildItem(itemId, opts);
}

/**
 * Every `DeviceKind` that MORE THAN ONE registry piece claims, as `{ kind: [itemId, …] }`.
 *
 * This exists to be MEASURED, not called by a surface: it is the evidence behind this module's
 * decision not to key the join on the wire's `kind` byte. Non-empty means `DeviceKind → itemId` is
 * not a function and a kind-keyed join would have to guess. Derived from `ITEMS`, so it stays true
 * as the registry moves. PURE.
 */
export function deviceKindsWithSeveralPieces() {
  const by = Object.create(null);
  for (const id of ITEM_IDS) {
    const e = ITEMS[id];
    if (!e || e.kind !== 'functional' || typeof e.deviceKind !== 'string') continue;
    (by[e.deviceKind] || (by[e.deviceKind] = [])).push(id);
  }
  const out = Object.create(null);
  for (const k of Object.keys(by)) if (by[k].length > 1) out[k] = by[k];
  return out;
}
