# spritegen — automated sprite pipeline (Nano Banana / Gemini image API)

Generates, style-enforces and integrates web-skin sprite sets from a JSON spec.
One command end to end:

```bash
python3 art/spritegen/run.py --spec art/spritegen/spec_steampunk.json --stage all
```

API key: `GEMINI_API_KEY` / `GOOGLE_API_KEY` env var, or any `...gemini... = <key>`
line in the repo-root `.env` (gitignored). Model defaults to Nano Banana Pro
(`gemini-3-pro-image-preview`); `--model gemini-2.5-flash-image` for NB1.

## Stages

| stage | what happens |
|---|---|
| generate | style block + per-asset prompt → N candidates each (`--candidates`, default 4) + contact sheet |
| select | `work/<name>/selection.json` picks a candidate per asset (default 0 — edit and rerun) |
| process | key magenta → downscale to `tile_px` → style enforcement → seam report for tileables → contact sheet |
| integrate | data URIs + `SPRITE_TILE` written into `Client.html` between the SPRITEGEN markers |
| shot | boots PeriluneWeb headless, screenshots to `work/<name>/shot.png` |

Stages are idempotent and chainable (`--stage process,integrate,shot`). Existing
candidates are never regenerated — delete a file to reroll it.

## Style enforcement (the part that makes AI sets cohesive)

- `"style": "pixel"` (32px sets): every sprite quantized to ONE shared palette
  (`palette_greys` + `palette_accents`), with chromatic accents in a protected
  bucket so tiny accent populations (mint screens, seedlings) survive.
- `"style": "hd"` (128px sets): no color-count cap — chromatic pixels are pulled
  toward the spec's `hue_centers_deg` (`hue_pull` strength) so everything shares
  one material family without banding.

## Spec files

- `spec_pixel32.json` — the sci-fi pixel set
- `spec_steampunk.json` — 128px steampunk set
- `spec_cyberpunk80s.json` — 128px cyberpunk/synthwave set (current shipped look;
  keys on GREEN because the art itself is full of magenta/pink neon — the fringe
  pass in `run.py` follows the spec's `key_color`)
All pipeline state lives in `art/spritegen/work/<spec name>/`; the final sprites ship
as data URIs inside Client.html.

New set = new spec: change `tile_px`, `style`, the style block and
per-asset prompts. Roles (floor/wall/door/pawn[_b|_c]/growbed/terminal/bed/table/
chair/medbed/medcab/…) map to what the web skin draws; unmapped roles are ignored
by integrate until the skin learns them. An asset may override the spec's
`key_color` (e.g. the green-foliage growbed keys on magenta inside the green-keyed
cyberpunk set).
