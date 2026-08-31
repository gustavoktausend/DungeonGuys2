// serialize.test.ts — FORM-07 and FORM-08, which together are success
// criterion 3 of the phase.
//
// THE HASH CANNOT BE THE ONLY WITNESS OF ITS OWN SERIALISATION PATH. That
// sentence is the reason this file has the shape it has, and the reason it
// carries two comparison tools instead of one.
//
// `hashWorld` is built on `JSON.stringify`, which is the same call that loses
// the sign of zero: `JSON.stringify(-0)` emits "0" and
// `JSON.parse(JSON.stringify(-0))` gives back +0. So a round-trip test whose
// only assertion is "same hash before and after" passes on data that is
// ALREADY corrupt — the witness travels the lossy path it is supposed to be
// policing. The synthetic -0 test below exists to prove that in one assertion:
// the hashes match while the structural comparison reports the loss.
//
// Hence `diffStrict`, which walks the structure and compares every leaf with
// `Object.is` — the only equality in the language that tells -0 from +0.
// `toEqual` is deliberately absent from this file: it collapses the two, which
// is the exact distinction two of these tests are about. `toBeCloseTo` is
// banned across this whole phase for the same family of reasons.
import { describe, it, expect } from 'vitest';
import { makeTestWorld, runTicks, hashWorld } from './helpers';
import {
  createPlayer, createWorld, drainEvents,
  INDESTRUCTIBLE_HP, loadWorld, saveWorld, startRun,
} from '@dg2/sim';
import type { InputState, ObjectiveKind, ObjectiveState, World } from '@dg2/sim';
import { OBJECTIVE_KIND, quantize } from '@dg2/protocol';

/** `-0` printed as itself, so a failure message is readable. */
function show(v: unknown): string {
  if (Object.is(v, -0)) return '-0';
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

/**
 * Every leaf where `a` and `b` disagree, by path. Empty means identical.
 *
 * Leaves are compared with `Object.is`, which is the whole point: it separates
 * -0 from +0 and treats NaN as equal to itself, so a diverged field reports as
 * a difference instead of as a mysterious pass. Returning paths rather than a
 * boolean is not decoration — a `World` has thousands of leaves, and "they
 * differ" without a path is a failure nobody can act on.
 *
 * Key ORDER is not compared, only the key SET. Order inside a Record is not
 * simulation state (that is what `orderedPlayers` exists to settle), and JSON
 * preserves whatever order it was handed anyway.
 */
function diffStrict(a: unknown, b: unknown, path = '$'): string[] {
  if (Object.is(a, b)) return [];

  const aObj = typeof a === 'object' && a !== null;
  const bObj = typeof b === 'object' && b !== null;
  if (!aObj || !bObj) return [`${path}: ${show(a)} !== ${show(b)}`];
  if (Array.isArray(a) !== Array.isArray(b)) return [`${path}: array contra objeto`];

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${path}.length: ${a.length} !== ${b.length}`];
    const out: string[] = [];
    for (let i = 0; i < a.length; i++) out.push(...diffStrict(a[i], b[i], `${path}[${i}]`));
    return out;
  }

  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra);
  const kb = Object.keys(rb);
  const out: string[] = [];
  for (const k of ka) if (!(k in rb)) out.push(`${path}.${k}: ausente depois do round-trip`);
  for (const k of kb) if (!(k in ra)) out.push(`${path}.${k}: apareceu no round-trip`);
  for (const k of ka) if (k in rb) out.push(...diffStrict(ra[k], rb[k], `${path}.${k}`));
  return out;
}

/**
 * Every numeric field holding `-0`, by path.
 *
 * This is the executable half of ADR 0011's `-0` policy: the format canonises
 * at CAPTURE and does not preserve the sign, which is only honest if no field
 * of a real run ever reaches -0 in the first place. `Math.round(-0.4)` is -0
 * and so is `-0 / 127`, so the value is one careless quantisation away from
 * existing — which is why this is asserted on a real run instead of assumed.
 */
function findNegativeZero(value: unknown, path = '$', seen = new Set<object>()): string[] {
  if (typeof value === 'number') return Object.is(value, -0) ? [path] : [];
  if (typeof value !== 'object' || value === null) return [];
  if (seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    const out: string[] = [];
    for (let i = 0; i < value.length; i++) out.push(...findNegativeZero(value[i], `${path}[${i}]`, seen));
    return out;
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(value)) out.push(...findNegativeZero(v, `${path}.${k}`, seen));
  return out;
}

/**
 * Every node that is not plain JSON data — a Map, a Set, or any class
 * instance — by path. Empty means the value is carryable by the format.
 *
 * It does not descend into an offender: naming the container is the useful
 * answer, and walking a class's private fields would bury it in noise.
 */
function nonPlainNodes(value: unknown, path: string): string[] {
  if (typeof value !== 'object' || value === null) return [];
  if (value instanceof Map || value instanceof Set) return [`${path}: Map/Set`];
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== Object.prototype && proto !== Array.prototype) return [`${path}: instância de classe`];

  const out: string[] = [];
  for (const [k, child] of Object.entries(value)) out.push(...nonPlainNodes(child, `${path}.${k}`));
  return out;
}

/**
 * A scripted tick, PUT THROUGH THE REAL CAPTURE QUANTISATION.
 *
 * `quantize` is what `app/input.ts` calls before the sim ever sees a value, so
 * routing the script through it is what makes the "-0 never happens in a real
 * run" test a statement about the game instead of about this file. Feeding raw
 * engine floats here would test a path no player can produce.
 */
function captured(tick: number): Record<string, InputState> {
  const raw: InputState = {
    tick,
    move: { x: Math.sin(tick / 17), y: Math.cos(tick / 23) },
    aim: (tick % 360) * (Math.PI / 180),
    attack: tick % 7 === 0,
    special: tick % 211 === 0,
    sprint: tick % 90 < 30,
  };
  return { p1: quantize(raw) };
}

/**
 * A world with its entity arrays actually full — 600 ticks of a real run, with
 * an arena, a player, live enemies, dropped coins, obstacles and traps.
 *
 * Built from the helpers and from the canonical start-of-run sequence rather
 * than assembled by hand, and both halves of that matter. A hand-built `World`
 * exercises the EMPTY shape, which is the one case that cannot fail — the
 * whole risk of a format lives in the populated arrays. And `startRun` is what
 * generates the arena and opens wave 1: `step()` alone never starts a wave, so
 * a fixture that skips it runs 600 ticks with zero enemies and quietly proves
 * nothing (measured: wave 0, `waveActive` false, enemies 0, still true at tick
 * 1200).
 */
function busyWorld(): World {
  const w = makeTestWorld();
  createPlayer(w, 'p1', 'mage', 'T');
  startRun(w);
  runTicks(w, 600, captured);
  return w;
}

const roundTrip = (w: World): World => loadWorld(saveWorld(w));

describe('FORM-07 — round-trip do World sem perda', () => {
  it('o mundo de teste está de fato ocupado, e não vazio', () => {
    // Without this, every assertion below could pass on empty arrays — the
    // classic way a serialisation test rots into a tautology.
    const w = busyWorld();
    expect(w.tick).toBe(600);
    expect(Object.keys(w.players).length).toBeGreaterThan(0);
    expect(w.obstacles.length).toBeGreaterThan(0);
    expect(w.traps.length).toBeGreaterThan(0);
    expect(w.enemies.length).toBeGreaterThan(0);
  });

  it('o mundo ocupado volta do round-trip com o mesmo hashWorld', () => {
    const w = busyWorld();
    const back = roundTrip(w);
    expect(hashWorld(back)).toBe(hashWorld(w));
  });

  it('o mundo ocupado volta idêntico numa comparação estrutural com Object.is', () => {
    const w = busyWorld();
    const back = roundTrip(w);
    const diffs = diffStrict(w, back);
    expect(diffs.join('\n'), `campos divergentes: ${diffs.length}`).toBe('');
  });

  it('o cursor do RNG volta idêntico e a sequência seguinte coincide', () => {
    const w = busyWorld();
    const back = roundTrip(w);
    expect(back.rng.save()).toBe(w.rng.save());

    // The cursor matching is necessary but not sufficient: a reload that
    // stored the number without restoring it would still compare equal here
    // and then draw a different sequence on the very next tick.
    const a: number[] = [], b: number[] = [];
    for (let i = 0; i < 32; i++) { a.push(w.rng.next()); b.push(back.rng.next()); }
    expect(b.join(',')).toBe(a.join(','));
  });

  it('saveWorld preserva config campo a campo', () => {
    const w = busyWorld();
    const data = saveWorld(w);
    expect(data.config).toBeDefined();

    const back = loadWorld(data);
    const diffs = diffStrict(w.config, back.config, '$.config');
    expect(diffs.join('\n')).toBe('');
    expect(back.config.seed).toBe(w.config.seed);
    expect(back.config.mode).toBe(w.config.mode);
    expect(back.config.players.length).toBe(w.config.players.length);
  });

  it('-0 plantado: o hash não enxerga a perda, a comparação estrutural enxerga', () => {
    // The proof that this file's second witness is worth having. If this ever
    // starts failing on the hash line, the hash grew the ability to see -0 and
    // the format's story has to be rewritten; if it fails on the diff line,
    // this file lost the only tool that catches a silent corruption.
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    w.players.p1.x = -0;

    const back = roundTrip(w);
    expect(Object.is(w.players.p1.x, -0)).toBe(true);
    expect(Object.is(back.players.p1.x, +0)).toBe(true);

    expect(hashWorld(back), 'o hash passa pelo mesmo caminho lossy').toBe(hashWorld(w));
    const diffs = diffStrict(w, back);
    expect(diffs.join('\n')).toBe('$.players.p1.x: -0 !== 0');
  });

  it('nenhum campo do World chega a -0 depois de 600 ticks de uma run real', () => {
    const w = busyWorld();

    // An empty result from a broken scanner reads exactly like an empty result
    // from a clean run, so the scanner is made to find one first. Without this,
    // "no -0 anywhere" and "no scan at all" are the same passing test.
    w.players.p1.regenAcc = -0;
    expect(findNegativeZero(w)).toHaveLength(1);
    w.players.p1.regenAcc = 0;

    const found = findNegativeZero(w);
    expect(found.join('\n'), `campos com -0: ${found.length}`).toBe('');
  });

  it('Number.MAX_SAFE_INTEGER sobrevive ao round-trip com o valor idêntico', () => {
    const w = busyWorld();
    // The real one first: a column's hp IS Number.MAX_SAFE_INTEGER, chosen in
    // arena.ts precisely because Infinity does not survive JSON.
    const column = w.obstacles.find(o => o.kind === 'column');
    expect(column, 'a arena gerou pelo menos uma coluna').toBeDefined();

    w.players.p1.maxHp = Number.MAX_SAFE_INTEGER;
    const back = roundTrip(w);
    expect(back.obstacles.find(o => o.kind === 'column')!.hp).toBe(INDESTRUCTIBLE_HP);
    expect(back.players.p1.maxHp).toBe(Number.MAX_SAFE_INTEGER);
    expect(Object.is(back.players.p1.maxHp, w.players.p1.maxHp)).toBe(true);
  });
});

describe('os dois contratos do serialize.ts', () => {
  // The failure this file is guarding against is somebody copying hashWorld's
  // replacer into saveWorld: it type-checks, the round-trip still matches by
  // hash, and the run manifest disappears without a sound.
  it('hashWorld ignora config; saveWorld o inclui', () => {
    const a = makeTestWorld({ seed: 111 });
    const b = makeTestWorld({ seed: 222 });
    createPlayer(a, 'p1', 'mage', 'T');
    createPlayer(b, 'p1', 'mage', 'T');
    // Same world state, different manifests: the fingerprint cannot tell them
    // apart (config is excluded) but the lossless form must.
    b.rng.restore(a.rng.save());
    expect(hashWorld(b)).toBe(hashWorld(a));
    expect(saveWorld(a).config.seed).toBe(111);
    expect(saveWorld(b).config.seed).toBe(222);
  });

  it('hashWorld ignora events; saveWorld os preserva', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    const clean = hashWorld(w);
    w.events.push({ t: 'sfx', name: 'hit' }, { t: 'hurtFlash' });
    expect(hashWorld(w)).toBe(clean);

    const back = roundTrip(w);
    expect(back.events.length).toBe(2);
    expect(diffStrict(w.events, back.events, '$.events').join('\n')).toBe('');
  });

  it('hashWorld distingue NaN, Infinity e -Infinity entre si e de um número', () => {
    // Moved with the function, and re-asserted here because the tagging is a
    // property of serialize.ts now, not of a test helper.
    const mk = (hp: number) => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      w.players.p1.hp = hp;
      return hashWorld(w);
    };
    expect(new Set([mk(NaN), mk(Infinity), mk(-Infinity), mk(0)]).size).toBe(4);
  });
});

describe('FORM-08 — objetivos de missão como campo do World', () => {
  /**
   * The simulation's `ObjectiveKind` is a TYPE, so it has no runtime list to
   * compare against. A `Record` keyed by it does have one, and it is exhaustive
   * BY CONSTRUCTION: adding a kind to the union without listing it here is a
   * compile error, and listing one that is not in the union is too. That is
   * what makes the parity test below able to fail in both directions.
   */
  const SIM_OBJECTIVE_KIND_INDEX: Record<ObjectiveKind, number> = {
    none: 0, defend: 1, hunt: 2, purge: 3, fetch: 4, extract: 5,
  };
  const SIM_OBJECTIVE_KIND = (Object.keys(SIM_OBJECTIVE_KIND_INDEX) as ObjectiveKind[])
    .sort((x, y) => SIM_OBJECTIVE_KIND_INDEX[x] - SIM_OBJECTIVE_KIND_INDEX[y]);

  const twoObjectives: ObjectiveState[] = [
    { kind: 'hunt', status: 'active', progress: 3, target: 10, ticksLeft: -1, marks: [7, 11, 13] },
    { kind: 'extract', status: 'inactive', progress: 0, target: 1, ticksLeft: 3600, marks: [] },
  ];

  it('objectives nasce em createWorld, é array e vale [] numa run de campanha', () => {
    const w = makeTestWorld();
    expect(Array.isArray(w.objectives)).toBe(true);
    expect(w.objectives.length).toBe(0);
    expect(createWorld(w.config).objectives.length).toBe(0);
  });

  it('objectives populado sobrevive ao round-trip campo a campo', () => {
    const w = busyWorld();
    w.objectives = twoObjectives.map(o => ({ ...o, marks: [...o.marks] }));
    const back = roundTrip(w);
    expect(back.objectives.length).toBe(2);
    expect(diffStrict(w.objectives, back.objectives, '$.objectives').join('\n')).toBe('');
  });

  it('drainEvents não remove nem altera objectives', () => {
    // The executable form of ADR 0012's deliberate exception: events are the
    // sim's only output, and `objectives` is the one piece of state that is
    // NOT one — because what app/ drained leaves no trace in the snapshot, so
    // an objective reached by event would be unverifiable by replay.
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    w.objectives = twoObjectives.map(o => ({ ...o, marks: [...o.marks] }));
    w.events.push({ t: 'announce', text: 'objetivo' });

    const drained = drainEvents(w);
    expect(drained.length).toBe(1);
    expect(w.events.length).toBe(0);
    expect(w.objectives.length).toBe(2);
    expect(diffStrict(w.objectives, twoObjectives, '$.objectives').join('\n')).toBe('');
  });

  it('a tabela de objetivos do sim e a do protocolo são idênticas e na mesma ordem', () => {
    // The sim cannot import @dg2/protocol — `dependencies: {}` in packages/sim
    // is an invariant — so the list exists twice, and this test importing both
    // is the only thing keeping them from drifting. Compared IN ORDER, because
    // OBJECTIVE_KIND is append-only and the index IS the wire value: a
    // reordering makes a message written as 'hunt' read as 'purge', silently,
    // somewhere else, later.
    expect(SIM_OBJECTIVE_KIND.join(',')).toBe([...OBJECTIVE_KIND].join(','));
    expect(SIM_OBJECTIVE_KIND.length).toBe(OBJECTIVE_KIND.length);
    expect(SIM_OBJECTIVE_KIND_INDEX.none).toBe(OBJECTIVE_KIND.indexOf('none'));
  });

  it('objectives é JSON-safe: nada de Map, Set ou instância de classe no serializado', () => {
    const w = busyWorld();
    w.objectives = twoObjectives.map(o => ({ ...o, marks: [...o.marks] }));
    const data = saveWorld(w);

    expect(nonPlainNodes(data.objectives, '$.objectives').join('\n')).toBe('');
    // And not just objectives: the whole serialised world is plain data, which
    // is the property the format rests on.
    expect(nonPlainNodes(data, '$').join('\n')).toBe('');
    expect(typeof data.rng).toBe('number');

    // The scan proves nothing unless it can find something. Run it on the LIVE
    // world and it must report exactly one offender — which is also the
    // executable form of the claim loadWorld's comment makes: `world.rng` is
    // THE only class instance in the World, so it is the only revive. The day
    // a second one is added, this line names it.
    expect(nonPlainNodes(w, '$').join('\n')).toBe('$.rng: instância de classe');
  });
});
