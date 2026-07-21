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
  `procedural.js` (vector fallback painters), `sprites.js` (image/rotation runtime + C7 animation
  variants), `motion.js` (pure animation runtime), `canvas2d.js` (the Canvas2D executor),
  `executor.js` (the two-backend interface + contract).
- `src/render/webgl/` — the WebGL2 backend's **pure** halves plus the thin GL layer: `batch.js`
  (`buildPasses` — DisplayList → ordered RenderPasses) and `atlas.js` (`packAtlas` — sprite-atlas
  placement + UV math) are No-DOM/No-GL and golden-tested; `gl.js` is the ONLY GPU-touching module
  (context, two shader programs, one VAO+VBO, atlas texture, premultiplied blending, context-loss).
- `src/render/rasterplan.js` — **pure** decision layer for the GL executor: which atlas cell each
  RenderPass op needs (sprite image vs baked procedural cell), its tint/alpha/facing, and the
  atlas signature that triggers a rebuild. Unit-tested (no DOM).
- `src/render/webgl2.js` — the `WebGL2Executor`: rasterizes procedural painters + sprite images
  into one canvas-backed atlas (via `rasterplan` + `atlas.js`), uploads once, and per frame walks
  `buildPasses` into batched quads through `gl.js`. Same `.execute(list, ctx, opts)` shape as
  Canvas2D. DOM/GPU glue only — every decision is in the pure modules above.
- `src/render/exec-select.js` — **pure** backend + `?t=` time-freeze selection (unit-tested).
- `src/render/motion.js` — **pure** C7 animation runtime: per-cid tracking across frames
  (`trackMotion` — walk vs teleport/deck/fog-reveal/despawn), the deterministic walk-cycle frame
  index + sub-tile interpolation (`walkFrameIndex`/`walkOffset` — `timeSec`/`progress` as inputs),
  and the absence-tolerant sprite-variant selectors (`deviceSpriteKey`/`pawnSpriteKey`). Both
  executors consume it; compose stays time-free, so a fixed `timeSec` is fully deterministic.
- `src/input/controls.js` — mouse + keyboard map (verbatim behaviour port).
- `src/ui/` — HTML chrome + the P2 floating panels. `hud.js` (sidebar/status/log DOM + panel
  routing), **`chat.js`** (PURE conversation-stream reassembler), **`portraits.js`** (PURE portrait
  resolver + silhouette fallback), **`terminal-model.js`** (PURE MOSS-IDE state machine), `panels.js`
  + `panel-base.js` + `terminal.js` (DOM-only dialogue/citizen/terminal shells).
- `src/main.js` — runtime glue (canvas sizing, camera placement, sprite toggle, reticle loop);
  `makeExecutor(canvas)` genuinely selects the backend from `?exec=canvas2d|webgl2` (default
  `canvas2d`). `webgl2` builds the real `WebGL2Executor` when WebGL2 is available; on a
  construction failure OR a mid-session `webglcontextlost` it falls back to Canvas2D silently
  (a lost GL canvas can't hand itself back as 2D, so the canvas element is swapped for a fresh
  clone and input is rebound — the frame loop never crashes). `?t=<sec>` freezes the reticle
  pulse for deterministic screenshots (see the parity harness).
- `assets/sprites.g.js` — **generated** (see below).

### WebGL2 backend (pure batcher + atlas)

The WebGL2 executor draws the same DisplayList as Canvas2D, but first groups it into **four
ordered RenderPasses** via `buildPasses(list, {timeSec})` (`src/render/webgl/batch.js`) and packs
the sprite set with `packAtlas(sizes, opts)` (`src/render/webgl/atlas.js`). Both are pure and
deterministic (`timeSec` is an input — the selection-reticle pulse phase is derived from it as
data, never a clock read), so they are golden-tested with no GPU.

| pass       | consumes                                  | op shape |
|------------|-------------------------------------------|----------|
| `terrain`  | hull/void/floor/debris/wall               | `{kind, x, y}` — `kind` (incl. `wall`/`wall_vert`) doubles as the atlas/fill key |
| `entities` | entity                                    | `{kind:'entity', x, y, sprite, turns, tint, alpha, glyph, pv, overlay}` — `sprite`=atlas key or `null` (procedural); `turns`=facing transform |
| `light`    | op:`light`                                | `{kind:'light', x, y, state}` — per-tile LightState overlay (multiply pass); empty when the deck carries no lighting |
| `overlay`  | wash / cursor / reticle                   | `{kind:'wash'|'cursor'|'reticle', …}`; reticle carries `phase` from `timeSec` |

Pass order is fixed (`terrain < entities < light < overlay`) and within a pass ops keep the
DisplayList order, so GL overdraw matches the canvas skin exactly.

The **executor itself** (`src/render/webgl2.js`) turns those passes into pixels: at startup (and
whenever the atlas signature changes — a `P` sprite toggle, or a new glyph/colour scrolling into
view) it rasterizes the procedural painters (`procedural.js`) AND the loaded sprite images
(`sprites.js`) into ONE canvas-backed atlas at `packAtlas` placements and uploads it once via
`gl.js`. Per frame it walks the passes into interleaved quad batches: flat hull/void + textured
base tiles (terrain), atlas sprite or baked procedural cell with facing carried as a UV rotation
and dim as alpha (entities), the **multiply-blend light pass** (each `state` byte becomes a
`dst *= M` darken/tint from `palette.LIGHT`, empty when the deck is fully lit), and the lens wash
+ cursor/reticle overlay (lens reads OVER lighting).
Which cell each op needs is decided by the PURE `rasterplan.js` (unit-tested); `gl.js` and
`webgl2.js` are the only DOM/GPU code and are covered by the parity harness below, not node.

### Render-parity harness (`client/tools/`)

Canvas2D is the proven reference; the WebGL2 backend must reproduce it. `client/tools/shot.mjs`
boots the sim host (`hosts/web` on :8332) + the static client (`serve.py` on :8333), then drives
headless Chrome (`chrome --headless --screenshot`, the `art/spritegen/run.py stage_shot` pattern)
against a frozen scene — `?exec=…&cx=…&cy=…&zoom=…&t=0` — for **both executors at two zooms**, and
diffs each pair with `client/tools/imgdiff.py` (Pillow, already a spritegen dep):

```sh
node client/tools/shot.mjs                 # → PNGs + diff in client/tools/.shots/ (git-ignored)
# knobs: --out DIR --host-port N --client-port N --cx N --cy N --zoom "36,90"
# env:   CHROME=/path/to/Chrome  DOTNET=~/.dotnet/dotnet
python3 client/tools/imgdiff.py A.png B.png [--tol 40] [--bar 0.90]   # standalone diff
```

**Parity is intentionally not pixel-perfect.** The GL path rasterizes the *same* painters/sprites
but then samples them through nearest-magnify + mipmapped-minify under premultiplied-alpha blending,
so antialiased edges and zoomed-out (minified) tiles differ by a few levels. The tolerance: a pixel
"matches" when its max per-channel diff ≤ **40/255**; the parity **bar is ≥ 90% matching pixels**.
Structural elements — tile positions, sprite/cell choice, facing, and colours within tolerance —
must match; the near-zoom shot (upscaled, crisp NEAREST) matches more tightly than the far-zoom
shot (downscaled, where GL mipmaps soften vs the canvas skin's nearest sampling). If headless
Chrome or a GPU/SwiftShader context is unavailable, the harness still runs by hand — it prints the
active backend it captured per shot (grep of `[perilune] backend=…`); if `webgl2` silently fell
back to Canvas2D the two PNGs will be identical (diff ~0), which is the tell that GL never engaged.

### Manual parity + context-loss checklist

Against a live host (`~/.dotnet/dotnet run --project hosts/web -- --port 8330` + `serve.py`):

1. Open `?exec=canvas2d` and `?exec=webgl2` side by side — terrain, sprites, facing, lens wash,
   hover cursor and the selection reticle should read the same (colours within tolerance).
2. Press `P` in the `webgl2` tab — the atlas rebuilds for procedural mode; the vector skin should
   match the Canvas2D procedural skin.
3. Zoom in (scroll up) — GL magnify stays crisp (NEAREST); zoom out — tiles stay readable (mipmaps).
4. **Context-loss drill.** In the `webgl2` tab's devtools console:
   `document.querySelector('#c').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`
   — the client logs `webgl2 context lost — falling back to canvas2d`, swaps the canvas element,
   rebinds input, and keeps rendering as Canvas2D. Pan/zoom/select must still work (no dead frame).

### DisplayList op vocabulary (`composeScene` output)

Flat, deterministically-ordered, integer tile coordinates. Tiles are emitted row-major within
the camera cull window; each tile emits `[base, entity?, light?, wash?, cursor?]`; a single
`reticle` (if the selected tile is visible) is appended last — reproducing Client.html's draw order.

| op        | fields                                   | meaning |
|-----------|------------------------------------------|---------|
| `hull`    | x, y                                     | deep hull **or** unexplored fog — one dark mass |
| `void`    | x, y                                     | known-empty space inside the hull |
| `floor`   | x, y                                     | floor base tile |
| `debris`  | x, y                                     | rubble base tile |
| `wall`    | x, y, vert, face                         | wall: panel when `face`, else hull mass; `vert`=rotated run |
| `entity`  | x, y, g, fg, dim, role, turns, pv        | device/citizen/item/door on a floor base (`role`/`turns` drive facing sprites, `pv`=pawn variant) |
| `light`   | x, y, state                              | per-tile LightState overlay (`palette.LIGHT`); below the wash, above entities; only visible states (Dead/Emergency/Brownout) emit |
| `wash`    | x, y, bg                                 | translucent lens tint (`bg`=lens color id) |
| `cursor`  | x, y                                     | hover cursor (ATTR_INVERSE) |
| `reticle` | x, y                                     | selected-crew reticle (drawn last; the executor animates it) |

The **fog gate is first**: an unexplored tile emits *only* a `hull` op (no wash, no cursor, no
`light` — the decoded plane is never trusted to gate itself) — the load-bearing invariant,
asserted in `test/scene.test.js` + `test/lighting.test.js`.

## P2 panels: dialogue, citizen card, terminal drawer (`src/ui/`)

The slice UI is built as **pure view-models + DOM shells**, so the logic is testable without a
browser. As of C5 the dialogue is **live**: <kbd>T</kbd> (or <kbd>Enter</kbd> on a selected crew)
sends `talk {cid}`, the input box sends `say {sid,text}`, and closing the window (× or <kbd>Esc</kbd>)
sends `bye {sid}`. Citizen cards resolve their portrait through the generated registry glue
(`assets/portraits-registry.js` → silhouette fallback), and an `llmstatus` message drives a small
strip chip (backend · degraded · $ /hr):

- **`chat.js`** — a PURE reducer over the `chat` wire events (`start`/`delta`/`line`/`effect`/`end`,
  keyed by `sid`). The transcript is built ONLY from `line` + `effect` events, so **a client that
  dropped every `delta` still renders a byte-correct transcript from lines alone**; a `line`
  supersedes its turn's cosmetic delta preview; deltas reorder by `seq`, dedup (first-wins) and
  tolerate gaps. `sessionModel(session)` is the render-ready view-model.
- **`portraits.js`** — `resolvePortrait(citizen, registry)` maps a `portrait` key to an image, or —
  when the key is unknown/absent (no art yet) — a MANDATORY procedural silhouette (initials over a
  hue hashed deterministically from `cid`). Never throws.
- **`terminal-model.js`** — a PURE state machine for the MOSS terminal IDE: the editor lifecycle
  (`viewing`/`dirty`/`compiling`/`installed`/`error`), diagnostic normalize + sort/merge (by line,
  col, severity; exact dups collapse), gutter-marker geometry from 1-based (line,col), and a bounded
  audit ring. `reduceMoss(state, msg)` folds source/diag/audit/rterror, ignoring other-tid messages.
- **`terminal.js`** — the DOM drawer over that model: a source textarea with a synced line-number
  gutter + diagnostic markers, a diagnostics list, an audit pane (⟳ = `moss audit`), an Install
  button (`moss set`), and a runtime-error banner. Opens on a `device {kind:"terminal"}` message
  (which fires `moss open`); switches its bound `tid` when a different terminal is selected.
- **`panels.js`** — DOM-only panel framework (open/close/z-order-on-focus) over the shared
  `panel-base.js` chrome: the dialogue window (transcript + streaming indicator + live input box →
  `say`, close → `bye`), the citizen card (portrait/name/role/mood/traits), and the MOSS terminal
  drawer (routed to `terminal.js`). `#panels` stays empty (view unchanged) until the first
  chat/citizen/device/moss message. `selectedCrewCid(frame)` (`wire/messages.js`, PURE) resolves the
  T-key's target from the crew tuple `[x,y,pv,cid]`.

Wire shapes are documented as JSDoc typedefs in `wire/messages.js` (`ChatMsg`/`CitizenMsg`/`MossMsg`/
`LlmStatusMsg`); `main.js` routes them to `Hud.renderChat/renderCitizen/renderMoss/renderLlmStatus`
and wires `talk`/`say`/`bye` to the session. **L6 host note:** the live conversation server (`talk`→
stream→`bye`) lands in a parallel spine lane; C5 is built + tested against fixtures (`test/fixtures/
session_live.jsonl`). When L6 is on main, record a real `TemplateBackend` session into a fixture.

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
- `test/webgl2.test.js` — the GL executor's PURE halves: the rasterization plan (`rasterplan.js` —
  terrain/entity/overlay → cell key or flat, sprite-vs-procedural per mode, dim/facing/lock, the
  atlas signature) over the boot fixture, and backend/time selection (`exec-select.js`). The GL
  layer + executor DOM/GPU glue are covered by the parity harness above, not node.
- `test/ui.test.js` — the P2 panel cores: the chat reassembler (out-of-order/dup/dropped seq,
  line-overrides-deltas byte-exact, end-without-line, zero-delta, two interleaved sids, non-
  mutation) and the portrait resolver (deterministic hue, unknown-key silhouette safety). Replays
  the hand-written wire fixtures in `test/fixtures/*.jsonl` end-to-end.
- `test/lighting.test.js` — C4 lighting: the palette contract, the compose fog gate over an
  untrusted plane (a light claimed on fog is dropped), the RLE plane decode round-trip + tolerance,
  no-lights byte-compat, the light-op ordering invariant (after entity, before wash), and
  canvas2d↔batch routing parity of the overlay.
- `test/dialogue.test.js` — C5 dialogue-live: the talk/say/bye/moss command constructors, the
  `selectedCrewCid` resolver (the T-key target), the full live flow (fixture replay of
  `session_live.jsonl` with interleaved citizen + llmstatus), a mid-session reconnect that resets
  cleanly without wedging, flaky-link tolerance, and interleaved live sessions.
- `test/terminal.test.js` — C6 MOSS IDE model: the editor state machine (viewing→dirty→compiling→
  installed / error), diag normalize + sort/merge, gutter-marker layout math, the audit ring cap,
  unknown-tid / absent-terminal safety + non-mutation, and a real-wire fixture replay
  (`moss_session.jsonl`: source → multi-error diag → audit → rterror).
- `test/motion.test.js` — C7 motion: the reset matrix (teleport/deck/fog/despawn/standing vs a real
  one-tile walk), non-mutation, deterministic `walkFrameIndex` + `walkOffset` interpolation, and the
  absence-tolerant device/pawn variant selectors. `test/webgl2.test.js` is extended: walking pawns
  resolve a walk-frame cell, devices resolve broken/off cells, the atlas bakes every walk frame
  (timeSec-stable signature), and static scenes stay byte-identical to the pre-C7 cell set.

Cases live in `test/cases.js` (shared by tests and both regen scripts). Regenerate goldens
**only** for an intended rendering change, and explain the diff in the commit:

```sh
node client/tools/regen-goldens.mjs         # DisplayList goldens (or: npm run regen-goldens)
node client/tools/regen-pass-goldens.mjs    # WebGL RenderPass goldens
```

> Note: Node 24's test runner rejects a bare directory positional (`node --test test/`); use the
> glob form above, or `cd client && node --test` (default discovery).
