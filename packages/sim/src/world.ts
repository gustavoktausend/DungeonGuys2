// world.ts — the single mutable state object the whole simulation operates on.
import { Rng } from './rng';
import { WORLD, TILE } from './constants';
import type { RunConfig, SimEvent, World } from './types';

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
    nextWaveDelay: 3000,
    pendingAfterLevelUp: null,

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
