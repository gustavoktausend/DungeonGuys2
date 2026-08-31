// ulid.ts — ULID (Universally Unique Lexicographically Sortable Identifier),
// transcribed by hand from the spec at github.com/ulid/spec.
//
// 128 bits = a 48-bit millisecond timestamp + 80 bits of randomness, rendered
// as 26 Crockford Base32 characters: 10 of time, then 16 of randomness. Because
// the time component comes first and Base32 preserves order, sorting the
// strings sorts by time — which is why a ledger event's id is also its
// ordering key, and why the `at` field next to it is for display only.
//
// `ulid@3.0.2` and `ulidx@2.4.1` are legitimate packages, but this module ships
// inside the published game and CLAUDE.md keeps `dependencies: {}` as an
// invariant. The spec fits in forty lines, so it is transcribed, not installed.
//
// The id is the ledger's idempotency key — the same value the phase 6 server
// will dedupe on with UNIQUE(id) — so the 80 bits come from
// crypto.getRandomValues and never from a non-cryptographic source (T-1-02).
//
// This module lives in app/. sim/ never imports it: it reads a clock.

/** Crockford Base32: the digits minus I, L, O and U, so no id can be misread. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_CHARS = 10;
const RANDOM_BYTES = 10;
const RANDOM_CHARS = 16;
/** 2^48 - 1: the largest millisecond the 10-character time component holds. */
const MAX_TIME = 281474976710655;

/**
 * The two host capabilities a ULID needs. Injecting them is what makes the
 * generator testable without a wall clock and without patching a global.
 */
export type UlidDeps = {
  /** Epoch milliseconds. */
  now(): number;
  /** `n` cryptographically strong bytes. */
  randomBytes(n: number): Uint8Array;
};

/** Rejects anything the 48-bit time component cannot represent. */
function assertTime(t: number): void {
  if (!Number.isInteger(t) || t < 0 || t > MAX_TIME) {
    throw new RangeError(`ulid: timestamp ${t} is outside the 48-bit range`);
  }
}

/** Encodes 48 bits of milliseconds as 10 Crockford characters. */
function encodeTime(t: number): string {
  let out = '';
  let rest = t;
  for (let i = 0; i < TIME_CHARS; i++) {
    const digit = rest % 32;
    out = ALPHABET[digit] + out;
    rest = (rest - digit) / 32;
  }
  return out;
}

/** Encodes 10 bytes (80 bits) as exactly 16 Crockford characters. */
function encodeRandom(bytes: Uint8Array): string {
  let out = '';
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < RANDOM_BYTES; i++) {
    acc = (acc << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >>> bits) & 31];
    }
    // Drop the bits already emitted so `acc` stays far below 32 bits.
    acc &= (1 << bits) - 1;
  }
  return out;
}

/**
 * Adds 1 to the 80-bit random component, least significant bit first, carrying
 * into the preceding byte. This is what keeps two ids minted in the same
 * millisecond strictly ordered.
 */
function increment(bytes: Uint8Array): void {
  for (let i = RANDOM_BYTES - 1; i >= 0; i--) {
    if (bytes[i] < 0xff) {
      bytes[i]++;
      return;
    }
    bytes[i] = 0;
  }
  // Unreachable short of 2^80 ids inside one millisecond. Throwing beats
  // wrapping around, because wrapping would hand out a duplicate id.
  throw new Error('ulid: randomness exhausted within a single millisecond');
}

/** Pulls a fresh block from the source, copied so the caller cannot alias it. */
function takeBytes(deps: UlidDeps, n: number): Uint8Array {
  const src = deps.randomBytes(n);
  if (src.length < n) {
    throw new Error(`ulid: random source returned ${src.length} bytes, needed ${n}`);
  }
  return src.slice(0, n);
}

/**
 * Builds a monotonic ULID generator over the given clock and byte source.
 *
 * Within one millisecond the random component is incremented instead of
 * redrawn. A clock that moves backwards (NTP correction, timezone change,
 * resume from suspend) takes the same branch: the generator keeps the highest
 * timestamp it has seen, so the ids it returns never stop growing.
 */
export function createUlidFactory(deps: UlidDeps): () => string {
  let lastTime = -1;
  // Annotated: the inferred type would pin the buffer kind and reject the
  // block that `takeBytes` hands back.
  let random: Uint8Array = new Uint8Array(RANDOM_BYTES);

  return (): string => {
    const t = deps.now();
    assertTime(t);
    if (t > lastTime) {
      lastTime = t;
      random = takeBytes(deps, RANDOM_BYTES);
    } else {
      increment(random);
    }
    const id = encodeTime(lastTime) + encodeRandom(random);
    // Cheap structural guard: a 26-character id is the whole contract.
    if (id.length !== TIME_CHARS + RANDOM_CHARS) {
      throw new Error(`ulid: produced ${id.length} characters, expected 26`);
    }
    return id;
  };
}

/** The process-wide generator, bound to the real clock and the real CSPRNG. */
export const ulid = createUlidFactory({
  now: () => Date.now(),
  randomBytes: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
});
