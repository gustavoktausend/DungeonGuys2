// replayVerify.ts — the whole of phase 1 success criterion 2 in one function.
//
// "A run recorded today is reloaded after a new build and re-executed to the
// same hashWorld; when SIM_VERSION changes, the refusal is explicit and says
// why." Until now that criterion was satisfied in pieces — plan 01-04 proves
// replay against the golden, plan 01-06 tests `checkVersions` in isolation —
// and neither piece demonstrates the SEAMED capability. This is the seam.
//
// THE ORDER OF THE STEPS BELOW IS THE CRITERION, not a matter of style. The
// version comparison happens before a World is ever built, so a mismatched
// envelope costs zero ticks of simulation. That is what "instead of silently
// producing a wrong result" means in practice, and `ticksReplayed` is the
// field that makes it assertable rather than aspirational.
import { createPlayer, createWorld, startRun } from '@dg2/sim';
import type { World } from '@dg2/sim';
import { MAX_RUN_TICKS, checkVersions, decodeLog } from '@dg2/protocol';
import type { RunEnvelope, VersionMismatch, Versions } from '@dg2/protocol';
import { createStepper } from '../src/app/stepper';
import { hashWorld } from './helpers';

/**
 * Every branch carries `ticksReplayed`, including the refusals — where it is
 * always 0. A caller can therefore prove the simulation did not move, which
 * no boolean could express.
 */
export type ReplayResult =
  | { ok: true; hash: string; ticksReplayed: number }
  | {
      ok: false;
      reason: 'versionMismatch';
      mismatch: VersionMismatch;
      message: string;
      ticksReplayed: number;
    }
  | { ok: false; reason: 'tickCeiling'; message: string; ticksReplayed: number }
  | { ok: false; reason: 'hashMismatch'; hash: string; message: string; ticksReplayed: number };

/**
 * The canonical start-of-run sequence, the same one tests/golden.test.ts uses.
 * Copied rather than reinvented on purpose: two ways of starting a run is two
 * definitions of what a run IS, and the replay would then be verifying a
 * different game than the one that was recorded.
 */
function buildWorld(envelope: RunEnvelope): World {
  const world = createWorld(envelope.config);
  for (const slot of envelope.players) createPlayer(world, slot.id, slot.cls, slot.name);
  startRun(world);
  return world;
}

/**
 * Verifies a recorded run against this build.
 *
 * `ours` is the verifier's OWN pair of versions (T-1-01): the envelope never
 * supplies the reference to compare against, so a forged `simVersion` can only
 * get itself refused, never widen what is accepted.
 */
export function verifyRunEnvelope(envelope: RunEnvelope, ours: Versions): ReplayResult {
  // 1. Versions first, before any simulation exists.
  const mismatch = checkVersions(ours, {
    sim: envelope.simVersion,
    protocol: envelope.protocolVersion,
  });
  if (mismatch) {
    return {
      ok: false,
      reason: 'versionMismatch',
      mismatch,
      ticksReplayed: 0,
      // Both values, literally, because "incompatible version" on its own
      // costs an hour of debugging every time it is read (D-08).
      message:
        `versão de ${mismatch.kind} incompatível: esta máquina tem ${mismatch.ours}, ` +
        `o replay foi gravado com ${mismatch.theirs} — recarregue para atualizar`,
    };
  }

  // 2. The tick ceiling, also before anything is allocated (T-1-03).
  if (envelope.ticks > envelope.maxTicks || envelope.ticks > MAX_RUN_TICKS) {
    return {
      ok: false,
      reason: 'tickCeiling',
      ticksReplayed: 0,
      message:
        `o envelope declara ${envelope.ticks} ticks, acima do teto de ` +
        `${Math.min(envelope.maxTicks, MAX_RUN_TICKS)}`,
    };
  }

  // 3. Only now: rebuild from the seed (D-11) and apply the log.
  const collect = decodeLog(envelope.log, envelope.players);
  const world = buildWorld(envelope);
  createStepper(world).runTicks(envelope.ticks, collect);

  // 4. Compare, carrying both hashes so a failure is diagnosable.
  const hash = hashWorld(world);
  if (hash !== envelope.finalHash) {
    return {
      ok: false,
      reason: 'hashMismatch',
      hash,
      ticksReplayed: world.tick,
      message: `o replay terminou em ${hash}, o envelope declara ${envelope.finalHash}`,
    };
  }
  return { ok: true, hash, ticksReplayed: world.tick };
}
