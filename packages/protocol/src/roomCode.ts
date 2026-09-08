// roomCode.ts — the alphabet, the length, the normaliser and the strict check
// for a room code. Three things have to be said here, because each of them is
// a decision someone would otherwise undo by accident.
//
// (a) THE CODE IS THE ONLY CREDENTIAL A ROOM HAS IN THIS PHASE (D3-09). There
//     is no session on the signalling upgrade until phase 6; whoever knows the
//     six characters is in. That is what sets the size: 32^6 = 1,073,741,824
//     codes, so a blind guess against fifty live rooms lands with probability
//     ~4.7e-8. Six characters is the FLOOR, and it is enough only BECAUSE the
//     rate limit on the join attempt exists (T-3-01) — ten tries per minute
//     per address turns sweeping the space into geological time, and without
//     it the same six characters would be sweepable. The limiter lives in the
//     signalling server (plan 03-04); this module is the half of the pair that
//     cannot enforce it, and saying so here is what keeps the other half from
//     being quietly dropped as "not needed".
//
// (b) GENERATION DOES NOT LIVE HERE, AND MUST NOT. A code is drawn ON THE
//     SERVER, from the platform's CSPRNG, and checked against the live rooms
//     before it is handed out. This module only
//     NORMALISES and VALIDATES, and that restraint is what lets @dg2/protocol
//     keep `dependencies: {}` and `types: []`: drawing a code needs a CSPRNG,
//     a CSPRNG is a runtime capability, and reaching for one here would drag
//     either a dependency or an ambient type into a package that has to
//     compile inside a browser tab and inside a Node process from one source.
//
//     The paragraph above names no API, and the omission is deliberate — the
//     same move version.ts makes for the same reason. The acceptance check for
//     this file is a grep for the names of the random-number APIs, so a
//     comment that spells one would either retire the audit for being noisy or
//     teach the next reader that the generator belongs here after all.
//
// (c) THIS ALPHABET IS A SECOND, INDEPENDENT COPY of the one in
//     src/app/ulid.ts:20, and the duplication is deliberate. Both are Crockford
//     Base32 today, and sharing the constant would make a change to the ROOM
//     PROTOCOL edit the format of the LEDGER's identifiers — two things with
//     different reasons to change and different blast radii. Coupling them
//     would be free today and expensive exactly once.

/**
 * Crockford Base32: the digits and the letters, minus I, L, O and U.
 *
 * I, L and O are out because they are misread as 1, 1 and 0; the decode map
 * below accepts them anyway and folds them in, which is the point of the
 * scheme. U is out for a different reason and is NEVER mapped: excluding it
 * keeps the encoding from producing accidental obscenities, and there is no
 * character it could safely be mistaken for.
 */
export const ROOM_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Six characters — see (a) in the header for why this number and not four. */
export const ROOM_CODE_LENGTH = 6;

/**
 * The Crockford decode map: what a player can type instead of the real
 * character. Only these three, and U is deliberately absent (see the alphabet
 * doc above).
 *
 * A Map rather than an object literal so that `get` is typed
 * `string | undefined` and the `??` below is a real fallback rather than one
 * the compiler considers unreachable.
 */
const DECODE = new Map<string, string>([['I', '1'], ['L', '1'], ['O', '0']]);

/**
 * Characters a player may put BETWEEN the code's characters without meaning
 * them: the hyphen they add to make it readable, and every space a copy out of
 * a chat window drags along — space, tab, CR, LF, and U+00A0, the non-breaking
 * space that a paste out of a web page actually contains.
 *
 * BY CODE POINT, not by literal. Four of the five are invisible, and the
 * non-breaking one is invisible AND indistinguishable from a normal space on
 * screen — so writing them as themselves would put characters in this table
 * that no reviewer can see and that an editor's "clean up whitespace" would
 * silently delete, changing behaviour with a diff nobody can read. The numbers
 * are legible, greppable and survive every tool between here and the reader.
 *
 * A set rather than a regular expression, also on purpose: tests/scan.ts,
 * which every structural audit in this repository runs first, documents that
 * it does not handle regex literals and that neither packages/sim nor
 * packages/protocol contains one. Keeping that true is cheaper than making the
 * scanner smarter.
 */
const SEPARATORS = new Set([...[0x20, 0x09, 0x0a, 0x0d, 0xa0].map((c) => String.fromCharCode(c)), '-']);

/**
 * Turns whatever the player typed into the canonical form, or returns `null`.
 *
 * Forgiving about presentation (case, hyphens, spaces, the three ambiguous
 * letters) and unforgiving about everything else: an unknown character, a `U`,
 * or a length other than `ROOM_CODE_LENGTH` all yield `null`. Refusing here is
 * what keeps a typo from costing a round trip to the server, and — because the
 * refusal happens before the code leaves the machine — keeps a mistyped code
 * out of the join rate limit that protects (a).
 *
 * `toUpperCase` and not `toLocaleUpperCase`: the locale-aware one maps a
 * Turkish dotless i differently, and a code is not text in the player's
 * language. Iteration is by code point, so a surrogate pair arrives as one
 * two-unit string that is not in the alphabet and is refused, rather than
 * being split into two halves that might individually look innocent.
 */
export function normalizeRoomCode(raw: string): string | null {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (SEPARATORS.has(ch)) continue;
    const mapped = DECODE.get(ch) ?? ch;
    if (!ROOM_CODE_ALPHABET.includes(mapped)) return null;
    out += mapped;
    // Bail as soon as it is too long: a pasted paragraph should cost a handful
    // of iterations, not one per character of the paragraph.
    if (out.length > ROOM_CODE_LENGTH) return null;
  }
  return out.length === ROOM_CODE_LENGTH ? out : null;
}

/**
 * Is this string ALREADY the canonical form — exact length, every character in
 * the alphabet, nothing to fold?
 *
 * Deliberately not "would this be valid after normalising". This is the check
 * the server runs on a code that arrived over the wire, where accepting
 * `abc-123` would mean two spellings of one room and therefore two rooms in a
 * map keyed by the string. Callers holding player input run
 * `normalizeRoomCode` first; callers holding a code that was already
 * normalised run this.
 */
export function isRoomCode(value: string): boolean {
  if (value.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of value) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
