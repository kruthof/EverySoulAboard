#!/usr/bin/env node
// Extract the SPRITEGEN data block from hosts/web/Client.html into a browser-loadable
// ES module (client/assets/sprites.g.js). The spritegen pipeline (art/spritegen/run.py)
// remains the SINGLE source of truth: it owns the block between the markers in Client.html;
// this script only re-exports it verbatim so the structured client never hand-copies the
// (huge) base64 sprite URIs. Re-run whenever the pipeline regenerates Client.html.
//
//   node client/tools/extract-sprites.mjs
//
// The marker block in Client.html is never modified.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));           // client/tools
const repoRoot = join(here, '..', '..');                        // worktree root
const clientHtml = join(repoRoot, 'hosts', 'web', 'Client.html');
const outFile = join(here, '..', 'assets', 'sprites.g.js');     // client/assets/sprites.g.js

const BEGIN = 'SPRITEGEN BEGIN';
const END = 'SPRITEGEN END';

const html = readFileSync(clientHtml, 'utf8');
const lines = html.split('\n');
const beginIdx = lines.findIndex((l) => l.includes(BEGIN));
const endIdx = lines.findIndex((l) => l.includes(END));
if (beginIdx < 0 || endIdx < 0 || endIdx <= beginIdx) {
  console.error('Could not locate the SPRITEGEN markers in', clientHtml);
  process.exit(1);
}

// Everything strictly between the marker comment lines is the generated payload:
//   const SPRITE_TILE = 128;
//   const SPRITE_FACING = {...};
//   const SPRITE_NO_ROTATE = [...];
//   const SPRITE_URIS = {...};
//   const SPRITE_STATES = {...};   // append-only: role -> {state: uri}  (machine on/off/broken)
//   const SPRITE_FRAMES = {...};   // append-only: role -> [uri, ...]    (pawn walk cycle)
const payload = lines.slice(beginIdx + 1, endIdx).join('\n').trimEnd();

const header =
  '// @ts-nocheck\n' +
  '// GENERATED — do not edit. Produced by client/tools/extract-sprites.mjs from the\n' +
  '// SPRITEGEN block of hosts/web/Client.html (the spritegen pipeline is the source of\n' +
  '// truth). Re-run the extractor after any spritegen regeneration.\n\n';

const footer =
  '\n\nexport { SPRITE_TILE, SPRITE_FACING, SPRITE_NO_ROTATE, SPRITE_URIS, SPRITE_STATES, SPRITE_FRAMES };\n';

writeFileSync(outFile, header + payload + footer, 'utf8');

// Count by cheap regex rather than eval'ing the big literals. A base sprite URI is a
// 2-space-indented `role: 'data:...'` line; state maps (`  role: {`) and frame arrays
// (`  role: [`) don't quote their value, so they don't inflate the base count.
const uriCount = (payload.match(/^ {2}[a-z_]+: '/gm) || []).length;
const stateRoles = (payload.match(/^ {2}[a-z_]+: \{/gm) || []).length;
const frameRoles = (payload.match(/^ {2}[a-z_]+: \[/gm) || []).length;
console.log(
  `Wrote ${outFile}\n  SPRITE_TILE + facing/no-rotate metadata + ${uriCount} sprite URIs` +
    ` + ${stateRoles} state-map roles + ${frameRoles} frame-cycle roles`
);
