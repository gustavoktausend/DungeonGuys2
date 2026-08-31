// blessings.ts — LEVELUP_POOL, XP_BASE, XP_GROWTH, LEVEL_HP,
// ported verbatim from ORIG/entities.js:88-107, :64-66.

import type { Blessing } from '../types';

// ─── XP / leveling ────────────────────────────────────────────────────────────
export const XP_BASE   = 100;  // xp needed for level 2
export const XP_GROWTH = 1.4;  // each level needs 40% more
export const LEVEL_HP  = 10;   // max HP gained per level (also healed)

// ─── Level-up blessings (pick 1 of 3) ─────────────────────────────────────────
export const LEVELUP_POOL: Blessing[] = [
  { name: 'MIGHT',       icon: '💪', mods: { dmgPct: 4 } },
  { name: 'HASTE',       icon: '⚡', mods: { atkSpeedPct: 5 } },
  { name: 'PRECISION',   icon: '🎯', mods: { crit: 3 } },
  { name: 'IRON SKIN',   icon: '🛡', mods: { armor: 1 } },
  { name: 'EVASION',     icon: '💨', mods: { dodge: 3 } },
  { name: 'VITALITY',    icon: '❤', mods: { maxHp: 15 } },
  { name: 'REGROWTH',    icon: '🌿', mods: { hpRegen: 1 } },
  { name: 'BLOODTHIRST', icon: '🦇', mods: { lifeSteal: 2 } },
  { name: 'SWIFTNESS',   icon: '👢', mods: { speedPct: 4 } },
  { name: 'FORTUNE',     icon: '🍀', mods: { luck: 10 } },
  { name: 'REACH',       icon: '👁', mods: { range: 15 } },
  { name: 'ENDURANCE',   icon: '🥤', mods: { stamina: 15 } },
  { name: 'SHARPNESS',   icon: '🗡', dmgKind: 'melee',     mods: { meleeDmg: 2 } },
  { name: 'PIERCING',    icon: '🏹', dmgKind: 'arrow',     mods: { rangedDmg: 2 } },
  { name: 'SORCERY',     icon: '🔥', dmgKind: 'elemental', mods: { elementalDmg: 2 } },
  { name: 'IGNITE',      icon: '🔥', mods: { burn: 12 } },
  { name: 'FROST',       icon: '❄', mods: { chill: 15 } },
];
