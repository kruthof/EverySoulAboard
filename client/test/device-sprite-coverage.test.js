// THE GUARD: every glyph the sim can project is either skinned by a real item with a real builder,
// or named in a ledger that only ever shrinks.
//
// WHY IT EXISTS (HANDOVER §4l). Garvin, from a screenshot of the running game: dashed boxes with raw
// ASCII letters where furniture should be — `roomzoom-view.js`'s VS-Z-25 "unknown glyph" chip, a
// development stopgap, shipping to the player. Three `DeviceKind`s had no art on the standard
// surface: `GrowBed` (`"`), `Terminal` (`T`), `Telescope` (`x`) — hydroponics, i.e. the food loop,
// and the door into the entire MOSS CRT. **No test could see it**: the client was emitting *correct*
// text, honestly reporting that it had no art. Nothing threw, nothing was red; it read as wrong only
// when a person looked at the screen.
//
// ⚠️ THE CLAIM THIS FILE SHIPPED WITH WAS FALSE, AND IT IS QUOTED HERE RATHER THAN DELETED. It read:
// *"So the fix is not three sprites, it is this file… The next `DeviceKind` added without art fails
// here instead of shipping a placeholder"*, and the package's commit message said deriving the table
// **"removes the class of bug, not just the three instances"**. **IT DOES NOT.** Independent review
// photographed `--ship grid` deck 0, room STORAGE, *after* this package: **seven dashed unknown chips
// carrying raw ASCII — `,` six times and `f` once.** The owner's exact reported symptom, on the
// owner's ship, on the standard surface, one room away from the three that were fixed.
//
// They are GROUND ITEMS, not devices: `Glyphs.ForItem` (`Regolith ','`, `Potato 'f'`, and four more)
// lands in the *same* `roomCells` → `furnitureSvg` else-branch, and `NON_FURNITURE` filters only
// `'&'` of the seven. A guard that enumerated `ForDevice` alone could not see them **structurally**.
//
// So this file now enumerates **BOTH** switches. `ForDevice` is CLOSED — every kind resolves to art
// or is in `NO_FURNITURE_SPRITE`. `ForItem` is **OPEN AND MEASURED**: ~~no ground item has art, all
// nine are in `NO_GROUND_ITEM_SPRITE`~~, and the count of kinds that visibly chip is pinned by
// equality. That ledger is the gap made mechanical instead of prose — a *new* `ItemKind` cannot join
// it silently, and the number can only be paid down. ~~**Ground-item art is chartered separately and
// is deliberately NOT in this package.**~~
//   ⚠️ THE STRUCK CLAUSES ARE THE STATE OF THIS FILE ON THE DAY IT WAS WRITTEN, kept because the
//   sentence around them still describes the machinery. Ground-item art landed 2026-07-27 (8 pieces)
//   and the swarf pile in W0b, so **9 of the 10 `ItemKind`s have art today and ONE is ledgered**.
//   Re-COUNT that against `EXPECT_GROUND_ITEM_LEDGER` below; never compute it from this paragraph.
//
// ⚠️ IT IS DRIVEN, NOT SCANNED, wherever it can be. `assert(TABLE has key)` is the weak form of this
// guard — it passes for an entry pointing at a builder that does not exist. Every coverage assertion
// below ends in a real `buildItem()` call whose output is compared BYTE-FOR-BYTE against the
// placeholder that `buildItem` returns for an unknown id, so a bad entry fails exactly as loudly as
// a missing one. The C# parse is the one thing that must be a scan (the sim is not importable from
// node), and it is comment-stripped with the SHARED `codeOnly` and carries its own negative controls
// at the bottom of this file — CLAUDE.md trap 1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { codeOnly } from './code-only.js';
import { ITEMS, buildItem, RESOURCE_ITEM_BY_KIND_NAME } from '../src/items/index.js';
import { GLYPH_SUBSTITUTE, GLYPH_TO_ITEM, itemIdForGlyphChar } from '../src/items/glyph-map.js';
import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  itemForGlyph, roomCells, roomTileRect,
  // ⭐ THE PLATE'S OWN VOCABULARY. `DEVICE_KIND_NAMES` is the client's index→name mirror of
  // `sim/Sim.Core/Devices/Device.cs`'s enum (pinned by-name-and-index in `prioritise-menu.test.js`);
  // inverted it gives the BYTE the `devices` channel carries, which is the identity the side
  // elevation resolves a fitting from. `itemForDeviceRow` / `itemIdForStockKind` are the two
  // derivations `ship-fittings.js` runs, imported here so this file drives the SHIPPED route.
  DEVICE_KIND_NAMES, itemForDeviceRow, itemIdForStockKind,
} from '../src/ui/room-model.js';

/** `DeviceKind` NAME → its byte, off the one shipped table. */
const KIND_BYTE = Object.freeze(Object.fromEntries(DEVICE_KIND_NAMES.map((nm, i) => [nm, i])));
import { overviewScene } from '../src/ui/overview-scene.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SIM SIDE, parsed. `sim/Sim.Glyph/Glyphs.cs` is THE authority on which letter stands for
//    which device — its own header says so — and `sim/Sim.Core/Entities/Device.cs` is the authority
//    on which kinds exist. Both are parsed rather than transcribed: a transcription is a fourth hand
//    mirror, which is the defect this package removes.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Brace-matched body of the first `needle … {` block in `src` (comments already stripped). */
function blockAfter(src, needle) {
  const i = src.indexOf(needle);
  if (i < 0) return '';
  const from = src.indexOf('{', i);
  if (from < 0) return '';
  let depth = 0;
  for (let j = from; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(from + 1, j); }
  }
  return '';
}

/**
 * `enum <Name> : byte { Door = 0, … }` → ['Door', 'AirVent', …] in declaration order.
 *
 * ⚠️ THE FIRST VERSION OF THIS FUNCTION HAD A SURVIVOR, and it is quoted because the hole was in the
 * exact case the guard exists for. It matched `/(\w+)\s*=\s*(\d+)\s*,/g` — a member was only seen if
 * it had **both** an explicit `= <digits>` **and** a trailing comma. Measured by independent review,
 * both with the whole suite green: a new `DeviceKind` added as `Ghost = 26` (no trailing comma — it
 * is the last member, so this is the *natural* way to add one) **survived**, and `Ghost,` (implicit
 * value, idiomatic C#) **survived**. Both had a `ForDevice` arm and no art. The same addition written
 * `Ghost = 26,` reddened four tests, which is what proved it a parser hole rather than a dead guard.
 *
 * Now: the value clause is OPTIONAL and not restricted to digits, and a member may be terminated by
 * a comma **or by the end of the enum body** (`blockAfter` returns the body without its closing
 * brace, so end-of-string *is* the closing brace).
 */
export function parseEnumMembers(csSrc, enumName) {
  const body = blockAfter(codeOnly(csSrc), 'enum ' + enumName);
  const out = [];
  const re = /(\w+)\s*(?:=\s*[^,\n}]+?)?\s*(?:,|$)/g;
  for (let m = re.exec(body); m; m = re.exec(body)) out.push(m[1]);
  return out;
}

/** `enum DeviceKind : byte { … }` → its member names. */
export const parseDeviceKinds = (csSrc) => parseEnumMembers(csSrc, 'DeviceKind');
/** `enum ItemKind : byte { … }` → its member names. */
export const parseItemKinds = (csSrc) => parseEnumMembers(csSrc, 'ItemKind');

/** `public const char Foo = 'x';` → { Foo: 'x' }. */
function parseCharConsts(code) {
  const out = Object.create(null);
  const re = /const\s+char\s+(\w+)\s*=\s*'((?:\\.|[^'])+)'\s*;/g;
  for (let m = re.exec(code); m; m = re.exec(code)) out[m[1]] = m[2];
  return out;
}

/**
 * A `Glyphs.For*` switch expression → { EnumMemberName: glyphChar }. Arms are either a char literal
 * (`DeviceKind.AirVent => '^',`) or a named `const char` (`DeviceKind.Door => DoorClosed,`), and the
 * named form is RESOLVED — three of the twenty-six `ForDevice` arms use it, so a parser that skipped
 * it would silently under-report Door, Conduit and Pipe: the exact three the allowlist excuses.
 */
function parseGlyphSwitch(csSrc, header, enumName) {
  const code = codeOnly(csSrc);
  const consts = parseCharConsts(code);
  const body = blockAfter(code, header);
  const out = Object.create(null);
  const re = new RegExp(enumName + '\\.(\\w+)\\s*=>\\s*(?:\'((?:\\\\.|[^\'])+)\'|(\\w+))\\s*(?:,|$)', 'g');
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const lit = m[2];
    const named = m[3];
    if (lit !== undefined) out[m[1]] = lit;
    else if (named !== undefined && consts[named] !== undefined) out[m[1]] = consts[named];
    else out[m[1]] = null; // an arm we could not resolve — reported, never silently dropped
  }
  return out;
}

/** `Glyphs.ForDevice` → { DeviceKindName: glyphChar }. */
export const parseForDevice = (csSrc) =>
  parseGlyphSwitch(csSrc, 'ForDevice(DeviceKind kind) => kind switch', 'DeviceKind');
/** `Glyphs.ForItem` → { ItemKindName: glyphChar } — the GROUND-ITEM half (the §4l-adjacent gap). */
export const parseForItem = (csSrc) =>
  parseGlyphSwitch(csSrc, 'ForItem(ItemKind kind) => kind switch', 'ItemKind');

/**
 * ⚠️ THE SWITCH IS NOT THE POPULATION — `GlyphMapper.DeviceGlyph` OVERRIDES IT (door package,
 * 2026-07-27). This whole file was built on "`Glyphs.ForDevice` is THE authority on which letter
 * stands for which device", which its own header says, and which is FALSE for one kind:
 *
 *     private static char DeviceGlyph(Device device) {
 *         if (device.Kind == DeviceKind.Door) {
 *             if (device.IsLocked) return Glyphs.DoorLocked;      // 'X'  ← not a switch arm
 *             return device.IsOpen ? Glyphs.DoorOpen              // '/'  ← not a switch arm
 *                                  : Glyphs.DoorClosed;           // '+'  ← IS the switch arm
 *         }
 *         return Glyphs.ForDevice(device.Kind);
 *     }
 *
 * So two chars a real device really does put on a real tile were **out of scope of every assertion
 * in this file** — `CLAUDE.md` trap 4, a guard whose scope filter excludes the violation, and this
 * time the excluded thing was already broken: `'+'` drew the VS-Z-25 dashed chip in the shipping
 * game, reachable by pressing the DOOR tool inside a room (`BuildSystem.cs:226` — "the door starts
 * closed"). The allowlist entry that excused `Door` from the guard is what hid it, and its stated
 * justification was false in both halves (see the retraction where that entry used to be).
 *
 * PARSED, NOT TRANSCRIBED, for the same reason everything else here is: a transcription is a hand
 * mirror, and a hand mirror is the defect. `DeviceGlyph`'s body is brace-matched out of
 * `GlyphMapper.cs` and every `Glyphs.<Const>` reference in it is resolved against `Glyphs.cs`'s own
 * `const char` declarations, so a fourth door state — or a second kind that grows a state override —
 * joins the guarded population by existing.
 * @returns {string[]} the glyph chars `DeviceGlyph` can return without consulting `ForDevice`
 */
export function parseDeviceGlyphOverrides(mapperSrc, glyphsSrc) {
  const byKind = parseDeviceGlyphOverridesByKind(mapperSrc, glyphsSrc);
  const out = [];
  for (const chars of Object.values(byKind)) for (const c of chars) if (!out.includes(c)) out.push(c);
  return out;
}

/**
 * The same population, ATTRIBUTED TO ITS KIND — `{ Door: ['X','/','+'], CryoPod: ['k','K'] }`.
 *
 * ⚠️ WHY THIS EXISTS, AND IT IS THE DOOR LESSON ARRIVING FROM THE OTHER SIDE. `DeviceGlyph` is now
 * a two-kind switch: the wreck start's `DeviceKind.CryoPod` projects `'k'` for an OPEN capsule and
 * `'K'` for an occupied one, and the warm set ships a separate piece for each. So for the first
 * time a state glyph is claimed by a real `ITEMS` row rather than by a `GLYPH_SUBSTITUTE` entry —
 * and two guards below compared a row's glyph against `Glyphs.ForDevice[kind]`, the kind's REST
 * glyph, which `'k'` is not. Both went red on a CORRECT registry. That is the shape
 * `GLYPH_SUBSTITUTE`'s own test already records in its header: *"A guard that cannot express the
 * fix is part of the bug."*
 *
 * PARSED, NOT TRANSCRIBED, like everything else here. The attribution rule is positional: every
 * `Glyphs.<Const>` in `DeviceGlyph`'s body belongs to the most recent `DeviceKind.<Name>` before
 * it, which is exactly how the shipped body reads (one `if (device.Kind == DeviceKind.X)` guard per
 * kind, then its chars). `Glyphs.ForDevice(device.Kind)` at the tail contributes nothing: `ForDevice`
 * is not a `const char`, and `device.Kind` has no dot after `Kind` so it cannot re-bind the kind.
 * A future body that interleaves kinds differently would need this rule revisited — which is why
 * the rule is written down here rather than left implicit.
 * @returns {Object<string,string[]>} DeviceKind name → the glyph chars it can project from state
 */
export function parseDeviceGlyphOverridesByKind(mapperSrc, glyphsSrc) {
  const consts = parseCharConsts(codeOnly(glyphsSrc));
  const body = blockAfter(codeOnly(mapperSrc), 'char DeviceGlyph(Device device)');
  const out = Object.create(null);
  let kind = null;
  const re = /DeviceKind\.(\w+)|Glyphs\.(\w+)/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m[1] !== undefined) { kind = m[1]; continue; }
    const v = consts[m[2]];
    if (typeof v !== 'string' || v.length !== 1 || kind === null) continue;
    if (out[kind] === undefined) out[kind] = [];
    if (!out[kind].includes(v)) out[kind].push(v);
  }
  return out;
}

const DEVICE_CS = read('sim/Sim.Core/Entities/Device.cs');
const ITEM_CS = read('sim/Sim.Core/Entities/ItemStack.cs');
const GLYPHS_CS = read('sim/Sim.Glyph/Glyphs.cs');
const MAPPER_CS = read('sim/Sim.Glyph/GlyphMapper.cs');
const DEVICE_KINDS = parseDeviceKinds(DEVICE_CS);
const ITEM_KINDS = parseItemKinds(ITEM_CS);
const FOR_DEVICE = parseForDevice(GLYPHS_CS);
const FOR_ITEM = parseForItem(GLYPHS_CS);
/** The state chars `GlyphMapper.DeviceGlyph` returns instead of calling `ForDevice`. */
const DEVICE_GLYPH_OVERRIDES = parseDeviceGlyphOverrides(MAPPER_CS, GLYPHS_CS);
/** The same, attributed to the kind that projects them: `{ Door: [...], CryoPod: [...] }`. */
const DEVICE_GLYPH_OVERRIDES_BY_KIND = parseDeviceGlyphOverridesByKind(MAPPER_CS, GLYPHS_CS);
/**
 * EVERY glyph a device can put on a tile: the switch's arms PLUS the mapper's state overrides.
 * This is the population the art standard is held against, and the union is the whole fix.
 */
const PROJECTED_DEVICE_GLYPHS = [...new Set([
  ...Object.values(FOR_DEVICE).filter((g) => typeof g === 'string' && g.length === 1),
  ...DEVICE_GLYPH_OVERRIDES,
])];

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE ALLOWLIST — kinds with NO furniture sprite, and why. IT ONLY EVER SHRINKS.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * `DeviceKind`s the SVG surfaces are allowed not to skin as furniture, each with the layer that
 * draws it instead. Three entries, all structural: they are not objects standing in a room, they are
 * parts of the room. Nothing here is "we have not got round to it".
 *
 * ⚠️ ADDING A NAME IS A DECISION, NOT A CHORE — it says "this device is drawn by another layer", and
 * it belongs in a commit message. If the honest reason is "no art yet", the fix is the art (or a
 * named stand-in in `GLYPH_SUBSTITUTE`), because an unlisted kind is what the player sees as a
 * dashed box with a letter in it. The size is pinned by equality below so the list cannot grow
 * quietly; removing an entry means that kind grew a real piece.
 */
const NO_FURNITURE_SPRITE = Object.freeze({
  // ⚠️ `Door` WAS HERE AND IS GONE (door package, 2026-07-27). The entry is not deleted quietly,
  // because it is the reason a LIVE bug shipped and stayed invisible, and BOTH halves of its stated
  // justification were false. It read:
  //
  //   *"Doors ride glyphs '+' (closed) / '/' (open) / 'X' (locked) and are drawn by the Room Zoom's
  //   STRUCTURE layer and the Overview's wall layer, from the frame's own wall/door codes… Measured
  //   on `--ship grid` deck 0: zero such tiles today (the ship's doors sit on room boundaries, which
  //   are outside every room rect), which is why it is latent and not a live bug."*
  //
  //   (1) THERE IS NO SUCH LAYER, on either surface. The Room Zoom's "structure layer" is
  //       `roomMaterialTiles` → `materialLayerSvg`, which emits `kind:'wall'` for glyph 35 and
  //       `kind:'floor'` for glyph 46 and nothing else. The Overview's compartments are drawn from
  //       the `decks` slot rects and never from frame codes. NOTHING drew a door, so "it would draw
  //       TWICE" was backwards: it drew a dashed chip, or nothing.
  //   (2) THERE ARE NOT ZERO SUCH TILES. Driven over the committed `--ship grid` capture
  //       (`client/test/fixtures/overview-grid.json`): deck 0 carries **8 door tiles and all 8 are
  //       inside a room rect**; deck 1 the same 8, of which **3 are CLOSED (`'+'`)**. Every room's
  //       door sits on that room's own rect edge — the "doors sit on room boundaries" premise
  //       describes the WALL, not the rect. Pinned by `parseDeviceGlyphOverrides`' census test.
  //   (3) And it is reachable by a first-class player gesture, which is what makes it live rather
  //       than a fixture curiosity: the DOOR tool is on the Room Zoom palette, and
  //       `sim/Sim.Core/Systems/BuildSystem.cs:226` says in its own comment "the door starts
  //       closed". Build a door inside a room ⇒ a dashed box with a `+` in it.
  //
  // `Door` is now COVERED like every other kind: `'+'` → `sliding-door` (an ordinary `ForDevice`
  // claim in `ITEMS`), `'X'` → `blast-door` via `GLYPH_SUBSTITUTE`, `'/'` deliberately unskinned and
  // ledgered in `NO_DEVICE_GLYPH_ART` below. Because `sliding-door` is a `functional` row rather
  // than an empty `itemId`, `furnitureSvg`'s ground-stack suppression no longer applies to it, so
  // the second harm the old entry recorded — a stack on a door tile erasing the chip and leaving
  // nothing — is closed by the same change and not by narrowing the suppression.
  //
  // Conduit and Pipe share the glyph '~' — an intentional, documented collision in Glyphs.cs (they
  // are the same service-tray line). They are UTILITY-LENS OVERLAYS, drawn only under a lens, never
  // as an object on a tile; `power-conduit` / `pipe-run` therefore stay at `glyph: null` too. A
  // single glyph could not disambiguate them even if the furniture layer wanted to.
  Conduit: 'utility-lens overlay line, shares glyph ~ with Pipe',
  Pipe: 'utility-lens overlay line, shares glyph ~ with Conduit',
});

/**
 * Projected device GLYPHS that are deliberately unskinned, keyed by the char rather than by
 * `DeviceKind` — because the population this draws from is `GlyphMapper.DeviceGlyph`'s state arms,
 * and one kind can put three chars on a tile which are three separate decisions.
 *
 * ⚠️ EVERY ENTRY IS "DRAWING NOTHING IS THE CORRECT DRAWING", never "no art yet". A kind with no art
 * belongs in `GLYPH_SUBSTITUTE` with a named stand-in, or gets a piece. Size pinned by equality.
 */
const NO_DEVICE_GLYPH_ART = Object.freeze({
  // Door, OPEN. `'/'` (47) is in `NON_FURNITURE` on both surfaces, so the Room Zoom's wall run
  // (`materialLayerSvg`, glyph 35 only) simply has a HOLE where the door tile is — which is the
  // truth about a tile a crew member walks through. A leaf drawn there would assert the door is shut.
  //
  // THE ASYMMETRY IS THE FEATURE and it is why `'/'` was not taken out of `NON_FURNITURE` when `'+'`
  // got art: closed draws a leaf, open draws a hole, so a player can see at a glance which doors are
  // shut. "Make the sets agree" by adding 43 and 88 to `NON_FURNITURE` would have made all three
  // states draw nothing, i.e. it would have shipped the closed-door tile as silently empty.
  '/': 'an OPEN doorway is a gap; the wall run correctly shows a hole through it. The closed and '
    + 'locked states carry the art (sliding-door, blast-door), so shut vs open stays legible.',
});

/**
 * `ItemKind`s with NO ground-item sprite — THE OPEN GAP, made mechanical.
 *
 * ⚠️ THIS LEDGER IS NOT LIKE `NO_FURNITURE_SPRITE`. Every entry there is "another layer draws this".
 * Every entry HERE is **"the player sees a dashed box with a raw letter in it"**, six times out of
 * seven, right now, on `--ship grid`. It is written down because independent review photographed
 * room STORAGE on deck 0 after this package landed and counted **seven chips: `,` ×6 and `f` ×1**.
 * Ground-item art is chartered separately and is deliberately not in this package; what this ledger
 * buys is that the gap is COUNTED rather than described, and that a NEW `ItemKind` cannot join it
 * silently — it would have to be added here, by name, in a commit.
 *
 * `chips: true` means the tile draws the VS-Z-25 unknown chip in the Room Zoom today (and nothing at
 * all on the Overview, which `continue`s instead). The count of `chips: true` entries is pinned by
 * equality below, so this ledger only ever pays DOWN.
 *
 * ⚠️ NOTE 2026-07-27, THE `items` CHANNEL THEN THE GROUND-ITEM ART — THE SYMPTOM HAS MOVED TWICE.
 * This ledger's headline sentence ("the player sees a dashed box with a raw letter in it") is now
 * true only where the `items` channel reports NOTHING. On a tile the channel does cover, the Room
 * Zoom draws the kind's real SPRITE with a count badge beside it, and `roomzoom-view.js`'s
 * `furnitureSvg` suppresses the letter chip underneath it (`itemStackTileKeys`) so the two do not
 * stack. Since a ground stack is exactly what puts a ground-item glyph in the frame, in practice that
 * is most of them on a live host. The LABEL PLATE the `items` channel shipped is no longer the normal
 * case: it survives DEMOTED to the no-art fallback — a kind with no piece (MetalOre) or a kind byte
 * from a newer host — which is precisely the population this ledger counts.
 *
 * NOTHING BELOW MOVES, and the reason is worth stating rather than assuming: every `chips` value
 * here is measured by DRIVING `roomCells` — the frame-derived model, which neither the `items`
 * package nor the art package touched — so it still answers "does this glyph reach the unknown-chip
 * branch?", which is still exactly the ART question. The item layer is a different layer with a
 * different source. The gap this ledger counts is "no ground-pile piece exists in the warm set", and
 * no channel can pay that down; only art can — and the art package did, for eight of the nine.
 */
const NO_GROUND_ITEM_SPRITE = Object.freeze({
  // ⚠️ ONE ENTRY LEFT, AND IT IS NOT A BACKLOG ITEM. `ItemKind.MetalOre` has **ZERO references
  // anywhere in `sim/` outside the glyph table and the enum declaration itself** — measured on this
  // tree, not assumed: no production node makes it, no recipe consumes it, no authored ship spawns
  // it, no system names it. It is dead E3 mining vocabulary. Giving it art would assert that the
  // game has an ore economy, which it does not, and would then make the drawing of a real ore — when
  // E3 decides what one IS — a redraw rather than a decision. The mock's own header says the same
  // ("There is deliberately NO MetalOre piece"). It therefore chips, and that is correct: a kind the
  // sim can project but nothing can create is exactly the case the dashed chip was invented for.
  // ⚠️ `Swarf` STOOD HERE AS A SECOND ENTRY AND IS NOW PAID DOWN (W0b, 2026-07-28), quoted rather
  // than deleted because the ledger's shrink/grow history is the record of what was DECIDED. It read:
  // *"REAL AND UNSKINNED, not dead vocabulary: DeconstructSystem creates Swarf on every wreck strip
  // and MaintenanceSystem consumes it, so a player WILL see this chip — on the wreck start,
  // constantly. The piece is OWED AND UNOWNED … Draw it and delete this entry."* It was the FIRST
  // entry ever added to a ledger documented as only shrinking, and it lasted one day.
  // `client/src/items/resources.js` now carries a `swarf` builder and `ITEMS` a `swarf` row, so `'w'`
  // resolves through the ordinary `deriveGlyphToItem` path and nothing about the ledger's machinery
  // changed — which is the whole reason the derivation was built.
  MetalOre: {
    glyph: 'o',
    chips: true,
    why: 'DEAD VOCABULARY, not missing art: ItemKind.MetalOre has zero references anywhere in sim/ '
      + 'outside Glyphs.ForItem and the enum itself — nothing produces or consumes it. Deliberately '
      + 'unskinned until E3 makes ore real; drawing it would assert an economy that does not exist.',
  },
});


/**
 * The DeviceKinds this file holds to the art standard. Kinds in the allowlist are excused; kinds
 * whose `ForDevice` arm did not RESOLVE are excluded too, and that exclusion is deliberate — see the
 * test immediately below, which is what fails for them.
 *
 * ⚠️ WHY THE SECOND FILTER EXISTS (found in review, `CLAUDE.md` trap 4). Without it, a kind with no
 * arm left `FOR_DEVICE[k] === undefined` and three driven tests died on
 * `TypeError: Cannot read properties of undefined (reading 'charCodeAt')`. The named guard still
 * fired, so the guard bit — but three of the failures were CRASHES wearing the costume of semantic
 * REDs, which is precisely the failure mode a harness must not produce. A missing arm is now
 * reported by exactly one test, by name, and every driven test below stays a semantic assertion.
 */
const COVERED = DEVICE_KINDS.filter(
  (k) => !(k in NO_FURNITURE_SPRITE) && typeof FOR_DEVICE[k] === 'string' && FOR_DEVICE[k].length === 1,
);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. NON-VACUITY. Every assertion below is over a parsed set; a parser that silently returned
//    nothing would make the whole file pass while proving nothing. This runs first and by name.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ THESE THREE COUNTS ARE PINNED BY EQUALITY, NOT BY A `>=` FLOOR, and the change is the whole
// point of the fix. They shipped as `>= 26` / `>= 26` / `>= 23`, and a floor is satisfied by a
// CORRELATED parse failure: grow the enum to 27 and drop one kind *and* its arm together, and every
// floor still holds while the guard silently stops covering something. Independent review measured
// exactly that surviving. Both ledgers in this same file were already pinned by equality; the parse
// counts were not, and the inconsistency was the tell.
//
// A sim that legitimately adds a DeviceKind now fails here FIRST, with instructions. That is
// intended: adding a kind is the moment to decide whether it has art.
// The wave moved all five. DEVICE side (E0-7 only): DeviceKind gained IceMelter (byte 26, so 27
// members). The melter is COVERED, not allowlisted — it wears the COOKER piece through
// GLYPH_SUBSTITUTE (see glyph-map.js for why that piece and not another).
// ITEM side (both lanes): ItemKind gained Seals (7, E0-6) and Ice (8, E0-7), so 9 members. BOTH are
// GROUND ITEMS and both join the NO_GROUND_ITEM_SPRITE ledger below: ground-item art is a separately
// chartered package and the warm set has no loose-pile builder at all, so each would have been drawn
// as a dashed letter box either way.
// The door package retired the `Door` allowlist entry, so COVERED went 24 → 25 (27 kinds − 2
// allowlisted). `EXPECT_FOR_DEVICE_ARMS` did NOT move and that is the point of the package: the
// switch always had 27 arms, and two of the glyphs a device can project were never in any of them.
// The wreck start (W3) added `DeviceKind.CryoPod` (byte 27, so 28 members) with a `ForDevice` arm
// and a two-state override in `GlyphMapper.DeviceGlyph`, and gave BOTH its chars real art
// (`cryo-capsule-occupied` → 'K', `cryo-capsule-open` → 'k'), so nothing joined a ledger.
// M3-10 added `DeviceKind.Heater` (byte 28, so 29 members) with a `ForDevice` arm giving it `'E'`
// and NO state override. It joins no ledger and needed no new art: `ITEMS['space-heater']` was drawn
// for exactly this kind (`deviceKind: 'Heater'`) and sat unreachable with `glyph: null` until the
// enum member existed, so this is the one addition so far that PAID DOWN unreached art instead of
// spending a stand-in. `EXPECT_COVERED` moves with the kind count; the two allowlisted kinds
// (Conduit, Pipe) are unchanged.
const EXPECT_DEVICE_KINDS = 29;
const EXPECT_FOR_DEVICE_ARMS = 29;
const EXPECT_COVERED = 27;    // 29 kinds − 2 allowlisted (Conduit, Pipe)
// `GlyphMapper.DeviceGlyph`'s state overrides: Door 'X' locked, '/' open, '+' closed; CryoPod 'k'
// open, 'K' occupied. Equality, not a floor — a floor is satisfied by a parser that finds the block
// and resolves nothing.
const EXPECT_DEVICE_GLYPH_OVERRIDES = 5;
// Projected device glyphs = 29 arms, of which Conduit and Pipe share '~' (28 distinct) and Door's
// '+' and CryoPod's 'K' are among them, PLUS the three override chars 'X', '/' and 'k' that are in
// no arm at all. (M3-10's Heater contributes one arm and one distinct char, 'E', and no override —
// its state lives in Powered/Condition, which the projection already colours rather than respells.)
const EXPECT_PROJECTED_DEVICE_GLYPHS = 31;
const EXPECT_DEVICE_GLYPH_LEDGER = 1;   // '/' alone — an open doorway is a gap
const EXPECT_ITEM_KINDS = 10;
const EXPECT_FOR_ITEM_ARMS = 10;
// The ledger below, pinned SEPARATELY from the enum size since the ground-item art landed. Those two
// numbers were the same while NOTHING had art and one constant did both jobs — which meant "the sim
// grew a kind" and "a kind lost its excuse" were indistinguishable. They are different facts and they
// move for opposite reasons, so they are different constants.
const EXPECT_GROUND_ITEM_LEDGER = 1;   // MetalOre alone — see its entry's own reason

const COUNT_MOVED = (what, n, expected) =>
  `${what.toUpperCase()} COUNT MOVED: parsed ${n}, expected exactly ${expected}.\n` +
  'This is an EQUALITY pin, deliberately — a `>=` floor is satisfied by a correlated parse failure\n' +
  '(enum grows by one, one kind silently stops being seen, floor still holds).\n' +
  'TWO CASES:\n' +
  '  (1) THE SIM REALLY GREW. Good — that is the moment to decide whether the new kind has art.\n' +
  '      Give it art (or a ledger entry with a reason), then raise this constant in the SAME commit.\n' +
  '  (2) THE PARSER BROKE. It has form: the first version of `parseEnumMembers` required BOTH an\n' +
  '      explicit `= <digits>` AND a trailing comma, so `Ghost = 26` (last member, no comma) and\n' +
  '      `Ghost,` (implicit value) were both invisible — with the whole suite green.';

test('the C# parse is non-vacuous and resolves the named-const arms', () => {
  assert.equal(DEVICE_KINDS.length, EXPECT_DEVICE_KINDS,
    COUNT_MOVED('DeviceKind', DEVICE_KINDS.length, EXPECT_DEVICE_KINDS));
  assert.ok(DEVICE_KINDS.includes('GrowBed') && DEVICE_KINDS.includes('Terminal')
    && DEVICE_KINDS.includes('Telescope'), 'the three §4l kinds are missing from the parse');

  const arms = Object.keys(FOR_DEVICE);
  assert.equal(arms.length, EXPECT_FOR_DEVICE_ARMS,
    COUNT_MOVED('ForDevice arm', arms.length, EXPECT_FOR_DEVICE_ARMS));

  // The three NAMED-const arms, resolved through `const char` declarations elsewhere in the file. A
  // parser that dropped them would leave Door/Conduit/Pipe unresolved and the allowlist would then
  // be excusing kinds that were never even measured.
  assert.equal(FOR_DEVICE.Door, '+', 'DeviceKind.Door => DoorClosed did not resolve');
  assert.equal(FOR_DEVICE.Conduit, '~', 'DeviceKind.Conduit => Conduit did not resolve');
  assert.equal(FOR_DEVICE.Pipe, '~', 'DeviceKind.Pipe => Pipe did not resolve');

  // Spot-checks against the sim's own literals, including the one that is a double-quote inside a
  // C# char literal — the char that broke every naive comment stripper this repo has written.
  assert.equal(FOR_DEVICE.GrowBed, '"');
  assert.equal(FOR_DEVICE.Terminal, 'T');
  assert.equal(FOR_DEVICE.Telescope, 'x');
  assert.equal(FOR_DEVICE.Scrubber, 'S');

  for (const [k, g] of Object.entries(FOR_DEVICE)) {
    assert.ok(typeof g === 'string' && g.length === 1, `ForDevice arm ${k} did not resolve to a char`);
  }
  assert.equal(COVERED.length, EXPECT_COVERED, COUNT_MOVED('covered kind', COVERED.length, EXPECT_COVERED));

  // …and the ITEM half, parsed the same way from the same file. `ForItem` has no named-const arms.
  assert.equal(ITEM_KINDS.length, EXPECT_ITEM_KINDS,
    COUNT_MOVED('ItemKind', ITEM_KINDS.length, EXPECT_ITEM_KINDS));
  const iArms = Object.keys(FOR_ITEM);
  assert.equal(iArms.length, EXPECT_FOR_ITEM_ARMS,
    COUNT_MOVED('ForItem arm', iArms.length, EXPECT_FOR_ITEM_ARMS));
  assert.equal(FOR_ITEM.Regolith, ',');
  assert.equal(FOR_ITEM.Potato, 'f');
  assert.equal(FOR_ITEM.Corpse, '&');
  for (const [k, g] of Object.entries(FOR_ITEM)) {
    assert.ok(typeof g === 'string' && g.length === 1, `ForItem arm ${k} did not resolve to a char`);
  }
});

// ⚠️ NON-VACUITY BY INCLUSION, NOT BY COUNT (`CLAUDE.md` trap 4's own countermeasure). The three
// legs below do not merely check that `parseDeviceGlyphOverrides` found SOMETHING — they name the
// two chars that were out of scope before this package and require both to be present, and they
// require the union to actually contain them. A population count would be satisfied by a parser that
// found `'+'` three times.
//
// THE LEGS ARE INDEPENDENT ON PURPOSE (`CLAUDE.md` trap 5 — `assert` throws, so only the first
// failing leg of a multi-leg test reports). Each is its own `test()` so each can fire alone.
test('parseDeviceGlyphOverrides finds the door states GlyphMapper returns instead of ForDevice', () => {
  assert.equal(DEVICE_GLYPH_OVERRIDES.length, EXPECT_DEVICE_GLYPH_OVERRIDES,
    COUNT_MOVED('DeviceGlyph override', DEVICE_GLYPH_OVERRIDES.length, EXPECT_DEVICE_GLYPH_OVERRIDES)
    + '\n\nA THIRD CASE HERE: `GlyphMapper.DeviceGlyph` was renamed or its body restructured, and\n'
    + 'the block match silently returned nothing. That would put every door state back out of scope\n'
    + 'of this whole file, which is the bug the door package fixed.');
  for (const g of ['X', '/', '+']) {
    assert.ok(DEVICE_GLYPH_OVERRIDES.includes(g),
      `the parse lost ${JSON.stringify(g)}. GlyphMapper.cs's DeviceGlyph returns Glyphs.DoorLocked / `
      + 'DoorOpen / DoorClosed; each must resolve through Glyphs.cs\'s `const char` declarations.');
  }
});

test('the guarded population is the UNION — the two chars no ForDevice arm carries are IN it', () => {
  // The whole defect in one assertion. `'X'` and `'/'` are glyphs a real device puts on a real tile
  // and they are in NO switch arm, so every guard in this file whose population was `FOR_DEVICE`
  // could not see them.
  const arms = new Set(Object.values(FOR_DEVICE));
  for (const g of ['X', '/']) {
    assert.ok(!arms.has(g),
      `${JSON.stringify(g)} is now a ForDevice arm. The union below is then redundant for it — but `
      + 'do NOT delete the union: check whether the sim moved the state switch into Glyphs.cs.');
    assert.ok(PROJECTED_DEVICE_GLYPHS.includes(g),
      `${JSON.stringify(g)} is missing from PROJECTED_DEVICE_GLYPHS — the union is not being taken.`);
  }
  assert.equal(PROJECTED_DEVICE_GLYPHS.length, EXPECT_PROJECTED_DEVICE_GLYPHS,
    COUNT_MOVED('projected device glyph', PROJECTED_DEVICE_GLYPHS.length, EXPECT_PROJECTED_DEVICE_GLYPHS));
});

test('EVERY projected device glyph is skinned or ledgered — the guard the Door entry escaped', () => {
  // The coverage assertion re-pointed at the RIGHT population. `COVERED` iterates DeviceKinds and so
  // can only ever ask about one glyph per kind; this iterates GLYPHS, which is what a tile carries.
  const unskinned = [];
  for (const g of PROJECTED_DEVICE_GLYPHS) {
    if (g in NO_DEVICE_GLYPH_ART) continue;
    // Conduit/Pipe's '~' is excused by DeviceKind, not by glyph — both kinds are allowlisted.
    // ⚠️ `kindsFor.length &&` is load-bearing: an OVERRIDE char ('X', '/') is projected by no switch
    // arm at all, so a bare `.every()` over an empty list is vacuously true and would skip exactly
    // the two glyphs this test exists for.
    const kindsFor = Object.keys(FOR_DEVICE).filter((k) => FOR_DEVICE[k] === g);
    if (kindsFor.length && kindsFor.every((k) => k in NO_FURNITURE_SPRITE)) continue;
    const id = itemIdForGlyphChar(g);
    if (!id) { unskinned.push(`${JSON.stringify(g)}: nothing claims it`); continue; }
    // DRIVEN, not "the table has a key": call the real builder and reject the neutral placeholder.
    const svg = buildItem(id, OPTS);
    if (svg === PLACEHOLDER) unskinned.push(`${JSON.stringify(g)} → "${id}": PLACEHOLDER`);
  }
  assert.deepEqual(unskinned, [],
    'PROJECTED DEVICE GLYPH WITH NO ART: ' + unskinned.join('; ') + '\n' +
    "This is the guard the old `Door` allowlist entry escaped. `'+'` (a door the player just built,\n" +
    'which BuildSystem starts CLOSED) drew the VS-Z-25 dashed chip in the shipping game.');
});

test('the device-glyph ledger is real, justified, and pinned to its size', () => {
  for (const [g, why] of Object.entries(NO_DEVICE_GLYPH_ART)) {
    assert.ok(PROJECTED_DEVICE_GLYPHS.includes(g),
      `STALE LEDGER ENTRY ${JSON.stringify(g)} — no device projects that glyph. Delete the line.`);
    assert.ok(!itemIdForGlyphChar(g),
      `LEDGER ENTRY ${JSON.stringify(g)} now resolves to "${itemIdForGlyphChar(g)}". It is skinned; ` +
      'the ledger has gone stale — delete the line.');
    assert.ok(typeof why === 'string' && why.length > 20,
      `ledger entry ${JSON.stringify(g)} has no real justification`);
  }
  assert.equal(Object.keys(NO_DEVICE_GLYPH_ART).length, EXPECT_DEVICE_GLYPH_LEDGER,
    'NO_DEVICE_GLYPH_ART CHANGED SIZE. Every entry claims DRAWING NOTHING IS CORRECT for that glyph.\n'
    + 'Adding one is a decision for a commit message; "no art yet" is not a reason and belongs in\n'
    + 'GLYPH_SUBSTITUTE with a stand-in instead.');
});

test('no glyph means BOTH a device and a ground item', () => {
  // A frame cell carries ONE glyph, so a shared char would leave the client unable to say which of
  // the two a tile is. It holds today (device glyphs are upper-case where the item ones are lower:
  // 'S' Scrubber vs 's' Scrap, 'P' PlantPot vs 'p' Parts, 'C' MedCabinet vs 'c' ControllerModule,
  // 'F' Fabricator vs 'f' Potato, 'O' WaterTank vs 'o' MetalOre) — and it holds by CONVENTION, which
  // is exactly the kind of thing that stops holding without anyone deciding to break it.
  const dev = new Set(Object.values(FOR_DEVICE));
  const clash = Object.entries(FOR_ITEM).filter(([, g]) => dev.has(g));
  assert.deepEqual(clash, [],
    'GLYPH CLAIMED BY A DEVICE **AND** AN ITEM: ' + JSON.stringify(clash) + '\n' +
    'One frame cell carries one glyph. The client cannot tell the two apart, and whichever the\n' +
    'furniture layer skins will be wrong half the time.');
});

test('every DeviceKind has a ForDevice arm — none falls through to the "?" fallback', () => {
  const missing = DEVICE_KINDS.filter((k) => !(k in FOR_DEVICE));
  assert.deepEqual(missing, [],
    'DEVICE KIND WITH NO GLYPH: ' + missing.join(', ') + '\n' +
    'Glyphs.ForDevice ends in `_ => \'?\'`, so a kind with no switch arm projects a literal question\n' +
    'mark onto the map and the client can only draw it as an unknown chip. Give it an arm in\n' +
    'sim/Sim.Glyph/Glyphs.cs (and art, or an entry in the allowlist in this file).');
});

test('the allowlist is real, justified, and pinned to its size', () => {
  for (const [name, why] of Object.entries(NO_FURNITURE_SPRITE)) {
    assert.ok(DEVICE_KINDS.includes(name),
      `STALE ALLOWLIST ENTRY "${name}" — no such DeviceKind. Delete the line.`);
    assert.ok(typeof why === 'string' && why.length > 20,
      `allowlist entry "${name}" has no real justification — say which layer draws it`);
  }
  // PINNED BY EQUALITY so the ledger cannot grow quietly (the house pattern: KNOWN_GAPS in
  // surface-boundary.test.js, ClientlessChannelAllowlist in SurfaceBoundaryTests.cs).
  // 3 → 2: the door package retired `Door`. It is the first entry this ledger has ever paid down,
  // and it was paid down by giving the kind art, which is exit (1) below.
  assert.equal(Object.keys(NO_FURNITURE_SPRITE).length, 2,
    'THE NO-FURNITURE ALLOWLIST CHANGED SIZE.\n' +
    'It only ever shrinks. If you removed an entry because that kind grew a real piece — lower this\n' +
    'number in the same commit. If you ADDED one, stop: the two legitimate exits are (1) give the\n' +
    'kind art (a builder in client/src/items/objects.js + a glyph on its ITEMS row), or (2) name a\n' +
    'stand-in in GLYPH_SUBSTITUTE (client/src/items/glyph-map.js). An unlisted, unskinned kind is\n' +
    'what the player sees as a dashed box with a raw letter in it — HANDOVER §4l.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3b. THE GROUND-ITEM GAP — every ItemKind accounted for, and the damage COUNTED.
//     This half is OPEN by charter. What it must never be again is invisible.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('EVERY ItemKind is accounted for — skinned, or named in the ledger', () => {
  const unaccounted = ITEM_KINDS.filter((k) => !(k in NO_GROUND_ITEM_SPRITE) && !itemIdForGlyphChar(FOR_ITEM[k]));
  assert.deepEqual(unaccounted, [],
    'ITEM KIND WITH NO ART AND NO LEDGER ENTRY: ' + unaccounted.join(', ') + '\n\n' +
    'A ground item with no art draws the SAME VS-Z-25 dashed chip a device with no art draws — the\n' +
    'symptom the owner reported (HANDOVER §4l), from the other switch. `Glyphs.ForItem` is as much a\n' +
    'source of on-map glyphs as `Glyphs.ForDevice`.\n\n' +
    'TWO EXITS: give it art (a builder + an ITEMS row carrying the glyph), or add it to\n' +
    'NO_GROUND_ITEM_SPRITE in this file with a per-entry reason and whether it chips. The ledger is\n' +
    'pinned by equality, so adding an entry is a decision someone has to write down.');

  for (const [name, e] of Object.entries(NO_GROUND_ITEM_SPRITE)) {
    assert.ok(ITEM_KINDS.includes(name), `STALE GROUND-ITEM LEDGER ENTRY "${name}" — no such ItemKind.`);
    assert.equal(e.glyph, FOR_ITEM[name],
      `ledger says ${name} rides ${JSON.stringify(e.glyph)}, Glyphs.ForItem says ${JSON.stringify(FOR_ITEM[name])}`);
    assert.ok(typeof e.why === 'string' && e.why.length > 20, `ledger entry "${name}" has no real reason`);
    assert.equal(itemIdForGlyphChar(e.glyph), '',
      `LEDGER IS STALE: ${name} (${JSON.stringify(e.glyph)}) now HAS art (${itemIdForGlyphChar(e.glyph)}). ` +
      'Delete the line and lower the pinned counts — this ledger only shrinks.');
  }
  assert.equal(Object.keys(NO_GROUND_ITEM_SPRITE).length, EXPECT_GROUND_ITEM_LEDGER,
    'THE GROUND-ITEM LEDGER CHANGED SIZE. It went 9 → 1 when the ground-item art landed (MetalOre\n' +
    'stayed, and it is not a backlog item — nothing in sim/ produces or consumes that kind), then\n' +
    '1 → 2 when the wreck start added Swarf, then 2 → 1 the next day when W0b DREW the swarf pile.\n' +
    'Growing it is the exception, not the rule. If you are ADDING one, the\n' +
    'question the ledger exists to force is: does this kind exist in the game, or only in the enum?');
});

// THE OTHER DIRECTION, and it is the one that pays the ledger down rather than merely counting it: an
// ItemKind that is NOT in the ledger must resolve to real art, DRIVEN through the real builder — not
// "the table has a key". `buildItem` returns the neutral "?" placeholder for an id that is not in the
// registry, byte-for-byte, so an entry pointing at a builder that does not exist fails exactly as
// loudly as a missing one.
test('EVERY skinned ItemKind builds REAL art (driven through buildItem)', () => {
  const skinned = ITEM_KINDS.filter((k) => !(k in NO_GROUND_ITEM_SPRITE));
  assert.equal(skinned.length, EXPECT_ITEM_KINDS - EXPECT_GROUND_ITEM_LEDGER,
    'the skinned set changed size — re-count the ledger pins together');
  const broken = [];
  for (const kind of skinned) {
    const glyph = FOR_ITEM[kind];
    const itemId = itemIdForGlyphChar(glyph);
    if (!itemId) { broken.push(`${kind} (glyph ${JSON.stringify(glyph)}): no item claims this glyph`); continue; }
    const entry = ITEMS[itemId];
    if (!entry) { broken.push(`${kind} → "${itemId}": no such entry in ITEMS`); continue; }
    if (entry.kind !== 'resource') {
      broken.push(`${kind} → "${itemId}": skinned by a ${entry.kind} piece, not a resource one`);
      continue;
    }
    if (entry.itemKind !== kind) {
      broken.push(`${kind} → "${itemId}": the row says itemKind ${JSON.stringify(entry.itemKind)}`);
      continue;
    }
    const svg = buildItem(itemId, OPTS);
    if (svg === PLACEHOLDER) { broken.push(`${kind} → "${itemId}": buildItem returned the PLACEHOLDER`); continue; }
    if (!svg.includes('<g class="pl-item">') || svg.length < 80) {
      broken.push(`${kind} → "${itemId}": buildItem returned no real fragment (${svg.length} chars)`);
    }
  }
  assert.deepEqual(broken, [],
    'ITEM KIND(S) WITH NO REAL ART:\n  ' + broken.join('\n  ') + '\n\n' +
    'A ground item with no art draws the same VS-Z-25 dashed chip a device with no art draws.\n' +
    'THE EXITS: draw it (a builder in client/src/items/resources.js + an ITEMS row carrying the\n' +
    'sim ItemKind NAME and the Glyphs.ForItem char), or put it in NO_GROUND_ITEM_SPRITE with a\n' +
    'reason that survives being read aloud.');
});

// THE NUMBER, DRIVEN — not "some items are unskinned" but exactly how many chip, measured through
// the real Room Zoom model on a real tile per kind. Pinned by equality so it can only be paid down.
// This is the assertion that turns the reviewer's photograph into something the gate can hold.
const EXPECT_CHIPPING_ITEM_KINDS = 1;   // MetalOre alone — see the ledger

test('THE OPEN GAP, MEASURED: exactly ONE ItemKind (MetalOre) still draws a raw-letter chip', () => {
  const chipping = [];
  for (const k of ITEM_KINDS) {
    const g = FOR_ITEM[k];
    // Driven through the SHIPPING Room Zoom model: a 1x1 room whose only cell is this glyph.
    const focus = { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 };
    const frame = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[g.charCodeAt(0), 0, 0, 0]] };
    const cells = roomCells(frame, focus);
    // `roomCells` drops NON_FURNITURE codes entirely (no cell ⇒ no chip); an emitted cell with an
    // empty itemId is exactly what `furnitureSvg` turns into the dashed letter box.
    const chips = cells.length === 1 && !cells[0].itemId;
    if (chips) chipping.push(`${k} (${JSON.stringify(g)})`);
    // A ledgered kind must chip exactly as its entry claims; a SKINNED kind must not chip at all —
    // and that second half is not free. `Corpse` reaches this model only because `'&'` was taken OUT
    // of NON_FURNITURE; with it back in, `roomCells` emits NOTHING for the tile, `chips` is false for
    // the wrong reason, and this leg would still be green. That is why the corpse has a driven test
    // of its own below that asserts the cell EXISTS and carries the art.
    const expected = k in NO_GROUND_ITEM_SPRITE ? NO_GROUND_ITEM_SPRITE[k].chips : false;
    assert.equal(chips, expected,
      `${k}: expected chips=${expected}, the real Room Zoom model says ${chips}`);
  }
  assert.equal(chipping.length, EXPECT_CHIPPING_ITEM_KINDS,
    'THE NUMBER OF RAW-LETTER CHIPS MOVED: ' + chipping.join(', ') + '\n\n' +
    'It was EIGHT until 2026-07-27 — measured live by independent review on --ship grid deck 0, room\n' +
    "STORAGE: seven chips on one floor, ',' six times and 'f' once, plus Seals and Ice from the\n" +
    'E0-6/E0-7 wave. The ground-item art paid seven of them down, leaving MetalOre; the wreck\n' +
    "start's salvage half then added Swarf (TWO), and W0b drew the swarf pile the next day, so ONE\n" +
    'chips today. The one that is left is dead vocabulary nobody owes art for — this number cannot\n' +
    'reach zero until E3 decides what an ore IS. If it went UP, a new ItemKind shipped without\n' +
    'art. If it went DOWN, a kind got art — lower this constant and delete its ledger entry in the\n' +
    'same commit.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE COVERAGE ASSERTION — driven end to end, one leg per DeviceKind.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const OPTS = { w: 64, h: 64, idPrefix: 'cov' };
/** Byte-for-byte what `buildItem` returns for an id that is not in the registry. */
const PLACEHOLDER = buildItem('__no_such_item__', OPTS);

test('EVERY DeviceKind the sim projects builds REAL art (driven through buildItem)', () => {
  const broken = [];
  for (const kind of COVERED) {
    const glyph = FOR_DEVICE[kind];
    const itemId = itemIdForGlyphChar(glyph);
    if (!itemId) { broken.push(`${kind} (glyph ${JSON.stringify(glyph)}): no item claims this glyph`); continue; }
    const entry = ITEMS[itemId];
    if (!entry) { broken.push(`${kind} → "${itemId}": no such entry in ITEMS`); continue; }
    if (typeof entry.build !== 'function') { broken.push(`${kind} → "${itemId}": entry.build is not a function`); continue; }
    // THE DRIVEN PART. Not "the table has a key" — call the real builder and check what came back
    // is not the neutral "?" placeholder `buildItem` hands out for an unknown id.
    const svg = buildItem(itemId, OPTS);
    if (svg === PLACEHOLDER) { broken.push(`${kind} → "${itemId}": buildItem returned the PLACEHOLDER`); continue; }
    if (!svg.includes('<g class="pl-item">') || svg.length < 80) {
      broken.push(`${kind} → "${itemId}": buildItem returned no real fragment (${svg.length} chars)`);
    }
  }
  assert.deepEqual(broken, [],
    'DEVICE KIND(S) WITH NO ART ON THE STANDARD SURFACE:\n  ' + broken.join('\n  ') + '\n\n' +
    'The sim gives every device a glyph (sim/Sim.Glyph/Glyphs.cs, Glyphs.ForDevice) and the two SVG\n' +
    'surfaces skin glyphs from the ITEMS registry (client/src/items/glyph-map.js). A kind that\n' +
    'resolves to nothing draws the VS-Z-25 dashed "unknown" chip in the Room Zoom — a raw ASCII\n' +
    'letter in a dashed box, in the shipping game — and draws NOTHING AT ALL on the Overview.\n' +
    'That is exactly what the owner photographed on 2026-07-26 (HANDOVER §4l).\n\n' +
    'THE THREE EXITS:\n' +
    '  (1) THE ART ALREADY EXISTS — find the piece in client/src/items/index.js and put the glyph\n' +
    '      char in its `dev(...)` call. Three of the sixty pieces shipped with `glyph: null` while\n' +
    '      their builders sat there fully drawn; that is how §4l happened.\n' +
    '  (2) DRAW IT — a builder in client/src/items/objects.js + a new ITEMS row carrying the glyph.\n' +
    '  (3) STAND IT IN — add the glyph to GLYPH_SUBSTITUTE in client/src/items/glyph-map.js with a\n' +
    '      per-entry reason. That ledger only shrinks, so this is a decision, not a shortcut.');
});

test('THE THREE FROM §4l, by name: hydroponics, the MOSS terminal and the sensor array', () => {
  // A regression pin with the kinds spelled out, so a future refactor that re-nulls one of them
  // fails with the owner's own bug report in the message rather than as an anonymous count.
  assert.equal(itemIdForGlyphChar(FOR_DEVICE.GrowBed), 'hydroponics');
  assert.equal(itemIdForGlyphChar(FOR_DEVICE.Terminal), 'research-console');
  // — lane/paper-machines — `'x'` moved from the warm `sensor-array` to the paper `ring-array` on
  // 2026-08-05. WHAT THIS LEG IS ABOUT IS UNCHANGED: §4l's defect was that the Telescope glyph
  // resolved to NOTHING and drew a dashed chip with a raw `x` in it. Which piece it resolves TO is
  // an art decision; that it resolves at all is the fix, and that is still what is asserted here.
  assert.equal(itemIdForGlyphChar(FOR_DEVICE.Telescope), 'ring-array');
  for (const id of ['hydroponics', 'research-console', 'ring-array']) {
    assert.notEqual(buildItem(id, OPTS), PLACEHOLDER, `${id} builds the placeholder`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE REGISTRY IS THE SINGLE SOURCE OF TRUTH — the invariants that keep it one.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The functional ITEMS rows that claim a glyph: [itemId, glyph]. */
const FUNCTIONAL_GLYPHS = Object.keys(ITEMS)
  .filter((id) => ITEMS[id].kind === 'functional' && typeof ITEMS[id].glyph === 'string')
  .map((id) => [id, ITEMS[id].glyph]);

/**
 * The RESOURCE rows that claim a glyph: [itemId, glyph]. The `Glyphs.ForItem` half of the registry.
 *
 * ⚠️ THIS CONSTANT IS THE FIX FOR A SURVIVOR THIS PACKAGE FOUND IN ITS OWN FIRST DRAFT. Every
 * assertion in this section filtered on `kind === 'functional'`, so the eight new resource rows were
 * OUT OF SCOPE of all four of them: a typo in a resource glyph, two rows claiming one char, or a row
 * whose `itemKind` named a kind the sim does not have would all have been invisible while the section
 * that exists to catch exactly those stayed green. That is CLAUDE.md's fourth trap shape — a guard
 * whose SCOPE FILTER excludes the violation — and it was reintroduced by the package that has the
 * shape written at the top of it.
 */
const RESOURCE_GLYPHS = Object.keys(ITEMS)
  .filter((id) => ITEMS[id].kind === 'resource' && typeof ITEMS[id].glyph === 'string')
  .map((id) => [id, ITEMS[id].glyph]);

/** Every row that claims a glyph, of either kind — what `GLYPH_TO_ITEM` is actually built from. */
const CLAIMED_GLYPHS = [...FUNCTIONAL_GLYPHS, ...RESOURCE_GLYPHS];

test('no two ITEMS rows claim the same glyph — across BOTH switches', () => {
  assert.ok(FUNCTIONAL_GLYPHS.length >= 18, 'the functional-glyph scan found almost nothing');
  assert.ok(RESOURCE_GLYPHS.length >= 8, 'the resource-glyph scan found almost nothing');
  const seen = new Map();
  const clashes = [];
  for (const [id, g] of CLAIMED_GLYPHS) {
    if (seen.has(g)) clashes.push(`${JSON.stringify(g)}: ${seen.get(g)} vs ${id}`);
    else seen.set(g, id);
  }
  assert.deepEqual(clashes, [],
    'TWO ITEMS CLAIM ONE GLYPH: ' + clashes.join('; ') + '\n' +
    'glyph-map.js resolves first-wins, so one of these pieces would silently never render. Across\n' +
    'the two switches this is worse than a lost sprite: a device and a pile would be one drawing.');
});

test('every glyph an ITEMS row claims is a glyph the sim actually projects', () => {
  // The other direction, and it is the one that catches a TYPO. A row that claims `\`` instead of
  // `"` would leave GrowBed unskinned again while every count above stayed the same. Each half is
  // checked against ITS OWN switch: a resource row claiming a DEVICE glyph is not "fine", it is a
  // pile wearing a machine's char.
  // ⚠️ `PROJECTED_DEVICE_GLYPHS`, NOT `Object.values(FOR_DEVICE)`, and for the reason
  // `GLYPH_SUBSTITUTE`'s own test already learned from the door package: a glyph a real device puts
  // on a real tile is not always a switch arm. `cryo-capsule-open` correctly claims `'k'`, which
  // `GlyphMapper.DeviceGlyph` projects for an OPEN capsule and which appears in no arm — the
  // narrower set rejected a correct row. Nothing is lost: a functional row claiming a deliberately
  // unskinned char is caught by the `NO_DEVICE_GLYPH_ART` test below.
  const devGlyphs = new Set(PROJECTED_DEVICE_GLYPHS);
  const itemGlyphs = new Set(Object.values(FOR_ITEM));
  const orphans = [
    ...FUNCTIONAL_GLYPHS.filter(([, g]) => !devGlyphs.has(g))
      .map(([id, g]) => `${id} claims ${JSON.stringify(g)}, which no DeviceKind projects`),
    ...RESOURCE_GLYPHS.filter(([, g]) => !itemGlyphs.has(g))
      .map(([id, g]) => `${id} claims ${JSON.stringify(g)}, which no ItemKind projects`),
  ];
  assert.deepEqual(orphans, [],
    'ITEMS ROW CLAIMS A GLYPH THE SIM DOES NOT PROJECT: ' + orphans.join('; ') + '\n' +
    'Either the char is a typo, or the sim arm it mirrors was changed without this row.');
});

test('every ITEMS row that claims a glyph names the sim kind that projects it', () => {
  // The registry carries `deviceKind` / `itemKind` beside `glyph`. If the two disagree the registry
  // is lying about what the piece is, and the lie is invisible because only `glyph` is read at
  // runtime — which is precisely what makes `itemKind` worth asserting: `room-model.js` joins on the
  // NAME to turn a wire kind BYTE into a piece, so a wrong name silently draws the wrong pile.
  const wrong = [];
  for (const [id, g] of FUNCTIONAL_GLYPHS) {
    const kind = ITEMS[id].deviceKind;
    if (!kind) { wrong.push(`${id} claims ${JSON.stringify(g)} with no deviceKind`); continue; }
    if (!(kind in FOR_DEVICE)) continue;       // a NEW kind not yet in the sim — deviceStatus:'new'
    // The kind's REST glyph plus any STATE glyphs `GlyphMapper.DeviceGlyph` gives it. A kind with
    // two pieces (CryoPod: occupied 'K', open 'k'; Door: closed '+') has two legal answers here,
    // and pinning only the rest glyph would reject the second piece as a typo.
    const projects = new Set([FOR_DEVICE[kind], ...(DEVICE_GLYPH_OVERRIDES_BY_KIND[kind] || [])]);
    if (!projects.has(g)) wrong.push(`${id}: deviceKind ${kind} projects ${JSON.stringify([...projects].join(''))}, row says ${JSON.stringify(g)}`);
  }
  for (const [id, g] of RESOURCE_GLYPHS) {
    const kind = ITEMS[id].itemKind;
    if (!kind) { wrong.push(`${id} claims ${JSON.stringify(g)} with no itemKind`); continue; }
    if (!(kind in FOR_ITEM)) { wrong.push(`${id}: itemKind ${kind} is not an ItemKind the sim has`); continue; }
    if (FOR_ITEM[kind] !== g) wrong.push(`${id}: itemKind ${kind} projects ${JSON.stringify(FOR_ITEM[kind])}, row says ${JSON.stringify(g)}`);
  }
  assert.deepEqual(wrong, [], 'ITEMS row disagrees with Glyphs.For*: ' + wrong.join('; '));
});

test('GLYPH_SUBSTITUTE is real, non-shadowing, and pinned to its size', () => {
  const realGlyphs = new Set(CLAIMED_GLYPHS.map(([, g]) => g));
  for (const [g, id] of Object.entries(GLYPH_SUBSTITUTE)) {
    // ⚠️ `PROJECTED_DEVICE_GLYPHS`, NOT `Object.values(FOR_DEVICE)`. The narrower test was here
    // until the door package and it is what made `'X'` (DoorLocked) unrepresentable: the glyph is
    // projected by `GlyphMapper.DeviceGlyph`, never by a switch arm, so a correct substitution for
    // it was rejected as "stale". A guard that cannot express the fix is part of the bug.
    assert.ok(PROJECTED_DEVICE_GLYPHS.includes(g),
      `STALE SUBSTITUTE ${JSON.stringify(g)}: no DeviceKind projects that glyph. Delete the line.`);
    assert.ok(!realGlyphs.has(g),
      `SHADOWED SUBSTITUTE ${JSON.stringify(g)}: a real ITEMS row now claims it (${GLYPH_TO_ITEM[g]}).\n` +
      'The substitution is dead code and the ledger has grown stale — delete the line.');
    assert.ok(ITEMS[id], `SUBSTITUTE ${JSON.stringify(g)} → "${id}": no such item`);
    assert.equal(typeof ITEMS[id].build, 'function', `SUBSTITUTE "${id}" has no builder`);
    assert.notEqual(buildItem(id, OPTS), PLACEHOLDER, `SUBSTITUTE "${id}" builds the placeholder`);
    assert.equal(GLYPH_TO_ITEM[g], id, 'the derivation did not pick the substitute up');
  }
  // ONLY SHRINKS. Each entry is a device wearing another device's art, visible to the player.
  // 5 → 6 (E0-7): DeviceKind.IceMelter wears the COOKER piece. This is the ledger GROWING, which
  // its own header says is legitimate only when a new DeviceKind ships and a stand-in is chosen
  // over drawing art — the reason is in glyph-map.js beside the entry, and drawing a real melter
  // is a job for the art lane.
  // 6 → 7 (door package): `'X'` (DoorLocked) wears the BLAST DOOR piece. Legitimate under the
  // ledger's own header — a device glyph with no dedicated piece and a named stand-in with a reason
  // — with the twist that the glyph is a STATE of a kind whose rest glyph already has a piece, so
  // one `ITEMS` row could not express it. The reason is in glyph-map.js beside the entry.
  assert.equal(Object.keys(GLYPH_SUBSTITUTE).length, 7,
    'GLYPH_SUBSTITUTE CHANGED SIZE. It only shrinks — an entry goes away when the warm set grows a\n' +
    'real piece for that kind. Adding one means a device now wears art that is not its own, on the\n' +
    'one standard surface; that is a decision for a commit message, not a default.');
});

test('the derived table is a function of ITEMS — not of a hand mirror', () => {
  // The bug class this package removed: two view files each carrying their own copy. If the
  // derivation ever stops reading the registry, this goes red — every glyph is checked back against
  // its own ITEMS row rather than against a transcribed expectation.
  for (const [id, g] of CLAIMED_GLYPHS) {
    assert.equal(GLYPH_TO_ITEM[g], id, `ITEMS["${id}"].glyph is ${JSON.stringify(g)} but the table says ${GLYPH_TO_ITEM[g]}`);
  }
  // BOTH halves, and the sum is the pin: 21 device rows + 8 resource rows + 7 substitutes = 36.
  // Written as a sum of the three sources rather than as 34 so that it stays a statement about the
  // DERIVATION — a literal would still hold if the resource half stopped being read and seven other
  // glyphs appeared from somewhere.
  //
  // ⚠️ THIS SENTENCE IS PROSE ABOUT A PIN AND MUST BE RE-COUNTED, NEVER EDITED BY ARITHMETIC —
  // exactly as `glyph-map.js`'s header says of its own ledger counts, and the door package proved
  // the warning is not theoretical TWICE in one file. It read "18 + 8 + 6 = 32" before the door
  // package. Adjusting it by arithmetic from the one change you remember (substitutes 6 → 7) gives
  // "18 + 8 + 7 = 33" and is WRONG: `sliding-door` claiming `'+'` moved the DEVICE-ROW count too,
  // 18 → 19. The real numbers were measured off the shipped registry (19 / 8 / 7 / 34); the
  // assertion below is a sum, so it stayed green through both wrong versions of this comment.
  //
  // ⚠️ IT HAPPENED A THIRD TIME AND THE COUNTERMEASURE HELD. The wreck start added ONE `DeviceKind`
  // (`CryoPod`) and TWO device rows, because the kind has two state glyphs and the warm set ships a
  // piece for each. Adjusting "19 + 8 + 7 = 34" by the remembered change (+1 kind) gives 35 and is
  // wrong; the numbers below were RE-COUNTED off the shipped registry with a script, not derived:
  // 21 functional rows carry a glyph, 8 resource rows do, 7 substitutes, `GLYPH_TO_ITEM` is 36.
  assert.equal(Object.keys(GLYPH_TO_ITEM).length,
    CLAIMED_GLYPHS.length + Object.keys(GLYPH_SUBSTITUTE).length);
  assert.ok(RESOURCE_GLYPHS.every(([, g]) => GLYPH_TO_ITEM[g]),
    'the derivation stopped reading the RESOURCE half of the registry — every ground stack would go\n' +
    'back to being a dashed box with a raw letter in it, which is HANDOVER §4l on the item side.');
  // Non-glyph inputs are '' rather than a throw or an `undefined` leaking into an SVG string.
  for (const junk of ['', 'ab', null, undefined, 42, {}]) assert.equal(itemIdForGlyphChar(junk), '');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. BOTH SURFACES, DRIVEN — the real Overview composer and the real Room Zoom controller.
//    A shared table proves nothing if a surface stops reading it.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const DECKS_JSON =
  '{"type":"decks","decks":[{"deck":1,"slots":[[0,4,6,12,8,"quarters",5,true,true]]}]}';
const ROOMS_JSON = '{"type":"rooms","rooms":[["quarters",1,0.209,512,101.3,293,96]]}';
const VIEW = decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON)));
const QUARTERS = roomTileRect(VIEW, 'quarters');

/**
 * ⭐ VR-P4 — A ONE-TILE OVERVIEW PROBE, PLACED INSIDE A COMPARTMENT.
 *
 * ⚠️ THE OLD PROBE WAS `{deck:1, w:1, h:1, cells:[[code,…]]}` — a single tile at (0,0) — AND THE SHIP
 * PLATE CANNOT DRAW IT, by design rather than by bug. The plate is a GRID OF COMPARTMENTS: a
 * fitting is drawn inside the miniature interior of the room that contains it, so a tile that is
 * inside NO compartment has nowhere on the plate to be (the module header states that limit, and
 * `makeTransform`'s inverse is pinned against it). Tile (0,0) is outside every deck-1 slot rect on
 * this fixture, so every probe drew nothing and every assertion here would have failed for a reason
 * that has nothing to do with art coverage.
 *
 * So the probe now puts the glyph at the FIRST TILE OF THE FIRST COMPARTMENT of deck 1, which is
 * where a real device would be. The property under test is unchanged — "the composer draws art for
 * this glyph" — and the fixture is now capable of expressing it.
 */
const OV_DECK = 1;
const OV_SLOT = (VIEW.find((d) => d.deck === OV_DECK) || { slots: [] }).slots[0];

/**
 * ⭐⭐ THE PROBE DRIVES THE CHANNELS, NOT THE FRAME, AND THAT IS THE PACKAGE'S CHANGE TO THIS FILE.
 *
 * ⚠️ IT USED TO PLANT A GLYPH IN `frame.cells` AND THAT NO LONGER EXPRESSES ANYTHING ABOUT THE
 * PLATE. The side elevation draws EVERY deck at once, so it cannot source fittings from a channel
 * that carries one — it takes `devices` + `items` instead (`ship-fittings.js`, whose header carries
 * the tile-for-tile measurement that made the substitution safe and the one piece of art it costs).
 * A frame-glyph probe against the new composer is not a weaker test, it is a VACUOUS one: it would
 * pass or fail for reasons entirely unrelated to art coverage.
 *
 * So the Overview probe now takes a DEVICE ROW or an ITEM ROW — the two things the plate really
 * reads — placed on the first tile of the first compartment of deck 1, which is where a real device
 * would be. (The tile placement half of the old note stands and its reason is unchanged: a tile
 * inside no compartment lands on the WALKWAY, which draws, but the compartment is where a device
 * lives and the fixture should say so.)
 */
function ovFrame() {
  const r = OV_SLOT.rect;
  const w = r.x + r.w, h = r.y + r.h;
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];   // floor everywhere
  return { type: 'frame', deck: OV_DECK, w, h, lens: 'none', cells };
}
/** The plate, with ONE device of `kind` standing in the compartment. */
function ovDeviceScene(kind, open = 0) {
  const r = OV_SLOT.rect;
  return overviewScene({
    deck: OV_DECK, decksView: VIEW, frame: ovFrame(), marks: [],
    devices: [{ x: r.x, y: r.y, deck: OV_DECK, kind, cond: 255, oper: 1, open }],
  });
}
/** The plate, with ONE ground stack of `kind` in the compartment. */
function ovItemScene(kind) {
  const r = OV_SLOT.rect;
  return overviewScene({
    deck: OV_DECK, decksView: VIEW, frame: ovFrame(), marks: [],
    items: [{ x: r.x, y: r.y, deck: OV_DECK, kind, count: 1 }],
  });
}

/** A frame for deck `d` whose (x,y) cells carry the given glyph chars, everything else floor. */
function frameWith(placements, deck = 1, w = 24, h = 20) {
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];
  for (const [x, y, ch] of placements) cells[y * w + x] = [ch.charCodeAt(0), 8, 0, 0];
  return { type: 'frame', deck, w, h, lens: 'none', cells };
}

test('the Room Zoom MODEL skins every covered kind — no unknown chip (roomCells, driven)', () => {
  // One tile per covered DeviceKind, laid out inside the room rect and read back through the real
  // `roomCells`. `itemId === ''` is precisely what makes `furnitureSvg` draw the dashed chip.
  const placements = COVERED.map((k, i) => [QUARTERS.rx + (i % 10), QUARTERS.ry + Math.floor(i / 10), FOR_DEVICE[k]]);
  assert.ok(placements.length >= 23, 'nothing to place — the covered set is empty');
  const cells = roomCells(frameWith(placements, QUARTERS.deck), QUARTERS);
  assert.equal(cells.length, placements.length, 'roomCells dropped tiles — the fixture is off-rect');
  const chipped = cells.filter((c) => !c.itemId).map((c) => JSON.stringify(String.fromCharCode(c.code)));
  assert.deepEqual(chipped, [],
    'THE ROOM ZOOM WOULD DRAW THE VS-Z-25 UNKNOWN CHIP for glyph(s): ' + chipped.join(', '));
  // and the model agrees with the shared derivation, per kind
  for (const k of COVERED) assert.equal(itemForGlyph(FOR_DEVICE[k].charCodeAt(0)), itemIdForGlyphChar(FOR_DEVICE[k]), k);
});

test('the Overview COMPOSER draws furniture for every covered kind (overviewScene, driven)', () => {
  // ⭐ DRIVEN BY DEVICE KIND, which is the identity the plate really consumes. `COVERED` is the set
  // of `DeviceKind`s the C# `Glyphs.ForDevice` census says have a glyph, so the same set expresses
  // the same claim on either side of the source change — what moved is the ROUTE, not the subject.
  const missing = [];
  for (const k of COVERED) {
    if (!ovDeviceScene(KIND_BYTE[k]).includes('class="pl-furniture"')) {
      missing.push(`${k} (kind ${KIND_BYTE[k]})`);
    }
  }
  assert.deepEqual(missing, [],
    'THE OVERVIEW DREW NOTHING for: ' + missing.join(', ') + '\n' +
    '`fittingLayer` skips a row whose `itemForDeviceRow` is empty, so on the Overview an unskinned\n' +
    'device is not a chip — it is silently absent from the drawing, which is worse to find.');
  // NON-VACUITY, and it is an INCLUSION control rather than a count: a kind NOTHING skins must make
  // this probe draw no furniture layer at all. Without it, a composer that emitted `pl-furniture`
  // unconditionally would pass the loop above for every kind at once.
  assert.ok(!ovDeviceScene(250).includes('class="pl-furniture"'),
    'the probe reports a furniture layer for a DeviceKind nothing skins — it cannot see absence');
});

// ── the REAL Room Zoom controller, over dom-lite ──────────────────────────────────────────────
// The two tests above drive the pure model and the pure composer. This one drives the SHIPPING
// controller: `initRoomZoom` + `enter()` + the real repaint, and reads the SVG it actually wrote
// into `#rz-layers`. It is the only leg that can see the chip markup itself.

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-tray', 'rz-accepts', 'rz-minimap',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
class RzEl extends DomEl {
  constructor(doc, tag) { super(doc, tag); this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 }; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return this._rect; }
  closest() { return null; }
}
class RzDoc extends DomDocument {
  constructor() { super(); this.body = new RzEl(this, 'body'); }
  createElement(tag) { return new RzEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const rzDoc = new RzDoc();
for (const id of RZ_IDS) { const e = new RzEl(rzDoc, 'div'); e._id = id; rzDoc.register(id, e); }
globalThis.document = rzDoc;
globalThis.window = { addEventListener() {}, removeEventListener() {} };

// Resolved AFTER the globals — both modules touch `document` at import time.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

test('THE OWNER\'S BUG, driven through the SHIPPING Room Zoom: no dashed letter box remains', () => {
  const api = RoomZoom.initRoomZoom({ send: () => {} });
  Hud.renderDecks(decode(DECKS_JSON));
  Hud.renderRooms(decode(ROOMS_JSON));

  // NON-VACUITY CONTROL FIRST, and it is the half that makes the rest mean anything: a glyph
  // NOTHING skins ('z') must still produce the chip. Without this the assertion below passes just as
  // well against a Room Zoom that lost its furniture layer entirely.
  Hud.renderFrame(frameWith([[QUARTERS.rx, QUARTERS.ry, 'z']], QUARTERS.deck));
  api.exit(); api.enter('quarters');
  const control = rzDoc.getElementById('rz-layers').innerHTML;
  // ⭐ VR-P3 — THE CHIP'S DASH MOVED WITH THE DIALECT: it is the charter's UNBUILT/PLANNED spelling
  // (ink `6 5`) now, which is the honest thing to say about a glyph with no art and is emphatically
  // not the oxblood `8 5` a queued order wears. The LETTER — the thing the owner photographed — is
  // unchanged and is still what every assertion below hunts for.
  assert.ok(control.includes('stroke-dasharray="6 5"') && control.includes('>z</text>'),
    'the VS-Z-25 unknown chip did not render for an unskinned glyph — this rig cannot see the bug');

  // …and now the three the owner photographed, plus every other covered kind, on real tiles.
  // ⚠️ STRICTLY INSIDE THE ROOM'S OWN WALLS (VR-P3 review, MINOR 4). The row used to start ON the
  // rect's front edge, and the cutaway now PLATES a door glyph that sits on the room's boundary and
  // drops it from the furniture pass — one drawing per door, which is the fix. A device census laid
  // along the boundary would therefore lose `sliding-door`/`blast-door` for a reason that has nothing
  // to do with sprite coverage, and read as a coverage regression. The offset is +1 on both axes; the
  // non-vacuity check below is what keeps it honest if the room ever shrinks.
  const placements = COVERED.map((k, i) => [
    QUARTERS.rx + 1 + (i % 10), QUARTERS.ry + 1 + Math.floor(i / 10), FOR_DEVICE[k],
  ]);
  for (const [x, y] of placements) {
    assert.ok(x > QUARTERS.rx && x < QUARTERS.rx + QUARTERS.rw - 1
      && y > QUARTERS.ry && y < QUARTERS.ry + QUARTERS.rh - 1,
    `the census placed a device on the room BOUNDARY at ${x},${y} — the cutaway plates a door there `
    + 'and this test would then read a de-duplication as a coverage hole. Grow the fixture room.');
  }
  Hud.renderFrame(frameWith(placements, QUARTERS.deck));
  api.exit(); api.enter('quarters');
  const html = rzDoc.getElementById('rz-layers').innerHTML;

  assert.ok(html.includes('class="rz-furniture"'), 'the Room Zoom drew no furniture layer at all');
  for (const k of COVERED) {
    const g = FOR_DEVICE[k];
    const chip = '>' + (g === '"' ? '&quot;' : g) + '</text>';
    assert.ok(!html.includes(chip),
      `THE §4l BUG IS BACK for ${k}: the Room Zoom rendered the unknown chip carrying ${JSON.stringify(g)}.\n` +
      'That is the dashed box with a raw ASCII letter in it that Garvin photographed on 2026-07-26.');
  }
  // A count, so "no chip" cannot be satisfied by "no tiles". Every covered kind drew a real piece.
  const pieces = (html.match(/<g class="pl-item">/g) || []).length;
  assert.ok(pieces >= COVERED.length, `only ${pieces} item groups for ${COVERED.length} devices`);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6b. THE CORPSE, and the SET THAT HID IT. `'&'` (38) sat in `NON_FURNITURE` on BOTH SVG surfaces,
//     so a dead crew member reached NEITHER furniture layer and drew NOTHING AT ALL — not a wrong
//     thing, nothing. That is why `NO_GROUND_ITEM_SPRITE` recorded `chips: false` for the one kind
//     that was invisible rather than merely unskinned, and it is why ART ALONE COULD NOT FIX IT.
//
//     The removal is one number in two files. These tests pin BOTH SURFACES separately, because the
//     bug's whole shape was "the set is written twice and each copy hides it on its own surface".
// ═════════════════════════════════════════════════════════════════════════════════════════════

const CORPSE_GLYPH = "&";

test("the CORPSE glyph reaches the Room Zoom's furniture layer at all (roomCells, driven)", () => {
  assert.equal(FOR_ITEM.Corpse, CORPSE_GLYPH, 'Glyphs.ForItem(Corpse) moved — re-derive this test');
  const focus = { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 };
  const frame = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[CORPSE_GLYPH.charCodeAt(0), 0, 0, 0]] };
  const cells = roomCells(frame, focus);
  // THE FIRST HALF IS THE ONE THAT WAS BROKEN, and it is asserted on its own because `!cells[0]` and
  // `cells[0].itemId === ''` fail in the same direction while meaning opposite things: "the tile was
  // filtered out" vs "the tile has no art". Only the first was true, and only art fixes the second.
  assert.equal(cells.length, 1,
    "roomCells DROPPED the corpse tile. `'&'` (38) is back in NON_FURNITURE, so a corpse reaches no\n"
    + 'furniture layer on this surface and draws NOTHING — the state this package was written to end.');
  // ⚠️ `'body-bag'` SINCE lane/paper-resources — the paper redraw of this pile — and the literal is
  // kept rather than derived so a silent reassignment of `'&'` to some other row still fails here.
  // The second leg is the one that makes it more than a transcription: the GLYPH join and the
  // KIND-NAME join are two separate derivations off the registry, and a tile is only correct when
  // both land on the same row.
  assert.equal(cells[0].itemId, 'body-bag', 'the corpse tile resolved to no art');
  assert.equal(cells[0].itemId, RESOURCE_ITEM_BY_KIND_NAME.Corpse,
    "the '&' glyph and ItemKind.Corpse resolve to DIFFERENT rows — a corpse on the map and a corpse\n"
    + 'in the items channel would draw two different pictures on the same tile.');
});

test('the CORPSE reaches the OVERVIEW composer too (overviewScene, driven)', () => {
  // ⚠️ THE ROUTE CHANGED AND THE SUBJECT DID NOT. A corpse is not a device — it is `ItemKind` 2 on
  // the `items` channel — so the plate reaches it through `itemIdForStockKind`, and the fact that
  // the two routes agree about the SAME PIECE is what this asserts. The Overview has no unknown-chip
  // fallback, so a corpse missing here is SILENT.
  assert.equal(itemIdForGlyphChar(CORPSE_GLYPH), 'body-bag',
    'the corpse glyph no longer skins the body bag — the fixture is measuring the wrong piece');
  assert.equal(itemIdForStockKind(CORPSE_ITEM_KIND), 'body-bag',
    'ItemKind ' + CORPSE_ITEM_KIND + ' no longer skins the body bag — the plate\'s route to a corpse '
    + 'is gone, and with it the corpse itself, silently.');
  assert.ok(ovItemScene(CORPSE_ITEM_KIND).includes('class="pl-furniture"'),
    'THE OVERVIEW DREW NOTHING for a corpse on the `items` channel.');
});
/** `ItemKind.Corpse` — the byte `itemIdForStockKind` resolves to the body bag. Pinned by the test
 *  above in BOTH directions so it cannot rot into a number nobody checks. */
const CORPSE_ITEM_KIND = 2;

test('EVERY glyph the registry skins is drawn by BOTH surfaces — no surface filters art away', () => {
  // The general form of the corpse bug, and an INCLUSION test rather than a population count: it
  // enumerates the glyphs that DO resolve to a piece and requires each to survive both filters.
  // Planting the violation (putting 38 back in either set) reddens it by name.
  const skinned = Object.keys(GLYPH_TO_ITEM);
  assert.ok(skinned.length >= 32, 'the skinned-glyph set is suspiciously small');
  const lost = { roomZoom: [], overview: [] };
  // ⭐⭐ THE OVERVIEW LEG ASKS THE QUESTION IN THE PLATE'S OWN VOCABULARY, and the difference matters
  // enough to be spelled out. The Room Zoom reads GLYPHS, so its leg stays a glyph sweep. The plate
  // reads DEVICE KINDS and ITEM KINDS, so its leg sweeps every piece those two routes can NAME and
  // requires each to be drawn. Sweeping glyphs on the plate would be asking a surface for something
  // it never receives.
  const byChannel = new Map();          // itemId → a probe that produces it
  for (const k of Object.keys(KIND_BYTE)) {
    for (const open of [0, 1]) {
      const id = itemForDeviceRow({ kind: KIND_BYTE[k], open });
      if (id && !byChannel.has(id)) byChannel.set(id, () => ovDeviceScene(KIND_BYTE[k], open));
    }
  }
  for (let ik = 0; ik < 32; ik += 1) {
    const id = itemIdForStockKind(ik);
    if (id && !byChannel.has(id)) byChannel.set(id, () => ovItemScene(ik));
  }
  for (const g of skinned) {
    const code = g.charCodeAt(0);
    const focus = { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 };
    const cells = roomCells({ deck: 0, w: 1, h: 1, lens: 'none', cells: [[code, 0, 0, 0]] }, focus);
    if (cells.length !== 1 || !cells[0].itemId) lost.roomZoom.push(JSON.stringify(g));
  }
  for (const [id, probe] of byChannel) {
    if (!probe().includes('class="pl-furniture"')) lost.overview.push(JSON.stringify(id));
  }
  assert.deepEqual(lost, { roomZoom: [], overview: [] },
    'A PIECE WITH REAL ART IS FILTERED OUT BEFORE IT CAN BE DRAWN: ' + JSON.stringify(lost) + '\n'
    + 'A code in NON_FURNITURE is claimed by the floor/wall/structure layers. A code with a registry\n'
    + 'piece is claimed by the furniture layer. A code in both is drawn by neither, silently — that\n'
    + 'is what happened to the corpse for the whole life of the two SVG surfaces.');

  // ⛔⛔ AND THE COST OF THE PLATE'S NEW SOURCE, PINNED BY NAME IN BOTH DIRECTIONS — because "34 of
  // 35 pieces survive" is exactly the kind of claim that rots into "all of them do".
  //
  // `door-blast` is the LOCKED DOOR: `GlyphMapper.DeviceGlyph` returns `Glyphs.DoorLocked` for a
  // `DeviceKind.Door` whose `IsLocked` is set, and `IsLocked` IS NOT ON THE `devices` CHANNEL —
  // `hosts/web/WireFormat.Devices.cs`'s own "WHAT IS DELIBERATELY LEFT OUT" list names it. So the
  // plate draws a locked door as an ordinary one, and the Room Zoom (which still reads the frame)
  // does not. FILED; the fix is a one-element append to that tuple.
  const glyphIds = new Set(skinned.map((g) => itemIdForGlyphChar(g)).filter(Boolean));
  const unreachable = [...glyphIds].filter((id) => !byChannel.has(id)).sort();
  assert.deepEqual(unreachable, ['door-blast'],
    'THE SET OF ART THE PLATE CANNOT REACH HAS CHANGED. It is meant to be exactly one piece,\n'
    + '`door-blast`, for the reason above. A NEW name here is art the Level-1 plate has silently\n'
    + 'stopped drawing; an EMPTY list means the channel was widened and this exception should be\n'
    + 'deleted along with the paragraph in `ship-fittings.js` that files it.');
  assert.ok(glyphIds.size >= 30 && byChannel.size >= 29,
    'non-vacuity: one of the two derivations came back nearly empty, so the difference above is '
    + 'measuring the fixture rather than the surfaces (glyph ' + glyphIds.size
    + ', channel ' + byChannel.size + ')');
});

test('NON_FURNITURE is ONE list: overview-scene.js imports it and declares no second copy', () => {
  // The structural half. The driven tests above catch a DIVERGENCE that costs art; this catches the
  // re-introduction of the hand mirror itself, before it has had a chance to diverge. Comment-
  // stripped (CLAUDE.md trap 1): the literal sitting in a comment must not satisfy it either way.
  // ⚠️ THE SUBJECT MOVED WITH THE SOURCE, AND THE GUARD MOVED WITH IT RATHER THAN BEING DELETED.
  // `overview-scene.js` no longer classifies GLYPHS at all — it does not import `NON_FURNITURE_CODES`
  // and could not, because the plate never sees a glyph. So requiring the import would be requiring
  // a dead dependency. What the hand-mirror rule was actually protecting is *"the two surfaces must
  // not keep private copies of a shared classification"*, and on the plate the shared classification
  // is now `ship-fittings.js`'s `deckFittings` — so the guard asserts that the composer imports it
  // and declares no second glyph table of its own.
  const src = codeOnly(read('client/src/ui/overview-scene.js'));
  assert.ok(src.includes('deckFittings'),
    'overview-scene.js no longer imports the shared fitting source — it is deriving what stands on a\n'
    + 'tile by itself again, which is the hand mirror in its new costume.');
  assert.ok(!/NON_FURNITURE\s*=\s*new Set\(\s*\[/.test(src),
    'overview-scene.js declares a NON_FURNITURE LITERAL. That is the hand mirror that hid\n'
    + "the corpse: `'&'` had to be deleted from two places, and deleting it from one would have\n"
    + 'fixed one surface and left the other silently blank.');
  assert.ok(!/itemIdForGlyphChar/.test(src),
    'overview-scene.js resolves a GLYPH to a piece again. The plate draws every deck and `frame`\n'
    + 'carries one, so a glyph route here can only ever furnish the deck the host is projecting —\n'
    + 'and it would be a SECOND answer to "what stands here" beside `deckFittings`.');
  // NEGATIVE CONTROL, both directions, on synthetic sources so an edit to the real one cannot
  // invalidate them: the literal in a COMMENT must not trip the scan, and a live one must.
  const commented = codeOnly('// const NON_FURNITURE = new Set([46, 35]);\nconst live = 1;\n');
  assert.ok(!/NON_FURNITURE\s*=\s*new Set\(\s*\[/.test(commented),
    'a commented-out literal trips the scan — the guard fires on prose');
  const real = codeOnly('const NON_FURNITURE = new Set([46, 35]);\n// and a later real comment\n');
  assert.ok(/NON_FURNITURE\s*=\s*new Set\(\s*\[/.test(real),
    'a LIVE literal does not trip the scan — the guard is vacuous');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. NEGATIVE CONTROLS for the C# scan (CLAUDE.md trap 1). A guard that matches raw source text is
//    satisfied by the thing it guards against, COMMENTED OUT — and, in the mirror direction, fires
//    on prose, which teaches people to delete explanatory comments to appease a test. Both halves
//    are required, and both are asserted here against SYNTHETIC sources so the controls cannot be
//    invalidated by an edit to the real ones.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('NEGATIVE CONTROL: a commented-out ForDevice arm is NOT parsed as coverage', () => {
  const src = `
    public static class Glyphs {
      public const char Conduit = '~';
      public static char ForDevice(DeviceKind kind) => kind switch
      {
          DeviceKind.Scrubber => 'S',
          // DeviceKind.Ghost => 'q',
          /* DeviceKind.Phantom => 'w', */
          DeviceKind.Conduit => Conduit,
          _ => '?',
      };
    }`;
  const parsed = parseForDevice(src);
  assert.deepEqual(Object.keys(parsed).sort(), ['Conduit', 'Scrubber'],
    'a COMMENTED-OUT arm was counted as real coverage — the comment stripper is not being used');
  assert.equal(parsed.Conduit, '~', 'the live named-const arm stopped resolving (the control is over-strict)');
});

test('NEGATIVE CONTROL: a commented-out enum member is NOT counted as a DeviceKind', () => {
  const src = `
    public enum DeviceKind : byte {
      Door = 0,
      // Ghost = 98,
      /* Phantom = 99, */
      Telescope = 25,
    }`;
  assert.deepEqual(parseDeviceKinds(src), ['Door', 'Telescope'],
    'a COMMENTED-OUT enum member was counted — the comment stripper is not being used');
});

test('NEGATIVE CONTROL: prose mentioning a kind does not create coverage, and a quote does not blind the scan', () => {
  // The mirror direction. A comment that TALKS about DeviceKind.Ghost must not register it…
  const prose = `
    // See DeviceKind.Ghost => 'q', which we deliberately do not ship.
    public static char ForDevice(DeviceKind kind) => kind switch
    { DeviceKind.GrowBed => '"', _ => '?', };`;
  assert.deepEqual(Object.keys(parseForDevice(prose)), ['GrowBed']);
  // …and the '"' char literal must not swallow the rest of the file, which is the exact hole that
  // has shipped in this repo before. If it did, the arm AFTER it would vanish.
  const afterQuote = `
    public static char ForDevice(DeviceKind kind) => kind switch
    { DeviceKind.GrowBed => '"', DeviceKind.Terminal => 'T', _ => '?', };`;
  assert.deepEqual({ ...parseForDevice(afterQuote) }, { GrowBed: '"', Terminal: 'T' });
});

test('POSITIVE CONTROL: the uncommented forms ARE parsed (the controls are not vacuous)', () => {
  const live = `
    public enum DeviceKind : byte { Door = 0, Ghost = 98, }
    public static char ForDevice(DeviceKind kind) => kind switch
    { DeviceKind.Ghost => 'q', _ => '?', };`;
  assert.deepEqual(parseDeviceKinds(live), ['Door', 'Ghost']);
  assert.deepEqual({ ...parseForDevice(live) }, { Ghost: 'q' });
});

test('THE TWO SURVIVORS: an enum member with no trailing comma, and one with an implicit value', () => {
  // ⚠️ THIS TEST IS THE FIX FOR F1 AND IT EXISTS BECAUSE BOTH SHAPES SHIPPED PAST THE GUARD.
  // Independent review added a real `DeviceKind` in each of these two spellings, gave it a
  // `ForDevice` arm, gave it no art — and the whole 711-test suite stayed green, twice. Both are the
  // NATURAL way to write it: no trailing comma is what you get appending a last member, and an
  // implicit value is idiomatic C#. Neither is exotic.
  const noComma = `
    public enum DeviceKind : byte {
      Door = 0,
      Telescope = 25,
      Ghost = 26
    }`;
  assert.deepEqual(parseDeviceKinds(noComma), ['Door', 'Telescope', 'Ghost'],
    'SURVIVOR 1 IS BACK: a last enum member with no trailing comma is invisible to the parser');

  const implicitValue = `
    public enum DeviceKind : byte {
      Door = 0,
      Ghost,
      Telescope = 25,
    }`;
  assert.deepEqual(parseDeviceKinds(implicitValue), ['Door', 'Ghost', 'Telescope'],
    'SURVIVOR 2 IS BACK: an enum member with an implicit value is invisible to the parser');

  // Both at once, plus a non-digit value expression — none of these three is special-cased.
  const mixed = `
    public enum DeviceKind : byte {
      Door = 0,
      Shifted = 1 << 3,
      Ghost,
      Last
    }`;
  assert.deepEqual(parseDeviceKinds(mixed), ['Door', 'Shifted', 'Ghost', 'Last']);

  // …and the comment stripper still wins over all of it (the two must not trade off).
  const commented = `
    public enum DeviceKind : byte {
      Door = 0,
      // Ghost
      /* Phantom, */
      Last
    }`;
  assert.deepEqual(parseDeviceKinds(commented), ['Door', 'Last']);
});
