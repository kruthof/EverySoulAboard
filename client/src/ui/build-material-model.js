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

/** The default per-tool active-material map (both default to byte 0). PURE. */
export function defaultMaterials() {
  return { wall: 0, floor: 0 };
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
