// worlds.ts — the three worst-case synthetic worlds, and THE ONLY PLACE THE
// DECLARED CEILING OF D3-20 IS WRITTEN DOWN.
//
// THIS MODULE IS THE SINGLE SOURCE OF THE CEILING. tests/snapshot-codec.test.ts
// and tools/bench/snapshot.mjs both import from here, and that is not a
// convenience — it is the only thing stopping the gate and the bench from
// measuring two different worlds. A bench that builds its own world drifts from
// the test the first time either is edited, and the drift is invisible: both
// stay green while one of them stops describing the game. If a second copy of
// these constructors ever appears, the ceiling has stopped meaning anything.
//
// Same discipline as tests/helpers.ts, for the same reasons: every fixture says
// WHY it is what it is, nothing draws from an unseeded source, and `players` is
// deep-copied per world so that a test writing into `forge` cannot contaminate
// the next world built.
//
// WHAT "WORST CASE" MEANS HERE, precisely, because it is deliberately ABOVE
// what the simulation would actually roll:
//
//   - Every enemy is elite. The `elite` mutator caps the roll at 65%, and
//     below wave 3 `spawnEnemy` never rolls at all — so a real wave 1 has no
//     elites. Applying it to all of them is the upper bound the codec has to
//     survive, not a prediction of a session.
//   - The boss is elite too. `spawnBoss` never applies one. Same reason.
//   - The projectile and loot counts are DECLARED, not simulated. They are the
//     estimates recorded as assumption A2 of 03-RESEARCH.md, and the honest
//     thing to do with an estimate is to name it and let a real run contradict
//     it — which is exactly what the secondary test of D3-20 is for. If a real
//     run measures above these numbers, the synthetic world is wrong and this
//     file is what gets fixed.
//
// The three worlds reproduce the § Measured Baseline table of 03-RESEARCH.md:
// 21,0 KiB on wave 1, 82,0 KiB on wave 16, 158,0 KiB on wave 40 — measured in
// this repository, and the reason the snapshot codec is a measured constraint
// rather than an optimisation.
//
// REPRODUCE, NOT REPLICATE, and the gap is worth naming rather than hiding.
// Measured here: 24,0 KiB, 96,7 KiB and 184,0 KiB — about 18% above the
// research on the two larger waves, and the same 5331 B of players to the byte.
// The whole difference is in the projectiles and the loot, and the cause is
// that the counts below are the DECLARED CEILING carrying full-precision
// coordinates, while the research measured a mix from a world that had been
// stepped. A coordinate straight out of `rng.range` prints seventeen
// significant digits, which is the most expensive thing JSON can hold; a
// coordinate that has been through the sim's clamps often prints fewer. Erring
// high is the correct direction for a worst case — the codec has to survive the
// ceiling, not the average — so the numbers stay and the delta is written down.
import {
  BOSS_WAVES,
  EQUIPMENT,
  MINIBOSS_WAVES,
  createPlayer,
  createWorld,
  equipInto,
  generateArena,
  makeElite,
  makeEnemy,
  pickEnemyType,
  recalcStats,
} from '@dg2/sim';
import type {
  AttackKind,
  Bullet,
  Chest,
  Coin,
  EnemyBullet,
  ForgeLevels,
  GameMode,
  MutatorKey,
  Player,
  Potion,
  RunConfig,
  World,
} from '@dg2/sim';

/**
 * The wave-16 enemy cohort, by the simulation's own formula.
 *
 * `startNextWave` computes `4 + wave * 3` and multiplies by 1.6 under `swarm`:
 * `round((4 + 16 * 3) * 1.6)` is 83. Every ceiling below is anchored to this
 * number so that "the wave 16 world" has exactly one meaning.
 */
const WAVE16_ENEMIES = 83;

// ── The declared ceiling (D3-20, assumption A2 of 03-RESEARCH.md) ───────────
// Five numbers, each one an ESTIMATE of the wave-16 worst case rather than a
// measurement of a session. They are named, not inlined, because the bench
// prints them and the test asserts against them.

/** Player projectiles in flight at once on wave 16 — four players, fast weapons. */
const WAVE16_BULLETS = 80;
/** Enemy projectiles on wave 16 — shooters plus one boss ring (12 or 16 at a time). */
const WAVE16_ENEMY_BULLETS = 24;
/** Coins on the floor on wave 16 — dropped faster than four players hoover them up. */
const WAVE16_COINS = 140;
/** Potions on the floor on wave 16 — potionChance is 0.2 higher on every elite. */
const WAVE16_POTIONS = 12;
/** Chests on wave 16 — `startNextWave` rolls at most one, so four is generous on purpose. */
const WAVE16_CHESTS = 4;

/**
 * How a ceiling moves to another wave: with the SQUARE ROOT of the enemy count,
 * not linearly with it.
 *
 * The rule is written here rather than left implicit because it is the second
 * assumption of this file. Linear scaling would be wrong in an obvious way —
 * four players do not fire eleven times more bullets on wave 16 than on wave 1
 * just because there are eleven times more enemies; the fire rate is capped by
 * the weapon, and the loot on the floor is capped by how fast four people walk
 * over it. Square-root scaling reproduces the § Measured Baseline table to
 * within a few percent on both of the other two waves, which is the whole
 * evidence for it.
 *
 * `Math.sqrt` is the one transcendental the ECMAScript specification pins to
 * IEEE-754 exactly, so this stays bit-identical across engines — which matters,
 * because tests/cross-engine.test.ts builds these same worlds in three browsers.
 */
function ceiling(base: number, enemies: number): number {
  return Math.max(1, Math.round(base * Math.sqrt(enemies / WAVE16_ENEMIES)));
}

/** Enemy count by `startNextWave`'s formula, `swarm` included. */
function enemyCount(wave: number, mutator: MutatorKey | null): number {
  const base = 4 + wave * 3;
  return mutator === 'swarm' ? Math.round(base * 1.6) : base;
}

/** Zeroed forge, spelled out rather than spread, so a new field fails to compile. */
function noForge(): ForgeLevels {
  return { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0 };
}

/**
 * Four players in canonical order, four different classes.
 *
 * The classes differ because a snapshot carries a class index per player and a
 * world where all four are mages would never exercise it. The forge is
 * identical and explicit across the four for the opposite reason: it is not
 * what this fixture is measuring, and four different forges would make every
 * derived stat a puzzle to read.
 */
function manifest(seed: number, mode: GameMode): RunConfig {
  return {
    seed,
    mode,
    players: [
      { id: 'p0', name: 'UM', cls: 'mage', forge: noForge() },
      { id: 'p1', name: 'DOIS', cls: 'archer', forge: noForge() },
      { id: 'p2', name: 'TRES', cls: 'warrior', forge: noForge() },
      { id: 'p3', name: 'QUATRO', cls: 'ninja', forge: noForge() },
    ],
  };
}

/**
 * The first eight catalog entries, equipped in order.
 *
 * Verbatim what § Measured Baseline did to reach 1338 B per player in JSON, and
 * copied rather than improved on purpose: filling all eight EQUIP_SLOTS instead
 * would be a fatter player and a DIFFERENT baseline, and the point of this file
 * is to reproduce the measurement that justified the codec, not to beat it.
 */
function equipEight(p: Player): void {
  for (const item of EQUIPMENT.slice(0, 8)) p.equipment = equipInto(p.equipment, item);
  recalcStats(p);
  p.hp = p.maxHp;
}

/** The attack kinds a bullet may carry, rotated through so the index travels. */
const BULLET_KINDS: AttackKind[] = ['melee', 'bolt', 'arrow', 'bullet', 'fireball'];

/** Canonical slot ids, rotated through so `Bullet.owner` resolves to all four. */
const OWNERS = ['p0', 'p1', 'p2', 'p3'];

type Spec = {
  seed: number;
  mode: GameMode;
  wave: number;
  mutator: MutatorKey | null;
};

/**
 * Builds one synthetic world, by the simulation's own constructors.
 *
 * Nothing here invents a shape: `createWorld`, `generateArena`, `createPlayer`,
 * `pickEnemyType`, `makeEnemy` and `makeElite` are the same functions a real
 * run calls, so a field added to `Enemy` tomorrow appears here without this
 * file being touched. Only the COUNTS are declared, and those are the ceiling.
 */
function build(spec: Spec): World {
  const world = createWorld(manifest(spec.seed, spec.mode));
  generateArena(world);
  for (const slot of world.config.players) {
    equipEight(createPlayer(world, slot.id, slot.cls, slot.name));
  }

  // Wave state goes in BEFORE the enemies: `makeEnemy` reads `world.wave` for
  // the hp/speed ramp and `world.waveMutator` for swarm's hp cut, so setting
  // them afterwards would build a wave-16 world out of wave-0 enemies.
  world.wave = spec.wave;
  world.waveActive = true;
  world.waveMutator = spec.mutator;
  const bossType = BOSS_WAVES[spec.wave] ?? MINIBOSS_WAVES[spec.wave] ?? null;
  world.waveHasBoss = bossType !== null;

  const { play, rng } = world;
  const spanX = () => rng.range(play.left + 20, play.right - 20);
  const spanY = () => rng.range(play.top + 20, play.bottom - 20);

  const cohort = enemyCount(spec.wave, spec.mutator);
  for (let i = 0; i < cohort; i++) {
    const enemy = makeEnemy(world, pickEnemyType(world, spec.wave), spanX(), spanY());
    makeElite(world, enemy);
    world.enemies.push(enemy);
  }
  if (bossType) {
    const boss = makeEnemy(world, bossType, spanX(), spanY());
    makeElite(world, boss);
    world.enemies.push(boss);
  }

  const bullets = ceiling(WAVE16_BULLETS, cohort);
  for (let i = 0; i < bullets; i++) {
    const bullet: Bullet = {
      owner: OWNERS[i % OWNERS.length],
      x: spanX(), y: spanY(),
      vx: rng.range(-8, 8), vy: rng.range(-8, 8),
      angle: rng.range(-Math.PI, Math.PI),
      speed: 8, range: 430,
      damage: [36, 48],
      pierce: 1, aoe: 0, poison: null,
      type: BULLET_KINDS[i % BULLET_KINDS.length],
      hitIds: [], dist: 0, dead: false,
    };
    world.bullets.push(bullet);
  }

  const enemyBullets = ceiling(WAVE16_ENEMY_BULLETS, cohort);
  for (let i = 0; i < enemyBullets; i++) {
    const bullet: EnemyBullet = {
      x: spanX(), y: spanY(),
      vx: rng.range(-5, 5), vy: rng.range(-5, 5),
      dmg: 12, dist: 0, dead: false,
    };
    world.enemyBullets.push(bullet);
  }

  const coins = ceiling(WAVE16_COINS, cohort);
  for (let i = 0; i < coins; i++) {
    const coin: Coin = { x: spanX(), y: spanY(), vx: 0, vy: 0, bob: rng.next(), dead: false };
    world.coins.push(coin);
  }

  const potions = ceiling(WAVE16_POTIONS, cohort);
  for (let i = 0; i < potions; i++) {
    const potion: Potion = { x: spanX(), y: spanY(), bob: rng.next(), dead: false };
    world.potions.push(potion);
  }

  const chests = ceiling(WAVE16_CHESTS, cohort);
  const CHEST_STATES: Chest['state'][] = ['closed', 'opening', 'looted'];
  for (let i = 0; i < chests; i++) {
    const chest: Chest = {
      x: spanX(), y: spanY(),
      state: CHEST_STATES[i % CHEST_STATES.length],
      timer: 0, fade: 0,
    };
    world.chests.push(chest);
  }

  // Scalars a snapshot carries and a freshly built world would leave at zero.
  world.tick = spec.wave * 1800;
  world.score = spec.wave * 1250;
  world.combo = 7;
  return world;
}

/** How many enemies each fixture holds, boss included — the test's expectation. */
export function expectedEnemies(wave: number, mutator: MutatorKey | null): number {
  const boss = BOSS_WAVES[wave] ?? MINIBOSS_WAVES[wave] ?? null;
  return enemyCount(wave, mutator) + (boss ? 1 : 0);
}

/**
 * Wave 1, four players, no mutator — 7 enemies by `4 + wave * 3`.
 *
 * The cheap case, and it ALREADY exceeds the 16 KiB DataChannel limit in JSON
 * (21,0 KiB measured). It is here so the ceiling is not the only evidence: the
 * codec is required on the very first wave of a four-player room, which is the
 * number that turns "optimisation" into "requirement".
 */
export function wave1FourPlayers(): World {
  return build({ seed: 20260902, mode: 'campaign', wave: 1, mutator: null });
}

/**
 * Wave 16 with `swarm`, every enemy elite, plus the act boss (`ogre_warlord`).
 *
 * The world SYNC-04 names. 83 swarm enemies by the formula, 84 with the boss,
 * and 82,0 KiB of JSON — five times the 16 KiB the transport will carry.
 */
export function wave16SwarmElite(): World {
  return build({ seed: 20260916, mode: 'campaign', wave: 16, mutator: 'swarm' });
}

/**
 * Wave 40 of an endless run with `swarm` — 198 enemies, no boss.
 *
 * The declared endless ceiling of D3-19: deep enough that the per-part budget
 * is a real question and shallow enough that a person actually reaches it.
 */
export function wave40Endless(): World {
  return build({ seed: 20260940, mode: 'endless', wave: 40, mutator: 'swarm' });
}
