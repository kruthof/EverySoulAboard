// OVERVIEW view-model — PURE. Every derivation the Level-1 warm Overview controller
// (client/src/ui/overview-view.js) needs that is more than a straight DOM write lives here,
// node-tested, with no DOM and no wire access: the click→action classification, the lens recolor
// grade + tint mapping, the selected-crew → current-room join, the deck-rail pip list + delta, the
// Escape rung reducer (with the Level-2 room-zoom rung slotted in), and the small display
// formatters the readout atmos box needs.
//
// Shared derivations (selectedRosterEntry, cautionState, clockHHMM, moraleColor, surnameOf,
// speedLabel, designsOnDeck) are IMPORTED from console-model.js — never re-forked — so the Overview
// and the console speak one contract (interaction-spec IX-O-03). InvariantCulture-safe throughout
// (no locale APIs): round + ASCII only.

import { makeTransform } from './overview-scene.js';

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Click → tile projection (IX-O-19). The scene draws in a 1300×561 viewBox; the caller maps a DOM
// click to viewBox coords (via the SVG CTM) and hands them here with the deck's transform + frame.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The integer sim tile a viewBox point fell in, or null when out of the frame bounds. `transform`
 * is `makeTransform(slots, frame)` (its `.invert` recovers the fractional tile). PURE.
 * @param {{invert:(x:number,y:number)=>[number,number]}|null} transform
 * @param {number} vx @param {number} vy   point in the scene's 1300×561 viewBox space
 * @param {{w:number,h:number}|null} [frame]
 * @returns {{x:number,y:number}|null}
 */
export function tileAt(transform, vx, vy, frame) {
  if (!transform || typeof transform.invert !== 'function') return null;
  const [tx, ty] = transform.invert(vx, vy);
  const x = Math.floor(tx), y = Math.floor(ty);
  if (frame && (x < 0 || y < 0 || x >= frame.w || y >= frame.h)) return null;
  return { x, y };
}

/** Convenience: build the deck transform for a decoded deck-view slot list + frame (re-export). */
export { makeTransform };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Click classification (IX-O-11/12/13/15/19). One rule for a floor click: an armed tool decides
// everything; with no tool armed, the DOM hit (pawn > add-room chip > bound room > hall) decides.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Classify an Overview click into an action. `armed` is the shared armed-tool slot (null | move);
 * `hit` is the DOM hit-test result:
 *   { pawnCid?, addRoomSlot?, roomAnchor?, hallSlot? }  (all optional; absent = miss)
 *
 * BUILDING IS ZOOM-ONLY: walls/floors are placed inside a room (the Room Zoom), never on the ship
 * schematic. So there is NO 'build' action here — an armed wall/door/cancel (if one leaks in from
 * the shared console slot) is ignored on the Overview and the click falls through to the hit rule.
 *
 * Precedence (single disambiguation rule):
 *   1. the MOVE order armed → 'move' (the move target tile — IX-O-41)
 *   2. a pawn hit → 'select' (IX-O-15; pawns sit above room hit-rects)
 *   3. a MOSS terminal hit → 'terminal' (opens the MOSS terminal; devices sit above the room)
 *   4. an ＋ADD ROOM chip hit → 'addroom' (IX-O-13; the only interactive thing in a hall)
 *   5. a bound room hit → 'enterRoom' (IX-O-11; Level-2 room zoom — where building happens)
 *   6. a bare hall / empty space → 'none' (IX-O-13/18)
 * PURE.
 * @param {null|'move'|string} armed
 * @param {{pawnCid?:*, terminalId?:*, addRoomSlot?:number, roomAnchor?:string, hallSlot?:number}} [hit]
 * @returns {{type:'move'|'select'|'terminal'|'addroom'|'enterRoom'|'none', cid?:*, tid?:*, slot?:number, anchor?:string}}
 */
export function overviewClickAction(armed, hit) {
  const h = hit || {};
  if (armed === 'move') return { type: 'move' };
  if (h.pawnCid != null) return { type: 'select', cid: h.pawnCid };
  if (h.terminalId != null) return { type: 'terminal', tid: h.terminalId };
  if (h.addRoomSlot != null) return { type: 'addroom', slot: h.addRoomSlot };
  if (h.roomAnchor) return { type: 'enterRoom', anchor: h.roomAnchor };
  return { type: 'none' };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Command-bar tab gating. CHRONICLE still renders as a tab button (the slot is kept) but is INERT
// for now — its legacy console surface is not wired to the Overview, so selecting it would un-hide
// the old `.app` and strand the player. Clicking it is a silent no-op; BUILD/CREW/MOSS/RELATIONS are
// unaffected. Pure predicate so the view's click handler stays declarative + node-testable.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Tabs rendered in the command bar but with no action bound (kept visible, but inert). PURE. */
export const INERT_TABS = Object.freeze(['chron']);

/** True when a command-bar tab is present-but-inert (clicking it must do nothing). PURE. */
export function tabIsInert(key) {
  return INERT_TABS.indexOf(key) >= 0;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LENS recolor (IX-O-29/30). A non-`none` lens grades each room by one metric; the grade picks a
// translucent wash painted over the floor. Grades reuse the console's danger language (one meaning,
// one colour). Water has no per-room wire value (rooms carries no H₂O) and power is a per-slot
// `active` flag, not an atmos number — both are handled by the caller, so `lensGrade` returns null
// for them and never fabricates a reading.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** grade → the translucent floor wash (warm STATUS ramp; ~.22–.28 alpha to read as an overlay). */
export const GRADE_TINT = Object.freeze({
  good: 'rgba(90,167,127,.22)',
  warn: 'rgba(207,122,51,.26)',
  bad:  'rgba(194,90,63,.30)',
  cold: 'rgba(90,159,212,.26)',
});

/**
 * The lens grade for one room's atmosphere, or null when the lens carries no per-room reading here
 * (lens `none`, an unknown lens, `power`/`water` which the caller derives, or a null atmos). PURE.
 * @param {string} lens  frame.lens ('none'|'oxygen'|'co2'|'temperature'|'pressure'|'power'|'water')
 * @param {{o2:number,co2ppm:number,tempK:number,pressureKPa:number}|null} atmos
 * @returns {'good'|'warn'|'bad'|'cold'|null}
 */
export function lensGrade(lens, atmos) {
  if (!atmos || !lens || lens === 'none') return null;
  switch (lens) {
    case 'oxygen': {
      const o = atmos.o2;                    // fraction 0..1 (fresh air ≈ 0.21)
      return o >= 0.19 ? 'good' : o >= 0.15 ? 'warn' : 'bad';
    }
    case 'co2': {
      const c = atmos.co2ppm;                // console rails: 1000 warn, 2000 alert
      return c < 1000 ? 'good' : c < 2000 ? 'warn' : 'bad';
    }
    case 'temperature': {
      const k = atmos.tempK;                 // comfortable ≈ 292–298 K; cold end reads cool
      if (k >= 291 && k <= 299) return 'good';
      if (k < 283) return 'cold';
      return 'warn';
    }
    case 'pressure': {
      const p = atmos.pressureKPa;           // sea-level ≈ 101 kPa
      return (p >= 90 && p <= 115) ? 'good' : (p >= 70 && p <= 130) ? 'warn' : 'bad';
    }
    default: return null;                    // power / water / unknown — caller's job or no data
  }
}

/**
 * The lens wash colour for one slot, or null (no wash → resting floor shows). Handles the `power`
 * lens from the slot's `active` flag (the same live power/lit predicate the amber glow reads,
 * VS-O-31/63): active → good, inactive → bad. Atmos lenses defer to `lensGrade`. PURE.
 * @param {string} lens
 * @param {{atmos?:object|null, active?:boolean}} slot   a decoded deck-view slot
 * @returns {string|null}
 */
export function lensSlotTint(lens, slot) {
  if (!lens || lens === 'none' || !slot) return null;
  if (lens === 'power') return GRADE_TINT[slot.active ? 'good' : 'bad'];
  const g = lensGrade(lens, slot.atmos || null);
  return g ? GRADE_TINT[g] : null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Selected crew → current room join (VS-O-62/63). Find the bound room slot whose tile-rect covers
// the crew's tile on the shown deck; surfaces the display name, atmosphere and derived power.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** True when (x,y) lies inside the slot's tile rect. PURE. */
function inRect(rect, x, y) {
  return rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/**
 * The room a crew member stands in, from the deck-view slots, or null when they are in no bound
 * room (a hall / corridor gap). `deckView` is one `decksView` entry's `slots`. PURE.
 * @param {{x:number,y:number}|null} crewTile
 * @param {Array|null} slots
 * @returns {{anchorName:string, displayName:string, atmos:object|null, active:boolean}|null}
 */
export function currentRoom(crewTile, slots) {
  if (!crewTile || !Array.isArray(slots)) return null;
  for (const s of slots) {
    if (s && s.occupied && inRect(s.rect, crewTile.x, crewTile.y)) {
      return {
        anchorName: s.anchorName, displayName: s.displayName || s.anchorName || '',
        atmos: s.atmos || null, active: !!s.active,
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Deck rail (VS-O-49/50/51 / IX-O-26). One pip per existing deck, highest deck number on top so
// up/down reads spatially. Before the decks channel lands, only the active deck's pip shows.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The deck-rail pips, highest deck first. `decksView` is the decoded per-deck list ([{deck,slots}]);
 * `activeDeck` is `frame.deck`. Empty/absent decks → a single active pip (the honest "not yet
 * known" state, IX-O-47/51). PURE.
 * @param {Array<{deck:number}>|null} decksView @param {number} activeDeck
 * @returns {{deck:number, active:boolean}[]}
 */
export function deckPips(decksView, activeDeck) {
  const a = (activeDeck | 0);
  const decks = Array.isArray(decksView) ? decksView.map((d) => d.deck | 0) : [];
  if (!decks.length) return [{ deck: a, active: true }];
  const uniq = Array.from(new Set(decks)).sort((x, y) => y - x); // highest first
  return uniq.map((deck) => ({ deck, active: deck === a }));
}

/** The relative `Cmd.deck(delta)` to reach a target deck from the current one (IX-O-26). PURE. */
export function deckDelta(targetDeck, currentDeck) {
  return (targetDeck | 0) - (currentDeck | 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Escape rung reducer (IX-O-35). The console's `escapeTarget` order (armed → dialogue → moss →
// relations → none) with ONE added rung — a Level-2 room-zoom ascends to Level-1 — slotted below
// relations and above no-op. The Level-2 side is owned by the roomzoom lane; here the rung only
// exists so the reducer is complete and future-proof (roomZoomOpen is always false until it lands).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{armed:boolean, dialogueOpen:boolean, mossActive?:boolean, relationsActive?:boolean, roomZoomOpen?:boolean}} s
 * @returns {'disarm'|'dialogue'|'moss'|'relations'|'ascend'|'none'}
 */
export function overviewEscape(s) {
  if (s && s.armed) return 'disarm';
  if (s && s.dialogueOpen) return 'dialogue';
  if (s && s.mossActive) return 'moss';
  if (s && s.relationsActive) return 'relations';
  if (s && s.roomZoomOpen) return 'ascend';
  return 'none';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Readout atmos formatters (VS-O-63). RAW room values → display text; the client owns all
// formatting (%, °C). InvariantCulture-safe: round + string concat only.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** O₂ fraction (0..1) → "NN%". PURE. */
export function fmtO2(o2) {
  const v = typeof o2 === 'number' && isFinite(o2) ? o2 : 0;
  return Math.round(v * 100) + '%';
}

/** CO₂ ppm → "N ppm" (rounded integer). PURE. */
export function fmtCo2(ppm) {
  const v = typeof ppm === 'number' && isFinite(ppm) ? ppm : 0;
  return Math.round(v) + ' ppm';
}

/** Kelvin → "NN°C" (rounded). PURE. */
export function fmtTemp(tempK) {
  const v = typeof tempK === 'number' && isFinite(tempK) ? tempK : 0;
  return Math.round(v - 273.15) + '°C';
}

/** The coarse per-room power state from the slot `active` flag (VS-O-63). PURE. */
export function powerLabel(active) {
  return active ? 'ON' : 'OFF';
}
