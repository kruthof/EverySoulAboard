// Hand-written glue (NOT generated) — adapts the generated portrait manifest to the shape
// the wave-1 resolver wants. client/src/ui/portraits.js `resolvePortrait(citizen, registry)`
// expects `registry` to be a plain { portraitKey -> imageSrc } map; the generated manifest
// (portraits.g.js) is { portraitKey -> { file } } so the pipeline can carry more per-entry
// metadata later without breaking the resolver. This module bridges the two, resolving each
// file relative to itself so it works under any base URL (localhost, Tauri, PERILUNE Cloud).
//
// Keys are persona portrait keys (pk_xxxxxxxx, see hosts/scenario PersonaDump.PersonaKey).
// A citizen whose key is absent here simply keeps the procedural silhouette fallback.

import { PORTRAITS } from './portraits.g.js';

/**
 * E0-7 — THE SLICE'S CITIZEN IDS SHIFTED BY ONE, and this is where that is paid for.
 *
 * A portrait key is `pk_fnv1a32(shipSeed, citizenId)` (hosts/scenario PersonaDump.PersonaKey), and
 * entity ids are handed out in plan order with devices before citizens. E0-7 authored ONE new
 * device onto `--ship slice` — the ice melter on the hydro loop — so all eight crew ids moved up by
 * one and every one of them started resolving to the NEXT crew member's baked face, with the eighth
 * resolving to nothing. That is a face swap, not a missing image, which is why it is fixed rather
 * than left to the procedural-silhouette fallback.
 *
 * The fix is a REMAP, not new art and not a rename: each crew member's NEW key is pointed at the
 * PNG that was baked for them under their OLD id, so every face stays with its person. Nothing in
 * `client/assets/portraits/` changed and `portraits.g.js` (which is generated) was not touched —
 * adapting the generated manifest is precisely this module's job.
 *
 * ORDER IS THE ROSTER ORDER in AuthoredShips.PeriluneSlice(). Re-running the portrait pipeline
 * against the current ship would regenerate `portraits.g.js` with these keys directly and let this
 * table be deleted; until then it is the record of what moved and why.
 *
 * `tests/Perilune.Tests/SlicePortraitKeysTests.cs` computes each slice citizen's key with the REAL
 * PersonaKey function and asserts it resolves here — so a future id shift fails loudly instead of
 * silently handing the crew each other's faces again.
 */
const SLICE_ID_SHIFT_REMAP = Object.freeze({
  pk_7c4eede7: 'pk_4a48938e', // Amara Okonkwo
  pk_ae554840: 'pk_7c4eede7', // Priya Raghavan
  pk_d7913cf1: 'pk_ae554840', // Dmitri Volkov
  pk_0c5b885a: 'pk_d7913cf1', // Salif Camara
  pk_3e61e2b3: 'pk_0c5b885a', // Nadia Hassan
  pk_70683d0c: 'pk_3e61e2b3', // Tomas Ferreira
  pk_99a431bd: 'pk_70683d0c', // Grace Oyelaran
  pk_cbaa8c16: 'pk_99a431bd', // Wei Chen
});

/** @type {Object<string, string>} portrait key → resolvable image URL. */
export const portraitRegistry = Object.fromEntries(
  Object.entries(PORTRAITS)
    .map(([key, entry]) => [key, new URL(entry.file, import.meta.url).href])
    .concat(
      Object.entries(SLICE_ID_SHIFT_REMAP)
        .filter(([, baked]) => PORTRAITS[baked])
        .map(([key, baked]) => [key, new URL(PORTRAITS[baked].file, import.meta.url).href]),
    ),
);

export default portraitRegistry;
