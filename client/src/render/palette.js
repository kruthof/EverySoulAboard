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
FG[C.Unknown] = '#0b0716'; FG[C.Void] = '#161122'; FG[C.Floor] = '#443d5e'; FG[C.Wall] = '#6f6892';
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

// Solid ship body: deep hull AND unexplored fog render as this one dark mass, so the hull
// is a consistent solid the crew's movement never "reveals" tile by tile. Space beyond the
// hull stays the near-black canvas fill (FG[Unknown]), keeping the ship silhouette crisp.
export const HULL = '#161122';

/** True when a lens bg id actually paints a wash. */
export function hasWash(bg) {
  return WASH[bg] !== undefined;
}
