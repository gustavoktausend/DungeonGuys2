// enemies.ts — ENEMY_DEFS, ELITE_TYPES, MINIBOSS_WAVES, WAVE_DURATION,
// ported verbatim from ORIG/entities.js:3-30, :33-38, :60, :61.

import type { EnemyDef, EliteType } from '../types';

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  skeleton: { hp: 50,  speed: 1.1, w: 26, h: 26, score: 10, gold: 1, anim: 'skelet',    potion: 0.03, dmg: 8  },
  goblin:   { hp: 35,  speed: 1.7, w: 24, h: 24, score: 15, gold: 2, anim: 'goblin',    potion: 0.03, dmg: 6  },
  demon:    { hp: 90,  speed: 0.9, w: 26, h: 40, score: 25, gold: 3, anim: 'chort',     potion: 0.08, dmg: 10 },
  brute:    { hp: 200, speed: 0.6, w: 52, h: 62, score: 50, gold: 6, anim: 'big_demon', potion: 0.25, dmg: 14 },
  mimic:    { hp: 130, speed: 1.5, w: 26, h: 24, score: 40, gold: 8, anim: 'mimic',     potion: 0.5,  dmg: 10 },
  // shooter: keeps its distance and lobs dark bolts at the player
  necromancer: { hp: 70, speed: 0.85, w: 26, h: 38, score: 30, gold: 4, anim: 'necromancer', potion: 0.1, dmg: 8,
                 shooter: { range: 260, interval: 2200, bulletSpeed: 4.5, dmg: 10 } },
  // exploder: sprints at the player, flashes, and detonates
  swampy:      { hp: 45, speed: 2.0,  w: 24, h: 24, score: 20, gold: 2, anim: 'swampy', potion: 0.05, dmg: 4,
                 exploder: { fuse: 700, radius: 90, dmg: 18, triggerDist: 55 } },
  // bosses (wave 8 and 16) — bigger sprite scale, summon minions, big loot
  zombie_king:  { hp: 1500, speed: 0.8,  w: 76, h: 92, score: 500,  gold: 25, anim: 'big_zombie', potion: 1, dmg: 16,
                  boss: 'ZOMBIE KING',  scale: 3, summons: ['skeleton', 'goblin'],
                  abilities: { charge: 6500 } },
  ogre_warlord: { hp: 3200, speed: 0.9,  w: 76, h: 92, score: 1500, gold: 50, anim: 'ogre',       potion: 1, dmg: 22,
                  boss: 'OGRE WARLORD', scale: 3, summons: ['demon', 'brute'],
                  abilities: { charge: 8000, ring: 7000 } },
  // mini-bosses (waves 4 and 12) — smaller than the act bosses, still must die
  goblin_chief: { hp: 600,  speed: 1.5,  w: 40, h: 40, score: 250, gold: 15, anim: 'goblin',      potion: 1, dmg: 12,
                  boss: 'GOBLIN CHIEFTAIN', scale: 2.4, summons: ['goblin'],
                  abilities: { charge: 6000 } },
  necro_lord:   { hp: 1300, speed: 0.85, w: 38, h: 56, score: 600, gold: 20, anim: 'necromancer', potion: 1, dmg: 12,
                  boss: 'NECRO LORD', scale: 2.3, summons: ['skeleton'],
                  shooter: { range: 320, interval: 1500, bulletSpeed: 5, dmg: 12 } },
};

// ─── Elite / champion modifiers ───────────────────────────────────────────────
// rolled onto normal mobs from wave 3+; glow aura + buffed stats + extra loot
export const ELITE_TYPES: Record<string, EliteType> = {
  swift:    { name: 'SWIFT',    tint: '#5dade2', hp: 1.2, speed: 1.6 },
  brutish:  { name: 'BRUTISH',  tint: '#e67e22', hp: 2.2, dmg: 1.5, scaleUp: 1.25 },
  vampiric: { name: 'VAMPIRIC', tint: '#27ae60', hp: 1.6, regen: 7 }, // HP/s
};

export const MINIBOSS_WAVES: Record<number, string> = { 4: 'goblin_chief', 12: 'necro_lord' };
export const WAVE_DURATION = 30000; // survive this long and the wave is cleared (boss waves excluded)
