# Building with Vorsatz

Vorsatz is a calm, warm, paper-like design language for a personal planner:
oat/cream grounds, dark warm ink, one amber accent, serif display type. Designs
should feel quiet — no saturated colors, no harsh borders, generous whitespace.

## Setup

No provider or wrapper is required — components style themselves from
`styles.css` (import closure: tokens + compiled component CSS + fonts). Use
`bg-ground` on the page body; place content on `bg-surface` cards.

Toasts: render `<Toaster />` once at the root and raise with the exported
`toast("Message")` / `toast("Deleted", { action: { label: "Undo", onClick } })`.

## Styling idiom — Tailwind utilities with Vorsatz's own vocabulary

Style layout glue with Tailwind utility classes using THESE token families
(never generic Tailwind palette colors like `bg-orange-500` / `text-gray-600`):

| Family | Classes | Use |
|---|---|---|
| Ground/surfaces | `bg-ground`, `bg-surface`, `bg-surfaceWeek` | page ground; cards; board cards |
| Inset panels | `bg-oat-2`, `bg-oat-3` | input fields, inset rows, hover fills |
| Ink (text) | `text-ink`, `text-ink-2`, `text-ink-3`, `text-ink-4` | body → progressively muted labels |
| Amber accent | `bg-amber-deep` (+`text-white`), `bg-amber-tint` (+`text-amber-ink`) | THE primary action color; soft emphasis |
| Status | `bg-green-tint`+`text-green-ink`, `bg-rust-tint`+`text-rust-ink` | success; advisory warnings (never blocking red) |
| Borders | `border-border` (hairline), `border-ink/[0.12]` | default card/input borders |
| Radii | `rounded-card` (14px), `rounded-cardlg` (16px), `rounded-panel` (18px), `rounded-full` | cards; larger cards; panels; pills/buttons |
| Shadows | `shadow-card`, `shadow-ritual` | resting cards; modals/overlays |
| Type | `font-serif` (Instrument Serif — display/headings), `font-mono` (Space Mono — uppercase micro-labels, timers), default sans is Inter | |

Opacity modifiers work on all token colors (`bg-ink/10`, `border-amber/40`).

**Token gotcha:** CSS custom properties are RGB channel triplets
(`--amber: 207 122 51`). In inline styles or arbitrary values write
`rgb(var(--amber))` — a bare `var(--amber)` is NOT a valid color. Components
with color props (`ProgressRing`, `Pill`, `TaskSegmentBar`,
`CelebrationCheckbox`) expect a resolved color string (hex or `rgb(...)`).

Micro-label idiom (used everywhere for section headings):
`text-xs font-semibold uppercase tracking-wider text-ink-3 font-mono` — or just
use `<SectionLabel>`.

## Where the truth lives

Read `styles.css` → `_ds_bundle.css` (compiled component + utility CSS; the
`:root` block at the top defines every token) and each component's
`components/general/<Name>/<Name>.prompt.md` + `<Name>.d.ts` before styling.

## Idiomatic example

```jsx
import { Button, Chip, SectionLabel, CapacityGauge } from "@flowdeck/client";

export const PlanCard = () => (
  <div className="min-h-screen bg-ground p-8">
    <div className="mx-auto flex max-w-[560px] flex-col gap-5 rounded-panel border border-border bg-surface p-6 shadow-card">
      <SectionLabel suffix="2 of 3">Focus topics</SectionLabel>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">Write grant outline</span>
        <Chip className="bg-amber-tint text-amber-ink">45m</Chip>
      </div>
      <CapacityGauge plannedMin={150} availableMin={240} />
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost">Not today</Button>
        <Button variant="amber">Commit to today</Button>
      </div>
    </div>
  </div>
);
```

# Vorsatz (@flowdeck/client@0.1.0)

This design system is the published @flowdeck/client React library, bundled as a single
browser global. All 19 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.Vorsatz`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.Vorsatz.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AmberBar } = window.Vorsatz;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AmberBar />);
```

## Tokens

88 CSS custom properties from @flowdeck/client. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (13): `--tw-border-spacing-x`, `--tw-border-spacing-y`, `--tw-ring-offset-color`, …
- **spacing** (1): `--tw-ring-inset`
- **shadow** (4): `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-shadow`, …
- **other** (70): `--tw-translate-x`, `--tw-translate-y`, `--tw-rotate`, …

## Components

### general
- `AmberBar`
- `Button`
- `CapacityGauge`
- `CardSkeleton`
- `CelebrationCheckbox`
- `Chip`
- `ConnectRow`
- `EstimatePreviewChip`
- `GripDots`
- `Pill`
- `ProgressRing`
- `RadioCard`
- `RitualFooter`
- `RitualShell`
- `SectionLabel`
- `StatCard`
- `TaskSegmentBar`
- `Toaster`
- `ToggleSwitch`
