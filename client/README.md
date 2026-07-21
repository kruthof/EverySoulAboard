# PERILUNE — structured web client (WS-CLIENT, P1)

A parity port of the proven vanilla-canvas skin (`hosts/web/Client.html`) into a modular,
testable client. Same pixels, same conventions, same input map — but restructured around a
**pure renderer core** so it can grow toward the VISION.md fidelity bar (WebGL2, lighting,
animation) without ever risking the sim or the wire.

The wire carries **semantic ids only** (glyph char + `GlyphColor`/`GlyphAttr` bytes); the
client owns every pixel. See `docs/ARCHITECTURE.md` → "The projection stack".

## Toolchain: plain JavaScript ES modules (zero build)

`npm` and Node 24 are available here, but the browser can't run `.ts` without a build step and
the P1 constraint is "no bundler-required runtime". So the client is **plain JS ES modules with
JSDoc types**: it runs in the browser directly (`<script type="module">`), in `node --test`
directly, and type-checks with `tsc --checkJs` (TypeScript is a dev-only dependency — no build
artifact ships). Zero install is required to run or test; `npm install` is only needed for the
optional type-check.

## Run it (dev loop)

```sh
# 1. start the sim host (owns the game + the /ws wire). Use 8330+ (other agents use 8323).
~/.dotnet/dotnet run --project hosts/web -- --port 8330

# 2. serve the client (any static server works; this one adds no-store + correct MIME)
python3 client/serve.py            # http://localhost:8331/   (pass a port arg to change)

# 3. open http://localhost:8331/ in a browser.
```

The client is served separately from the host, so it opens its WebSocket at
`ws://<hostname>:8330/ws` by default. Override with a query string:

- `?port=9000` — host on a different port
- `?ws=ws://host:port/ws` — full explicit URL
- `?cx=&cy=&zoom=` — frame a view (the spritegen shot-stage uses these; ported from Client.html)

### Manual play checklist (all verified against a live `hosts/web` on :8330)

Pan (WASD / drag), zoom (scroll, anchored on cursor), inspection cursor (arrows/hjkl, hover),
deck (R/F or buttons), lens 1–7 (+ legend card appears), pause (space/button), speed +/−,
click-select a crew / toggle a device, shift-click move, `m` move, `P` sprite toggle. The
command protocol was driven end-to-end against the running host: frame/metrics/status/legend
all update; `lens power` → legend populates, `pause`/`speed`/`deck`/`cursor`/`click` (device
toggle) all round-trip. (Crew select+move needs an explored `@`, fog-gated at boot.)

## Architecture: pure core + thin executor

```
wire (semantic) ─► composeScene(frame, camera, assets) ─► DisplayList ─► execute(list, ctx) ─► pixels
                    │ PURE: no DOM, no time, no mutation                 │ Canvas2D or WebGL2
                    └ golden-testable                                    └ swappable behind Executor
```

- `src/wire/` — `messages.js` (typed decode) + `session.js` (WebSocket + `Cmd` constructors).
- `src/render/` — `palette.js` (GlyphColor→RGB), `camera.js` (transform/cull/zoom/pan, pure),
  `glyphs.js` (neighbour + facing logic, pure), **`compose.js`** (the pure core),
  `procedural.js` (vector fallback painters), `sprites.js` (image/rotation runtime),
  `canvas2d.js` (the Canvas2D executor), `executor.js` (the two-backend interface + contract).
- `src/render/webgl/` — the WebGL2 backend's **pure** halves (the GL upload/draw layer lands in a
  later package): `batch.js` (`buildPasses` — DisplayList → ordered RenderPasses) and `atlas.js`
  (`packAtlas` — sprite-atlas placement + UV math). No DOM, no GL, golden-tested.
- `src/input/controls.js` — mouse + keyboard map (verbatim behaviour port).
- `src/ui/hud.js` — sidebar/status/log DOM.
- `src/main.js` — runtime glue (canvas sizing, camera placement, sprite toggle, reticle loop);
  `makeExecutor(canvas)` selects the backend from `?exec=canvas2d|webgl2` (default `canvas2d`
  until the GL executor exists; `webgl2` currently resolves to Canvas2D).
- `assets/sprites.g.js` — **generated** (see below).

### WebGL2 backend (pure batcher + atlas)

The WebGL2 executor will draw the same DisplayList as Canvas2D, but first groups it into **four
ordered RenderPasses** via `buildPasses(list, {timeSec})` (`src/render/webgl/batch.js`) and packs
the sprite set with `packAtlas(sizes, opts)` (`src/render/webgl/atlas.js`). Both are pure and
deterministic (`timeSec` is an input — the selection-reticle pulse phase is derived from it as
data, never a clock read), so they are golden-tested with no GPU.

| pass       | consumes                                  | op shape |
|------------|-------------------------------------------|----------|
| `terrain`  | hull/void/floor/debris/wall               | `{kind, x, y}` — `kind` (incl. `wall`/`wall_vert`) doubles as the atlas/fill key |
| `entities` | entity                                    | `{kind:'entity', x, y, sprite, turns, tint, alpha, glyph, pv, overlay}` — `sprite`=atlas key or `null` (procedural); `turns`=facing transform |
| `light`    | *(reserved)* op:`light`                   | empty until the sim emits lighting DrawOps; the pass slot always exists |
| `overlay`  | wash / cursor / reticle                   | `{kind:'wash'|'cursor'|'reticle', …}`; reticle carries `phase` from `timeSec` |

Pass order is fixed (`terrain < entities < light < overlay`) and within a pass ops keep the
DisplayList order, so GL overdraw matches the canvas skin exactly.

### DisplayList op vocabulary (`composeScene` output)

Flat, deterministically-ordered, integer tile coordinates. Tiles are emitted row-major within
the camera cull window; each tile emits `[base, entity?, wash?, cursor?]`; a single `reticle`
(if the selected tile is visible) is appended last — reproducing Client.html's draw order.

| op        | fields                                   | meaning |
|-----------|------------------------------------------|---------|
| `hull`    | x, y                                     | deep hull **or** unexplored fog — one dark mass |
| `void`    | x, y                                     | known-empty space inside the hull |
| `floor`   | x, y                                     | floor base tile |
| `debris`  | x, y                                     | rubble base tile |
| `wall`    | x, y, vert, face                         | wall: panel when `face`, else hull mass; `vert`=rotated run |
| `entity`  | x, y, g, fg, dim, role, turns, pv        | device/citizen/item/door on a floor base (`role`/`turns` drive facing sprites, `pv`=pawn variant) |
| `wash`    | x, y, bg                                 | translucent lens tint (`bg`=lens color id) |
| `cursor`  | x, y                                     | hover cursor (ATTR_INVERSE) |
| `reticle` | x, y                                     | selected-crew reticle (drawn last; the executor animates it) |

The **fog gate is first**: an unexplored tile emits *only* a `hull` op (no wash, no cursor) —
the load-bearing invariant, asserted in `test/scene.test.js`.

## Sprites (single source of truth = spritegen)

`assets/sprites.g.js` is generated from the `SPRITEGEN` block of `hosts/web/Client.html` (which
the spritegen pipeline owns) — never hand-edited. Regenerate after any spritegen run:

```sh
node client/tools/extract-sprites.mjs     # or: npm run extract-sprites
```

The marker block in `Client.html` is read, never modified. `SPRITE_FOR_GLYPH` and the paint
logic are skin code (in `src/render/`), not generated data.

## Tests (no GPU)

```sh
cd client && node --test "test/*.test.js"   # or: npm test
npm run typecheck                            # tsc --checkJs, clean (needs npm install once)
```

- `test/compose.test.js` — golden DisplayList tests: the committed wire fixture
  (`tests/Perilune.Tests/Golden/web_frame_boot.json`, read-only) + fixed cameras → asserted
  against committed goldens in `test/golden/`. Plus op-vocabulary, determinism, no-mutation.
- `test/scene.test.js` — behavioural invariants: the fog/hull rule, wall face/vert, lens wash,
  selection reticle, camera culling, facing.
- `test/webgl.test.js` — WebGL2 batcher + atlas: RenderPass goldens (`test/golden/passes/`, same
  fixture cases), pass ordering + per-pass vocabulary, the light-pass slot, determinism under
  deep-frozen inputs, entity resolution parity with the canvas skin, and atlas non-overlap /
  in-bounds UVs / order-independent packing.

Cases live in `test/cases.js` (shared by tests and both regen scripts). Regenerate goldens
**only** for an intended rendering change, and explain the diff in the commit:

```sh
node client/tools/regen-goldens.mjs         # DisplayList goldens (or: npm run regen-goldens)
node client/tools/regen-pass-goldens.mjs    # WebGL RenderPass goldens
```

> Note: Node 24's test runner rejects a bare directory positional (`node --test test/`); use the
> glob form above, or `cd client && node --test` (default discovery).
