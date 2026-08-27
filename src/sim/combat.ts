// combat.ts — the player's attack, melee arc and damage pipeline.
// Ported from ORIG/combat.js:99-121 (attack), :122-143 (fireProjectile),
// :144-184 (meleeAttack), :305-341 (dealDamage), ORIG/entities.js:293-302
// (applyPoison, applyBurn).
//
// fireProjectile lives here (not in bullets.ts) alongside attack(), its only
// caller — see tests/combat.test.ts, which imports it from this module.
// bullets.ts (updateBullets, explode) imports dealDamage/applyPoison back
// from here; neither direction calls fireProjectile, so there's no cycle
// between the two files.
//
// Deliberate deviations from the original — see task-11-brief.md:
//  - attack() has no wall-clock: the original compared performance.now() -
//    lastShot against the effective fire rate; here p.attackTimer (already
//    decremented every tick by updatePlayer, Task 9) gates the cooldown,
//    and firing resets it to w.fireRate / (1 + atkSpeedPct / 100).
//  - attack() does not check gameState: step() only runs the pipeline while
//    world.phase === 'playing' (T-phase-guard), so duplicating the check
//    here would be redundant.
//  - dealDamage(world, p, e, damage, kind, fx?, fy?) takes the attacking
//    player instead of reading a global `player` — every player.stats/hp/
//    weapon becomes p.stats/hp/weapon. This lets a later milestone credit
//    kills, gold and lifesteal to whoever actually landed the hit.
//  - fireProjectile's spread draws from world.rng, not Math.random() — it
//    changes where the bullet actually goes, so it must affect the world
//    (T3), not stay in render.
//  - meleeAttack keeps no state: the original pushed to a global
//    `meleeSwings` array that the renderer animated over several frames;
//    here it emits a single { t: 'swing', ... } event instead (T5).
import { emit } from './world';
import { damageCrate } from './arena';
import { killEnemy } from './enemies';
import type { AttackKind, DamageKind, Enemy, Player, Weapon, World } from './types';

export function attack(world: World, p: Player): void {
  if (p.attackTimer > 0) return;
  const w = p.weapon;
  p.attackTimer = w.fireRate / (1 + p.stats.atkSpeedPct / 100);

  emit(world, { t: 'sfx', name: w.attack === 'melee' ? 'swing' : w.attack === 'arrow' ? 'arrow' : 'shoot' });

  const angle = p.facing;
  if (w.attack === 'melee') {
    meleeAttack(world, p, angle, w);
  } else {
    // multi-shot weapons fan out around the aim
    const count = w.count || 1;
    for (let i = 0; i < count; i++) {
      const fan = count > 1 ? (i - (count - 1) / 2) * 0.14 : 0;
      fireProjectile(world, p, angle + fan, w.attack, w);
    }
  }
}

export function fireProjectile(world: World, p: Player, angle: number, type: AttackKind, w: Weapon): void {
  const spread = (world.rng.next() - 0.5) * 0.04;
  const speed = w.bulletSpeed ?? 0;
  world.bullets.push({
    owner: p.id,
    x: p.x,
    y: p.y,
    vx: Math.cos(angle + spread) * speed,
    vy: Math.sin(angle + spread) * speed,
    angle: angle + spread,
    speed,
    range: w.range + p.stats.range,
    damage: w.damage,
    pierce: w.pierce || 0,
    aoe: w.aoe || 0,
    poison: w.poison || null,
    type, // 'bolt' | 'arrow' | 'fireball' | 'bullet'
    hitIds: [],
    dist: 0,
    dead: false,
  });
}

// ─── Melee ────────────────────────────────────────────────────────────────────
export function meleeAttack(world: World, p: Player, angle: number, w: Weapon): void {
  const range = w.range + p.stats.range / 2; // melee gets half the range stat
  const arc = w.arc ?? Math.PI * 2;
  emit(world, { t: 'swing', x: p.x, y: p.y, angle, range, arc });
  emit(world, {
    t: 'particles',
    x: p.x + Math.cos(angle) * range * 0.6,
    y: p.y + Math.sin(angle) * range * 0.6,
    color: '#ffe066',
    count: 4,
  });

  for (const o of world.obstacles) {
    if (o.dead || o.kind !== 'crate') continue;
    const od = Math.hypot(o.x - p.x, o.y - p.y);
    if (od <= range + o.r) {
      let diff = Math.atan2(o.y - p.y, o.x - p.x) - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= arc / 2) damageCrate(world, o, w.damage[1]);
    }
  }

  for (const e of world.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > range + Math.max(e.w, e.h) / 2) continue;

    let diff = Math.atan2(dy, dx) - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > arc / 2) continue;

    dealDamage(world, p, e, w.damage, 'melee');
    // knockback away from player
    if (dist > 1) {
      const knockback = w.knockback ?? 0;
      e.x += (dx / dist) * knockback;
      e.y += (dy / dist) * knockback;
    }
  }
}

// ─── Damage pipeline ──────────────────────────────────────────────────────────
// flat bonus by weapon kind, then % damage, then crit (x2); lifesteal on hit
export function dealDamage(
  world: World,
  p: Player,
  e: Enemy,
  damage: [number, number],
  kind: DamageKind,
  fx?: number,
  fy?: number,
): void {
  const st = p.stats;
  const [min, max] = damage;
  let dmg = min + Math.floor(world.rng.next() * (max - min + 1));
  dmg += kind === 'melee' ? st.meleeDmg
       : (kind === 'arrow' || kind === 'bullet') ? st.rangedDmg
       : st.elementalDmg; // bolt / fireball
  dmg = Math.max(1, Math.round(dmg * (1 + st.dmgPct / 100)));

  // crit roll is unconditional in the original (Math.random() always runs,
  // regardless of st.crit) — preserved here so the rng draw sequence never
  // depends on stat values.
  if (world.rng.next() < st.crit / 100) {
    dmg *= 2;
    emit(world, { t: 'float', x: e.x, y: e.y - e.h / 2 - 12, text: `${dmg}!`, color: '#f1c40f' });
  } else {
    // every hit shows its number, slightly scattered so stacks stay readable
    emit(world, {
      t: 'float',
      x: e.x + (world.rng.next() - 0.5) * 14,
      y: e.y - e.h / 2 - 8,
      text: `${dmg}`,
      color: '#e8dcc8',
    });
  }

  e.hp -= dmg;
  e.hitFlash = 150;
  emit(world, { t: 'sfx', name: 'hit' });
  emit(world, { t: 'particles', x: fx ?? e.x, y: fy ?? e.y, color: '#ff4444', count: 6 });

  // lifesteal roll is also unconditional (the hp check is the second half of
  // a JS `&&`, not a guard on the rng draw itself).
  if (world.rng.next() < st.lifeSteal / 100 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + 1);
  }

  // elemental procs: burn scales with the weapon's hit, chill briefly slows.
  // These rolls ARE guarded — Math.random() only runs when the stat is > 0.
  if (st.burn > 0 && world.rng.next() < st.burn / 100) {
    applyBurn(e, Math.max(6, Math.round(p.weapon.damage[0] * 0.15)), 3000);
  }
  if (st.chill > 0 && world.rng.next() < st.chill / 100) {
    e.slowT = Math.max(e.slowT, 1500);
  }

  if (e.hp <= 0) killEnemy(world, e, p);
}

export function applyPoison(e: Enemy, dps: number, dur: number): void {
  e.poisonDps = Math.max(e.poisonDps, dps);
  e.poisonT = Math.max(e.poisonT, dur);
}

export function applyBurn(e: Enemy, dps: number, dur: number): void {
  e.burnDps = Math.max(e.burnDps, dps);
  e.burnT = Math.max(e.burnT, dur);
}
