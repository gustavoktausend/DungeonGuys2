// special.ts — the seven class special abilities (E / right-click).
// Ported from ORIG/combat.js:186-283 (castSpecial and its switch, one case
// per class).
//
// Deliberate deviations from the original — per task-13-brief.md:
//  - The `gameState !== 'playing'` half of the original guard is dropped:
//    step() only runs the player loop while world.phase === 'playing', so
//    checking it again here would be redundant (T-phase-guard).
//  - The angle comes from p.facing, which updatePlayer already derived from
//    input.aim — there is no separate aimAngle() helper in the sim layer.
//  - dash explicitly clamps the destination into world.play and calls
//    resolveObstacles there. The original got both "for free" on the next
//    frame's regular player update (the same clamp/push-out updatePlayer
//    does every tick); a one-shot cast here has no next frame before the
//    caller can observe the result, so it must happen inline or the ninja
//    would end up outside the arena, or stuck inside a wall until the
//    following tick's movement pass fixes it up.
//  - meleeAttack (Task 11) takes a full Weapon object. whirlwind reuses the
//    player's real weapon shape via spread, overriding only the fields the
//    original computed from it (range/damage/knockback) — same as the
//    original's `w.range`, `w.damage`, `w.knockback` reads. nova and
//    fireball build custom stat blocks the original never derived from any
//    real weapon, so they fill the otherwise-unused name/sprite/attack/
//    fireRate fields with inert placeholders; meleeAttack/fireProjectile
//    never read them.
import { emit } from './world';
import { fireProjectile, meleeAttack, dealDamage, applyPoison } from './combat';
import { resolveObstacles } from './arena';
import { CLASS_DEFS } from './defs/classes';
import { cos, sin } from './math';
import type { Enemy, Player, World } from './types';

export function castSpecial(world: World, p: Player): void {
  if (p.specialTimer > 0) return;
  const def = CLASS_DEFS[p.cls];
  p.specialTimer = def.specialCd;
  emit(world, { t: 'sfx', name: 'special' });

  const angle = p.facing;
  const w = p.weapon;

  switch (def.special) {
    case 'fireball':
      fireProjectile(world, p, angle, 'fireball', {
        name: 'fireball', sprite: null, attack: 'fireball', fireRate: 0,
        bulletSpeed: 5.5, range: 520,
        damage: [80, 120], pierce: 0, aoe: 95,
      });
      break;

    case 'volley': {
      // ring of arrows in all directions
      const n = 12;
      for (let i = 0; i < n; i++) {
        fireProjectile(world, p, angle + (i / n) * Math.PI * 2, 'arrow', w);
      }
      break;
    }

    case 'whirlwind':
      meleeAttack(world, p, angle, {
        ...w,
        range: w.range + 14,
        arc: Math.PI * 2,
        damage: [Math.trunc(w.damage[0] * 1.5), Math.trunc(w.damage[1] * 1.5)],
        knockback: (w.knockback ?? 0) * 2,
      });
      break;

    case 'dash': {
      // shadow dash: teleport toward the aim, slicing everything on the path
      const d = 170;
      const sx = p.x, sy = p.y;
      const tx = Math.max(world.play.left + 12, Math.min(world.play.right - 12, sx + cos(angle) * d));
      const ty = Math.max(world.play.top + 12, Math.min(world.play.bottom - 12, sy + sin(angle) * d));
      const hit = new Set<Enemy>();
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const px2 = sx + (tx - sx) * i / steps;
        const py2 = sy + (ty - sy) * i / steps;
        emit(world, { t: 'particles', x: px2, y: py2, color: '#aab7c4', count: 3 });
        for (const e of world.enemies) {
          if (e.dead || hit.has(e)) continue;
          const ex = e.x - px2, ey = e.y - py2;
          if (Math.sqrt(ex * ex + ey * ey) < 30 + Math.max(e.w, e.h) / 2) {
            hit.add(e);
            dealDamage(world, p, e, [50, 70], 'melee');
          }
        }
      }
      p.x = tx;
      p.y = ty;
      // The original clamped bounds here but relied on next frame's regular
      // resolveObstacles call to push out of columns/crates; do it inline
      // (see file header).
      resolveObstacles(p, 10, world);
      p.invincible = 600;
      break;
    }

    case 'nova':
      // holy nova: full-circle smite around the priestess + self heal
      meleeAttack(world, p, angle, {
        name: 'nova', sprite: null, attack: 'melee', fireRate: 0,
        range: 130, arc: Math.PI * 2, damage: [60, 90], knockback: 20,
      });
      p.hp = Math.min(p.maxHp, p.hp + 30);
      emit(world, { t: 'float', x: p.x, y: p.y - 34, text: '+30 HP', color: '#ffd700' });
      emit(world, { t: 'particles', x: p.x, y: p.y, color: '#ffd700', count: 24 });
      break;

    case 'emp': {
      // EMP blast: shockwave damages and slows everything nearby
      emit(world, { t: 'shake', mag: 8, dur: 300 });
      emit(world, { t: 'particles', x: p.x, y: p.y, color: '#66ccff', count: 28 });
      emit(world, { t: 'swing', x: p.x, y: p.y, angle: 0, range: 150, arc: Math.PI * 2 }); // ring visual
      for (const e of world.enemies) {
        if (e.dead) continue;
        const dx2 = e.x - p.x, dy2 = e.y - p.y;
        if (Math.sqrt(dx2 * dx2 + dy2 * dy2) <= 150 + Math.max(e.w, e.h) / 2) {
          dealDamage(world, p, e, [40, 60], 'bullet');
          if (!e.dead) e.slowT = Math.max(e.slowT, 3000);
        }
      }
      break;
    }

    case 'hex':
      // hex: every living enemy is poisoned and slowed
      for (const e of world.enemies) {
        if (e.dead) continue;
        applyPoison(e, 15, 4000);
        e.slowT = Math.max(e.slowT, 4000);
        emit(world, { t: 'particles', x: e.x, y: e.y, color: '#9b59b6', count: 5 });
      }
      emit(world, { t: 'float', x: p.x, y: p.y - 34, text: 'HEX!', color: '#9b59b6' });
      break;
  }
}
