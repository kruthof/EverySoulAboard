// PAPER TOKENS — the SINGLE source of the visual-redesign palette (paper · ink · one oxblood).
//
// Authority: `docs/design/perilune-visual-redesign.charter.md` §1, which itself was measured off the
// owner's two design documents (`design-import/Perilune Game.dc.html`,
// `design-import/Perilune Fittings.dc.html`). THE .dc.html MARKUP IS THE SPEC — every value below is
// a literal lifted from the charter (or, where noted, measured directly out of the markup with the
// element it was measured on quoted inline). The Vorsatz DS bundle is voice, not tokens: the design
// docs use ZERO of its variables.
//
// Pure ES module: no DOM, no side effects, no clock, no locale API. Every export is a frozen table
// or a pure helper, and every helper returns a deterministic fallback rather than throwing.
//
// ── THE MIRROR ────────────────────────────────────────────────────────────────────────────────
// `client/src/theme/paper.css` declares the same values as CSS custom properties. `CSS_VAR` below
// is the ONE map from a JS path to a CSS variable name, and `paper-tokens.test.js` walks it to prove
// the two files agree value-for-value. Nothing pinned that mirror for the warm layer, and warm.css
// and warm-tokens.js were free to drift for a year. Add a token ⇒ add its `CSS_VAR` row in the SAME
// commit, or the mirror test fails loudly on the orphan.
//
// ── THE WARM LAYER ────────────────────────────────────────────────────────────────────────────
// `warm-tokens.js` is RETIRED but not deleted: seventeen consumers still import it and this wave
// restyles nothing. It is re-exported from the bottom of this file (colliding names carry a `WARM_`
// prefix) so a package written from here on imports ONE theme module. Its CSS half, `warm.css`, is
// reached only through `paper.css`, which `@import`s it — no page links it directly any more.

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §1  Paper — the grounds, the plates, the insets, the rules
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every surface the ink sits on (charter §1 "Paper & ink"). */
export const PAPER = Object.freeze({
  ground:   '#E7E0D2', //  the page behind the plates
  plate:    '#EBE4D1', //  a plate / a sheet of paper — the fill of every front + top face
  border:   '#C6BBA2', //  a plate's 1px border
  hairline: '#CFC3A9', //  the thinnest rule (column separators, section rules)
  inset1:   '#DED6C2', //  inset panel — the deepest of the three
  inset2:   '#DCD3BE', //  inset panel
  inset3:   '#E1D9C5', //  inset panel — also the FLAT side-face fill at thumbnail scale (charter §1)
});

/** The plate's drop shadow, measured on the Screen-02 plate (`Perilune Game.dc.html`, `box-shadow`). */
export const PLATE_SHADOW = '0 18px 40px -28px rgba(28,26,23,.55)';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §1  Ink — one black and the greys that descend from it
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The ink ramp (charter §1). `ink` is EVERY stroke, every dark fill, every selected-row plate. */
export const INK = Object.freeze({
  ink:      '#14120F', //  strokes, dark fills, the inverted selected row
  display:  '#241E17', //  the largest display serif only — measured on "Everything you can build"
  serif:    '#2E2A23', //  body serif ink
  prose:    '#4E463A', //  prose
  annot:    '#3A342A', //  annotation
  micro:    '#6B6252', //  micro-label (mono, uppercase, tracked)
  section:  '#8A7F6C', //  section label
  faintest: '#A79C86', //  the faintest ink that still reads
  offline:  '#8A8272', //  offline / disabled — an ABSENCE, never an alarm
});

/** Links (charter §1). The only warm hue left that is not the accent. */
export const LINK = Object.freeze({ base: '#B0662A', hover: '#8A4E1E' });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §1  ONE accent — oxblood. Attention, faults, queued orders, emotional beats.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The single accent. There is no second one; if a thing needs to stand out it is this or nothing. */
export const ATTEND = '#7B2C22';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §1  THE DASH DIALECT (ruling E3) — colour alone no longer distinguishes state
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The warm skin spent four hues on order / fault / caution / rubble and a colour-blind player read
// three of them the same. In the paper idiom the STROKE PATTERN carries the meaning and the one
// accent carries the urgency, so every state is legible in ink alone. Read a row as "stroke + dash".

/** state id → { stroke, dash }. `dash` is a `stroke-dasharray` value, or null for a solid stroke. */
export const DIALECT = Object.freeze({
  order:     Object.freeze({ stroke: ATTEND,    dash: '8 5' }), //  QUEUED ORDER (the bench ghost)
  attention: Object.freeze({ stroke: ATTEND,    dash: null  }), //  ATTENTION / FAULT
  unbuilt:   Object.freeze({ stroke: '#14120F', dash: '6 5' }), //  UNBUILT / PLANNED
  offline:   Object.freeze({ stroke: '#8A8272', dash: null  }), //  OFFLINE
  cut:       Object.freeze({ stroke: '#14120F', dash: '7 5' }), //  a CUT EDGE of the room cutaway
  none:      Object.freeze({ stroke: '#14120F', dash: null  }), //  nothing to see — plain ink
});

/** The neutral row: plain ink, no dash. Returned for anything `dialect()` does not know. */
export const DIALECT_FALLBACK = DIALECT.none;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §1  The shared 45° hatch — every oblique side face
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Measured verbatim off `<pattern id="fh">`, which is byte-identical in BOTH design documents:
 *   <pattern width=7 height=7 patternUnits=userSpaceOnUse patternTransform=rotate(45)>
 *     <rect width=7 height=7 fill=#EBE4D1/>
 *     <path d="M0 0 L0 7" stroke=#14120F stroke-width=0.7 opacity=0.28/>
 *   </pattern>
 * `render/oblique.js` emits it — ONE namespaced def per surface root, never one per fitting.
 */
export const HATCH = Object.freeze({
  period:  7,
  angle:   45,
  ground:  '#EBE4D1',
  ink:     '#14120F',
  width:   0.7,
  opacity: 0.28,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §1  Halo text — a label that has to survive being drawn over art
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** `stroke #EBE4D1 stroke-width 3.4 paint-order stroke` (charter §1; measured on the leader labels). */
export const HALO = Object.freeze({ stroke: '#EBE4D1', width: 3.4, paintOrder: 'stroke' });

/**
 * The two-pass INK FIGURE knockout (charter §1 "Pawns", ruling E10). MEASURED on the design's own
 * pawn: every ink stroke is emitted twice, and the knockout pass runs `ink + 3.0` px wide — 1.4→4.4,
 * 1.35→4.3, 1.2→4.2, 1.0→4.0. The charter's prose says "~3× width"; +3.0 is what the markup does,
 * and across the 0.9–2.2 stroke band the two readings only agree at the thin end. The measurement
 * wins, and `oblique.js` takes the rule as a parameter so a caller can say otherwise.
 */
export const GHOST = Object.freeze({ knockout: '#EBE4D1', widen: 3.0 });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §1  The engraved cell gauge
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Filled cell = solid ink; empty cell = a 1px inset ring + 45° micro-hatch. 8 ship / 10 MOSS. */
export const GAUGE = Object.freeze({
  filled:    '#14120F',
  emptyRing: 'rgba(20,18,15,.4)',
  shipCells: 8,
  mossCells: 10,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §1  Type
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Instrument Serif = display / headlines / body prose / italic captions & annotations.
 * Space Mono = ALL micro-labels, numbers, stats, MOSS body — uppercase, tracked .06em–.24em.
 * Inter is NOT shipped (ruling E9). The two stacks are the same strings `styles/base.css` declares.
 */
export const TYPE = Object.freeze({
  serif:    "'Instrument Serif',ui-serif,Georgia,serif",
  // ⚠️ The mono stack is the one the CASCADE RESOLVES TO, which is `warm.css`'s — `styles/base.css`
  // carried a different one (…SFMono-Regular,Menlo,Consolas…) that had been overridden since the day
  // warm.css landed and had therefore never rendered a glyph. Both files now say this. The mirror
  // test is what found it; before VR-A nothing compared them.
  mono:     "'Space Mono', ui-monospace, 'SF Mono', Menlo, monospace",
  trackMin: '.06em',
  trackMax: '.24em',
});

/** Fitting stroke weight is a function of MASS: 0.9 for a curtain rail, 2.2 for a reactor (§1). */
export const STROKE = Object.freeze({ min: 0.9, max: 2.2 });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MIRROR MAP — JS path → CSS custom property in `paper.css`
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The test walks THIS table, so a token that reaches the CSS without a row here is an orphan the
// mirror cannot see, and a row here with no CSS declaration is a red. Numeric tokens are compared
// as numbers (CSS `7` vs JS `7`), colours case-insensitively, everything else as exact strings.

/** JS path (dotted, into the frozen tables above) → the CSS custom property that must equal it. */
export const CSS_VAR = Object.freeze({
  'PAPER.ground':   '--paper-ground',
  'PAPER.plate':    '--paper-plate',
  'PAPER.border':   '--paper-border',
  'PAPER.hairline': '--paper-hairline',
  'PAPER.inset1':   '--paper-inset-1',
  'PAPER.inset2':   '--paper-inset-2',
  'PAPER.inset3':   '--paper-inset-3',
  PLATE_SHADOW:     '--plate-shadow',

  'INK.ink':        '--ink',
  'INK.display':    '--ink-display',
  'INK.serif':      '--ink-serif',
  'INK.prose':      '--ink-prose',
  'INK.annot':      '--ink-annot',
  'INK.micro':      '--ink-micro',
  'INK.section':    '--ink-section',
  'INK.faintest':   '--ink-faintest',
  'INK.offline':    '--ink-offline',

  'LINK.base':      '--link',
  'LINK.hover':     '--link-hover',

  ATTEND:           '--attend',

  'DIALECT.order.dash':   '--dash-order',
  'DIALECT.unbuilt.dash': '--dash-unbuilt',
  'DIALECT.cut.dash':     '--dash-cut',

  'HATCH.period':   '--hatch-period',
  'HATCH.ground':   '--hatch-ground',
  'HATCH.ink':      '--hatch-ink',
  'HATCH.width':    '--hatch-width',
  'HATCH.opacity':  '--hatch-opacity',

  'HALO.stroke':    '--halo-stroke',
  'HALO.width':     '--halo-width',

  'GAUGE.filled':    '--gauge-filled',
  'GAUGE.emptyRing': '--gauge-empty-ring',

  // `--font-serif` and `--font-mono` are declared in `styles/base.css`, beside each other, because
  // that is where every other type token has always lived; the mirror resolves the whole cascade.
  'TYPE.serif':     '--font-serif',
  'TYPE.mono':      '--font-mono',
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Pure helpers — tolerant of unknown keys (deterministic fallback, NEVER throw)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a dash-dialect state id to its frozen `{ stroke, dash }` row.
 * Unknown / null / non-string → DIALECT_FALLBACK (plain ink, no dash). Never throws.
 * @param {string|null|undefined} state
 */
export function dialect(state) {
  if (typeof state !== 'string' || !state.length) return DIALECT_FALLBACK;
  const key = state.toLowerCase().trim();
  // ⚠️ `Object.hasOwn`, not a bare lookup. `DIALECT['constructor']` is TRUTHY — it resolves up the
  // prototype chain to `Object` — so a plain `DIALECT[key] || FALLBACK` hands a caller the Object
  // constructor for a handful of ordinary-looking words and calls it a dialect row. The promise this
  // helper makes is a deterministic fallback, and an own-property check is what keeps it.
  return Object.hasOwn(DIALECT, key) ? DIALECT[key] : DIALECT_FALLBACK;
}

/**
 * Map a 0..1 MASS to a fitting's stroke weight across the §1 band (0.9 heaviest-thin … 2.2).
 * Clamps rather than throwing; a non-finite input reads as the midpoint. Rounded to 2 dp so the
 * emitted SVG string is stable (no locale API — plain arithmetic + toFixed).
 * @param {number} mass 0 = lightest member, 1 = heaviest
 */
export function strokeWeight(mass) {
  const t = typeof mass === 'number' && Number.isFinite(mass) ? Math.min(1, Math.max(0, mass)) : 0.5;
  const v = Math.round((STROKE.min + t * (STROKE.max - STROKE.min)) * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The RETIRED warm layer, re-exported so one module is the door (see the header)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export {
  VOID, VOID_GRADIENT, HULL, TRIM_LIGHT, AMBER, STATUS,
  ROLE_HUE, ROLE_FALLBACK, MATERIAL, ROOM_MATERIAL, ROOM_MATERIAL_FALLBACK, ROOM_TYPE,
  HUD_TOKEN, roomMaterial, roleHue,
  // `INK` is the ONE name the two layers both claim, and they mean opposite things — warm's ink is
  // cream-on-navy, paper's is black-on-paper. Renamed rather than shadowed so neither can be got by
  // accident.
  INK as WARM_INK,
} from './warm-tokens.js';
