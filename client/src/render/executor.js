// The executor interface. composeScene() produces a backend-agnostic DisplayList; an executor
// turns it into pixels. P1 ships the Canvas2D executor (canvas2d.js) for pixel-parity with the
// proven skin; P2 adds a WebGL2 executor implementing the same shape so it slots in without
// touching the pure core. main.js's makeExecutor() picks the backend from `?exec=` and defaults
// to canvas2d until the GL executor lands.
//
// Two-backend contract:
//   Canvas2D  — buckets the DisplayList by `passIndexOf` (webgl/batch.js) and walks the SAME four
//               passes the GL backend draws, issuing one canvas op per DrawOp (canvas2d.js).
//   WebGL2    — first groups the DisplayList into ordered RenderPasses via the PURE batcher
//               (webgl/batch.js → buildPasses), packs the sprite set with the PURE atlas packer
//               (webgl/atlas.js → packAtlas), then uploads each pass as an instanced quad batch.
//               The batcher + packer are data-in/data-out and golden-tested; only the thin GL
//               upload/draw layer (a later package) touches the GPU. Both backends consume the
//               SAME DisplayList and the SAME ExecuteOpts, so the swap is invisible to the core.
//
// Pass order (webgl/batch.js): terrain → entities → light → overlay. The reticle's animation
// phase is derived from ExecuteOpts.timeSec as DATA inside the batcher, keeping buildPasses pure.

/**
 * @typedef {Object} ExecuteOpts
 * @property {import('./camera.js').Camera} camera camera descriptor (sets the transform)
 * @property {import('./sprites.js').SpriteAssets} [sprites] loaded sprite set (optional)
 * @property {boolean} [spriteMode] draw sprites when true and assets are ready
 * @property {number} [timeSec] wall-clock seconds, for the animated selection reticle + walk cycle
 * @property {Object<string,import('./motion.js').MotionEntry>} [motion] per-tile motion (walk slide)
 * @property {number|null} [nowMs] wall-clock ms driving the continuous slide; null = settled (frozen)
 * @property {{count:number,data:Float32Array,stride:number}} [lightMesh] the WP-3 light field
 *   (render/lightfield.js `buildLightMesh`) — a vertex-coloured multiply mesh that REPLACES the
 *   flat per-tile light overlay. Optional: omit it and both backends fall back to the flat overlay,
 *   byte-identical to the pre-WP-3 output.
 */

/**
 * @typedef {Object} Executor
 * @property {(list: import('./compose.js').DrawOp[], ctx: any, opts: ExecuteOpts) => void} execute
 */

export {};
