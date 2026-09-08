// net-vocabulary.test.ts — FORM-12 on the CLIENT side of the wire: the
// transport does not contain the word "host" either, and `Transport` has no
// `broadcast`.
//
// The sibling of tests/protocol-vocabulary.test.ts, deliberately built from the
// same parts: the same `FORBIDDEN` regex, copied rather than rewritten, the
// same comment stripping through tests/scan.ts, the same anti-vacuity guard,
// and the same test-that-tests-the-detector. Copying the regex is not
// duplication for its own sake — it is the one piece whose obvious spelling is
// wrong (see the comment on it), and two guards that disagree about what the
// rule IS are worse than one.
//
// THE SCOPE OF THIS FILE GROWS IN A FIXED SEQUENCE, and the sequence matters:
//
//   plan 03-03         src/net/**/*.ts
//   this plan (03-04)  + apps/server/src/signaling/**/*.ts
//   plans 03-08/03-09  + the ICE and lobby-screen sources of those waves
//
// Writing tomorrow's glob today would be worse than useless: an
// `import.meta.glob` over a directory that does not exist yet returns an empty
// record, every check below would pass over nothing, and the anti-vacuity test
// is precisely what would go red to say so. So the glob widens when the
// directory lands, in the same commit — which is what happened here.
//
// THE RULE APPLIES TO THE SERVER FOR A SHARPER REASON THAN IT DOES TO THE
// CLIENT. src/net/ is one machine's view of a wire; apps/server/src/signaling/
// is the thing in the middle, and it is the single place where the temptation
// to write "the host's socket" is strongest, because from there the authority
// really does look like a server. It is not one: it is a peer that happens to
// own the simulation today, and the day that moves to a dedicated process the
// names have to still describe reality (FORM-12). A relay module that had
// grown `hostSocket` would have to be renamed in the same commit that changes
// the topology, which is the commit with the least room for it.
//
// tests/scan.ts documents that it cannot handle regex literals. Checked when
// this glob widened: apps/server/src/signaling/ contains none, so the
// ambiguous case still does not arise.
//
// WHAT THIS FILE ADDS THAT ITS SIBLING DOES NOT: two assertions about
// src/net/transport.ts specifically. `broadcast` must not survive comment
// stripping — the word appears twice in that file's header, explaining its own
// absence, and that is the only place it is allowed to be. And no source under
// src/net/ may carry the per-line FORM-12 exemption marker: the one legitimate
// occurrence in this repository is RFC 8445's candidate type in
// packages/protocol/src/enums.ts, and it has no business on this side.
//
// WHAT IS NOT REPEATED HERE: the "substitute vocabulary lives in the NAMES"
// assertion. tests/protocol-vocabulary.test.ts makes it over the package that
// defines the vocabulary, which is where it belongs; making it again over a
// directory that is still growing would pin the presence of words rather than
// the absence of one, and only the absence is the rule.
import { describe, it, expect } from 'vitest';
import { scan } from './scan';

// Vite's raw glob rather than a filesystem read: the tsconfig pins `types` to
// ["vite/client"], so Node's fs module is not even typed in this file.
//
// TWO PATTERNS IN ONE CALL, not two globs merged by hand: `import.meta.glob`
// takes an array and returns one record, so the checks below iterate a single
// set and cannot be extended for one side and forgotten for the other.
const FILES = import.meta.glob<string>(
  ['../src/net/**/*.ts', '../apps/server/src/signaling/**/*.ts'],
  { query: '?raw', import: 'default', eager: true },
);

/** The prefixes each half of the glob produces, for the anti-vacuity checks. */
const CLIENT_PREFIX = '../src/net/';
const SERVER_PREFIX = '../apps/server/src/signaling/';

/**
 * Matches "host" at the start of an identifier segment, in any casing —
 * `host`, `Host`, `HOST`, `hostId`, `HostSlot`, `'host'` — plus, via the
 * second alternative, the camelCase hump in `isHost` or `roomHost`.
 *
 * Copied verbatim from tests/protocol-vocabulary.test.ts. Deliberately NOT
 * `/\bhost\b/i`, which is the obvious spelling and the wrong one: `\b` after
 * "host" demands a non-word character, so `hostId` and `hostName` — the single
 * most likely way this rule ever gets broken — do not match it. Equally
 * deliberately not `/host/i`, which flags `ghost`, and would also flag
 * `localhost` in a comment about the test server.
 */
const FORBIDDEN = /(?<![A-Za-z])[Hh][Oo][Ss][Tt]|(?<=[a-z0-9])H(?:ost|OST)/;

/** The marker the protocol audit honours. Nothing here may claim it. */
const EXEMPT_MARKER = 'FORM-12-EXEMPT';

/** The file whose whole job is to not have a certain method. */
const TRANSPORT = '../src/net/transport.ts';

describe('vocabulário do transporte e do signaling (FORM-12)', () => {
  it('o glob encontrou os fontes de src/net', () => {
    // Without this, a broken glob would make every check below pass on an
    // empty set — the failure mode that makes a guard worthless, and the exact
    // thing that would happen if this file's glob were widened to a directory
    // that a later plan has not created yet.
    const client = Object.keys(FILES).filter(path => path.startsWith(CLIENT_PREFIX));
    expect(client.length).toBeGreaterThan(0);
  });

  it('o glob encontrou os fontes de apps/server/src/signaling', () => {
    // The half that was added in plan 03-04, asserted SEPARATELY from the one
    // above and not merged into a single count. A combined "more than zero"
    // would stay green if the server pattern matched nothing at all — which is
    // exactly the state this file spent a plan warning about, and the state it
    // would silently return to if the directory were ever renamed.
    const server = Object.keys(FILES).filter(path => path.startsWith(SERVER_PREFIX));
    expect(server.length).toBeGreaterThan(0);
  });

  it('nenhum fonte de src/net nem do signaling contém "host" fora de comentário', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(FILES)) {
      // keepStrings: true — comments go, string bodies stay. A literal 'host'
      // travels on the wire exactly like an identifier would, so it breaks the
      // rule exactly as much.
      for (const line of scan(src, true).split('\n')) {
        if (FORBIDDEN.test(line)) bad.push(`${path}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('a interface Transport não tem broadcast (FORM-12, uma perna por mensagem)', () => {
    const src = FILES[TRANSPORT];
    expect(src, `o glob não encontrou ${TRANSPORT}`).toBeTypeOf('string');
    // Comments stripped, because the header of that file says the word twice
    // while explaining why the method is absent — and an audit that could not
    // tell prose from code would either fail on the correct file or be loosened
    // until it stopped catching anything.
    expect(scan(src!, true).toLowerCase()).not.toContain('broadcast');
    // Anti-vacuity for the assertion above: the word MUST still be in the raw
    // text. If someone deletes the paragraph that explains the absence, the
    // check above keeps passing while the reason for the rule is gone, and the
    // next person adds the method because nothing told them not to.
    expect(src!.toLowerCase(), 'o parágrafo que explica a ausência sumiu').toContain('broadcast');
  });

  it('nenhum fonte de src/net nem do signaling reivindica o marcador de exceção', () => {
    // The single legitimate occurrence in this repository is RFC 8445's
    // candidate type in packages/protocol/src/enums.ts, and the exemption there
    // is locked three ways. Neither side of the wire has such a case — the
    // signalling server never reads a candidate's type, it copies the string —
    // and a file that quietly grew one should have to come through review.
    const claimants = Object.entries(FILES)
      .filter(([, src]) => src.includes(EXEMPT_MARKER))
      .map(([path]) => path);
    expect(claimants).toEqual([]);
  });

  it('o detector pega as formas reais e ignora as inocentes', () => {
    // This test guards the guard. It exists because the obvious regex for this
    // rule is wrong in a way that is invisible until something is planted.
    for (const bad of [
      'const host = p;', 'const hostName = 1;', 'hostId: string',
      "kind: 'host'", "kind: 'HOST'", 'const isHost = true;',
      'type HostSlot = number;', 'room.roomHost',
      "  'host',",
      'const authorityHost = p;',
    ]) {
      expect(FORBIDDEN.test(bad), `deveria pegar: ${bad}`).toBe(true);
    }

    for (const ok of [
      'const authority = peer.slot;', 'const ghost = 1;',
      'type Ghost = { peer: string };', 'const slots: Slot[] = [];',
      // localhost is the near-miss this side of the wire actually produces,
      // and it must stay quiet: the letter before "host" is a word character,
      // so the lookbehind refuses it.
      "const origin = 'http://localhost:5173';",
    ]) {
      expect(FORBIDDEN.test(ok), `não deveria pegar: ${ok}`).toBe(false);
    }
  });
});
