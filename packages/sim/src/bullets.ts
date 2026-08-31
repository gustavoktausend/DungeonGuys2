// bullets.ts — player projectile movement, collision and explosions.
// Ported from ORIG/combat.js:284-297 (explode), :342-397 (updateBullets).
// fireProjectile lives in combat.ts alongside attack(), its only caller —
// see the header note there.
//
// Deliberate deviations from the original — see task-11-brief.md:
//  - hitIds is a plain number[] of enemy ids, not a Set<Enemy> — Bullet
//    must serialize. `.has(e)` becomes `.includes(e.id)`, `.add(e)` becomes
//    `.push(e.id)`.
//  - screen bounds (PLAY.left/right/top/bottom) become world.play (T6).
//  - a bullet whose owner (world.players[b.owner]) no longer exists dies
//    without dealing damage, instead of crashing on `undefined.stats`.
import { emit } from './world';
import { TICK_FACTOR } from './constants';
import { damageCrate, rectCircle } from './arena';
import { dealDamage, applyPoison } from './combat';
import type { Bullet, World } from './types';

export function explode(world: World, b: Bullet): void {
  emit(world, { t: 'sfx', name: 'explosion' });
  emit(world, { t: 'shake', mag: 7, dur: 280 });
  emit(world, { t: 'particles', x: b.x, y: b.y, color: '#ff8c00', count: 24 });
  emit(world, { t: 'particles', x: b.x, y: b.y, color: '#ffe066', count: 16 });

  const owner = world.players[b.owner];
  if (!owner) return; // owner gone — blast still looks right, deals no damage

  for (const e of world.enemies) {
    if (e.dead) continue;
    const dx = e.x - b.x, dy = e.y - b.y;
    if (Math.sqrt(dx * dx + dy * dy) <= b.aoe + Math.max(e.w, e.h) / 2) {
      // ORIG passed the literal 'elemental' here; explode() only ever runs
      // for fireball bullets, and 'fireball' routes to the same st.elementalDmg
      // bucket in dealDamage's kind ternary, so this is behavior-identical.
      dealDamage(world, owner, e, b.damage, b.type);
    }
  }
}

// Bullets
export function updateBullets(world: World): void {
  const factor = TICK_FACTOR;
  for (const b of world.bullets) {
    if (b.dead) continue;

    const owner = world.players[b.owner];
    if (!owner) { b.dead = true; continue; }

    b.x += b.vx * factor;
    b.y += b.vy * factor;
    b.dist += b.speed * factor;

    if (b.dist > b.range ||
        b.x < world.play.left || b.x > world.play.right ||
        b.y < world.play.top || b.y > world.play.bottom) {
      b.dead = true;
      if (b.type === 'fireball') explode(world, b);
      else emit(world, { t: 'particles', x: b.x, y: b.y, color: '#ff8c00', count: 3 });
      continue;
    }

    let blocked = false;
    for (const o of world.obstacles) {
      if (o.dead) continue;
      const dx = b.x - o.x, dy = b.y - o.y;
      if (Math.sqrt(dx * dx + dy * dy) < o.r + 4) {
        if (o.kind === 'crate') damageCrate(world, o, (b.damage[0] + b.damage[1]) / 2);
        b.dead = true;
        if (b.type === 'fireball') explode(world, b);
        else emit(world, { t: 'particles', x: b.x, y: b.y, color: '#aab7c4', count: 4 });
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    for (const e of world.enemies) {
      if (e.dead || b.hitIds.includes(e.id)) continue;
      if (rectCircle(e.x, e.y, e.w, e.h, b.x, b.y, b.type === 'fireball' ? 9 : 5)) {
        if (b.type === 'fireball') {
          b.dead = true;
          explode(world, b);
          break;
        }
        b.hitIds.push(e.id);
        dealDamage(world, owner, e, b.damage, b.type, b.x, b.y);
        if (b.poison && !e.dead) applyPoison(e, b.poison.dps, b.poison.dur);
        if (b.pierce > 0) {
          b.pierce--;
        } else {
          b.dead = true;
          break;
        }
      }
    }
  }
  world.bullets = world.bullets.filter(b => !b.dead);
}
