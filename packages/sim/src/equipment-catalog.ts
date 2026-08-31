// equipment-catalog.ts — fixed, curated equipment for the per-run shop (seed set).
// Weapon entries carry their own combat params (same shape as CLASS_DEFS tiers) and
// the player's attack type comes from the equipped weapon, within the class archetype.
// Non-weapon items only carry stat `mods`. Phase 3 expands/balances this list.
// Ported from ORIG/equipment-catalog.js:6-66.

import type { EquipItem } from './types';

export const EQUIPMENT: EquipItem[] = [
  // ── weapons: elemental (mage / witch) ──
  { id: 'w_runed',  name: 'RUNED STAFF',    icon: '🪄', slot: 'weapon', archetype: 'elemental', classReq: null, twoHanded: false, mods: {},                  price: 42,
    weapon: { attack: 'bolt', sprite: 'staff_green', fireRate: 185, bulletSpeed: 8, range: 430, damage: [36, 48], pierce: 1, count: 1 } },
  { id: 'w_scepter', name: 'ARCANE SCEPTER', icon: '🔮', slot: 'weapon', archetype: 'elemental', classReq: null, twoHanded: true,  mods: { elementalDmg: 2 }, price: 78,
    weapon: { attack: 'bolt', sprite: 'staff_green', fireRate: 150, bulletSpeed: 9, range: 480, damage: [48, 64], pierce: 2, count: 1 } },
  { id: 'w_plaguewand', name: 'PLAGUE WAND', icon: '🐍', slot: 'weapon', archetype: 'elemental', classReq: null, twoHanded: false, mods: {},                  price: 60,
    weapon: { attack: 'bolt', sprite: 'staff_green', fireRate: 210, bulletSpeed: 8, range: 420, damage: [24, 34], pierce: 1, count: 1, poison: { dps: 12, dur: 3000 } } },
  { id: 'w_stormrod', name: 'STORM ROD',     icon: '⚡', slot: 'weapon', archetype: 'elemental', classReq: null, twoHanded: false, mods: { atkSpeedPct: 5 },  price: 66,
    weapon: { attack: 'bolt', sprite: 'staff_green', fireRate: 130, bulletSpeed: 9, range: 440, damage: [30, 40], pierce: 1, count: 1 } },

  // ── weapons: melee (warrior / ninja / priestess) ──
  { id: 'w_sabre',  name: 'STEEL SABRE',  icon: '🗡', slot: 'weapon', archetype: 'melee', classReq: null, twoHanded: false, mods: {},                price: 44,
    weapon: { attack: 'melee', sprite: 'sword_knight', fireRate: 360, range: 70, damage: [58, 78], arc: Math.PI * 0.75, knockback: 16 } },
  { id: 'w_greatsword', name: 'GREATSWORD', icon: '⚔', slot: 'weapon', archetype: 'melee', classReq: null, twoHanded: true, mods: { meleeDmg: 3 }, price: 82,
    weapon: { attack: 'melee', sprite: 'sword_anime', fireRate: 340, range: 86, damage: [82, 108], arc: Math.PI * 0.9, knockback: 24 } },
  { id: 'w_shadowdagger', name: 'SHADOW DAGGER', icon: '🥷', slot: 'weapon', archetype: 'melee', classReq: null, twoHanded: false, mods: { atkSpeedPct: 6 }, price: 56,
    weapon: { attack: 'melee', sprite: 'katana', fireRate: 200, range: 64, damage: [40, 56], arc: Math.PI * 0.55, knockback: 10 } },
  { id: 'w_glaive', name: 'WAR GLAIVE',   icon: '🔱', slot: 'weapon', archetype: 'melee', classReq: null, twoHanded: true,  mods: { range: 10 },     price: 70,
    weapon: { attack: 'melee', sprite: 'sword_knight', fireRate: 400, range: 92, damage: [66, 88], arc: Math.PI * 0.7, knockback: 20 } },

  // ── weapons: ranged (archer / coprobo) ──
  { id: 'w_hunterbow', name: 'HUNTER BOW', icon: '🏹', slot: 'weapon', archetype: 'ranged', classReq: ['archer'], twoHanded: true, mods: {}, price: 46,
    weapon: { attack: 'arrow', sprite: 'bow_2', fireRate: 350, bulletSpeed: 12, range: 600, damage: [34, 46], pierce: 2, count: 2 } },
  { id: 'w_stormbow', name: 'STORM BOW',  icon: '🎯', slot: 'weapon', archetype: 'ranged', classReq: ['archer'], twoHanded: true, mods: {}, price: 84,
    weapon: { attack: 'arrow', sprite: 'bow_2', fireRate: 320, bulletSpeed: 13, range: 640, damage: [38, 52], pierce: 3, count: 3 } },
  { id: 'w_ion',    name: 'ION BLASTER', icon: '🔫', slot: 'weapon', archetype: 'ranged', classReq: ['coprobo'], twoHanded: true, mods: {}, price: 80,
    weapon: { attack: 'bullet', sprite: null, fireRate: 150, bulletSpeed: 13, range: 520, damage: [26, 36], pierce: 2, count: 1 } },
  { id: 'w_gatling', name: 'GATLING',    icon: '💢', slot: 'weapon', archetype: 'ranged', classReq: ['coprobo'], twoHanded: false, mods: { atkSpeedPct: 8 }, price: 58,
    weapon: { attack: 'bullet', sprite: null, fireRate: 95, bulletSpeed: 11, range: 440, damage: [13, 19], pierce: 0, count: 1 } },

  // ── offhand: shields (give block) ──
  { id: 'o_buckler', name: 'BUCKLER',     icon: '🛡', slot: 'offhand', archetype: null, classReq: null, mods: { armor: 2, block: 6 },  price: 26 },
  { id: 'o_kite',    name: 'KITE SHIELD', icon: '🔰', slot: 'offhand', archetype: null, classReq: null, mods: { armor: 4, block: 12 }, price: 44 },
  { id: 'o_bulwark', name: 'BULWARK',     icon: '🏰', slot: 'offhand', archetype: null, classReq: null, mods: { armor: 7, block: 18, atkSpeedPct: -8 }, price: 62 },

  // ── helm ──
  { id: 'h_iron',   name: 'IRON HELM',   icon: '⛑', slot: 'helm', archetype: null, classReq: null, mods: { armor: 3 },              price: 30 },
  { id: 'h_hood',   name: 'MYSTIC HOOD', icon: '🎓', slot: 'helm', archetype: null, classReq: null, mods: { dmgPct: 5, maxHp: -5 },  price: 34 },
  { id: 'h_horned', name: 'HORNED HELM', icon: '🐲', slot: 'helm', archetype: null, classReq: null, mods: { maxHp: 20, armor: 2 },   price: 36 },

  // ── armor ──
  { id: 'a_plate',   name: 'PLATE ARMOR',  icon: '🦺', slot: 'armor', archetype: null, classReq: null, mods: { armor: 5, speedPct: -3 }, price: 40 },
  { id: 'a_leather', name: 'LEATHER VEST', icon: '🧥', slot: 'armor', archetype: null, classReq: null, mods: { dodge: 6 },              price: 38 },
  { id: 'a_robe',    name: 'BATTLE ROBE',  icon: '👘', slot: 'armor', archetype: null, classReq: null, mods: { dmgPct: 8, armor: -2 },  price: 42 },

  // ── boots ──
  { id: 'b_swift',  name: 'SWIFT BOOTS',   icon: '👢', slot: 'boots', archetype: null, classReq: null, mods: { speedPct: 8 },            price: 30 },
  { id: 'b_plated', name: 'PLATED BOOTS',  icon: '🥾', slot: 'boots', archetype: null, classReq: null, mods: { armor: 2, stamina: 15 },  price: 32 },
  { id: 'b_trail',  name: 'TRAIL RUNNERS', icon: '🩴', slot: 'boots', archetype: null, classReq: null, mods: { speedPct: 5, dodge: 3 },  price: 34 },

  // ── rings ──
  { id: 'r_might',   name: 'RING OF MIGHT',   icon: '💍', slot: 'ring', archetype: null, classReq: null, mods: { dmgPct: 6 },                price: 36 },
  { id: 'r_fortune', name: 'RING OF FORTUNE', icon: '🔆', slot: 'ring', archetype: null, classReq: null, mods: { luck: 12 },                 price: 26 },
  { id: 'r_vampire', name: 'VAMPIRE RING',    icon: '🩸', slot: 'ring', archetype: null, classReq: null, mods: { lifeSteal: 4 },             price: 40 },
  { id: 'r_berserk', name: 'BERSERKER RING',  icon: '😤', slot: 'ring', archetype: null, classReq: null, mods: { atkSpeedPct: 10, armor: -2 }, price: 38 },

  // ── amulet ──
  { id: 'm_vitality', name: 'VITALITY AMULET', icon: '📿', slot: 'amulet', archetype: null, classReq: null, mods: { maxHp: 30 }, price: 38 },
  { id: 'm_crit',     name: 'CRIT PENDANT',    icon: '🎴', slot: 'amulet', archetype: null, classReq: null, mods: { crit: 8 },   price: 36 },
  { id: 'm_ember',    name: 'EMBER PENDANT',   icon: '🔥', slot: 'amulet', archetype: null, classReq: null, mods: { burn: 14 },  price: 36 },
  { id: 'm_frost',    name: 'FROST PENDANT',   icon: '❄', slot: 'amulet', archetype: null, classReq: null, mods: { chill: 16 }, price: 36 },
];
