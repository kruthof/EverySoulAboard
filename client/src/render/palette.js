// Semantic palette — GlyphColor byte -> RGB. Mirrors the intent of AnsiPaint / the wire's
// GlyphColor enum EXACTLY (index order is load-bearing: the wire ships raw enum bytes).
// This is a verbatim port of the `C` / `FG` / `WASH` tables in hosts/web/Client.html so the
// structured client is pixel-faithful to the proven canvas skin.

/** GlyphColor enum → index. Append-only, mirrors Perilune.Glyph.GlyphColor. */
export const C = {
  Unknown: 0, Void: 1, Floor: 2, Wall: 3, Debris: 4, Crew: 5, Hostile: 6, Item: 7, Device: 8,
  DeviceDim: 9, Broken: 10, Locked: 11, Terminal: 12, Water: 13, Growth: 14, Designate: 15,
  Stockpile: 16, LensGood: 17, LensOk: 18, LensWarn: 19, LensBad: 20, LensCold: 21, LensHot: 22,
  Accent: 23, Text: 24, TextDim: 25,
};

/** @type {string[]} Foreground RGB per GlyphColor index. */
export const FG = [];
// Unknown is the canvas CLEAR (the field behind everything) and Void is known-empty space; both
// are TRUE BLACK so the hull's graphite silhouette (HULL, below) always reads against space.
// See "The three dark states" at the foot of this file.
FG[C.Unknown] = '#050409'; FG[C.Void] = '#050409'; FG[C.Floor] = '#443d5e'; FG[C.Wall] = '#6f6892';
FG[C.Debris] = '#96795a'; FG[C.Crew] = '#2de2ff'; FG[C.Hostile] = '#ff4d6a'; FG[C.Item] = '#e0a84f';
FG[C.Device] = '#8f9fe8'; FG[C.DeviceDim] = '#5c5b7a'; FG[C.Broken] = '#d03a55'; FG[C.Locked] = '#ffb02e';
FG[C.Terminal] = '#2de2ff'; FG[C.Water] = '#3ab4f0'; FG[C.Growth] = '#b06df5'; FG[C.Designate] = '#ff3d8a';
FG[C.Stockpile] = '#b0a860'; FG[C.LensGood] = '#3ee08a'; FG[C.LensOk] = '#c6d13a'; FG[C.LensWarn] = '#ffb02e';
FG[C.LensBad] = '#ff4d6a'; FG[C.LensCold] = '#3ab4f0'; FG[C.LensHot] = '#ff6d4a'; FG[C.Accent] = '#2de2ff';
FG[C.Text] = '#e4def2'; FG[C.TextDim] = '#948caa';

/** @type {string[]} Lens background wash (translucent over the tile). Only lens bg ids tint. */
export const WASH = [];
WASH[C.LensGood] = 'rgba(62,224,138,.20)'; WASH[C.LensOk] = 'rgba(198,209,58,.18)';
WASH[C.LensWarn] = 'rgba(255,176,46,.20)'; WASH[C.LensBad] = 'rgba(255,77,106,.22)';
WASH[C.LensCold] = 'rgba(58,180,240,.20)'; WASH[C.LensHot] = 'rgba(255,109,74,.22)';

export const ATTR_INVERSE = 1;
export const ATTR_DIM = 2;

// Per-tile lighting overlay, keyed by the wire's LightState byte (sim/Sim.Glyph LightMapper):
//   0 Unknown  — fog, never reaches here (compose fog-gates); no overlay
//   1 Dead     — explored, no functioning light: a heavy near-black overlay
//   2 Emergency— reserved emergency lighting: a red tint
//   3 Brownout — a shed (browned-out) network: an amber tint
//   4 Powered  — lit normally: transparent / no-op (absent from the table)
// A state with no table entry paints nothing (Powered + Unknown are deliberately absent), so a
// fully-lit deck adds zero light ops and renders byte-identically to the no-lights path. Canvas2D
// fills this rgba as a translucent over-blend; the WebGL2 light pass folds it into a multiply.
//
// Dead is a ~0.52 WARM-DARK darkening — a room with the lamp OFF, not a morgue under moonlight.
// Both executors resolve the same rgba to the same factor — canvas2d over-blends `dst*(1-a)+C*a`,
// webgl2 folds the identical expression into a multiply `M = (1-a) + C*a` — so the per-channel
// multiply for rgba(58,42,30,.58) is
//   R (1-.58) + 58/255*.58 = 0.55   G … = 0.52   B … = 0.49   (luma ≈ 0.52)
// An unlit-but-explored room therefore lands at roughly half the lit value with a WARM cast: dim
// and inhabited, never void, and never confusable with the HULL mass an unexplored tile paints.
// (Design decision 2026-07-22, Garvin: "the ship does not need to be cold." The ship is warm where
// it is alive AND warm-dim where the lights are off; COLD is reserved for vacuum/hull, not rooms.)
//
// KNOWN SIDE EFFECT, measured: because the three channels are multiplied UNEQUALLY, this overlay
// does not merely darken — it manufactures a little chroma. Expanding the blend, the output's
// red-minus-blue distance is 0.42*(R−B) + (58−30)/255*.58*255 ≈ 0.42*(R−B) + 16, so a perfectly
// NEUTRAL grey comes out of a Dead room at chroma ~16 (WARM) — a quarter of the old cold overlay's
// +51, and pointing the friendly way. The sprite-side chroma ceilings in render/matte.js no longer
// have to fight a +51 cold term; the prop ceiling can return to 55 (see matte.js).
export const LIGHT = [];
LIGHT[1] = 'rgba(58,42,30,.58)';  // Dead — warm-dark half-light (lamp off; see the multiply above)
LIGHT[2] = 'rgba(224,48,64,.30)';  // Emergency — red
LIGHT[3] = 'rgba(255,168,54,.20)'; // Brownout — amber

/** The lighting overlay rgba for a LightState byte, or undefined when the state paints nothing. */
export function litOverlay(state) {
  return LIGHT[state];
}

// Solid ship body: deep hull AND unexplored fog render as this one mass, so the hull is a
// consistent solid the crew's movement never "reveals" tile by tile (the fog gate lives in
// composeScene; this colour must stay identical for both or exploration would leak).
// It is a HIGH-VALUE GRAPHITE (luma ≈ 39), so the ship's outline reads at every zoom instead of
// dissolving into the void — while still sitting a clear step BELOW the dimmest explored room,
// so "not yet seen" never outshines "seen but dark".
//
// CAVEAT, because it surprises people: "graphite against black space" is only true where space
// has actually been EXPLORED. composeScene emits `hull` for every unexplored tile and `void` only
// for a tile the projection has marked known-empty, so unexplored vacuum paints graphite (38.5)
// while explored vacuum paints true black (4.6). On a near shot of a partly-explored ship the
// exploration FRONTIER is therefore visible as a value step out in the vacuum. That is a
// deliberate consequence of "hull mass and fog must be the same colour or the fog gate leaks",
// not a bug — but it means the silhouette contrast is a property of the far/established shot, not
// something the near shot always shows.
export const HULL = '#282531';

// ── The three dark states ───────────────────────────────────────────────────────────────────
// Three different meanings used to share one near-black; they are now three separated bands, so
// a glance tells you which is which (measured on the slice frame, luma 0..255):
//   explored void           FG[Void] = FG[Unknown] = #050409     ~   5   true black
//   hull mass + ALL fog     HULL     = #282531                   ~  39   graphite silhouette
//   explored but UNLIT room floor art × LIGHT[1]                 ~  60   cold blue half-light
//   explored and LIT room   floor art (no overlay)               ~ 113   the working value range
// Whoever moves one of these must re-check the other three still separate — the ship's
// readability rests entirely on that ladder.

/** True when a lens bg id actually paints a wash. */
export function hasWash(bg) {
  return WASH[bg] !== undefined;
}
