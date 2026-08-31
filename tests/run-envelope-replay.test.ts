// run-envelope-replay.test.ts — phase 1 success criterion 2, proven by one
// command: a real envelope goes through checkVersions, is replayed, and lands
// on the hash it declares; a mismatched one is refused without a single tick.
//
// WHY THE REFERENCE SIM_VERSION IS A FIXTURE CONSTANT AND NOT THE REAL VALUE.
// Three reasons, and none of them is convenience:
//   (a) Building the mismatch case requires controlling BOTH sides of the
//       comparison. The real value only gives one side, so half the criterion
//       would be untestable.
//   (b) Plan 01-07 closes, as an acceptance criterion, that no code reads
//       sim-version.json in this phase. Reading it here would break that.
//   (c) Tying this test to a build artifact would make it require
//       `npm run sim:build` first — and a test that depends on a build is a
//       test somebody eventually skips.
//
// This file never hard-codes a hash of its own. It reads the golden's, which
// is what keeps it green through the re-baselines of plans 01-12 and 01-13
// without anyone editing it — and is the difference between a seam and a
// second golden hash in disguise.
import { describe, it, expect } from 'vitest';
import {
  MAX_RUN_TICKS,
  PROTOCOL_VERSION,
  RUN_FORMAT_VERSION,
  encodeLog,
  recordsToTable,
  type RunEnvelope,
  type Versions,
} from '@dg2/protocol';
import { verifyRunEnvelope } from './replayVerify';
import type { GoldenFixture } from './inputLog';
import FIXTURE from './golden/campaign-mage-3000.json';

const GOLDEN = FIXTURE as unknown as GoldenFixture;

/** See the header: a fixture value, deliberately, not the built one. */
const SIM_VERSION = 'sha256:0000000000000001';
const OTHER_SIM_VERSION = 'sha256:00000000000000ff';
const OTHER_PROTOCOL_VERSION = `${PROTOCOL_VERSION}-outro`;

const OURS: Versions = { sim: SIM_VERSION, protocol: PROTOCOL_VERSION };

/**
 * The golden run, expressed as a RunEnvelope.
 *
 * `log` is the REAL base64 blob, produced by encodeLog — never the readable
 * integer form. That is what makes this exercise the whole production path:
 * encodeLog -> envelope -> decodeLog -> replay. The type annotation is not
 * decoration either: it is what makes `npx tsc --noEmit` refuse a hand-rolled
 * shape that only resembles the protocol's.
 */
function goldenEnvelope(): RunEnvelope {
  return {
    runFormatVersion: RUN_FORMAT_VERSION,
    seed: GOLDEN.config.seed,
    config: GOLDEN.config,
    simVersion: SIM_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    players: GOLDEN.config.players,
    ticks: GOLDEN.ticks,
    maxTicks: MAX_RUN_TICKS,
    score: 0,
    finalHash: GOLDEN.hash,
    log: encodeLog(recordsToTable(GOLDEN.log, GOLDEN.config.players)),
  };
}

describe('critério 2: envelope real -> checkVersions -> replay -> hash', () => {
  it('aceita um envelope real e chega ao hash que ele declara', () => {
    const envelope = goldenEnvelope();
    const result = verifyRunEnvelope(envelope, OURS);
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.hash).toBe(envelope.finalHash);
    expect(result.ticksReplayed).toBe(envelope.ticks);
  });

  it('o envelope é o do protocolo, não uma forma paralela', () => {
    const envelope = goldenEnvelope();
    expect(envelope.runFormatVersion).toBe(RUN_FORMAT_VERSION);
    expect(envelope.maxTicks).toBe(MAX_RUN_TICKS);
    expect(envelope.protocolVersion).toBe(PROTOCOL_VERSION);
    // The log travels as the binary blob, not as the readable records.
    expect(typeof envelope.log).toBe('string');
    expect(envelope.log.length).toBeGreaterThan(0);
  });

  it('recusa um envelope de outro SIM_VERSION', () => {
    const result = verifyRunEnvelope({ ...goldenEnvelope(), simVersion: OTHER_SIM_VERSION }, OURS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('versionMismatch');
    if (result.reason !== 'versionMismatch') return;
    expect(result.mismatch.kind).toBe('sim');
  });

  it('a mensagem da recusa carrega as duas versões', () => {
    const result = verifyRunEnvelope({ ...goldenEnvelope(), simVersion: OTHER_SIM_VERSION }, OURS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // toContain on each value, never equality against a whole sentence: the
    // wording is a product decision and will be reworded; the two versions
    // being present is the requirement (D-08).
    expect(result.message).toContain(SIM_VERSION);
    expect(result.message).toContain(OTHER_SIM_VERSION);
  });

  it('a recusa por versão NÃO replaya: zero tick e nenhum hash', () => {
    // The most important of the six. Without it, "instead of silently
    // producing a wrong result" would be a sentence rather than an assertion.
    // Moving the checkVersions call in replayVerify.ts to AFTER the replay
    // makes exactly this case fail, because ticksReplayed stops being 0.
    const result = verifyRunEnvelope({ ...goldenEnvelope(), simVersion: OTHER_SIM_VERSION }, OURS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.ticksReplayed).toBe(0);
    expect('hash' in result).toBe(false);
  });

  it('recusa também por PROTOCOL_VERSION, e por teto de ticks, sem executar nada', () => {
    const byProtocol = verifyRunEnvelope(
      { ...goldenEnvelope(), protocolVersion: OTHER_PROTOCOL_VERSION },
      OURS,
    );
    expect(byProtocol.ok).toBe(false);
    if (byProtocol.ok) return;
    expect(byProtocol.reason).toBe('versionMismatch');
    if (byProtocol.reason !== 'versionMismatch') return;
    expect(byProtocol.mismatch.kind).toBe('protocol');
    expect(byProtocol.ticksReplayed).toBe(0);

    const byCeiling = verifyRunEnvelope(
      { ...goldenEnvelope(), ticks: MAX_RUN_TICKS + 1 },
      OURS,
    );
    expect(byCeiling.ok).toBe(false);
    if (byCeiling.ok) return;
    expect(byCeiling.reason).toBe('tickCeiling');
    expect(byCeiling.ticksReplayed).toBe(0);
  });
});
