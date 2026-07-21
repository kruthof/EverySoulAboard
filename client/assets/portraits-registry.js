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

/** @type {Object<string, string>} portrait key → resolvable image URL. */
export const portraitRegistry = Object.fromEntries(
  Object.entries(PORTRAITS).map(([key, entry]) => [key, new URL(entry.file, import.meta.url).href]),
);

export default portraitRegistry;
