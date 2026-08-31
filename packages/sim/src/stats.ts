// stats.ts — the permanent stat layer and its derivation into effective stats.
// Ported from ORIG/ui.js:14-66, ORIG/entities.js:112-122 and ORIG/items.js:46-58,
// replacing every reference to the global `player` with the `p` parameter.

import { computeEffectiveStats, effectiveMaxHp, archetypeOf } from './equipment';
import { CLASS_DEFS } from './defs/classes';
import { STAMINA_BASE } from './constants';
import type { Archetype, ClassKey, Mods, Player, Stats, Weapon } from './types';

/** All 17 stats at zero. A fresh object every call. */
export function baseStats(): Stats {
  return {
    hpRegen: 0, lifeSteal: 0, dmgPct: 0,
    meleeDmg: 0, rangedDmg: 0, elementalDmg: 0,
    atkSpeedPct: 0, crit: 0, armor: 0, dodge: 0,
    range: 0, speedPct: 0, luck: 0, stamina: 0,
    burn: 0, chill: 0, block: 0,
  };
}

/** Re-derives p.stats and p.maxHp from the permanent layer plus equipment. */
export function recalcStats(p: Player): void {
  p.stats = computeEffectiveStats(p.permStats, p.equipment);
  p.maxHp = effectiveMaxHp(p.permMaxHp, p.equipment);
  if (p.hp > p.maxHp) p.hp = p.maxHp;
}

export function startWeapon(cls: ClassKey): Weapon {
  return CLASS_DEFS[cls].tiers[0];
}

export function maxStamina(p: Player): number {
  return STAMINA_BASE + p.stats.stamina;
}

/** Damage-table bucket: melee | arrow | elemental (NOT the archetype vocabulary). */
export function playerDmgKind(p: Player): 'melee' | 'arrow' | 'elemental' {
  const atk = p.weapon.attack;
  if (atk === 'melee') return 'melee';
  if (atk === 'arrow' || atk === 'bullet') return 'arrow';
  return 'elemental';
}

/** Equipment eligibility bucket: melee | ranged | elemental. */
export function playerArchetype(p: Player): Archetype {
  return archetypeOf(p.weapon.attack);
}

/** Permanent gains from blessings and shop consumables. */
export function applyMods(p: Player, mods: Mods): void {
  let heal = 0;
  for (const [k, v] of Object.entries(mods)) {
    if (k === 'maxHp') {
      p.permMaxHp = Math.max(30, p.permMaxHp + (v as number));
      if ((v as number) > 0) heal += v as number; // permanent max HP also heals
    } else {
      const key = k as keyof Stats;
      p.permStats[key] = (p.permStats[key] || 0) + (v as number);
    }
  }
  recalcStats(p);
  if (heal) p.hp = Math.min(p.maxHp, p.hp + heal);
}

// The two HUD label tables that used to close this file now live in
// src/ui/labels.ts. They were pure presentation, so their bytes had no
// business inside the hash that decides which runs share a ranking season
// (D-06). Nothing in the simulation ever read them.
