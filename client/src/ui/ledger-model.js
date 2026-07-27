// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE LEDGER MODEL (E0-8) — the `ledger` wire message turned into the rows the Overview's LEDGER
// island paints. PURE: no DOM, no imports, no side effects, so it is driven directly by its tests
// instead of being asserted about through a rendered island.
//
// ⚠️ THE SENTINELS ARE THE WHOLE POINT OF THIS FILE, and a reader who skips them will write the bug
// this package exists to delete. The host cannot always answer, and it says so in three different
// ways rather than shipping a plausible zero:
//
//   • `window === 0` .......... NO RATE ON THIS PAYLOAD MEANS ANYTHING. The host has not watched
//     for long enough (10 sim-minutes minimum) or a save was just loaded, which restarts the
//     window. Every rate row renders MEASURING. Rendering "+0.0/d" here would state, confidently,
//     that nothing is being produced — about a ship the host has not yet looked at.
//   • `daysOfWater`/`o2TrendDays` < 0 ... NOT DEPLETING. This is the ORDINARY HEALTHY ANSWER, not a
//     missing value: a stock that is steady or rising has no runway, and neither does one that
//     would outlast the host's 999-day horizon. Rendering it as 0 would read as "runs out today".
//   • `partsPerDay` is SIGNED and 0 IS A REAL READING (a ship that neither makes nor spends Parts).
//     It has no -1 sentinel; `window` is the only thing that says whether it means anything.
//
// AND ONE MORE, WHICH IS WHY THE MATTER LIST CARRIES NAMES: the kind list is whatever the host
// sent. There is deliberately NO client-side table of item kinds to fall off the end of — two
// sibling economy lanes are adding kinds right now, and a ledger that quietly stops counting a new
// resource is precisely the lying metric E0-8 was chartered to end.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Runway (in days) below which a row reads as an emergency. */
export const RUNWAY_CRITICAL_DAYS = 1;
/** Runway below which a row reads as a warning. Above it, a finite runway is just information. */
export const RUNWAY_WARN_DAYS = 3;

/** The literal shown for a rate the host has not measured yet. */
export const MEASURING = 'MEASURING';
/** The literal shown for a stock that is not depleting. NOT an error state. */
export const NOT_DEPLETING = 'STEADY';

function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

/** InvariantCulture-ish fixed decimals; `null` in ⇒ `null` out (never "NaN" on screen). */
function fixed(v, places) {
  const n = num(v);
  return n === null ? null : n.toFixed(places);
}

/** A signed per-day rate, or MEASURING when the host has no window. */
export function rateText(perDay, windowTicks) {
  if (!(num(windowTicks) > 0)) return MEASURING;
  const n = num(perDay);
  if (n === null) return MEASURING;
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '/d';
}

/**
 * A runway, as text plus its alarm level.
 * Returns `{ text, level }` where level is '' | 'warn' | 'crit'.
 * A negative runway is STEADY at level '' — see the sentinel note at the top of this file.
 */
export function runwayText(days, windowTicks) {
  if (!(num(windowTicks) > 0)) return { text: MEASURING, level: '' };
  const n = num(days);
  if (n === null || n < 0) return { text: NOT_DEPLETING, level: '' };
  const level = n < RUNWAY_CRITICAL_DAYS ? 'crit' : n < RUNWAY_WARN_DAYS ? 'warn' : '';
  return { text: n.toFixed(2) + ' d', level };
}

/**
 * The matter census as a single line: the kinds actually aboard, largest first, ties broken by the
 * host's order (which is the ItemKind declaration order) so the line is stable frame to frame.
 * Returns '' when nothing is aboard — the honest empty state, not a zero.
 */
export function matterLine(msg) {
  const list = msg && Array.isArray(msg.matter) ? msg.matter : [];
  const rows = list
    .map((e, i) => ({ name: String(e && e[0]), units: num(e && e[1]) || 0, i }))
    .filter((e) => e.units !== 0)
    .sort((a, b) => (b.units - a.units) || (a.i - b.i));
  // An UNKNOWN bucket only appears when the host counted units under a kind its own enum does not
  // name. It should be impossible; it is surfaced rather than dropped precisely because a ledger
  // that silently loses a resource is the defect this package was chartered against.
  const unknown = num(msg && msg.unknown) || 0;
  if (unknown > 0) rows.push({ name: '(unknown)', units: unknown, i: 1e9 });
  return rows.map((e) => e.name + ' ' + e.units).join(' · ');
}

/** The host's derivation note for one member id, or '' when the payload carries none. */
export function noteFor(msg, id) {
  const notes = msg && Array.isArray(msg.notes) ? msg.notes : [];
  for (const n of notes) if (n && n[0] === id) return String(n[1] || '');
  return '';
}

/**
 * The four rows the LEDGER island paints, in fixed presentation order (a host-shaped decision, not a
 * client sort — the same rule as the MOSS ledger's eight rows and the relations ring).
 *
 * `null` message ⇒ `[]`, so the island renders its own empty state rather than four rows of zero.
 * Every row is `{ id, label, value, sub, level, note }`; `note` is the host's derivation text and
 * belongs in the row's `title`, because a limit that does not travel with its number gets read off.
 */
export function ledgerRows(msg) {
  if (!msg) return [];
  const w = msg.window;
  const water = runwayText(msg.daysOfWater, w);
  const air = runwayText(msg.o2TrendDays, w);
  const tank = fixed(msg.tankL, 0);
  return [
    {
      id: 'matter',
      label: 'MATTER',
      value: (num(msg.total) || 0) + ' u',
      sub: rateText(msg.matterPerDay, w),
      level: '',
      note: noteFor(msg, 'matter'),
    },
    {
      id: 'parts_per_day',
      label: 'PARTS',
      value: String(partsUnits(msg)),
      sub: rateText(msg.partsPerDay, w),
      level: '',
      note: noteFor(msg, 'parts_per_day'),
    },
    {
      id: 'days_of_water',
      label: 'WATER',
      value: (tank === null ? '–' : tank) + ' L',
      sub: water.text,
      level: water.level,
      note: noteFor(msg, 'days_of_water'),
    },
    {
      // ⚠️ LABELLED O2 TREND, NOT "AIR", and the row's value is CREW-DAYS, not a mole count.
      // Both are the same correction. A row called AIR states that there is air aboard to run out
      // of, and this sim has NO air reserve at all — a powered vent injects gas from nothing. And
      // "18.9 kmol" was uninterpretable: nothing on the ship is a capacity, a target or a reserve to
      // compare it against, so the one always-visible number was the one a player could not read.
      // The host ships its own denominator (`crewO2PerDay`) and the row states how long the people
      // actually aboard would take to breathe the standing oxygen.
      id: 'o2_trend',
      label: 'O₂ TREND',
      value: crewDaysOfO2(msg),
      sub: air.text,
      level: air.level,
      note: noteFor(msg, 'o2_trend'),
    },
  ];
}

/**
 * The standing oxygen expressed in CREW-DAYS — stock ÷ what the living crew breathe in a sim-day.
 * '–' when the host sent no denominator or nobody is alive to breathe it: an empty ship has no
 * crew-days, and rendering ∞ or 0 would both be statements the data does not support.
 */
export function crewDaysOfO2(msg) {
  const o2 = num(msg && msg.o2mol);
  const per = num(msg && msg.crewO2PerDay);
  if (o2 === null || per === null || !(per > 0)) return '–';
  return (o2 / per).toFixed(1) + ' crew-d';
}

/**
 * The ONE caveat rendered without a hover, straight from the host's own notes.
 *
 * Every other limit on this island rides a row's `title`, which is the channel a player is least
 * likely to read. For a package whose doctrine is "the limit must travel with the number", that is
 * the weakest available delivery, so the single most misreadable fact gets its own always-visible
 * line. '' when the host sent none — never an invented sentence.
 */
export function caveatLine(msg) {
  return noteFor(msg, 'caveat');
}

/** Units of Parts aboard, read out of the sparse matter list — 0 when the kind is absent, which is
 *  what a sparse list means and NOT a missing reading. */
export function partsUnits(msg) {
  const list = msg && Array.isArray(msg.matter) ? msg.matter : [];
  for (const e of list) if (e && e[0] === 'Parts') return num(e[1]) || 0;
  return 0;
}
