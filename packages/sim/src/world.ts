// world.ts — the single mutable state object the whole simulation operates on.
import { Rng } from './rng';
import { WORLD, TILE } from './constants';
import type { ForgeLevels, RunConfig, SimEvent, World } from './types';

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
