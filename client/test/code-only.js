// THE ONE quote-aware JS comment stripper for this test suite.
//
// WHY IT IS ITS OWN MODULE. It used to live only inside `surface-boundary.test.js`, and every other
// guard that needed it re-derived a weaker one — `x.replace(/\/\/[^\n]*/g, '')` and friends, which
// are blinded by a quoted `'//'` and by `/* */`. That is `CLAUDE.md` trap 1 ("a guard that matches
// raw source text is satisfied by the thing it guards against, COMMENTED OUT"), whose stated
// countermeasure is *copy the live implementation, do not re-derive it*. Copying it three times is
// three chances to copy it wrong, so it moved here instead and every consumer imports the SAME
// function — including its own behaviour tests, which stay in `surface-boundary.test.js` beside the
// scans they protect.
//
// NOT a `.test.js` file on purpose: `./ci.sh` runs `node --test "client/test/*.test.js"`, so a test
// file importing another test file would register that file's tests twice. `dom-lite.js` is the
// same shape and the same reason.
//
// (`client/test/relations-view.test.js` keeps its own local pair — a JS one and a CSS one, whose
//  behaviour it pins itself. Left alone deliberately: this package had no reason to touch it, and
//  moving a guard is only free when its tests move with it.)

/**
 * Strip JS comments, STRING-LITERAL AWARE, leaving everything else byte-for-byte. Scans over the
 * result must not fire on prose (a comment mentioning `#stockfilter` is documentation, not a
 * dependency), and they must not be BLINDED by a quoted comment marker (`'//'` inside a string must
 * not swallow the rest of the file — the exact hole an earlier hand-verified version of the C#
 * equivalent shipped with, ArchitectureBoundaryTests.cs `CodeOnly_IsStringLiteralAware…`).
 *
 * Handles '…', "…", `…` (including `${}` only insofar as it stays inside the template — good enough,
 * since an id in a template is a CONSTRUCTED id and already disclosed as invisible) and both comment
 * forms. NOT handled: regex literals — a `/…/` containing a quote could confuse it. Disclosed rather
 * than fixed, and bounded: a '…'/"…" scan terminates at the newline, so the worst it can do is
 * damage its own line (asserted in surface-boundary.test.js).
 */
export function codeOnly(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1;          // drop to EOL, keep the \n
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2;
    } else if (c === '\'' || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        const done = src[i] === q || (q !== '`' && src[i] === '\n');
        i += 1;
        if (done) break;
      }
    } else {
      out += c; i += 1;
    }
  }
  return out;
}

/**
 * The argument-object source of every `NAME({ … })` call in `src`, brace-matched over CODE ONLY.
 *
 * The naive version of this — count a token across the whole file — is what `input.test.js` shipped
 * and what broke the first time a second reader appeared: `count(getStockFilter:) === count(installInput({)`
 * is satisfied by BOTH getters sitting in one block and NONE in the other, and it fires on a
 * perfectly correct change elsewhere in the file. Per-block matching is strictly stronger and says
 * which block is wrong.
 *
 * Comments and string literals are stripped FIRST (a `{` in a comment and a `}` in a string each
 * mis-parse a raw brace walk, silently and while green). Callers should still assert something
 * about each block they get back — a runaway walk returns a plausible-looking superset, not an
 * error.
 *
 * @param {string} src  raw source
 * @param {string} name the callee, e.g. 'installInput'
 * @returns {string[]} one `{ … }` slice per call site, in source order
 */
export function callBlocks(src, name) {
  const code = codeOnly(src);
  const needle = name + '({';
  const out = [];
  for (let i = code.indexOf(needle); i >= 0; i = code.indexOf(needle, i + 1)) {
    const from = code.indexOf('{', i);
    let depth = 0;
    let j = from;
    for (; j < code.length; j++) {
      if (code[j] === '{') depth += 1;
      else if (code[j] === '}') { depth -= 1; if (depth === 0) break; }
    }
    out.push(code.slice(from, j + 1));
  }
  return out;
}
