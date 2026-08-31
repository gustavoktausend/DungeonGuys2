// protocol-vocabulary.test.ts — FORM-12: the protocol does not contain the
// word "host".
//
// This is a rule about naming, which is exactly the kind of rule that decays
// when it is enforced by review: reviewers get tired, and the first `hostId`
// that slips through makes the second one look like precedent. So it is a
// test.
//
// The rule is not cosmetic. Today authority over the simulation happens to sit
// on one player's machine, reached over WebRTC. The architecture is built so
// that moving authority onto a dedicated server is a change of transport and
// not a rewrite — and that promise is only real if no message name, no field
// and no type has baked the current arrangement into its spelling. A protocol
// full of `hostId` describes a topology; a protocol of AUTHORITY, PEER and
// SLOT describes a role, and roles survive being relocated.
//
// Comments are stripped before matching, because a comment is where the word
// legitimately appears — explaining why it is not used. String bodies are NOT
// stripped: a literal `'host'` travels on the wire just like an identifier
// would, so it breaks the rule exactly as much.
import { describe, it, expect } from 'vitest';
import { scan } from './scan';

// Vite's raw glob rather than a filesystem read: the tsconfig pins `types` to
// ["vite/client"], so Node's fs module is not even typed in this file. Named
// by description and not by import specifier on purpose — the acceptance check
// for this file greps these sources for that specifier, and a comment that
// trips the audit it describes is how an audit gets retired for being noisy.
const FILES = import.meta.glob<string>('../packages/protocol/src/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
});

/**
 * Matches "host" at the start of an identifier segment, in any casing —
 * `host`, `Host`, `HOST`, `hostId`, `HostSlot`, `'host'` — plus, via the
 * second alternative, the camelCase hump in `isHost` or `roomHost`.
 *
 * Deliberately NOT `/\bhost\b/i`, which is the obvious spelling and the wrong
 * one: `\b` after "host" demands a non-word character, so `hostId` and
 * `hostName` — the single most likely way this rule ever gets broken — do not
 * match it. That was measured, not assumed: with `/\bhost\b/i` in place, a
 * planted `const hostName = 'x';` passed the audit clean.
 *
 * Equally deliberately not `/host/i`, which flags `ghost`. A guard that cries
 * wolf is a guard someone deletes.
 */
const FORBIDDEN = /(?<![A-Za-z])[Hh][Oo][Ss][Tt]|(?<=[a-z0-9])H(?:ost|OST)/;

/** What to say instead. Kept here so the test documents the substitution. */
const REPLACEMENTS = ['authority', 'peer', 'slot'];

describe('vocabulário do protocolo (FORM-12)', () => {
  it('o glob encontrou os fontes de packages/protocol', () => {
    // Without this, a broken glob would make every check below pass on an
    // empty set — the failure mode that makes a guard worthless.
    expect(Object.keys(FILES).length).toBeGreaterThan(0);
  });

  it('nenhum fonte contém a palavra "host" fora de comentário', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(FILES)) {
      // keepStrings: true — comments go, string bodies stay.
      for (const line of scan(src, true).split('\n')) {
        if (FORBIDDEN.test(line)) bad.push(`${path}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('o vocabulário substituto está escrito no pacote', () => {
    // Deliberately reads the RAW sources, comments included. Today the
    // substitution lives in the doctrine comments, because this package is
    // still only tables and types — there is no room code yet to hold an
    // `authority` identifier. Phase 3 is what moves these words from prose
    // into names; until then, "the replacement is written down" is the honest
    // thing to assert, and asserting more would mean asserting something
    // false.
    const raw = Object.values(FILES).join('\n').toLowerCase();
    for (const word of REPLACEMENTS) {
      expect(raw, `o pacote não menciona '${word}'`).toContain(word);
    }
  });

  it('o detector pega as formas reais e ignora as inocentes', () => {
    // This test guards the guard. It exists because the obvious regex for this
    // rule is wrong in a way that is invisible until something is planted:
    // /\bhost\b/i misses every compound identifier, which is most of them.
    for (const bad of [
      'const host = p;', 'const hostName = 1;', 'hostId: string',
      "kind: 'host'", "kind: 'HOST'", 'const isHost = true;',
      'type HostSlot = number;', 'room.roomHost',
    ]) {
      expect(FORBIDDEN.test(bad), `deveria pegar: ${bad}`).toBe(true);
    }

    // The replacement vocabulary, and the near-misses that must stay quiet.
    for (const ok of [
      'const authority = peer.slot;', 'const ghost = 1;',
      'type Ghost = { peer: string };', 'const slots: Slot[] = [];',
    ]) {
      expect(FORBIDDEN.test(ok), `não deveria pegar: ${ok}`).toBe(false);
    }
  });
});
