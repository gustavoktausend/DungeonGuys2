// snapshot.mjs — the measured half of SYNC-04 (D3-20).
//
// THE NUMBER HAS TO BE IN THE LOG, NOT ONLY IN A GREEN TEST.
//
// tests/snapshot-bench.test.ts is the gate: it breaks the build when a part
// reaches the ceiling. This script is the OTHER half, and it exists for the
// failure the gate cannot see — a regression from 2,8 KiB to 9 KiB passes the
// gate and is invisible in review. Printing the six numbers on every CI run
// puts the new size in the log of the pull request that caused it, next to the
// diff that caused it. One of the two without the other is half a control:
// the test alone hides drift under the ceiling, the print alone never says no.
//
// WHY tsx AND NOT NODE. This file imports tests/worlds.ts and @dg2/protocol,
// which are TypeScript reached through a workspace symlink (`main` points at
// ./src/index.ts). Plain `node` cannot load them: Node 24's type stripping does
// no extension resolution, and both barrels use `export * from './world'`
// without a suffix. tsx does the resolution and the stripping, which is why
// the root package.json declares "tsx": "4.23.12" in devDependencies. That
// declaration adds NOTHING to package-lock.json — apps/server already depends
// on the exact same version and npm hoists it to the root node_modules, so the
// entry is the honest spelling of a dependency this script already had by
// accident. Verified before committing: `npm ci --dry-run` stays green with the
// declaration and fails with EUSAGE for a genuinely new package.
//
// WHAT IT DOES NOT DO, and that is a security property rather than an omission
// (T-3-22): it opens no socket, reads no environment variable and touches no
// file outside the repository. The only input is source code that CI just
// checked out.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF_REL = 'tools/bench/snapshot.mjs';
const WORLDS_REL = 'tests/worlds.ts';
const PROTOCOL_REL = 'packages/protocol/src/index.ts';

/**
 * The per-message budget of the DataChannel, in bytes.
 *
 * It has to equal SNAPSHOT_MAX_BYTES of packages/protocol/src/snapshotCodec.ts,
 * and `assertOneCeiling` below refuses to run when it does not. TWO CEILINGS IN
 * TWO FILES DIVERGE ON THE DAY ONE OF THEM MOVES, and the divergence is silent
 * in the worst direction: the bench would keep printing "teto=16384" while the
 * codec had been raised to 32768, so the log would report a limit nobody was
 * enforcing. tests/snapshot-bench.test.ts asserts the same equality from the
 * other side, by reading this literal out of this file as text — the runtime
 * check catches it when someone runs the bench, the test catches it in CI even
 * if nobody does.
 */
const CEILING = 16 * 1024;

/** Failure: `file:pointer: message` on stderr, exit 1 (tools/README.md §3). */
function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}

/**
 * Loads the two TypeScript modules, naming what to run when they are missing.
 *
 * Dynamic import rather than a static one for exactly one reason: a static
 * import that fails takes the process down with a stack trace before a single
 * line of this file executes, and tools/README.md §3 forbids an untreated
 * throw. Here the failure is caught and turned into an actionable sentence.
 */
async function load() {
  const worldsUrl = pathToFileURL(join(ROOT, WORLDS_REL)).href;
  try {
    const [worlds, protocol] = await Promise.all([
      import(worldsUrl),
      import('@dg2/protocol'),
    ]);
    return { worlds, protocol };
  } catch (error) {
    return fail(
      WORLDS_REL,
      '/',
      `não consegui carregar ${WORLDS_REL} nem ${PROTOCOL_REL} — rode \`npm ci\` antes: ${error.message}`,
    );
  }
}

/** Refuses to measure against a ceiling the codec no longer agrees with. */
function assertOneCeiling(maxBytes) {
  if (maxBytes !== CEILING) {
    fail(
      SELF_REL,
      '/CEILING',
      `o teto deste bench (${CEILING}) não bate com SNAPSHOT_MAX_BYTES do codec (${maxBytes}) — os dois são o mesmo número por definição`,
    );
  }
}

/** The three part sizes of one world, in the fixed order of SNAPSHOT_PART. */
function measure(world, protocol) {
  return protocol.encodeSnapshot(protocol.extractSnapshot(world)).map(part => part.byteLength);
}

async function main() {
  const { worlds, protocol } = await load();
  assertOneCeiling(protocol.SNAPSHOT_MAX_BYTES);

  // The same two constructors the gate measures, imported rather than rebuilt:
  // the header of tests/worlds.ts is explicit that a second copy of them would
  // let the bench and the test drift apart while both stayed green.
  const scenarios = [
    { name: 'wave16', parts: measure(worlds.wave16SwarmElite(), protocol) },
    { name: 'wave40', parts: measure(worlds.wave40Endless(), protocol) },
  ];

  // Every offending part is named, not just the first: one run has to report
  // all the problems it can see, the same discipline the gate follows.
  let over = 0;
  for (const scenario of scenarios) {
    scenario.parts.forEach((bytes, index) => {
      // `>=`, not `>`: a part that lands exactly on the budget has already
      // spent it, and the transport carries no message of CEILING + header.
      if (bytes >= CEILING) {
        over++;
        console.error(
          `${SELF_REL}:${scenario.name}/parte${index}: ${bytes} bytes alcança o teto de ${CEILING} por mensagem do DataChannel (SYNC-04)`,
        );
      }
    });
  }
  if (over > 0) process.exit(1);

  const line = scenarios
    .map(s => `${s.name} ${s.parts.map((b, i) => `parte${i}=${b}`).join(' ')}`)
    .join(' | ');
  console.log(`snapshot ${line} | teto=${CEILING}`);
}

try {
  await main();
} catch (error) {
  // The last resort of §3: no stack trace escapes this file.
  fail(SELF_REL, '/', `falha inesperada: ${error.message}`);
}
