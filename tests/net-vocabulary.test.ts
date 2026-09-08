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
//   plan 03-04         + apps/server/src/signaling/**/*.ts
//   this plan (03-08)  signaling.ts, rtc.ts and ice.ts — ALREADY COVERED by the
//                      first pattern, so the glob did not move. What DID move
//                      is the exemption block at the bottom, which stopped
//                      being "nobody here may claim the marker" and became the
//                      same three-lock arrangement the protocol audit uses.
//   this plan (03-09)  + src/ui/room.ts, which lives under src/ui and therefore
//                      DID need a third pattern.
//
// Writing tomorrow's glob today would be worse than useless: an
// `import.meta.glob` over a directory that does not exist yet returns an empty
// record, every check below would pass over nothing, and the anti-vacuity test
// is precisely what would go red to say so. So the glob widens when the
// directory lands, in the same commit — which is what happened here.
//
// WHY ONLY ONE FILE OF src/ui/ IS AUDITED, and not the directory. FORM-12 is
// about the vocabulary of the wire: authority, peers, slots in the code, and
// "quem criou a sala" on the screen. src/ui/room.ts is the only module under
// src/ui/ that speaks about rooms, peers and seats at all — every other file
// there paints a `World`, and a pattern of `src/ui/**` would drag in a hundred
// mentions of things this rule has no opinion about, while making the audit
// slower and its failures harder to read. The narrow pattern is also a claim
// that gets checked: if a second room-facing module is ever added under src/ui/
// and not listed here, the reviewer of THAT plan is the one who has to widen
// this line, in the commit that creates it.
//
// A wave whose files fall inside an existing pattern gets the OTHER half of the
// same discipline instead: an explicit assertion, below, that this wave's three
// sources are in the record. A pattern that already matches is not the same
// thing as a pattern that matched THESE files, and only the second is worth
// anything to the next reader.
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
// absence, and that is the only place it is allowed to be. And the exemption
// marker is confined to a literal list of files, which plan 03-08 grew from
// nothing to exactly one entry.
//
// WHY src/net/ice.ts EARNED THE EXEMPTION. That module reads the candidate type
// off the connection's statistics, and the RFC 8445 name of the
// local-interface candidate is the forbidden word — the standards body's noun
// for a NETWORK INTERFACE, not a claim about whose machine is in charge. The
// one line that compares against it says so, cites the RFC, and carries the
// marker; the three locks are the same ones tests/protocol-vocabulary.test.ts
// uses, and they are three separate tests so that a failure names which one
// gave way. Loosening FORBIDDEN instead would have been the cheap fix and the
// wrong one: the regex is written the way it is precisely to catch `hostId` and
// `authorityHost`, and widening it to admit this entry would readmit those.
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
  ['../src/net/**/*.ts', '../apps/server/src/signaling/**/*.ts', '../src/ui/room.ts'],
  { query: '?raw', import: 'default', eager: true },
);

/** The prefixes each part of the glob produces, for the anti-vacuity checks. */
const CLIENT_PREFIX = '../src/net/';
const SERVER_PREFIX = '../apps/server/src/signaling/';
/** The single view module of this phase — see the header for why it is one
 *  file and not a directory. */
const VIEW_FILE = '../src/ui/room.ts';

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

/** The per-line marker. Locked three ways — see the header. */
const EXEMPT_MARKER = 'FORM-12-EXEMPT';

/**
 * The complete list of files on this side of the wire allowed to carry the
 * marker. Grows by review, and grew by exactly one in plan 03-08.
 */
const EXEMPT_FILES = ['ice.ts'];

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

/** The file whose whole job is to not have a certain method. */
const TRANSPORT = '../src/net/transport.ts';

/** The three sources this wave added, asserted present rather than assumed. */
const WAVE_FOUR = [
  '../src/net/signaling.ts',
  '../src/net/rtc.ts',
  '../src/net/ice.ts',
];

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

  it('o glob encontrou a view da sala em src/ui', () => {
    // Asserted by NAME and separately from the two counts above, for the same
    // reason those two are separate: a combined "more than zero" stays green
    // when one pattern matches nothing at all. This is the pattern that would
    // silently stop matching if the module were ever renamed or split, and it
    // covers the file where the temptation to say the forbidden word is
    // strongest on this side — the screen is where the player has to be told
    // WHO is in charge, and the contract's answer is "quem criou a sala".
    expect(FILES[VIEW_FILE], `o glob não encontrou ${VIEW_FILE}`).toBeTypeOf('string');
  });

  it('o glob cobre os três fontes da onda 4 desta fase', () => {
    // A pattern that already matches is not the same thing as a pattern that
    // matched THESE files. Named one by one because a renamed module would
    // otherwise leave this audit silently reading two files instead of three.
    for (const path of WAVE_FOUR) {
      expect(FILES[path], `o glob não encontrou ${path}`).toBeTypeOf('string');
    }
  });

  it('nenhum fonte de src/net nem do signaling contém "host" fora de comentário', () => {
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
      // keepStrings: true — comments go, string bodies stay. A literal 'host'
      // travels on the wire exactly like an identifier would, so it breaks the
      // rule exactly as much.
      for (const line of scan(kept, true).split('\n')) {
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

  it("a lista de arquivos exemptos é exatamente ['ice.ts']", () => {
    // An exemption that any file may claim is not an exemption, it is an
    // opt-out. The signalling server still has no such case — it never reads a
    // candidate's type, it copies the string — and neither do transport.ts,
    // local.ts, lossy.ts, lobby.ts, ping.ts, signaling.ts or rtc.ts. Only
    // ice.ts classifies a candidate, so only ice.ts may say the word.
    expect(EXEMPT_FILES).toEqual(['ice.ts']);
    const claimants = Object.entries(FILES)
      .filter(([, src]) => markedLines(src).length > 0)
      .map(([path]) => path.slice(path.lastIndexOf('/') + 1));
    expect(claimants.sort(), `arquivo fora da lista usando ${EXEMPT_MARKER}`)
      .toEqual(EXEMPT_FILES);
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
    // Anti-vacuity: the exemption exists on this side from plan 03-08 on, so
    // zero marked lines would mean the marker was renamed and this test
    // silently stopped checking anything.
    expect(marked, 'nenhuma linha marcada — o marcador foi renomeado?').toBe(1);
    expect(uncited).toEqual([]);
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
