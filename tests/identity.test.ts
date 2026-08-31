// identity.test.ts — makes ADR 0001 executable.
//
// A run distinguishes THREE spaces of identity, each with its own owner and
// its own lifetime (docs/adr/0001-identidade-em-tres-espacos.md):
//
//   accountId  the server's durable ULID. Accumulates progress, soul gold,
//              unlocked missions and ranking entries. NEVER ENTERS THE WORLD.
//   playerId   the slot p0..p3, assigned once by the authority when the room
//              closes. The ONLY one the simulation and the replay know.
//   peerId     the transport handle. Born in the handshake, dies with the
//              connection; a reconnect makes a new one for the same slot.
//
// The property this file buys is the one the ADR exists for: A REPLAY IS
// REPRODUCIBLE WITH NO ACCOUNT DATA AT ALL. Phase 9's verifier loads a seed, a
// RunConfig and an input log, and runs `step()` without consulting the account
// database once. If either of the other two identities were to leak into the
// World, that stops being true, and every stored replay starts depending on a
// database to be readable.
//
// TWO SCANS, AND BOTH ARE NECESSARY. They catch different mistakes:
//   - the source scan catches INTENT: somebody added the field to a type.
//   - the serialised-World scan catches ACCIDENT: somebody stamped the value
//     onto an object at runtime without ever declaring it.
// Either alone leaves the other door open.
//
// The source scan deliberately does NOT strip comments, unlike
// tests/purity.test.ts. There the forbidden names (`Date.now`, `random`) are
// legitimately mentioned in prose about the original code, so stripping is
// required for the test to be usable at all. Here it is the opposite: nothing
// inside `packages/sim` has any business NAMING these two, in prose or
// otherwise — that vocabulary belongs to the authority and the account server,
// and a comment mentioning it is the first step of somebody adding it. The
// cost of the stricter rule is a false positive on a comment that says "no
// accountId here"; the note you are reading lives outside the package on
// purpose, which is where that explanation belongs.
import { describe, it, expect } from 'vitest';
import { createPlayer, createWorld, startRun } from '@dg2/sim';
import type { InputState, PlayerSlot, RunConfig, RunPlayer, World } from '@dg2/sim';
import { runTicks, noInput } from './helpers';

// Vite's raw glob, the same way tests/purity.test.ts reads the package —
// tsconfig's `types` is ["vite/client"] only, so there is no node:fs here.
const FILES = import.meta.glob<string>('../packages/sim/src/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
});

/** The two identities that live outside `packages/sim`, by name. */
const FOREIGN_IDENTITIES = ['accountId', 'peerId'] as const;

/** FORM-01/D-30: the slot vocabulary, frozen inside every replay from phase 4. */
const SLOT_SHAPE = /^p[0-3]$/;

const NO_FORGE = {
  vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0,
};

const ROSTER: RunPlayer[] = [
  { id: 'p0', name: 'ZERO', cls: 'mage', forge: NO_FORGE },
  { id: 'p1', name: 'UM', cls: 'archer', forge: NO_FORGE },
  { id: 'p2', name: 'DOIS', cls: 'warrior', forge: NO_FORGE },
  { id: 'p3', name: 'TRES', cls: 'ninja', forge: NO_FORGE },
];

const CONFIG: RunConfig = { seed: 0x1de77, mode: 'campaign', players: ROSTER };

/** A real four-player run, short but not empty: entities, loot and waves exist. */
function shortCoopRun(): World {
  const world = createWorld(CONFIG);
  for (const slot of CONFIG.players) createPlayer(world, slot.id, slot.cls, slot.name);
  startRun(world);
  runTicks(world, 300, tick => {
    const inputs: Record<string, InputState> = {};
    CONFIG.players.forEach((slot, i) => {
      inputs[slot.id] = { ...noInput(tick), attack: (tick + i) % 5 === 0 };
    });
    return inputs;
  });
  return world;
}

/**
 * Every key path in `value` whose last segment is one of `names`.
 *
 * Returns PATHS, not a boolean: "the World contains accountId" is useless as a
 * failure message when the World is a few thousand nodes deep, and the whole
 * point of catching this by accident is that nobody knows where it came from.
 */
function findKeys(value: unknown, names: readonly string[], path = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findKeys(item, names, `${path}[${i}]`));
  }
  const hits: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = `${path}.${key}`;
    if (names.includes(key)) hits.push(here);
    hits.push(...findKeys(child, names, here));
  }
  return hits;
}

describe('identidade em três espaços (FORM-01, ADR 0001)', () => {
  it('a varredura enxerga o pacote inteiro, não um glob vazio', () => {
    // A glob that matched nothing would make every assertion below vacuous.
    expect(Object.keys(FILES).length).toBeGreaterThan(20);
  });

  it('nenhum fonte de packages/sim/src nomeia accountId nem peerId', () => {
    const offenders = Object.entries(FILES)
      .filter(([, src]) => FOREIGN_IDENTITIES.some(name => src.includes(name)))
      .map(([file]) => file);
    // The list itself is the message: it names the file, which is what a
    // person needs in order to act on the failure.
    expect(offenders).toEqual([]);
  });

  it('o World serializado de uma run de quatro jogadores não carrega nenhum dos dois', () => {
    const world = shortCoopRun();
    // Round-tripped through JSON on purpose: what is asserted is what a
    // snapshot or a stored replay would actually carry across the wire.
    const serialised: unknown = JSON.parse(JSON.stringify(world, (key, value) =>
      key === 'rng' ? (value as { save(): number }).save() : value,
    ));
    const hits = findKeys(serialised, FOREIGN_IDENTITIES);
    expect(hits, `caminhos infratores: ${hits.join(', ')}`).toEqual([]);
  });

  it('todo id de RunConfig.players é um slot p0..p3', () => {
    const bad = CONFIG.players.filter(slot => !SLOT_SHAPE.test(slot.id)).map(s => s.id);
    expect(bad).toEqual([]);
    // The type says so too, and this is what keeps the two honest: an `as`
    // somewhere upstream could hand the sim a string the union forbids.
    const declared: PlayerSlot[] = ['p0', 'p1', 'p2', 'p3'];
    expect(CONFIG.players.map(s => s.id)).toEqual(declared);
  });

  it('todo id dentro de world.players é um slot p0..p3', () => {
    const world = shortCoopRun();
    const bad = Object.keys(world.players).filter(id => !SLOT_SHAPE.test(id));
    expect(bad, `ids fora de p0..p3: ${bad.join(', ')}`).toEqual([]);
    // `p.id` and the Record key are two spellings of one fact; a run where
    // they disagree replays as somebody else.
    for (const [key, p] of Object.entries(world.players)) expect(p.id).toBe(key);
  });
});

// What this file does NOT prove: that three spaces is the RIGHT design. That
// is a decision, argued and recorded in docs/adr/0001-identidade-em-tres-espacos.md,
// and it is verified by reading, not by running — 01-VALIDATION.md lists it
// under Manual-Only for exactly that reason.
