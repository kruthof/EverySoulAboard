// PURE model for the build MATERIAL picker. Lists the 6 wall + 6 floor materials of the item set
// (perilune-item-set.dc.html; the `id`s match client/src/items/index.js), maps each to the
// authoritative sim material BYTE the wire carries (the WallMaterial / FloorMaterial enum order in
// sim/Sim.Core), and reduces the active-material selection the palette holds per tool.
//
// The `mat` byte is interpreted per tile TYPE sim-side: on a wall tile it is a WallMaterial, on a
// floor tile a FloorMaterial. 0 is the default for both, so an un-chosen build lands as the default
// skin and a fresh/legacy world reads unchanged. No DOM, no wire, no mutation. ASCII only.

/** Wall materials, in picker order. `mat` == the sim WallMaterial byte. */
export const WALL_MATERIALS = Object.freeze([
  { id: 'steel-bulkhead',    mat: 0, label: 'STEEL' },
  { id: 'timber-lined-wall', mat: 1, label: 'TIMBER' },
  { id: 'blast-wall',        mat: 2, label: 'BLAST' },
  { id: 'glass-partition',   mat: 3, label: 'GLASS' },
  { id: 'insulated-wall',    mat: 4, label: 'INSULATED' },
  { id: 'hull-plating',      mat: 5, label: 'HULL' },
]);

/** Floor materials, in picker order. `mat` == the sim FloorMaterial byte. */
export const FLOOR_MATERIALS = Object.freeze([
  { id: 'steel-tan-floor',   mat: 0, label: 'STEEL-TAN' },
  { id: 'wood-plank-floor',  mat: 1, label: 'WOOD' },
  { id: 'grow-matting',      mat: 2, label: 'GROW MAT' },
  { id: 'cream-tile-floor',  mat: 3, label: 'CREAM TILE' },
  { id: 'metal-grating',     mat: 4, label: 'GRATING' },
  { id: 'carpet-floor',      mat: 5, label: 'CARPET' },
]);

/** The material list for a build tool, or [] for tools that carry no material. PURE. */
export function materialsForTool(tool) {
  if (tool === 'wall') return WALL_MATERIALS;
  if (tool === 'floor') return FLOOR_MATERIALS;
  return [];
}

/** True when a tool carries a material picker (wall / floor). PURE. */
export function toolHasMaterial(tool) {
  return tool === 'wall' || tool === 'floor';
}

/**
 * The item-set itemId for a (tool, mat byte) — used to skin ghosts + built tiles. Unknown mat falls
 * back to the tool's default (mat 0); a tool without materials → ''. PURE.
 */
export function materialItemId(tool, mat) {
  const list = materialsForTool(tool);
  if (!list.length) return '';
  const m = list.find((e) => e.mat === (mat | 0));
  return (m || list[0]).id;
}

/** The default per-tool active-material map (both default to byte 0). PURE.
 *
 * ⛔ ⚠️ BYTE 0 IS THE AUTHORED MATERIAL, SO THE FLOOR TOOL'S DEFAULT DRAG IS A GUARANTEED NO-OP ON AN
 * UNTOUCHED SHIP — and that is the owner's 2026-08-03 "I cannot build anything except the walls"
 * complaint, measured: `BuildSystem.CanDesignate` refuses a re-floor to the material a tile already
 * carries (`sim/Sim.Core/Systems/BuildSystem.cs`, the `GetMaterial(pos) == material` line), and the
 * wreck's floors ARE material 0. Default drag ⇒ nothing painted, nothing said. WALL is unaffected:
 * its byte-0 default paints a wall where there was none, so the material never decides the outcome.
 *
 * ⭐ THE DEFAULT IS DELIBERATELY LEFT AT 0 rather than moved to WOOD, and the argument is the
 * owner's own OD-G/"a movie, not a game" rule rather than taste. Pre-selecting a material the player
 * did not choose makes the FIRST floor they ever lay a decision the game took for them, and it does
 * not even close the hole: a room already floored in wood would silently no-op the wood default in
 * exactly the same way, so the "fix" would be a coin-flip dressed as a default. The honest answer is
 * to SAY SO — `allTilesAlreadyMaterial` below is what the Room Zoom asks after a swept release, and
 * the sentence it produces (`FLOOR ▸ ALREADY STEEL-TAN — PICK ANOTHER MATERIAL`) is the sibling of
 * the `ERASE ▸ NOTHING TO ERASE HERE` toast that already lives in that same commit path for the
 * identical shape: a sweep that legitimately committed nothing, reported instead of swallowed. */
export function defaultMaterials() {
  return { wall: 0, floor: 0 };
}

/** The picker LABEL for a (tool, mat byte) — 'STEEL-TAN', 'WOOD', … Unknown mat falls back to the
 *  tool's default entry; a tool without materials → ''. PURE. */
export function materialLabel(tool, mat) {
  const list = materialsForTool(tool);
  if (!list.length) return '';
  const m = list.find((e) => e.mat === (mat | 0));
  return (m || list[0]).label;
}

/**
 * ⭐ THE FLOOR NO-OP QUESTION: does EVERY tile in this swept rectangle already carry material
 * `mat` on `deck`? True ⇒ the sim will refuse the whole sweep as an identity re-floor and the drag
 * will paint nothing, so the surface owes the player a sentence.
 *
 * ⛔ IT READS THE SIM'S OWN DATA, IT DOES NOT RE-DERIVE THE SIM'S RULE. `rows` is the decoded
 * `materials` channel — a sparse read-only projection of the authoritative World material plane
 * (`GameSession.BuildMaterials`), emitting one entry per tile whose material differs from the
 * DEFAULT. So "absent from `rows`" means byte 0, exactly as it does host-side, and that convention
 * is the one thing here that could silently drift; `client/test/palette-honesty.test.js` pins it
 * against the host emitter's own comment rather than restating it.
 *
 * ⚠️ IT IS DELIBERATELY ALL-OR-NOTHING, never per-tile. A mixed sweep DOES commit something, and a
 * toast reading "already steel-tan" over a drag that laid four tiles would be the confident wrong
 * number this repo's ledger doctrine exists to delete. Only a sweep that can be PROVEN to have
 * committed nothing speaks. An empty tile list is not such a proof and answers false.
 * PURE — no DOM, no wire, no mutation.
 *
 * @param {Array<{x:number,y:number}>} tiles the swept tiles
 * @param {Array<{deck:number,x:number,y:number,mat:number}>} rows decoded `materials` channel
 * @param {number} deck the focused deck
 * @param {number} mat the active material byte
 */
export function allTilesAlreadyMaterial(tiles, rows, deck, mat) {
  if (!Array.isArray(tiles) || !tiles.length) return false;
  const want = mat | 0;
  const at = new Map();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (r && (r.deck | 0) === (deck | 0)) at.set((r.x | 0) + ',' + (r.y | 0), r.mat | 0);
    }
  }
  for (const t of tiles) {
    const cur = at.get((t.x | 0) + ',' + (t.y | 0)) || 0;
    if (cur !== want) return false;
  }
  return true;
}

/** The active material byte for a tool from the state map (0 for tools without materials). PURE. */
export function activeMaterial(state, tool) {
  if (!state || !toolHasMaterial(tool)) return 0;
  return state[tool] | 0;
}

/**
 * Reducer: choose material `mat` for `tool`. A tool without materials or an unknown `mat` is a no-op
 * (returns the SAME state reference so idle repaints stay inert). Never mutates. PURE.
 */
export function setMaterial(state, tool, mat) {
  if (!toolHasMaterial(tool)) return state;
  const list = materialsForTool(tool);
  if (!list.some((e) => e.mat === (mat | 0))) return state;
  if (state && (state[tool] | 0) === (mat | 0)) return state;
  return Object.assign({}, state || defaultMaterials(), { [tool]: mat | 0 });
}
