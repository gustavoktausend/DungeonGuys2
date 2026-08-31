// enemies.ts — spawn, elite rolls, chase/attack AI, enemy projectiles and death.
// Ported from ORIG/entities.js:39-58 (makeElite), :174-198 (spawnEnemy),
// :200-251 (makeEnemy), :252-264 (selfDetonate), :310-426 (updateEnemies),
// :427-470 (killEnemy + its enemyColor helper) and ORIG/combat.js:477-504
// (updateEnemyBullets).
//
// Deliberate deviations from the original — see task-12-brief.md:
//  - spawnEnemy spawns in a 420-620px ring around a living player (or the
//    world centre, with none alive) instead of hugging the arena wall — the
//    wall was close to the player only because the original arena was
//    screen-sized; this port's arena is much larger.
//  - Every AI decision that was `Math.random()` in the original now draws
//    from `world.rng`, and every `player` reference is `nearestPlayer(...)`,
//    so the file works whether the world holds one player or several.
//  - `killEnemy` grants XP through `./xp.ts`'s `gainXp` (Task 16):
//    `if (killer) gainXp(world, killer, e.score);`. That makes
//    enemies.ts -> xp.ts -> run.ts -> enemies.ts a module cycle (xp.ts's
//    `closeLevelUp` calls run.ts's `victory`, and run.ts already imports
//    `spawnEnemy`/`nearestPlayer` from here) — same shape as the
//    enemies.ts <-> boss.ts cycle below, safe for the same reason: every
//    cross-reference is used inside a function body, never at module-eval
//    time.
//  - Boss attack patterns (charge, ring, ...) live in `./boss.ts`'s
//    `updateBossPattern`, wired in at the seam inside `updateEnemies` (Task
//    14). That file also needs `makeEnemy`/`nearestPlayer`/`SPAWN_MIN`/
//    `SPAWN_MAX` from here, so this module and boss.ts import from each
//    other — flagged for the controller in task-14-report.md rather than
//    restructured unilaterally.
//  - `Save.data.progress.bossKills++` / `Save.persist()` (ORIG/entities.js:
//    437-438) are app-layer persistence — sim/ never touches localStorage.
//    killEnemy emits `{ t: 'bossKill' }` instead so app/events.ts can do the
//    persisting (Task 20 fix round 1, see task-20-report.md).
import { emit, orderedPlayers } from './world';
import { DT_MS, TICK_FACTOR, WORLD, DEFAULT_ENTITY_SCALE, COMBO_WINDOW } from './constants';
import { ENEMY_DEFS, ELITE_TYPES } from './defs/enemies';
import { damagePlayer } from './player';
import { resolveObstacles, trapDangerous, rectCircle } from './arena';
import { updateBossPattern } from './boss';
import { gainXp } from './xp';
import { atan2, cos, sin } from './math';
import type { EliteType, Enemy, Player, World } from './types';

// Also reused by boss.ts to keep a boss's spawn distance from the nearest
// player on the same scale as an ordinary enemy's spawn ring.
export const SPAWN_MIN = 420;
export const SPAWN_MAX = 620;

/**
 * Closest living player to (x, y), or null if none are alive. No ORIG source
 * range — the original always read the single global `player`; this is its
 * multiplayer-ready replacement, used everywhere that used to say `player`.
 *
 * Canonical order, not insertion order (FORM-02/D-13): the comparison below is
 * strict, so an exact distance TIE is won by whoever comes first — and four
 * players standing on the same spawn point is how every run begins.
 */
export function nearestPlayer(world: World, x: number, y: number): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of orderedPlayers(world)) {
    if (p.hp <= 0) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** ORIG/entities.js:200-251. */
export function makeEnemy(world: World, type: string, x: number, y: number): Enemy {
  const def = ENEMY_DEFS[type];
  let hp = def.hp + Math.floor(world.wave * def.hp * 0.12);
  // speed ramps with the wave but is capped so deep endless stays fair/playable
  let speed = def.speed + Math.min(world.wave, 30) * 0.04;
  let goldDrop = def.gold;
  // wave mutators tweak the stat line (bosses ignore swarm's HP cut)
  if (world.waveMutator === 'swarm' && !def.boss) hp = Math.round(hp * 0.7);
  if (world.waveMutator === 'frenzy') speed *= 1.35;
  if (world.waveMutator === 'bounty') goldDrop *= 2;
  return {
    id: world.nextId++,
    x, y,
    w: def.w, h: def.h,
    hp, maxHp: hp,
    speed,
    score: def.score,
    goldDrop,
    potionChance: def.potion,
    dmg: def.dmg,
    boss: def.boss || null,
    scale: def.scale || DEFAULT_ENTITY_SCALE,
    summons: def.summons || null,
    summonTimer: 0,
    type,
    anim: def.anim,
    dead: false,
    moving: false,
    elite: null,
    eliteName: null,
    eliteTint: null,
    regen: 0,
    hitFlash: 0,
    poisonT: 0,
    poisonDps: 0,
    burnT: 0,
    burnDps: 0,
    slowT: 0,
    shooter: def.shooter || null,
    shootT: 0,
    exploder: def.exploder || null,
    fusing: false,
    fuseT: 0,
    abilities: def.abilities || null,
    cd: {},
    bossState: 'chase',
    stateT: 0,
    trapT: 0,
    chargeDir: { x: 0, y: 0 },
    enraged: false,
  };
}

/** ORIG/entities.js:39-58. Returns the elite type it applied, so callers get
 *  its name/tint without re-narrowing the (nullable) fields on the enemy. */
export function makeElite(world: World, e: Enemy): EliteType {
  const keys = Object.keys(ELITE_TYPES);
  const key = world.rng.pick(keys);
  const t = ELITE_TYPES[key];
  e.elite = key;
  e.eliteTint = t.tint;
  e.eliteName = t.name;
  e.maxHp = Math.round(e.maxHp * (t.hp || 1));
  e.hp = e.maxHp;
  if (t.speed) e.speed *= t.speed;
  if (t.dmg) e.dmg = Math.round(e.dmg * t.dmg);
  if (t.regen) e.regen = t.regen;
  if (t.scaleUp) e.scale *= t.scaleUp;
  e.score = Math.round(e.score * 2.5);
  e.goldDrop = Math.round(e.goldDrop * 2.5);
  e.potionChance = Math.min(1, e.potionChance + 0.2);
  return t;
}

/**
 * A living player, or the world centre if none are alive — the spawn ring's
 * anchor.
 *
 * Canonical order matters more here than anywhere else: `rng.pick` indexes
 * this array, so the very SAME draw would choose a different anchor in two
 * rooms that filled in a different order, and the wave would spawn somewhere
 * else with the rng cursor looking perfectly healthy (FORM-02/D-13).
 */
function pickSpawnAnchor(world: World): { x: number; y: number } {
  const alive = orderedPlayers(world).filter(p => p.hp > 0);
  if (alive.length === 0) return { x: WORLD.w / 2, y: WORLD.h / 2 };
  return world.rng.pick(alive);
}

/**
 * Spawn-ring deviation (see file header): a point 420-620px from a living
 * player, inside the play bounds and clear of obstacles. Bounded attempts
 * and a deterministic fallback — never an unbounded loop, never a variable
 * number of rng draws that depends on anything outside `world`.
 */
function spawnPoint(world: World): { x: number; y: number } {
  const anchor = pickSpawnAnchor(world);
  for (let i = 0; i < 24; i++) {
    const a = world.rng.next() * Math.PI * 2;
    const r = world.rng.range(SPAWN_MIN, SPAWN_MAX);
    const x = anchor.x + cos(a) * r;
    const y = anchor.y + sin(a) * r;
    if (x < world.play.left + 20 || x > world.play.right - 20) continue;
    if (y < world.play.top + 20 || y > world.play.bottom - 20) continue;
    if (world.obstacles.some(o => {
      if (o.dead) return false;
      const dx = x - o.x, dy = y - o.y;
      return Math.sqrt(dx * dx + dy * dy) < o.r + 24;
    })) continue;
    return { x, y };
  }
  // fallback: clamp a point on the ring into bounds rather than give up
  const a = world.rng.next() * Math.PI * 2;
  return {
    x: Math.max(world.play.left + 20, Math.min(world.play.right - 20, anchor.x + cos(a) * SPAWN_MIN)),
    y: Math.max(world.play.top + 20, Math.min(world.play.bottom - 20, anchor.y + sin(a) * SPAWN_MIN)),
  };
}

/** ORIG/entities.js:174-198, with the spawn-ring deviation (see file header). */
export function spawnEnemy(world: World, type: string): void {
  const { x, y } = spawnPoint(world);
  emit(world, { t: 'particles', x, y, color: '#9b59b6', count: 8 });

  const e = makeEnemy(world, type, x, y);
  // elite chance grows with the wave; the ELITE HUNT mutator floods them
  const eliteChance = world.waveMutator === 'elite'
    ? Math.min(0.65, 0.12 * world.wave)
    : Math.min(0.28, 0.05 * world.wave);
  if (world.wave >= 3 && type !== 'mimic' && world.rng.chance(eliteChance)) {
    const elite = makeElite(world, e);
    emit(world, { t: 'float', x: e.x, y: e.y - e.h / 2 - 14, text: elite.name, color: elite.tint });
    emit(world, { t: 'particles', x: e.x, y: e.y, color: elite.tint, count: 12 });
  }
  world.enemies.push(e);
}

/** ORIG/entities.js:252-264. Exploder went off by itself: no loot, no xp — just the blast. */
export function selfDetonate(world: World, e: Enemy): void {
  e.dead = true;
  emit(world, { t: 'sfx', name: 'explosion' });
  emit(world, { t: 'shake', mag: 7, dur: 280 });
  emit(world, { t: 'particles', x: e.x, y: e.y, color: '#2ecc71', count: 20 });
  emit(world, { t: 'particles', x: e.x, y: e.y, color: '#ff8c00', count: 14 });
  const target = nearestPlayer(world, e.x, e.y);
  if (target && e.exploder) {
    const ex = target.x - e.x, ey = target.y - e.y;
    if (Math.sqrt(ex * ex + ey * ey) <= e.exploder.radius + 10) {
      damagePlayer(world, target, e.exploder.dmg);
    }
  }
}

/**
 * ORIG/ui.js:111 — kill-streak multiplier rewards aggressive play. Exported
 * so ui/hud.ts can render the same number it's scoring with (task-18 fix
 * round 1) instead of keeping its own duplicate copy of this formula.
 */
export function comboMult(combo: number): number {
  return Math.min(3, 1 + Math.floor(combo / 5) * 0.25);
}

/** ORIG/entities.js:467-470. */
function enemyColor(type: string): string {
  const c: Record<string, string> = { skeleton: '#e8dcc8', goblin: '#2ecc71', demon: '#9b59b6', brute: '#e74c3c' };
  return c[type] || '#fff';
}

/** ORIG/entities.js:310-426. */
export function updateEnemies(world: World): void {
  const dt = DT_MS;
  const factor = TICK_FACTOR;

  for (const e of world.enemies) {
    if (e.dead) continue;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    const startX = e.x, startY = e.y; // to tell idle from running this frame

    // bosses call reinforcements every 6s
    if (e.boss && e.summons) {
      e.summonTimer += dt;
      if (e.summonTimer >= 6000) {
        e.summonTimer = 0;
        for (let i = 0; i < 2; i++) {
          const type = world.rng.pick(e.summons);
          const minion = makeEnemy(world, type,
            e.x + (world.rng.next() - 0.5) * 80, e.y + (world.rng.next() - 0.5) * 80);
          world.enemies.push(minion);
          emit(world, { t: 'particles', x: minion.x, y: minion.y, color: '#9b59b6', count: 8 });
        }
      }
    }

    // poison ticks true damage; slow drags the chase
    if (e.poisonT > 0) {
      e.poisonT -= dt;
      e.hp -= (e.poisonDps * dt) / 1000;
      if (world.rng.chance(dt * 0.008)) emit(world, { t: 'particles', x: e.x, y: e.y, color: '#2ecc71', count: 2 });
      if (e.hp <= 0) { killEnemy(world, e); continue; }
    }
    // burn: fire damage-over-time (orange embers)
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.hp -= (e.burnDps * dt) / 1000;
      if (world.rng.chance(dt * 0.01)) emit(world, { t: 'particles', x: e.x, y: e.y, color: '#ff6600', count: 2 });
      if (e.hp <= 0) { killEnemy(world, e); continue; }
    }
    if (e.slowT > 0) e.slowT -= dt;
    const slowMult = e.slowT > 0 ? 0.6 : 1;

    // vampiric elites slowly knit themselves back together
    if (e.regen > 0 && e.hp > 0 && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + (e.regen * dt) / 1000);
      if (world.rng.chance(dt * 0.004)) emit(world, { t: 'particles', x: e.x, y: e.y, color: '#27ae60', count: 1 });
    }

    // AI targets the nearest living player; with none alive, nothing left
    // in this function needs a target — timers above already decayed and
    // the enemy simply doesn't move or attack.
    const target = nearestPlayer(world, e.x, e.y);
    let dx = 0, dy = 0, dist = 0;
    if (target) {
      dx = target.x - e.x;
      dy = target.y - e.y;
      dist = Math.sqrt(dx * dx + dy * dy);
    }

    // exploder: arm the fuse near the player, then detonate
    if (e.exploder) {
      if (!e.fusing && target && dist < e.exploder.triggerDist) {
        e.fusing = true;
        e.fuseT = e.exploder.fuse;
      }
      if (e.fusing) {
        e.fuseT -= dt;
        if (e.fuseT <= 0) { selfDetonate(world, e); continue; }
      }
    }

    if (target) {
      // shooter: hold mid range and cast; everyone else chases
      let move = 1; // toward player
      if (e.shooter) {
        if (dist < e.shooter.range * 0.6) move = -0.7; // back away
        else if (dist < e.shooter.range) move = 0;      // hold and cast
        e.shootT += dt;
        if (e.shootT >= e.shooter.interval && dist < e.shooter.range * 1.3) {
          e.shootT = 0;
          const a = atan2(dy, dx);
          world.enemyBullets.push({
            x: e.x, y: e.y,
            vx: cos(a) * e.shooter.bulletSpeed,
            vy: sin(a) * e.shooter.bulletSpeed,
            dmg: e.shooter.dmg,
            dist: 0,
            dead: false,
          });
          emit(world, { t: 'sfx', name: 'eshoot' });
          emit(world, { t: 'particles', x: e.x, y: e.y, color: '#9b59b6', count: 4 });
        }
      }

      const bossBusy = e.boss ? updateBossPattern(world, e, dx, dy, dist) : false;

      if (!bossBusy && dist > 1 && move !== 0) {
        e.x += (dx / dist) * e.speed * slowMult * move * factor;
        e.y += (dy / dist) * e.speed * slowMult * move * factor;
      }
    }

    if (!e.boss) resolveObstacles(e, Math.max(e.w, e.h) * 0.35, world);
    // did it actually move? drives the idle/run animation
    const mdx = e.x - startX, mdy = e.y - startY;
    e.moving = Math.sqrt(mdx * mdx + mdy * mdy) > 0.06;

    // spike traps hurt monsters too — lure them in
    if (e.trapT > 0) e.trapT -= dt;
    for (const tr of world.traps) {
      const tdx = e.x - tr.x, tdy = e.y - tr.y;
      if (e.trapT <= 0 && trapDangerous(world, tr) &&
          Math.sqrt(tdx * tdx + tdy * tdy) < 18 + Math.max(e.w, e.h) / 4) {
        e.trapT = 500;
        e.hp -= 15;
        e.hitFlash = 150;
        emit(world, { t: 'float', x: e.x, y: e.y - e.h / 2 - 8, text: '15', color: '#e8dcc8' });
        if (e.hp <= 0) { killEnemy(world, e); break; }
      }
    }
    if (e.dead) continue;

    // hit player (dodge avoids it entirely; armor reduces it)
    // exploders skip contact damage — their threat is the blast, and contact
    // i-frames would otherwise swallow the explosion
    if (target && !e.exploder && rectCircle(e.x, e.y, e.w, e.h, target.x, target.y, 10)) {
      damagePlayer(world, target, e.bossState === 'charging' ? Math.round(e.dmg * 1.5) : e.dmg);
      // `break`, not `return`: the sweep below still has to run. Returning here
      // leaves anything killed earlier this tick (DoT, traps) sitting in
      // `world.enemies` with `dead: true` for the whole gameover state, and
      // `saveWorld` serialises that array.
      if (world.phase !== 'playing') break;
    }
  }
  world.enemies = world.enemies.filter(e => !e.dead);
}

/** ORIG/entities.js:427-466 (+:467-470 enemyColor). */
export function killEnemy(world: World, e: Enemy, killer?: Player): void {
  if (e.dead) return;
  e.dead = true;
  // kill-streak multiplier rewards aggressive play (xp stays on the base value)
  world.combo++;
  world.comboTimer = COMBO_WINDOW;
  world.score += Math.round(e.score * comboMult(world.combo));
  world.runKills++;
  if (killer) gainXp(world, killer, e.score); // xp mirrors base score value (ORIG/entities.js:434)
  emit(world, { t: 'sfx', name: e.boss ? 'explosion' : 'death' });
  if (e.boss) {
    emit(world, { t: 'shake', mag: 14, dur: 500 });
    emit(world, { t: 'bossKill' }); // ORIG/entities.js:437-438 — app/ increments Save.data.progress.bossKills
    // last boss down? ease the music back to its normal theme
    if (!world.enemies.some(x => x.boss && !x.dead)) emit(world, { t: 'bossMusic', on: false });
    if (e.type === 'zombie_king') emit(world, { t: 'unlock', cls: 'priestess' });
  }
  emit(world, { t: 'particles', x: e.x, y: e.y, color: enemyColor(e.type), count: 12 });
  if (e.boss) {
    emit(world, { t: 'particles', x: e.x, y: e.y, color: '#ffd700', count: 40 });
    emit(world, { t: 'particles', x: e.x, y: e.y, color: '#ff8c00', count: 30 });
    emit(world, { t: 'float', x: e.x, y: e.y - 40, text: e.boss + ' SLAIN!', color: '#ffd700' });
  }
  for (let i = 0; i < e.goldDrop; i++) {
    const angle = world.rng.next() * Math.PI * 2;
    const r = world.rng.next() * 20;
    world.coins.push({
      x: e.x + cos(angle) * r,
      y: e.y + sin(angle) * r,
      vx: cos(angle) * 1.5,
      vy: sin(angle) * 1.5,
      dead: false,
      bob: world.rng.next() * Math.PI * 2,
    });
  }
  // No killer (environmental death): loot still falls, but there's no
  // player to apply a luck bonus to the potion roll.
  const luck = killer ? killer.stats.luck : 0;
  if (world.rng.chance(e.potionChance * (1 + luck / 100))) {
    world.potions.push({ x: e.x, y: e.y, bob: world.rng.next() * Math.PI * 2, dead: false });
  }
}

/** ORIG/combat.js:477-504 (enemy projectiles — necromancer bolts). */
export function updateEnemyBullets(world: World): void {
  const factor = TICK_FACTOR;
  for (const b of world.enemyBullets) {
    if (b.dead) continue;
    b.x += b.vx * factor;
    b.y += b.vy * factor;
    b.dist += Math.sqrt(b.vx * b.vx + b.vy * b.vy) * factor;

    if (b.dist > 600 ||
        b.x < world.play.left || b.x > world.play.right ||
        b.y < world.play.top || b.y > world.play.bottom) {
      b.dead = true;
      continue;
    }
    if (world.obstacles.some(o => {
      if (o.dead) return false;
      const dx = b.x - o.x, dy = b.y - o.y;
      return Math.sqrt(dx * dx + dy * dy) < o.r + 4;
    })) {
      b.dead = true;
      emit(world, { t: 'particles', x: b.x, y: b.y, color: '#9b59b6', count: 4 });
      continue;
    }
    const target = nearestPlayer(world, b.x, b.y);
    if (target) {
      const dx = b.x - target.x, dy = b.y - target.y;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        b.dead = true;
        emit(world, { t: 'particles', x: b.x, y: b.y, color: '#9b59b6', count: 6 });
        damagePlayer(world, target, b.dmg);
      }
    }
  }
  world.enemyBullets = world.enemyBullets.filter(b => !b.dead);
}
