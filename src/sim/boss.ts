// boss.ts — boss/mini-boss spawning, wave planning and attack patterns.
// Ported from ORIG/entities.js:303-309 (spawnBoss), ORIG/combat.js:398-476
// (updateBossPattern) and ORIG/ui.js:582-595 (bossPlanForWave).
//
// Deliberate deviations from the original — see task-14-brief.md:
//  - spawnBoss's x keeps the original's horizontal fan around the arena
//    centre (`WORLD.w / 2 + (index - (total-1)/2) * 140`), but the original's
//    y — `PLAY.top + 60` — put the boss "near the top of the screen", which
//    was only close to the player because the original arena WAS the screen.
//    Here the arena is 2400x1600, so y is placed a spawn-ring distance
//    (420-620px, same scale as an ordinary enemy's ring — see SPAWN_MIN/MAX
//    in enemies.ts) above the nearest living player instead, so the boss
//    enters the fight rather than spawning a screen and a half away.
//  - updateBossPattern takes `world` and the already-resolved dx/dy/dist to
//    the nearest player (computed once by updateEnemies' seam) instead of
//    reading a global `player`; dt is DT_MS and factor is TICK_FACTOR,
//    both fixed constants of this sim, so neither is a parameter.
//  - bossPlanForWave reads `world.config.mode` in place of the original's
//    global `gameMode`, and draws from `world.rng` instead of `Math.random()`.
//    Every draw that was an unconditional `Math.random() < x` in the
//    original (the extraChance roll and the >=32 stacking roll) uses
//    `world.rng.next() < x` rather than `world.rng.chance(x)`, so a draw
//    always happens even at a boundary where x could be 0 or 1 — this
//    project has been bitten once by chance()'s no-draw short circuit.
//    The conditional draws (the 20% "does a non-multiple-of-8 wave get a
//    boss" roll, gated on `w % 8 !== 0`, and the 25% extra-boss roll, gated
//    on `w >= 32`) keep their original short-circuiting exactly: the draw
//    only happens when its guard condition is true.
//
// This file and enemies.ts import from each other (boss.ts needs makeEnemy/
// nearestPlayer/SPAWN_MIN/SPAWN_MAX; enemies.ts's updateEnemies needs
// updateBossPattern at the seam left by Task 12). Flagged for the
// controller per task-14-brief.md rather than restructured unilaterally.
import { emit } from './world';
import { DT_MS, TICK_FACTOR, WORLD, WAVES_TOTAL } from './constants';
import { BOSS_WAVES, MINIBOSS_WAVES } from './defs/enemies';
import { makeEnemy, nearestPlayer, SPAWN_MIN, SPAWN_MAX } from './enemies';
import type { Enemy, World } from './types';

/** ORIG/entities.js:303-309, with the spawn-position deviation (see file header). */
export function spawnBoss(world: World, type: string, index: number, total: number): void {
  const x = WORLD.w / 2 + (index - (total - 1) / 2) * 140;
  const anchor = nearestPlayer(world, x, WORLD.h / 2);
  const anchorY = anchor ? anchor.y : WORLD.h / 2;
  const ring = world.rng.range(SPAWN_MIN, SPAWN_MAX);
  const y = Math.max(world.play.top + 20, Math.min(world.play.bottom - 20, anchorY - ring));

  const e = makeEnemy(world, type, x, y);
  world.enemies.push(e);
  emit(world, { t: 'particles', x: e.x, y: e.y, color: '#e74c3c', count: 30 });
}

/**
 * ORIG/combat.js:398-476. Returns true while the pattern controls the
 * boss's movement this tick (telegraph/charge/recover), false when the
 * caller's normal chase-and-contact movement should apply instead.
 */
export function updateBossPattern(world: World, e: Enemy, dx: number, dy: number, dist: number): boolean {
  if (!e.abilities) return false;

  // enrage below 30% HP: faster, angrier, shorter cooldowns
  if (!e.enraged && e.hp < e.maxHp * 0.3) {
    e.enraged = true;
    e.speed *= 1.35;
    emit(world, { t: 'float', x: e.x, y: e.y - e.h / 2 - 16, text: 'ENRAGED!', color: '#e74c3c' });
    emit(world, { t: 'sfx', name: 'mimic' });
    emit(world, { t: 'particles', x: e.x, y: e.y, color: '#e74c3c', count: 18 });
  }
  const cdMult = e.enraged ? 0.6 : 1;

  if (e.bossState === 'telegraph') {
    e.stateT -= DT_MS;
    if (e.stateT <= 0) {
      e.bossState = 'charging';
      e.stateT = 520;
      emit(world, { t: 'sfx', name: 'special' });
    }
    return true; // planted, winding up
  }

  if (e.bossState === 'charging') {
    e.stateT -= DT_MS;
    const sp = e.speed * 7;
    e.x += e.chargeDir.x * sp * TICK_FACTOR;
    e.y += e.chargeDir.y * sp * TICK_FACTOR;
    // slamming into a wall ends the charge early
    const cx = Math.max(world.play.left + 24, Math.min(world.play.right - 24, e.x));
    const cy = Math.max(world.play.top + 24, Math.min(world.play.bottom - 24, e.y));
    if (cx !== e.x || cy !== e.y) {
      e.x = cx; e.y = cy;
      e.stateT = 0;
      emit(world, { t: 'shake', mag: 9, dur: 260 });
      emit(world, { t: 'sfx', name: 'explosion' });
      emit(world, { t: 'particles', x: e.x, y: e.y, color: '#aab7c4', count: 14 });
    }
    if (e.stateT <= 0) { e.bossState = 'recover'; e.stateT = 450; }
    return true;
  }

  if (e.bossState === 'recover') {
    e.stateT -= DT_MS;
    if (e.stateT <= 0) e.bossState = 'chase';
    return true;
  }

  // chasing: tick cooldowns and maybe start an ability
  for (const k of Object.keys(e.abilities)) e.cd[k] = (e.cd[k] || 0) + DT_MS;

  if (e.abilities.ring && e.cd.ring >= e.abilities.ring * cdMult && dist < 420) {
    e.cd.ring = 0;
    const n = e.enraged ? 16 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      world.enemyBullets.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * 3.8, vy: Math.sin(a) * 3.8,
        dmg: 12, dist: 0, dead: false,
      });
    }
    emit(world, { t: 'sfx', name: 'eshoot' });
    emit(world, { t: 'particles', x: e.x, y: e.y, color: '#9b59b6', count: 16 });
    return false;
  }

  if (e.abilities.charge && e.cd.charge >= e.abilities.charge * cdMult && dist > 120 && dist < 520) {
    e.cd.charge = 0;
    e.bossState = 'telegraph';
    e.stateT = 650;
    e.chargeDir = { x: dx / dist, y: dy / dist }; // locked now — sidestep it!
    emit(world, { t: 'sfx', name: 'mimic' });
    return true;
  }
  return false;
}

/**
 * ORIG/ui.js:582-595. Which boss types (if any) spawn on wave `w` — act
 * bosses, mini-bosses, or (past WAVES_TOTAL in endless mode) a random,
 * escalating chance of one or more of the two act bosses.
 */
export function bossPlanForWave(world: World, w: number): string[] {
  if (BOSS_WAVES[w]) return [BOSS_WAVES[w]];
  if (MINIBOSS_WAVES[w]) return [MINIBOSS_WAVES[w]];
  if (world.config.mode !== 'endless' || w <= WAVES_TOTAL) return [];

  // endless past WAVES_TOTAL: guaranteed every 8th wave, otherwise a 20%
  // roll — drawn only on the non-multiple-of-8 branch, exactly like the
  // original's short-circuited `Math.random() >= 0.2`.
  if (w % 8 !== 0 && world.rng.next() >= 0.2) return [];

  const types = Object.values(BOSS_WAVES);
  const extraChance = Math.min(0.5, (w - WAVES_TOTAL) * 0.03);
  // Unconditional draws (see file header): always run, regardless of
  // whether extraChance could be 0.
  let count = 1 + (world.rng.next() < extraChance ? 1 : 0);
  if (w >= 32 && world.rng.next() < 0.25) count++;

  const plan: string[] = [];
  for (let i = 0; i < count; i++) plan.push(world.rng.pick(types));
  return plan;
}
