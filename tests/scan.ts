// scan.ts — strips comments (and optionally string bodies) from TypeScript
// source, so that a regex audit reads CODE and not prose.
//
// Every guard in this repo that greps sources for a forbidden word needs this
// first, for the same reason: the word is legitimate in a comment. The comment
// that says "sim/ must never call Date.now()" and the comment that says "no
// name here says host" are both explaining the rule they appear to break, and
// an audit that cannot tell prose from code either fails on correct files or
// gets loosened until it stops catching anything.
//
// NOTE ON DUPLICATION: tests/purity.test.ts still carries its own private copy
// of this function. That file is owned by another plan executing in parallel
// (01-08), so rewiring it here would collide. The follow-up is a one-line
// import swap in purity.test.ts, recorded in 01-06-SUMMARY.md. Until it lands,
// THE TWO COPIES MUST STAY BEHAVIOURALLY IDENTICAL — this one was copied
// verbatim, and the whole suite passing is what proves nothing drifted.

/**
 * Removes comments; also blanks string/template literal bodies when
 * `keepStrings` is false. Strings are consumed atomically either way, so a
 * "//" inside a literal is never mistaken for a comment.
 *
 * Does not handle regex literals: a `/` that begins a regex containing `//`
 * or `/*` would confuse it. Neither packages/sim nor packages/protocol
 * contains a regex literal (checked), so the ambiguous case does not arise —
 * but a caller pointing this at new sources should check again.
 */
export function scan(src: string, keepStrings: boolean): string {
  let out = '', i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (two === '/*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const start = i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
      out += keepStrings ? src.slice(start, i) : '""';
      continue;
    }
    out += c; i++;
  }
  return out;
}
