// The executor interface. composeScene() produces a backend-agnostic DisplayList; an executor
// turns it into pixels. P1 ships the Canvas2D executor (canvas2d.js) for pixel-parity with the
// proven skin; P2 adds a WebGL2 executor implementing the same shape so it slots in without
// touching the pure core.

/**
 * @typedef {Object} ExecuteOpts
 * @property {import('./camera.js').Camera} camera camera descriptor (sets the transform)
 * @property {import('./sprites.js').SpriteAssets} [sprites] loaded sprite set (optional)
 * @property {boolean} [spriteMode] draw sprites when true and assets are ready
 * @property {number} [timeSec] wall-clock seconds, for the animated selection reticle
 */

/**
 * @typedef {Object} Executor
 * @property {(list: import('./compose.js').DrawOp[], ctx: any, opts: ExecuteOpts) => void} execute
 */

export {};
