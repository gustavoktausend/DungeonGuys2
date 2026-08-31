// classes.ts — CLASS_DEFS, ported verbatim from ORIG/config.js:249-315.
// Each class has 3 weapon tiers; tier 0 is the starting weapon.

import type { ClassKey, ClassDef } from '../types';

export const CLASS_KEYS: ClassKey[] = ['mage', 'archer', 'warrior', 'ninja', 'priestess', 'witch', 'coprobo'];

export const CLASS_DEFS: Record<ClassKey, ClassDef> = {
  mage: {
    hp: 100, speed: 2.6, anim: 'wizzard',
    special: 'fireball', specialCd: 8000,
    tiers: [
      { name: 'APPRENTICE STAFF', sprite: 'staff',       attack: 'bolt', fireRate: 220, bulletSpeed: 7, range: 380, damage: [25, 35], pierce: 0, count: 1 },
      { name: 'EMERALD STAFF',    sprite: 'staff_green', attack: 'bolt', fireRate: 185, bulletSpeed: 8, range: 430, damage: [36, 48], pierce: 1, count: 1 },
      { name: 'ARCANE STAFF',     sprite: 'staff_green', attack: 'bolt', fireRate: 150, bulletSpeed: 9, range: 480, damage: [48, 64], pierce: 2, count: 1 },
    ],
  },
  archer: {
    hp: 80, speed: 3.0, anim: 'elf',
    special: 'volley', specialCd: 7000,
    tiers: [
      { name: 'SHORT BOW', sprite: 'bow',   attack: 'arrow', fireRate: 380, bulletSpeed: 11, range: 560, damage: [30, 42], pierce: 2, count: 1 },
      { name: 'ELVEN BOW', sprite: 'bow_2', attack: 'arrow', fireRate: 350, bulletSpeed: 12, range: 600, damage: [34, 46], pierce: 2, count: 2 },
      { name: 'TWIN BOW',  sprite: 'bow_2', attack: 'arrow', fireRate: 320, bulletSpeed: 13, range: 640, damage: [38, 52], pierce: 3, count: 3 },
    ],
  },
  warrior: {
    hp: 150, speed: 2.8, anim: 'knight',
    special: 'whirlwind', specialCd: 6000,
    tiers: [
      { name: 'RUSTY SWORD',  sprite: 'sword_rusty',  attack: 'melee', fireRate: 420, range: 58, damage: [45, 62],  arc: Math.PI * 0.65, knockback: 14 },
      { name: 'KNIGHT SWORD', sprite: 'sword_knight', attack: 'melee', fireRate: 380, range: 70, damage: [60, 80],  arc: Math.PI * 0.75, knockback: 17 },
      { name: 'ANIME BLADE',  sprite: 'sword_anime',  attack: 'melee', fireRate: 330, range: 84, damage: [80, 105], arc: Math.PI * 0.88, knockback: 22 },
    ],
  },
  ninja: {
    hp: 85, speed: 3.2, anim: 'masked_orc',
    special: 'dash', specialCd: 5000,
    tiers: [
      { name: 'KNIFE',   sprite: 'knife',   attack: 'melee', fireRate: 260, range: 46, damage: [22, 32], arc: Math.PI * 0.5,  knockback: 8  },
      { name: 'MACHETE', sprite: 'machete', attack: 'melee', fireRate: 235, range: 56, damage: [32, 44], arc: Math.PI * 0.55, knockback: 10 },
      { name: 'KATANA',  sprite: 'katana',  attack: 'melee', fireRate: 205, range: 68, damage: [44, 60], arc: Math.PI * 0.6,  knockback: 12 },
    ],
  },
  priestess: {
    hp: 120, speed: 2.7, anim: 'angel',
    special: 'nova', specialCd: 9000,
    tiers: [
      { name: 'MACE',         sprite: 'mace',         attack: 'melee', fireRate: 400, range: 56, damage: [38, 52], arc: Math.PI * 0.6,  knockback: 14 },
      { name: 'WAR HAMMER',   sprite: 'hammer',       attack: 'melee', fireRate: 430, range: 62, damage: [55, 75], arc: Math.PI * 0.65, knockback: 18 },
      { name: 'GOLDEN BLADE', sprite: 'golden_sword', attack: 'melee', fireRate: 360, range: 68, damage: [70, 92], arc: Math.PI * 0.7,  knockback: 18 },
    ],
  },
  witch: {
    hp: 90, speed: 2.6, anim: 'wizzard_f',
    special: 'hex', specialCd: 9000,
    tiers: [
      { name: 'CURSED STAFF', sprite: 'staff',       attack: 'bolt', fireRate: 240, bulletSpeed: 7, range: 380, damage: [18, 26], pierce: 0, count: 1, poison: { dps: 8,  dur: 3000 } },
      { name: 'VENOM STAFF',  sprite: 'staff_green', attack: 'bolt', fireRate: 210, bulletSpeed: 8, range: 420, damage: [24, 34], pierce: 1, count: 1, poison: { dps: 12, dur: 3000 } },
      { name: 'PLAGUE STAFF', sprite: 'staff_green', attack: 'bolt', fireRate: 180, bulletSpeed: 9, range: 460, damage: [32, 44], pierce: 2, count: 1, poison: { dps: 18, dur: 4000 } },
    ],
  },
  coprobo: {
    hp: 95, speed: 2.8, anim: 'coprobo',
    special: 'emp', specialCd: 8000,
    // guns are part of the robot sprite itself — no held weapon overlay
    tiers: [
      { name: 'PISTOL',       sprite: null, attack: 'bullet', fireRate: 190, bulletSpeed: 10, range: 420, damage: [16, 24], pierce: 0, count: 1 },
      { name: 'SMG',          sprite: null, attack: 'bullet', fireRate: 110, bulletSpeed: 11, range: 440, damage: [14, 20], pierce: 0, count: 1 },
      { name: 'PLASMA RIFLE', sprite: null, attack: 'bullet', fireRate: 150, bulletSpeed: 13, range: 520, damage: [26, 36], pierce: 2, count: 1 },
    ],
  },
};
