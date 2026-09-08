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

/**
 * The one legitimate occurrence, and the three locks on it.
 *
 * Phase 3 has to store the ICE candidate type reported by `getStats()`, and
 * the W3C / RFC 8445 name of the local-interface candidate is the forbidden
 * word. It is the standards body's word for a NETWORK INTERFACE, not a claim
 * about whose machine is in charge — a different noun spelled the same way.
 *
 * The tempting fix was to loosen FORBIDDEN. That would have been wrong: the
 * regex above exists because the obvious spelling of this rule misses
 * `hostId`, and widening it to let this one entry through would also let
 * `authorityHost` through, which is exactly the identifier the rule is for.
 *
 * So the exemption is per LINE, and it is locked three ways: the line must
 * carry the marker, the FILE must be in the literal list below, and the marked
 * line must cite the RFC that justifies it. Each lock is a separate test, so a
 * failure names which one gave way.
 */
const EXEMPT_MARKER = 'FORM-12-EXEMPT';

/** The complete list of files allowed to carry the marker. Grows by review. */
const EXEMPT_FILES = ['enums.ts'];

/** What a marked line must also cite, so the exemption carries its reason. */
const EXEMPT_CITATION = 'RFC 8445';

/**
 * The raw lines of one source that carry the marker.
 *
 * Reads the RAW text and not `scan`'s output, because the marker lives in a
 * trailing comment and `scan` removes comments — which is the whole point of
 * `scan` and the reason this cannot be one pass.
 */
function markedLines(src: string): string[] {
  return src.split('\n').filter((line) => line.includes(EXEMPT_MARKER));
}

describe('vocabulário do protocolo (FORM-12)', () => {
  it('o glob encontrou os fontes de packages/protocol', () => {
    // Without this, a broken glob would make every check below pass on an
    // empty set — the failure mode that makes a guard worthless.
    expect(Object.keys(FILES).length).toBeGreaterThan(0);
  });

  it('nenhum fonte contém a palavra "host" fora de comentário', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(FILES)) {
      // Drop the marked lines from the RAW source BEFORE scanning, rather than
      // trying to match scanned lines against raw ones by index: `scan` deletes
      // block comments whole, newlines included, so line N of its output is not
      // line N of the input. Removing a complete raw line is safe here because
      // a marked line is a code line with a trailing `//` comment — it opens
      // and closes no block — and the two tests below are what keep it that
      // way by pinning which files and which content may carry the marker.
      const kept = src.split('\n').filter((line) => !line.includes(EXEMPT_MARKER)).join('\n');
      // keepStrings: true — comments go, string bodies stay.
      for (const line of scan(kept, true).split('\n')) {
        if (FORBIDDEN.test(line)) bad.push(`${path}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('só os arquivos da lista literal usam o marcador FORM-12-EXEMPT', () => {
    // An exemption that any file may claim is not an exemption, it is an
    // opt-out. The list is short on purpose and grows only through review.
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(FILES)) {
      if (markedLines(src).length === 0) continue;
      const file = path.slice(path.lastIndexOf('/') + 1);
      if (!EXEMPT_FILES.includes(file)) offenders.push(path);
    }
    expect(offenders, `arquivo fora da lista usando ${EXEMPT_MARKER}`).toEqual([]);
  });

  it('toda linha com FORM-12-EXEMPT cita a RFC que a justifica', () => {
    // The citation is what makes the marker a claim someone can check. Without
    // it the marker degrades into "I needed this to pass", which is precisely
    // the failure mode that retires guards.
    const uncited: string[] = [];
    let marked = 0;
    for (const [path, src] of Object.entries(FILES)) {
      for (const line of markedLines(src)) {
        marked++;
        if (!line.includes(EXEMPT_CITATION)) uncited.push(`${path}: ${line.trim()}`);
      }
    }
    // Anti-vacuity: the exemption exists today, so zero marked lines would mean
    // the marker was renamed and this test silently stopped checking anything.
    expect(marked, 'nenhuma linha marcada — o marcador foi renomeado?').toBeGreaterThan(0);
    expect(uncited).toEqual([]);
  });

  it('o vocabulário substituto está nos NOMES, não só na prosa', () => {
    // This used to read the raw sources, comments included, and said so: the
    // package was tables and types, the substitution lived only in the doctrine
    // comments, and "the replacement is written down" was the most that could
    // honestly be asserted. Phase 3 is the phase that made that comment false —
    // signaling.ts carries `authorityPeerId`, `peers` and `slot` as FIELDS —
    // so the assertion moves with it and now reads the CODE, comments stripped.
    // Weakening it back would mean a package that talks about authority in
    // prose while spelling the topology in its identifiers.
    const code = Object.values(FILES).map((src) => scan(src, true)).join('\n').toLowerCase();
    for (const word of REPLACEMENTS) {
      expect(code, `nenhum identificador do pacote usa '${word}'`).toContain(word);
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
      // The exempt entry WITHOUT its marker: this is the shape of the one
      // legitimate occurrence in the package, and the detector still has to
      // catch it. The exemption is applied by the caller, one line at a time —
      // it is not baked into the regex, and this case is what proves it.
      "  'host',",
      // And the compound the loosened regex would have let through, which is
      // the reason the exemption is a marker and not a wider pattern.
      'const authorityHost = p;',
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
