# PERILUNE CLIENT UI — VISUAL SPEC v1 ("The Console")

Target: rebuild `client/index.html` + `client/styles.css` + `client/src/ui/hud.js` to the
warm Space Mono console language of `docs/design/perilune-game-ui.dc.html`. Every value
below is exact and implementable as written. Wire/DOM constraints per FACTS.md are honored:
all JS-referenced ids/classes keep existing; the canvas stage keeps the 28px padding
constant; `.term-code` keeps `line-height:18px`.

Conventions: colors are the mock's hexes verbatim unless flagged in §7 (contrast audit).
"Trio" = background / foreground / border. All borders are 1px solid unless stated.

---

## 1. Design tokens (VS-1 … VS-9)

**VS-1** — `:root` custom-property block. This is the complete palette; do NOT introduce
hues outside it (rgba() derivations of these hexes are allowed and enumerated in VS-8).

```css
:root {
  /* -- backgrounds -- */
  --bg-void:    #0c0a08;   /* page behind everything; canvas stage */
  --bg-deck:    #12100d;   /* app frame base */
  --bg-bar:     #161310;   /* top bar, bottom bar, panel bars, legend/inspect overlays */
  --bg-side:    #14110e;   /* crew watch, readout, floating panel bodies */
  --bg-inset:   #1a1611;   /* inactive tab/lens/chip fill; hover fill on flat rows */
  --bg-hover:   #2a2013;   /* hover fill on primary/amber-bordered controls */
  --bg-selrow:  #221b12;   /* selected crew-watch row */

  /* -- lines -- */
  --ln-hair:    #2b241c;   /* structural hairlines, dashed dividers, bar tracks */
  --ln-chip:    #3a332a;   /* chip/button/tab resting borders, avatar img border */
  --ln-row:     #2e2820;   /* crew-watch row resting border */

  /* -- amber accent ramp -- */
  --amber-1:    #cf7a33;   /* base accent: ship name, active borders, primary border */
  --amber-2:    #e8934a;   /* bright accent: live values, latest timestamp, links */
  --amber-3:    #f2b563;   /* peak: active tab/tool/lens fg, primary button fg, ghosts */
  --amber-4:    #b5652a;   /* deep amber (brownout grade, avatar hue only) */

  /* -- text ramp -- */
  --txt-hi:     #e8dcc9;   /* brightest: crew names, "> task", terminal code */
  --txt:        #b3aa9c;   /* body default */
  --txt-dim:    #8c8377;   /* secondary: roles, inactive control fg, log body */
  --txt-faint:  #57503f;   /* DECORATIVE ONLY — see VS-62 for the allowed uses */
  --txt-onacc:  #12100d;   /* dark text on amber/hue fills (avatar initials) */
  --txt-peak:   #fefbf6;   /* alert-chip fg, selection ring white */

  /* -- semantic -- */
  --good:       #5aa77f;   /* morale >=75%, nominal, run-dot, installed state */
  --warn:       #cf7a33;   /* morale >=50%, caution fills */
  --warn-txt:   #e8934a;   /* warn as TEXT at small sizes (see VS-63) */
  --bad:        #c25a3f;   /* fills/bars only — fails 4.5:1 as text (VS-63) */
  --bad-txt:    #e07a5f;   /* bad as TEXT, demolish fg, error diagnostics */
  --bad-deep:   #a53a25;   /* alert chip bg, demolish selected border */

  /* -- selected-state trio (tabs, tools, lenses, .on) -- */
  --sel-bg:     #3a2a12;
  --sel-fg:     #f2b563;
  --sel-bd:     #cf7a33;

  /* -- demolish-red trio -- */
  --demo-bg:    #3a1a10;
  --demo-fg:    #e07a5f;
  --demo-bd:    #a53a25;

  /* -- legacy aliases: hud.js writes these names in inline styles — keep working -- */
  --faint:      #57503f;   /* hud.js:41 "no events yet" line — decorative use, OK */

  /* -- type -- */
  --font-mono: 'Space Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

**VS-2** — Legacy semantic tokens `--good`, `--warn`, `--bad`, `--faint` (referenced by
name from `hud.js:19,31,41` inline styles) are defined above and MUST keep those exact
names. `--warn` maps to #cf7a33 and `--bad` to #c25a3f because hud.js uses them as `.fill`
bar backgrounds (non-text); any place hud.js uses them for *text* must switch to
`--warn-txt`/`--bad-txt` (currently none do — barColor() feeds backgrounds only).

**VS-3** — All other old tokens (`--neon`, `--pink`, `--panel`, `--edge`, `--ok`,
`--hull`, `--fog`, `--neon-dim`, `--dim`, `--text`, `--panel2`, `--bg`) are deleted. Grep
client/src for `var(--` before shipping; only VS-2's four names may appear from JS.

**VS-4** — Morale color function (mock DCLogic, roster morale is 0..1):
`m >= .75 → var(--good)`, `m >= .50 → var(--warn)`, else `var(--bad)`.
Note this is a NEW threshold set (75/50) distinct from hud.js `barColor` (66/33) which
stays as-is for ship-vitals bars. Keep both as pure functions; node-test the new one.

**VS-5** — Caution-chip state trios (derived client-side per FACTS — pure fn):
- `idle`:  bg transparent · fg var(--txt-dim) · bd var(--ln-hair) · label `SYSTEMS NOMINAL` · no animation
- `warn`:  bg var(--sel-bg) · fg var(--warn-txt) · no border · label e.g. `CAUTION · CO₂` · blinks
- `alert`: bg var(--bad-deep) · fg var(--txt-peak) · no border · label `MASTER CAUTION` · blinks

**VS-6** — Crew avatar hue palette (initials fallback backgrounds, assign stably by
cid hash order): `#cf7a33, #5aa77f, #c25a3f, #e8934a, #b5652a, #8c8377`. Initials always
`var(--txt-onacc)` (#12100d) — every pair ≥ 5.0:1 (§7).

**VS-7** — Lens grade tints (canvas-side lenses already recolor cells; these are for any
HTML lens accents e.g. legend chip dots): good `#7fc79f`, warn `#e8934a`, bad `#e07a5f`
as text; fills `rgba(90,167,127,.24)` / `rgba(207,122,51,.30)` / `rgba(194,90,63,.38)`.

**VS-8** — Permitted rgba derivations (exhaustive): `rgba(0,0,0,.55)` badge scrim,
`rgba(12,10,8,.88)` disconnect scrim, `rgba(12,10,8,.80)` inspect/legend overlay scrim,
`rgba(207,122,51,.22)` ghost fill, `rgba(255,244,230,.14)` lens room border,
`rgba(255,244,230,.60)` room-label ink, `rgba(0,0,0,.50)` deck-marker ring,
`rgba(194,90,63,.12)` term-banner fill, `rgba(0,0,0,.45)` panel drop shadow. Nothing else.

**VS-9** — `::selection { background: var(--sel-bg); color: var(--sel-fg); }`.

---

## 2. Typography (VS-10 … VS-16)

**VS-10** — Space Mono ships BUNDLED (offline client, no CDN at runtime). Files:
```
client/assets/fonts/SpaceMono-Regular.woff2   (400)
client/assets/fonts/SpaceMono-Bold.woff2      (700)
client/assets/fonts/OFL.txt                   (license — Space Mono is SIL OFL 1.1)
```
Obtain the latin-subset woff2 from Google Fonts (download once at build/dev time, commit
the files). Two weights only; italic is synthesized (only `.chat-effect` uses italic —
faux-oblique on a mono at 11px is acceptable and saves a file).

**VS-11** — @font-face (top of styles.css):
```css
@font-face { font-family:'Space Mono'; src:url('assets/fonts/SpaceMono-Regular.woff2') format('woff2');
  font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:'Space Mono'; src:url('assets/fonts/SpaceMono-Bold.woff2') format('woff2');
  font-weight:700; font-style:normal; font-display:swap; }
```
`body { font-family: var(--font-mono); }` — the whole client is mono; there is no second
family. Fallback stack per VS-1 renders acceptably if the woff2 ever fails.

**VS-12** — Type scale (complete; do not use sizes outside it):

| token         | size   | weight | tracking | line-height | used for |
|---------------|--------|--------|----------|-------------|----------|
| `--fs-micro`  | 9px    | 400    | .08em    | 1.3         | crew-row role line (uppercase) |
| `--fs-tag`    | 9.5px  | 400    | .06em    | 1.4         | hotkey line, hints, trait chips, readout role line (.1em), stage hint (.14em) |
| `--fs-label`  | 10px   | 400    | .18em    | 1.3         | section headers (CREW WATCH, READOUT, LENS SELECT, SENSOR LOG, PLACE ▸), uppercase |
| `--fs-small`  | 10.5px | 400    | .04em    | 1.7         | sensor-log lines, palette buttons, menu msg, memory/mood line (lh 1.6) |
| `--fs-body`   | 11px   | 400    | .10em top-bar / .08em tabs / 0 elsewhere | 1.4 | chrome default: chips, tabs, crew names, readout body, lens buttons, panel inputs |
| `--fs-code`   | 12px   | 400    | 0        | 18px FIXED  | terminal code+gutter (synced to terminal.js LINE_HEIGHT=18), chat lines (lh 1.5), avatar initials (700) |
| `--fs-name`   | 13px   | 700    | .02em    | 1.4         | readout selected-crew name, citizen-card name |

**VS-13** — Uppercase is applied via `text-transform:uppercase` (never pre-uppercased in
JS) on: section headers, crew-row role, readout role line, tab labels, term-state.

**VS-14** — Numerals: Space Mono is fixed-pitch — no `font-variant-numeric` needed; drop
the old `tabular-nums` declarations.

**VS-15** — Body text rendering: `-webkit-font-smoothing:antialiased;` on body. No
text-shadows anywhere in the new skin (the neon glow era is over).

**VS-16** — Minimum text size is 9px (crew role only). Nothing below 9px; ghost-marker
8px from the mock is a canvas-side concern, not HTML.

---

## 3. Layout (VS-17 … VS-27)

**VS-17** — App frame, translated from the fixed 1920×1000 mock to responsive:
```
.app  { display:grid; grid-template-rows:46px 1fr 170px; height:100vh; min-width:1180px; }
.mid  { display:grid; grid-template-columns:250px 1fr 310px; min-height:0; }
```
`html,body { height:100%; margin:0; overflow:hidden; background:var(--bg-void); }`
Rows 1 and 3 are FIXED heights (46px / 170px); the middle row flexes. In the middle row
the side panels are FIXED widths; only the canvas column flexes. Minimum supported
viewport is 1280×800; below 1180px width the frame clips (game client, acceptable).

**VS-18** — Breakpoints (only two; keep it boring):
- `@media (max-width:1439px)`: `.mid` columns → `220px 1fr 280px`; readout padding 16px→12px.
- `@media (max-width:1679px)`: bottom lens zone 440px→340px, sensor zone 400px→320px
  (sensor tail shows 2 lines instead of 3 — the flex-end trick in VS-52 does this for free).
- `@media (max-width:1359px)`: sensor zone `display:none` (full history stays reachable
  via the CHRONICLE tab / log panel).
At 2560px: side panels and bottom heights DO NOT grow; the canvas column absorbs all
extra width, bottom-left menu zone absorbs bottom width. The deck view is the hero.

**VS-19** — Canvas stage (CRITICAL — JS coupling): the canvas's parentElement is the
sizing stage and `main.js layout()` subtracts 28px (2×14px). Keep:
```
.stage { position:relative; padding:14px; min-width:0; min-height:0; overflow:hidden;
         background:var(--bg-void); cursor:crosshair; }
.stage.panning { cursor:grabbing; }
canvas  { width:100%; height:100%; border-radius:0; box-shadow:0 0 0 1px var(--ln-hair); }
```
Padding stays 14px so the layout() constant is untouched. Delete the CRT scanline
`::after`, the radial gradients, the neon inset glow, and the 8px canvas radius. The deck
sits as a sharp hairline-framed viewport on near-black.

**VS-20** — Stage hint line: absolutely positioned inside the stage's bottom padding
band — `position:absolute; left:16px; bottom:2px; pointer-events:none;` font `--fs-tag`
at .14em tracking, color var(--txt-faint) with live values in var(--amber-2), single
line, `white-space:nowrap; overflow:hidden; right:16px; text-overflow:ellipsis`.
Content e.g. `LIVE SPRITE FEED · CLICK DECK TO SELECT · DRAG TO PAN`.

**VS-21** — `#inspect` (cursor-tile readout, hud-written): overlay card inside the stage,
`position:absolute; left:16px; top:16px; max-width:300px; pointer-events:none;
background:rgba(12,10,8,.80); border:1px solid var(--ln-hair); padding:6px 10px;`
font `--fs-tag`, lh 1.5, `white-space:pre`, color var(--txt); first line (`.l0`)
color var(--amber-2). Empty inspect ⇒ element renders nothing (no empty box: hide via
`:empty` or keep zero padding when hud writes '').

**VS-22** — `#legendcard` (contains `#legend`): overlay card inside the stage,
`position:absolute; right:16px; top:16px;` same skin as VS-21 but text-align left,
first line color var(--amber-2) letter-spacing .12em. Hidden (`display:none`) when lens
is `none` — hud already knows the lens; toggle a `.off` class.

**VS-23** — Crew watch (left column):
`background:var(--bg-side); border-right:1px solid var(--ln-hair); padding:14px;
display:flex; flex-direction:column; gap:8px; overflow-y:auto; overflow-x:hidden;`
Header per VS-12 label style, text `CREW WATCH — {n} SOULS`. The list scrolls; rows never
shrink (`flex:none`). Scrollbar per VS-54.

**VS-24** — Readout (right column):
`background:var(--bg-side); border-left:1px solid var(--ln-hair); padding:16px;
display:flex; flex-direction:column; gap:10px; font-size:11px; min-height:0;`
Content order: header `READOUT` → name → role line → trait chips → task line → mood line
→ spacer → SHIP VITALS block (VS-25) → action buttons (`margin-top:auto` on the button
stack per mock; vitals sit directly above it). Crew section overflow: none expected;
trait chips wrap. If nothing selected: name area shows `NO CREW SELECTED` in
var(--txt-dim) and buttons render disabled (VS-44).

**VS-25** — `#metrics` (ship vitals, hud-written bars) lives at the bottom of the readout
panel, above the buttons, introduced by a `--fs-label` header `SHIP` and separated above
by `border-top:1px dashed var(--ln-hair); padding-top:10px;`. Bar skin: label row 
`--fs-tag`, label var(--txt-dim), value var(--txt); track `height:3px; background:var(--ln-hair);
border-radius:2px;` fill `height:3px; border-radius:2px; transition:width .25s ease,
background .25s ease;` — same 3px grammar as morale bars. hud.js keeps its `--good/--warn/
--bad` inline fills (VS-2). Vertical rhythm: `.metric{margin:5px 0}`.

**VS-26** — Bottom bar (grid row 3, 170px):
```
.console { display:flex; align-items:stretch; border-top:1px solid var(--ln-hair);
           background:var(--bg-bar); }
.console-menu   { flex:1; min-width:560px; padding:14px 20px; border-right:1px solid var(--ln-hair);
                  display:flex; flex-direction:column; gap:10px; overflow:hidden; }
.console-lens   { width:440px; flex:none; padding:14px 20px; border-right:1px solid var(--ln-hair); }
.console-sensor { width:400px; flex:none; padding:14px 20px; overflow:hidden;
                  display:flex; flex-direction:column; }
```
Menu zone stacking: tab row → (palette row OR menu msg) → hotkey line pinned with
`margin-top:auto`. Rows never wrap; if the viewport is at min width the tab row may
scroll horizontally (`overflow-x:auto`, scrollbar hidden via `scrollbar-width:none` +
`::-webkit-scrollbar{display:none}` — tabs fit at 1280 with VS-45 paddings, this is a
safety valve only).

**VS-27** — Top bar (grid row 1, 46px):
`display:flex; align-items:center; gap:22px; padding:0 20px; background:var(--bg-bar);
border-bottom:1px solid var(--ln-hair); font-size:11px; letter-spacing:.10em;`
Order left→right: ship name `MSV PERILUNE` (var(--amber-1), 700) · deck group
(`#b-deckdown` `#s-deck` `#b-deckup`) · `#s-msg` status text (var(--amber-2),
`flex:0 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis`)
· `margin-left:auto` spacer · DAY/time (`#s-day`, var(--txt)) · pause chip (`#b-pause`
wrapping `#s-runstate`) · speed group (`#b-slower` `#s-speed` `#b-faster`) · lens chip
(`#s-lens`) · LLM chip (`#s-llmchip`/`#s-llm`) · caution chip. Deck label text
color var(--txt-dim) (mock's #57503f fails contrast for load-bearing info — see VS-64).

---

## 4. Component specs (VS-28 … VS-55)

### Top-bar chips

**VS-28** — Base chip: `display:inline-flex; align-items:center; gap:6px; padding:3px 10px;
border:1px solid var(--ln-chip); border-radius:3px; color:var(--txt); background:transparent;
font-size:11px;` Chips that are buttons (`#b-pause`) add `cursor:pointer` and on hover
`border-color:var(--txt-faint); color:var(--txt-hi);`.

**VS-29** — Pause chip states (hud sets dot classes — keep them):
running: label `‖ HOLD`, fg var(--txt-dim), `.run-dot{width:7px;height:7px;border-radius:50%;
background:var(--good)}` (glow deleted). Paused: label `► RUN`, fg var(--warn-txt),
`.paused-dot{...background:var(--warn-txt)}`. Speed chip fg var(--txt); `#b-slower/#b-faster`
are 22×22px borderless square buttons, glyphs `‹ ›`, fg var(--txt-dim), hover fg
var(--txt-hi), inside the chip's border (one chip, three hit targets) or flanking it —
flanking is simpler: two mini-buttons `padding:3px 6px; border:1px solid var(--ln-chip);
border-radius:3px;`.

**VS-30** — Deck stepper: `#b-deckdown`/`#b-deckup` mini-buttons as VS-29 flanking style,
glyphs `▼ ▲`, with `#s-deck` text `DECK {n}` between them.

**VS-31** — LLM chip: base chip; `#s-llm` text var(--txt-dim). `.chip.degraded { border-color:
var(--demo-bd); color:var(--bad-txt); }` and inner `b`/value also var(--bad-txt).

**VS-32** — Caution chip: `padding:3px 12px; border-radius:3px; font-weight:700;` trios per
VS-5. Blink applies ONLY in warn/alert:
```css
@keyframes plnBlink { 0%,60% { opacity:1 } 70%,100% { opacity:.25 } }
.caution.warn, .caution.alert { animation:plnBlink 1.6s infinite; }
```
Idle chip has no animation and reads quiet. Under `prefers-reduced-motion:reduce` the
animation is disabled (colors alone carry the state) — VS-60.

### Crew-watch row

**VS-33** — Row: `display:flex; gap:10px; align-items:center; padding:8px;
border:1px solid var(--ln-row); border-radius:4px; background:transparent; cursor:pointer;
flex:none; transition:background-color .12s linear, border-color .12s linear;`
- hover:    `background:var(--bg-inset); border-color:var(--ln-chip);`
- selected: `background:var(--bg-selrow); border-color:var(--sel-bd);` (class `.sel`)
- selected+hover: same as selected (no compounding).

**VS-34** — Avatar, 34×34px `border-radius:3px; flex:none;`. With portrait
(`roster.portrait = "pk_xxxxxxxx"` resolved via portraits.js): `<img>` `object-fit:cover;
border:1px solid var(--ln-chip);` image-rendering:auto. Without: initials block,
`background:{crew hue per VS-6}; color:var(--txt-onacc); font:700 12px var(--font-mono);
display:flex; align-items:center; justify-content:center;`.

**VS-35** — Row text column (`min-width:0; flex:1`): line 1 SURNAME — 11px,
var(--txt-hi), `white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`. Line 2
role — `--fs-micro` uppercase var(--txt-dim), same ellipsis rule. Line 3 morale bar:
track `height:3px; background:var(--ln-hair); border-radius:2px; margin-top:4px;` fill
`height:3px; border-radius:2px; width:{morale*100}%; background:{VS-4 color};
transition:width .25s ease;`.

### Readout panel

**VS-36** — Header `READOUT` per VS-12 label style, color var(--txt-faint) (decorative,
allowed — VS-62).
**VS-37** — Name: 13px 700 var(--amber-1). Role line: `--fs-tag` at .1em tracking,
uppercase, var(--txt-dim); compose from wire truth only: `{role} · {mood}` (no room —
not on wire).
**VS-38** — Trait chips (populated after a `citizen` msg): container `display:flex; gap:6px;
flex-wrap:wrap;` chip `border:1px solid var(--ln-chip); border-radius:3px; padding:2px 7px;
font-size:9.5px; color:var(--txt);`. Chips are inert (no hover/cursor).
**VS-39** — Task line: `border-top:1px dashed var(--ln-hair); padding-top:10px;
color:var(--txt-hi);` content literally starts with `> ` (renders as `&gt; `), 11px.
Task text from roster verbatim (digging/hauling/… per wire).
**VS-40** — Secondary line below task: mood/last-known, `font-size:10.5px; line-height:1.6;
color:var(--txt-dim);`. NO fabricated memory text — leave empty until wire provides it.

**VS-41** — Action buttons stack: `display:flex; flex-direction:column; gap:6px;` each
button `text-align:center; padding:7px; border-radius:3px; font-size:11px; cursor:pointer;
background:transparent; transition:background-color .12s linear, color .12s linear,
border-color .12s linear;`.
**VS-42** — Primary `[T] OPEN CHANNEL — TALK`: `border:1px solid var(--amber-1);
color:var(--amber-3);` hover `background:var(--bg-hover);` active(pressed)
`background:var(--sel-bg);`.
**VS-43** — Secondary `[M] MOVE ORDER` (this is `#b-move`) and `[B] BIOGRAPHY`:
`border:1px solid var(--ln-chip); color:var(--txt);` hover `background:var(--bg-inset);
color:var(--txt-hi); border-color:var(--txt-faint);`. Armed state for MOVE (waiting for a
deck click): the selected trio (bg var(--sel-bg), fg var(--sel-fg), bd var(--sel-bd)).
**VS-44** — Disabled (no selection / no cid): `color:var(--txt-faint);
border-color:var(--ln-hair); cursor:default; pointer-events:none;` — decorative contrast
is acceptable for disabled affordances (WCAG exempts disabled controls).

### Bottom tabs

**VS-45** — Tab: `padding:9px 16px; border-radius:3px; font-size:11px; letter-spacing:.08em;
cursor:pointer; transition:background-color .12s linear, color .12s linear, border-color
.12s linear;` in a `display:flex; gap:8px;` row. Below 1680px viewport: `padding:9px 10px`.
- inactive: bg var(--bg-inset) · fg var(--txt-dim) · bd var(--ln-chip)
- hover:    fg var(--txt) · bd var(--txt-faint)
- active:   bg var(--sel-bg) · fg var(--sel-fg) · bd var(--sel-bd)
**VS-46** — Non-wired tabs (REFIT/ORDERS/SHIP/NAV): render with fg var(--txt-faint),
bd var(--ln-hair), no hover change, still clickable — clicking shows the menu-msg line
(VS-48) `{TAB} — SYSTEMS OFFLINE THIS VOYAGE` in place of the palette. They must not look
like live tabs (HCI call per FACTS: no dead-looking-live buttons).

### Build palette

**VS-47** — Palette row: `display:flex; gap:8px; align-items:center;` led by `PLACE ▸`
label (VS-12 label style, var(--txt-faint), `flex:none`). Buttons: `padding:8px 14px;
border-radius:3px; font-size:10.5px; cursor:pointer; background:transparent;`
- inactive: fg var(--txt-dim) · bd var(--ln-hair)
- hover:    fg var(--txt) · bd var(--ln-chip)
- active:   bg var(--sel-bg) · fg var(--sel-fg) · bd var(--sel-bd)
- DEMOLISH active: bg var(--demo-bg) · fg var(--demo-fg) · bd var(--demo-bd)
- DEMOLISH inactive: fg var(--txt-dim) · bd var(--ln-hair); hover fg var(--bad-txt) ·
  bd var(--demo-bd)
Only WALL / DOOR / `⌫ DEMOLISH` ship (wire has wall|door|cancel). No bunk/console/
scrubber/tray/light buttons — do not render P3 fiction.
**VS-48** — Menu message line (non-build tabs): `font-size:10.5px; color:var(--txt-dim);
letter-spacing:.04em; padding:8px 0;` (bumped from mock's #57503f — informative text,
VS-64).
**VS-49** — Hotkey line: `font-size:9.5px; color:var(--txt-faint); letter-spacing:.06em;
margin-top:auto;` text: `B BUILD · X DEMOLISH · ESC CANCEL · CLICK DECK = PLACE · 1–7 LENS
· SPACE PAUSE`. Decorative-tier color is accepted here as a deliberate exception: these
shortcuts are redundant with visible buttons (VS-62).

### Lens select

**VS-50** — Zone header `LENS SELECT` per VS-12 label. Button row `display:flex; gap:6px;`
SEVEN buttons (none/pressure/oxygen/co2/temperature/power/water — keys 1–7): each
`flex:1; text-align:center; padding:10px 2px; border-radius:3px; font-size:10.5px;
cursor:pointer;` labels `NONE · PRES · O₂ · CO₂ · TEMP · PWR · H₂O`. State trios identical
to tabs (VS-45), with `.on` (hud's existing class) = active trio. Footer line
`1–7 LENS · ATMOSPHERICS & POWER` per VS-49 style, `margin-top:12px`.

### Sensor log

**VS-51** — Zone header `SENSOR LOG` per VS-12 label. `#log` keeps its id; hud renders
each wire line (`"D<day.dd> <text>"`) as
`<div class="line"><span class="ts">D212.27</span> co2 rising in quarters</div>`
(hud change: wrap the leading token in `.ts`).
**VS-52** — Tail-view trick: the log body is `flex:1; display:flex; flex-direction:column;
justify-content:flex-end; overflow:hidden;` — the container shows however many trailing
lines fit (3 at full height, 2 at the 1680 breakpoint) with zero JS. Line style:
`font-size:10.5px; line-height:1.7; color:var(--txt-dim); white-space:nowrap;
overflow:hidden; text-overflow:ellipsis;`.
**VS-53** — Timestamp accent: `.line .ts { color:var(--txt-dim); }`
`.line:last-child .ts { color:var(--amber-2); }` and `.line:last-child { color:var(--txt); }`
— the newest entry pops, history recedes (mock's exact pattern).

### Scrollbars & focus

**VS-54** — Scrollbars (crew list, panel bodies, terminal, chat transcript, audit):
```css
* { scrollbar-width:thin; scrollbar-color:var(--ln-chip) transparent; }        /* Firefox */
::-webkit-scrollbar { width:8px; height:8px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:var(--ln-hair); border-radius:4px;
                            border:2px solid var(--bg-side); }
::-webkit-scrollbar-thumb:hover { background:var(--ln-chip); }
```
**VS-55** — Keyboard focus: `:focus { outline:none; }`
`:focus-visible { outline:1px solid var(--warn-txt); outline-offset:2px; border-radius:3px; }`
applies to every interactive element (chips, rows, tabs, buttons, inputs, panel-x). Text
inputs additionally get `border-color:var(--amber-1)` on `:focus` (VS-57).

---

## 5. Floating panels (VS-56 … VS-59)

**VS-56** — Panel chrome (`panel-base.js` markup unchanged):
```css
#panels { position:fixed; inset:0; pointer-events:none; z-index:30; }
.panel { position:absolute; pointer-events:auto; min-width:280px; max-width:420px;
  background:var(--bg-side); border:1px solid var(--ln-chip); border-radius:4px;
  box-shadow:0 12px 32px rgba(0,0,0,.45); display:flex; flex-direction:column; overflow:hidden; }
.panel-bar { display:flex; align-items:center; gap:8px; padding:8px 10px;
  background:var(--bg-bar); border-bottom:1px solid var(--ln-hair); cursor:grab;
  user-select:none; }
.panel-bar:active { cursor:grabbing; }
.panel-title { flex:1; font-size:10px; letter-spacing:.18em; text-transform:uppercase;
  color:var(--amber-1); font-weight:700; }
.panel-x { padding:1px 7px; font-size:13px; line-height:1; color:var(--txt-dim);
  background:transparent; border:1px solid transparent; border-radius:3px; cursor:pointer; }
.panel-x:hover { color:var(--bad-txt); border-color:var(--ln-chip); }
.panel-body { padding:11px 12px; overflow:auto; display:flex; flex-direction:column;
  gap:10px; min-height:0; }
```
Default positions keep the existing classes: `.panel-dialogue{top:64px;right:332px;width:360px;
max-height:60vh}` `.panel-citizen{top:64px;right:36px;width:300px}`
`.panel-terminal{left:20px;bottom:190px;width:min(560px,60vw);max-height:44vh}` (offsets
adjusted for the 310px readout + 170px console). Drag (new, in panel-base.js) writes
inline `left/top`, clamps to viewport, and `.panel-x` click stops propagation. A panel
being dragged raises z (existing focus() bump) — no extra visual treatment.

**VS-57** — Dialogue window (all `.chat-*` classes keep existing):
- `.chat-transcript` — `gap:8px; overflow:auto; max-height:34vh;`
- `.chat-line` — 12px lh 1.5; `.chat-who` color var(--amber-2) 700 margin-right 6px
  (`:empty{display:none}` kept); `.chat-said` color var(--txt-hi).
- `.chat-effect` — 11px italic color var(--warn-txt);
  `border-left:2px solid var(--amber-1); padding-left:8px;`
- `.chat-stream` — 12px color var(--txt-dim); `border-left:2px solid var(--ln-chip);
  padding-left:8px;`
- `.chat-input` — `border-top:1px solid var(--ln-hair); padding-top:9px; gap:7px;`
- `.chat-indicator` — 8×8 circle; `.streaming{background:var(--amber-2);
  animation:plnPulse 1.2s ease-in-out infinite}` `.idle{background:var(--good)}`
  `.ended{background:var(--txt-faint)}` base `background:var(--txt-faint)`. No box-shadow glows.
- `.chat-text` — `flex:1; min-width:0; font:inherit; font-size:12px; color:var(--txt-hi);
  background:var(--bg-void); border:1px solid var(--ln-chip); border-radius:3px;
  padding:5px 8px;` focus border var(--amber-1); `:disabled{opacity:.5}`.
- `.chat-send` — VS-43 secondary button skin, `padding:5px 12px`.

**VS-58** — Citizen card (`.cit-*`, `.portrait` keep existing):
- `.cit-head` — `display:flex; gap:12px; align-items:flex-start;`
- `.portrait` — `width:64px; height:64px; border-radius:3px; flex:none;
  border:1px solid var(--ln-chip); object-fit:cover;`
- `.portrait.silhouette` — centered initials, `font:700 22px var(--font-mono);
  letter-spacing:.04em; color:var(--txt-onacc);` background stays the JS-set crew hue.
- `.cit-name` — 13px 700 var(--amber-1). `.cit-role` — `--fs-tag` .1em uppercase
  var(--txt-dim).
- `.cit-traits` — `gap:5px; flex-wrap:wrap;` `.cit-trait` — identical skin to VS-38
  readout trait chips (border var(--ln-chip), radius 3px, 2px 7px, 9.5px, var(--txt)) —
  one chip grammar everywhere.

**VS-59** — MOSS terminal (`.term-*` keep existing; `.term-code` line-height 18px is
LOAD-BEARING — synced to terminal.js LINE_HEIGHT=18):
- `.term-banner` — 10.5px color var(--bad-txt); `background:rgba(194,90,63,.12);
  border:1px solid var(--demo-bd); border-radius:3px; padding:6px 9px;` mono.
- `.term-editor` — `height:200px; border:1px solid var(--ln-chip); border-radius:3px;
  background:var(--bg-void);`
- `.term-gutter` — `background:var(--bg-deck); border-right:1px solid var(--ln-hair);`
- `.term-gutter-nums` — `padding:6px 8px; font:12px/18px var(--font-mono);
  color:var(--txt-faint); text-align:right; min-width:26px;` (decorative — allowed).
- `.term-code` — `font:12px/18px var(--font-mono); padding:6px 8px; color:var(--txt-hi);
  background:transparent; white-space:pre;` ← 18px EXACT, verify against terminal.js.
- `.term-marker` — 7px dot, no glow; `.sev-error{background:var(--bad-txt)}`
  `.sev-warning{background:var(--warn-txt)}`.
- `.term-state` — `--fs-label` sizing (10px/.18em uppercase), `padding:2px 8px;
  border-radius:3px; border:1px solid var(--ln-chip); color:var(--txt-dim);`
  `.st-dirty{color:var(--warn-txt);border-color:var(--warn-txt)}`
  `.st-compiling{color:var(--amber-3);border-color:var(--amber-1)}`
  `.st-installed{color:var(--good);border-color:var(--good)}`
  `.st-error{color:var(--bad-txt);border-color:var(--demo-bd)}`
- `.term-install` — primary button skin (VS-42), `margin-left:auto; padding:4px 14px;`
  `:disabled{opacity:.4;cursor:default}`.
- `.term-diags` — mono 10.5px; `.term-diag{color:var(--txt)}`
  `.sev-warning{color:var(--warn-txt)}` `.sev-error{color:var(--bad-txt)}`.
- `.term-audit-title` — panel-title skin (10px/.18em amber-1);
  `.term-audit` — `max-height:96px; overflow:auto;` mono 10.5px var(--txt-dim);
  `.term-audit-refresh` — mini secondary button.

---

## 6. States & motion (VS-60 … VS-61)

**VS-60** — Motion budget (restrained, instrumental — nothing decorative):
- ANIMATES: color/background-color/border-color on interactive controls —
  `transition: … .12s linear`; bar fills (width .25s ease); the two keyframe loops below.
- NEVER animates: layout (no sliding panels, no scale/transform), text, the canvas frame,
  panel open/close (instant — a console, not an app).
```css
@keyframes plnBlink { 0%,60%{opacity:1} 70%,100%{opacity:.25} }   /* caution 1.6s infinite */
@keyframes plnPulse { 0%,100%{opacity:1} 50%{opacity:.35} }        /* streaming 1.2s ease-in-out infinite */
@media (prefers-reduced-motion: reduce) {
  .caution.warn, .caution.alert, .chat-indicator.streaming { animation:none; }
  * { transition-duration:0s !important; }
}
```
Selected-crew reticle is canvas-side — untouched by this spec.

**VS-61** — Disconnect overlay (`#disc`, keeps id; shown via `display:flex` from main.js):
`position:fixed; inset:0; display:none; align-items:center; justify-content:center;
background:rgba(12,10,8,.88); z-index:50;` containing one chip:
`border:1px solid var(--demo-bd); background:var(--bg-bar); padding:14px 22px;
border-radius:3px; color:var(--warn-txt); font-size:11px; letter-spacing:.18em;`
text `⚠ LINK LOST — ATTEMPTING RECONNECT`, with a leading 7px dot in var(--bad-txt)
running plnBlink. Reduced-motion: dot static.

---

## 7. Contrast audit (VS-62 … VS-65)

Computed WCAG ratios (relative-luminance formula) for every text pairing in this spec:

| pair (fg on bg) | ratio | verdict |
|---|---|---|
| #e8dcc9 on #12100d / #14110e | 14.0 | pass |
| #b3aa9c on #12100d / #161310 | 8.3 / 8.0 | pass |
| #8c8377 on #12100d / #161310 / #1a1611 | 5.1 / 4.9 / 4.8 | pass |
| #cf7a33 on #12100d / #161310 | 5.9 / 5.7 | pass (accent, mostly 700 weight) |
| #e8934a on #12100d / #161310 | 7.9 / 7.6 | pass |
| #f2b563 on #3a2a12 (selected trio) | 7.6 | pass |
| #5aa77f on #12100d | 6.6 | pass |
| #e07a5f on #12100d / #3a1a10 | 6.4 / 5.3 | pass |
| #fefbf6 on #a53a25 (alert chip) | 4.6 | pass |
| #12100d on all six avatar hues | ≥ 5.0 | pass |
| **#c25a3f on #12100d** | **4.4** | **FAIL as text** |
| **#57503f on #12100d / #161310** | **2.4 / 2.3** | **FAIL — decorative only** |

**VS-62** — `--txt-faint` (#57503f) is DECORATIVE-ONLY. Allowed: section headers whose
regions are self-evident (CREW WATCH, READOUT, LENS SELECT, SENSOR LOG, PLACE ▸, SHIP),
the hotkey line (redundant with visible buttons), the stage hint line, disabled controls,
terminal gutter numbers, ended-chat indicator dot. NOT allowed: the deck label, status/
error text, menu messages, log content, any value the player must read to act.

**VS-63** — `--bad` (#c25a3f) at 4.4:1 is fills/bars ONLY (morale bar low, vitals bar
low, lens tint). All red TEXT uses `--bad-txt` (#e07a5f, 6.4:1). Same discipline for
warn: `--warn` (#cf7a33) is fine as text (5.9:1) but at 9.5–10.5px prefer `--warn-txt`
(#e8934a) where it's body-weight information (diagnostics, chat effects, states).

**VS-64** — Minimal adjustments vs the mock (the only two deliberate deviations):
(a) top-bar deck label #57503f → var(--txt-dim) — it is the only place the current deck
number appears; (b) menu message line #57503f → var(--txt-dim) — it explains why a tab
has no palette. Everything else keeps the mock's exact values.

**VS-65** — 11px mono at these ratios is comfortably legible on the target (desktop,
game client); nothing in the chrome sits below 4.5:1 except the enumerated decorative
tier and disabled states. Re-run this table if any token hex changes.

---

## 8. Non-visual constraints honored (checklist for the implementer)

- Stage padding stays 14px ⇒ `layout()`'s 28px constant untouched (VS-19).
- `.term-code` 12px/18px exact (VS-59) — terminal.js LINE_HEIGHT sync.
- All JS-set ids/classes exist restyled, none renamed: `c, disc, b-*, metrics, log,
  legend, inspect, legendcard, lensbtns, s-*, panels, run-dot, paused-dot, .on,
  .degraded, .panning, .panel*, .chat-*, .cit-*, .portrait*, .term-*, .sev-*, .st-*`.
- `--good/--warn/--bad/--faint` custom properties kept for hud.js inline styles (VS-2).
- hud.js log lines gain a `.ts` span (VS-51) — the only hud markup change this spec asks for.
- No CDN/network fetches: fonts bundled (VS-10); check `slice-shot.mjs` renders with
  the bundled fonts before committing goldens.
- New pure view-model fns this spec implies (caution state VS-5, morale color VS-4,
  clock from dayFrac, log-line ts split) go in `client/src/ui/console-model.js` + node tests.
