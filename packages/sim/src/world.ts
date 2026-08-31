// world.ts — the single mutable state object the whole simulation operates on.
import { Rng } from './rng';
import { WORLD, TILE } from './constants';
import type { ForgeLevels, Player, RunConfig, SimEvent, World } from './types';

/**
 * What a slot the run manifest does not describe is worth: nothing.
 *
 * Shared and frozen rather than rebuilt per call — `slotForge` runs once per
 * coin per tick — and frozen so a caller that treats the fallback as writable
 * cannot poison every later reader.
 */
const NO_FORGE: Readonly<ForgeLevels> = Object.freeze({
  vigor: 0, honed: 0, fleet: 0,
  startgold: 0, merchant: 0, wise: 0, golden: 0,
});

/**
 * The forge levels of one slot (FORM-01/D-30).
 *
 * Forge is PER PLAYER, so every read site has to say WHOSE — the player who
 * collected the coin, who bought the item, who earned the xp. Each of the four
 * call sites already has that player in scope, so this never has to guess.
 *
 * It lives in world.ts on purpose: all four consumers already import from this
 * module, so resolving forge adds no edge to the import graph (tests/scc.ts).
 *
 * A slot missing from `config.players` gets NO_FORGE instead of throwing. That
 * is not leniency about a malformed manifest — it is the honest answer for a
 * player the manifest does not describe, and it is deterministic, which is the
 * only property that matters here: every peer computes the same nothing.
 */
export function slotForge(world: World, id: string): Readonly<ForgeLevels> {
  const slot = world.config.players.find(s => s.id === id);
  return slot ? slot.forge : NO_FORGE;
}

/**
 * Every player in the world, in the canonical order of the run manifest
 * (FORM-02/D-13).
 *
 * `step()` does not use this — it walks `config.players` directly, because it
 * also needs the slots nobody occupies. This exists for the OTHER readers that
 * used to walk `Object.values(world.players)` and so inherited insertion
 * order. Two of them changed the outcome of a run:
 *
 *   - `nearestPlayer` breaks a distance tie by taking the first one it sees,
 *     and two players standing on the same spot is not a rare case in a co-op
 *     game — it is the start of every run.
 *   - `pickSpawnAnchor` hands the array to `rng.pick`, so the SAME draw
 *     selects a different player depending on who joined first.
 *
 * Neither would ever look wrong; both would desync a room.
 *
 * A player the manifest does not describe still exists in the world and is
 * still visible here, appended after the manifest's own and sorted by id, so
 * that even the undescribed case has an order that is not the join sequence.
 * In a real run that tail is always empty — it is test-built worlds that
 * populate it — which is why the common case returns before computing it.
 */
export function orderedPlayers(world: World): Player[] {
  const out: Player[] = [];
  for (const slot of world.config.players) {
    const p = world.players[slot.id];
    if (p) out.push(p);
  }
  const ids = Object.keys(world.players);
  if (out.length === ids.length) return out;
  const extra = ids.filter(id => !world.config.players.some(s => s.id === id)).sort();
  for (const id of extra) out.push(world.players[id]);
  return out;
}

export function createWorld(config: RunConfig): World {
  return {
    tick: 0,
    phase: 'playing',
    rng: new Rng(config.seed),
    // Play bounds come from WORLD, never from a canvas (T6).
    play: {
      left: TILE,
      right: WORLD.w - TILE,
      top: TILE * 2,
      bottom: WORLD.h - TILE * 2,
    },
    config,
    nextId: 1,

    players: {},
    enemies: [],
    bullets: [],
    enemyBullets: [],
    coins: [],
    potions: [],
    chests: [],
    obstacles: [],
    traps: [],
    spawnQueue: [],

    wave: 0,
    waveActive: false,
    waveTimer: 0,
    waveHasBoss: false,
    waveMutator: null,
    pendingAfterLevelUp: null,

    // Born here, empty, on EVERY run — a campaign run has no mission and still
    // carries the field, so the World has one shape (types.ts, ObjectiveState).
    objectives: [],

    score: 0,
    combo: 0,
    comboTimer: 0,
    runKills: 0,
    runGoldEarned: 0,

    shopOffers: [],
    shopEquipOffers: [],
    rerollCost: 5,

    events: [],
  };
}

/** The only way sim/ talks to the outside world (T5). */
export function emit(world: World, event: SimEvent): void {
  world.events.push(event);
}

/** Changes phase and reports it, so ui/ can react without polling. */
export function setPhase(world: World, to: World['phase']): void {
  if (world.phase === to) return;
  emit(world, { t: 'phase', from: world.phase, to });
  world.phase = to;
}
