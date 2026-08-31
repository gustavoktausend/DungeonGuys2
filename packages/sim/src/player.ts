// player.ts — creation, per-tick update and the incoming-damage pipeline.
// Ported from ORIG/engine.js:170-215 (creation), ORIG/combat.js:22-97 (update)
// and ORIG/entities.js:265-292 (damage). updatePlayer reads only `world`, `p`
// and `input` — no keyboard, mouse, touch or performance.now() (T-input).
import { emit, setPhase, slotForge } from './world';
import { DT_MS, TICK_FACTOR, WORLD, STAMINA_BASE, SPRINT_MULT, FATIGUE_MULT, STAMINA_DRAIN, STAMINA_REGEN } from './constants';
import { XP_BASE } from './defs/blessings';
import { CLASS_DEFS } from './defs/classes';
import { emptyEquipment } from './equipment';
import { baseStats, recalcStats, startWeapon, maxStamina } from './stats';
import { resolveObstacles, trapDangerous } from './arena';
import { attack } from './combat';
import { castSpecial } from './special';
import type { ClassKey, InputState, Player, World } from './types';

export function createPlayer(world: World, id: string, cls: ClassKey, name: string): Player {
  const def = CLASS_DEFS[cls];
  const weapon = startWeapon(cls);
  // This player's own forge, resolved by slot — not the run's, which no
  // longer exists: four people in one room bring four different ones.
  const forge = slotForge(world, id);

  const p: Player = {
    id, name, cls,
    x: WORLD.w / 2, y: WORLD.h / 2, w: 20, h: 20,
    hp: 0, maxHp: 0,
    speed: def.speed,
    stamina: STAMINA_BASE, sprinting: false,
    invincible: 0, specialTimer: 0, attackTimer: 0,
    regenAcc: 0, dustTimer: 0,
    facing: 0, moving: false, walkFrame: 0, walkTimer: 0,
    level: 1, xp: 0, xpNext: XP_BASE,
    gold: forge.startgold * 15,
    equipment: emptyEquipment(),
    weapon,
    permStats: baseStats(),
    permMaxHp: def.hp,
    stats: baseStats(),
    pendingLevelUps: 0,
    levelChoices: [],
  };

  p.equipment.weapon = weapon;

  // forge perks feed the permanent layer
  p.permMaxHp += forge.vigor * 10;
  p.permStats.dmgPct += forge.honed * 2;
  p.permStats.speedPct += forge.fleet * 2;

  recalcStats(p);
  p.hp = p.maxHp;

  world.players[id] = p;
  return p;
}

export function updatePlayer(world: World, p: Player, input: InputState): void {
  if (p.invincible > 0) p.invincible -= DT_MS;
  if (p.specialTimer > 0) p.specialTimer -= DT_MS;
  if (p.attackTimer > 0) p.attackTimer -= DT_MS;

  // passive HP regen: 0.2 HP/s per point, fractional carry
  if (p.stats.hpRegen > 0 && p.hp < p.maxHp) {
    p.regenAcc += (DT_MS / 1000) * 0.2 * p.stats.hpRegen;
    if (p.regenAcc >= 1) {
      const heal = Math.floor(p.regenAcc);
      p.regenAcc -= heal;
      p.hp = Math.min(p.maxHp, p.hp + heal);
    }
  }

  // The input arrives already normalized; app/input handles keyboard vs analog.
  const dx = input.move.x;
  const dy = input.move.y;

  p.moving = dx !== 0 || dy !== 0;
  if (p.moving) {
    p.walkTimer += DT_MS;
    if (p.walkTimer > 120) { p.walkFrame = (p.walkFrame + 1) % 4; p.walkTimer = 0; }
  }

  // stamina: sprint drains, recovery slows you to 70%
  const wantSprint = input.sprint && p.moving && p.stamina > 0;
  let staminaMult = 1;
  if (wantSprint) {
    p.sprinting = true;
    p.stamina = Math.max(0, p.stamina - (STAMINA_DRAIN * DT_MS) / 1000);
    staminaMult = SPRINT_MULT;
    p.dustTimer += DT_MS;
    if (p.dustTimer > 90) {
      p.dustTimer = 0;
      emit(world, { t: 'particles', x: p.x - dx * 12, y: p.y + 14, color: 'rgba(180,170,150,0.8)', count: 2 });
    }
  } else {
    p.sprinting = false;
    if (p.stamina < maxStamina(p)) {
      p.stamina = Math.min(maxStamina(p), p.stamina + (STAMINA_REGEN * DT_MS) / 1000);
      staminaMult = FATIGUE_MULT;
    }
  }

  const effSpeed = p.speed * (1 + p.stats.speedPct / 100) * staminaMult;
  const nx = p.x + dx * effSpeed * TICK_FACTOR;
  const ny = p.y + dy * effSpeed * TICK_FACTOR;
  const margin = 10;
  p.x = Math.max(world.play.left + margin, Math.min(world.play.right - margin, nx));
  p.y = Math.max(world.play.top + margin, Math.min(world.play.bottom - margin, ny));
  resolveObstacles(p, 10, world);

  for (const tr of world.traps) {
    const dx = p.x - tr.x, dy = p.y - tr.y;
    if (trapDangerous(world, tr) && Math.sqrt(dx * dx + dy * dy) < 18) damagePlayer(world, p, 10);
  }

  // aim is decided by app/input (mouse, or nearest enemy under auto-aim)
  p.facing = input.aim;

  if (input.attack) attack(world, p);
  if (input.special) castSpecial(world, p);
}

export function damagePlayer(world: World, p: Player, raw: number): void {
  if (p.invincible > 0) return;
  p.invincible = 600;
  const st = p.stats;

  if (world.rng.chance(Math.min(60, st.dodge) / 100)) {
    emit(world, { t: 'float', x: p.x, y: p.y - 26, text: 'DODGE', color: '#3498db' });
    emit(world, { t: 'sfx', name: 'dodge' });
    return;
  }

  // shield block: a flat chance (capped) to fully negate the hit
  if (st.block > 0 && world.rng.chance(Math.min(75, st.block) / 100)) {
    emit(world, { t: 'float', x: p.x, y: p.y - 26, text: 'BLOCK', color: '#aab7c4' });
    emit(world, { t: 'sfx', name: 'dodge' });
    return;
  }

  const dmg = Math.max(1, Math.round(raw * (1 - st.armor / (st.armor + 15))));
  p.hp -= dmg;
  emit(world, { t: 'particles', x: p.x, y: p.y, color: '#ff0000', count: 8 });
  emit(world, { t: 'float', x: p.x, y: p.y - 30, text: '-' + dmg, color: '#e74c3c' });
  emit(world, { t: 'shake', mag: 6, dur: 220 });
  emit(world, { t: 'hurtFlash' });
  emit(world, { t: 'sfx', name: 'hurt' });

  if (p.hp <= 0) {
    p.hp = 0;
    setPhase(world, 'gameover');
  }
}
