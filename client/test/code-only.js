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
 * The CSS half of the same rule: strip `/* … *\/` comments, STRING-LITERAL AWARE, leaving everything
 * else byte-for-byte.
 *
 * ⚠️ WHY IT EXISTS. `moss-screen.test.js`'s five `styles.css` scans were all `assert.match(rawCss,
 * /…/)`, and their own header claimed *"what node CAN pin is that the rules exist at all, so
 * deleting one is red"*. Commenting a rule out — the ordinary way a rule gets disabled during a
 * layout experiment, and the ordinary way one gets LEFT disabled — does not change the substring, so
 * every one of those guards was green with the rule inert in the browser. `styles.css` carries 160
 * `/*` tokens, so this is not a contrived shape for that file. `CLAUDE.md` trap 1, in CSS.
 *
 * QUOTE-AWARE for the same reason `codeOnly` is: `content: "/*"` is legal CSS, and a naive
 * `replace(/\/\*[\s\S]*?\*\//g, '')` would start a comment inside that string and eat forward to the
 * next `*\/`, silently deleting real rules and making a scan pass vacuously. Strings terminate at a
 * newline here (CSS strings may not span one unescaped), so the blast radius of an unbalanced quote
 * is its own line — the same bound `codeOnly` documents.
 *
 * ⚠️ IT MUST NOT STRIP `//`. CSS has no line comments, and `url(http://…)` and `@import "//host/x"`
 * are ordinary values — the JS stripper above would eat the rest of those lines. That asymmetry is
 * exactly why this is a separate function rather than a flag on `codeOnly`.
 *
 * `\` escapes inside a string survive. NOT handled: comments inside unquoted `url()` tokens, which
 * CSS does not permit anyway.
 *
 * ⚠️ A COMMENT BECOMES A SPACE, NOT NOTHING, AND IT KEEPS ITS LINE BREAKS. Two properties, from
 * two independently-written implementations of this function that met in a merge — `lane/palette-
 * overflow` and the test-hygiene lane each added a `cssCodeOnly`, git combined them without a
 * conflict because they landed at different offsets, and the result was a duplicate export that
 * crashed eight test files. Measured against each other before one was kept, and NEITHER WAS A
 * SUPERSET:
 *
 *   • a space, not nothing — and ⚠️ **NOT** for the reason this comment used to give. It said
 *     *"`.a/*x*\/.b` must become `.a .b` (a DESCENDANT, which is what CSS means)"*. **That claim is
 *     FALSE and is retracted.** A CSS comment is not whitespace: the tokenizer consumes and DISCARDS
 *     it, emitting no whitespace token (CSS Syntax L3 §4.3.2), so it separates tokens without
 *     joining anything. Verified in Chrome: `.a/*x*\/.b{color:red}` has `selectorText` `".a.b"` — a
 *     COMPOUND, one element — and it colours `<i class="a b">`, NOT `<i class="a"><u class="b">`.
 *     `div/*x*\/span{…}` and `.rz/*x*\/-palette{…}` are both invalid and Chrome DROPS the rule.
 *
 *     The space is still correct, for a different reason, and the reason is an ASYMMETRY in what
 *     this function is — a TEXT FILTER feeding selector-shaped guards. Emitting nothing FUSES
 *     adjacent identifiers: `.rz/*x*\/-palette` becomes the string `.rz-palette`, and
 *     `.rz-palette/*x*\/-wrap` becomes `.rz-palette-wrap`. Chrome drops both of those rules as
 *     invalid, so a guard reading nothing-stripped text would fire on a rule that does NOTHING —
 *     a false positive that FABRICATES this package's own guarded selector out of thin air. A space
 *     can only ever SPLIT a token, yielding a selector the guard ignores (and a rule the browser was
 *     dropping anyway). Fabricating a match is unsafe; splitting one is not. The lane version
 *     emitted nothing; this is the hygiene lane's behaviour and it is the one that is safe.
 *   • line breaks kept — the lane version re-emitted each `\n` inside a comment, so the stripped
 *     sheet keeps the raw sheet's line numbering. Measured on the real `styles.css`: 1457 newlines
 *     preserved against 1301 for the space-only version, i.e. 156 lines of drift in a file whose
 *     guards quote `file:line`.
 *
 * Both are kept, both are pinned: the space rule by `moss-screen.test.js`'s "the CSS stripper"
 * tests, the line-fidelity rule beside them (it was previously untested on BOTH sides, which is why
 * it nearly vanished in the merge).
 *
 * Behaviour pinned by `moss-screen.test.js`'s "the CSS stripper" tests, beside the scans it protects,
 * and by `palette-layout.test.js`'s three-marker negative control (double-quoted, single-quoted and
 * escaped-quote markers — both of the latter were survivors when only `"` was tested).
 */
export function cssCodeOnly(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      // Re-emit the comment's own line breaks, so the stripped sheet keeps the raw sheet's line
      // numbering; then one space, so the tokens either side of it stay separate.
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2;                                            // past the terminator (or past EOF)
      out += ' ';                                        // never fuse the tokens either side (header)
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      out += c;
      i += 1;
      while (i < n && src[i] !== q && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i];
        i += 1;
      }
      if (i < n) { out += src[i]; i += 1; }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * ⚠️ THIS DOCSTRING WAS STRANDED. It sat above `cssCodeOnly` — describing the JS stripper while
 * attached to the CSS one — after the two lanes' additions were combined. Moved back onto its own
 * function during that merge resolution: two near-identical strippers in one file is already the
 * shape that mis-targeted a mutation harness, and a misfiled docstring is how the next person
 * hardens the wrong twin.
 *
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
