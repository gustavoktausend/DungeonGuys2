// types.ts — the whole shape of the simulation. sim/ owns these; render/, ui/
// and app/ read them but never define their own parallel shapes.

import type { Rng } from './rng';

export type ClassKey = 'mage' | 'archer' | 'warrior' | 'ninja' | 'priestess' | 'witch' | 'coprobo';
export type AttackKind = 'melee' | 'bolt' | 'arrow' | 'bullet' | 'fireball';
export type DamageKind = 'melee' | 'arrow' | 'bullet' | 'bolt' | 'fireball';
export type Archetype = 'melee' | 'ranged' | 'elemental';
export type MutatorKey = 'swarm' | 'frenzy' | 'bounty' | 'elite' | 'fog';
export type Phase = 'playing' | 'levelup' | 'shop' | 'gameover' | 'victory';
export type GameMode = 'campaign' | 'endless';

export type Bounds = { left: number; right: number; top: number; bottom: number };

export type Stats = {
  hpRegen: number; lifeSteal: number; dmgPct: number;
  meleeDmg: number; rangedDmg: number; elementalDmg: number;
  atkSpeedPct: number; crit: number; armor: number; dodge: number;
  range: number; speedPct: number; luck: number; stamina: number;
  burn: number; chill: number; block: number;
};

/** Stat mods may also carry `maxHp`, which Stats itself does not have. */
export type Mods = Partial<Stats> & { maxHp?: number };

/** Flat weapon shape — same as a CLASS_DEFS tier. `player.weapon` is always this. */
export type Weapon = {
  name: string;
  sprite: string | null;
  attack: AttackKind;
  fireRate: number;
  range: number;
  damage: [number, number];
  bulletSpeed?: number;
  pierce?: number;
  count?: number;
  arc?: number;
  knockback?: number;
  aoe?: number;
  poison?: { dps: number; dur: number } | null;
};

export type ItemSlot = 'weapon' | 'offhand' | 'helm' | 'armor' | 'boots' | 'ring' | 'amulet';
export type EquipSlot = 'weapon' | 'offhand' | 'helm' | 'armor' | 'boots' | 'ring1' | 'ring2' | 'amulet';

/** A catalog entry. Weapons nest their combat params under `.weapon`. */
export type EquipItem = {
  id: string;
  name: string;
  icon: string;
  slot: ItemSlot;
  archetype: Archetype | null;
  classReq: ClassKey[] | null;
  twoHanded?: boolean;
  mods: Mods;
  price: number;
  weapon?: Omit<Weapon, 'name'>;
};

/**
 * The `weapon` slot may hold either a catalog EquipItem or a bare CLASS_DEFS
 * tier (the starting weapon). `equipDelta` in the original relies on telling
 * them apart by the presence of `damage`; the port keeps that behavior.
 */
export type Equipment = Record<EquipSlot, EquipItem | Weapon | null>;

/** Shop consumable (ITEM_POOL). */
export type ShopItem = {
  name: string;
  icon: string;
  price: number;
  mods: Mods;
  dmgKind?: Archetype | 'arrow' | 'melee' | 'elemental';
};

export type Blessing = {
  name: string;
  icon: string;
  mods: Mods;
  dmgKind?: 'melee' | 'arrow' | 'elemental';
};

export type Offer<T> = { item: T; sold: boolean };

export type Player = {
  id: string;
  name: string;
  cls: ClassKey;
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number;
  speed: number;
  stamina: number; sprinting: boolean;
  invincible: number;      // ms remaining
  specialTimer: number;    // ms remaining
  attackTimer: number;     // ms until the next attack is allowed
  regenAcc: number;        // fractional HP carry
  dustTimer: number;       // ms since the last sprint dust puff
  facing: number;          // radians
  moving: boolean;
  walkFrame: number; walkTimer: number;
  level: number; xp: number; xpNext: number;
  gold: number;
  equipment: Equipment;
  weapon: Weapon;
  permStats: Stats; permMaxHp: number;
  stats: Stats;            // derived: permStats + equipment
  pendingLevelUps: number;
  levelChoices: Blessing[];
};

export type Enemy = {
  id: number;
  type: string;
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number;
  speed: number;
  score: number;
  goldDrop: number;
  potionChance: number;
  dmg: number;
  boss: string | null;
  scale: number;
  summons: string[] | null;
  summonTimer: number;
  anim: string;
  dead: boolean;
  moving: boolean;
  elite: string | null;
  eliteName?: string;
  eliteTint: string | null;
  regen: number;
  hitFlash: number;
  poisonT: number; poisonDps: number;
  burnT: number; burnDps: number;
  slowT: number;
  shooter: ShooterDef | null;
  shootT: number;
  exploder: ExploderDef | null;
  fusing: boolean; fuseT: number;
  /** ability key -> cooldown in ms, e.g. { charge: 6500, ring: 7000 } */
  abilities: Record<string, number> | null;
  cd: Record<string, number>;
  bossState: string;
  stateT: number;
  trapT: number;
  chargeDir: { x: number; y: number };
  enraged: boolean;
};

export type Bullet = {
  /** Player id that fired it — damage, lifesteal and score credit follow this. */
  owner: string;
  x: number; y: number; vx: number; vy: number;
  angle: number; speed: number; range: number;
  damage: [number, number];
  pierce: number;
  aoe: number;
  poison: { dps: number; dur: number } | null;
  type: AttackKind;
  hitIds: number[];   // enemy ids already hit (array, not Set — must serialize)
  dist: number;
  dead: boolean;
};

export type EnemyBullet = {
  x: number; y: number; vx: number; vy: number;
  dmg: number; life: number; dead: boolean; kind: string;
};

export type ShooterDef  = { range: number; interval: number; bulletSpeed: number; dmg: number };
export type ExploderDef = { fuse: number; radius: number; dmg: number; triggerDist: number };

/** A CLASS_DEFS entry. */
export type ClassDef = {
  hp: number;
  speed: number;
  anim: string;
  special: 'fireball' | 'volley' | 'whirlwind' | 'dash' | 'nova' | 'emp' | 'hex';
  specialCd: number;
  tiers: Weapon[];
};

/** An ENEMY_DEFS entry. */
export type EnemyDef = {
  hp: number; speed: number; w: number; h: number;
  score: number; gold: number; anim: string;
  potion: number; dmg: number;
  shooter?: ShooterDef;
  exploder?: ExploderDef;
  boss?: string;
  scale?: number;
  summons?: string[];
  abilities?: Record<string, number>;
};

export type EliteType = {
  name: string; tint: string;
  hp: number; speed?: number; dmg?: number; regen?: number; scaleUp?: number;
};

export type Coin   = { x: number; y: number; vx: number; vy: number; bob: number; dead: boolean };
export type Potion = { x: number; y: number; bob: number; dead: boolean };
export type Chest  = { x: number; y: number; state: 'closed' | 'opening' | 'looted'; timer: number };
export type Obstacle = { kind: 'column' | 'crate'; x: number; y: number; r: number; hp: number; dead: boolean };
export type Trap   = { x: number; y: number; offset: number };
export type SpawnEntry = { delay: number; type: string };

export type SimEvent =
  | { t: 'sfx'; name: string }
  | { t: 'float'; x: number; y: number; text: string; color: string }
  | { t: 'particles'; x: number; y: number; color: string; count: number }
  | { t: 'shake'; mag: number; dur: number }
  | { t: 'swing'; x: number; y: number; angle: number; range: number; arc: number }
  | { t: 'hurtFlash' }
  | { t: 'announce'; text: string }
  | { t: 'unlock'; cls: ClassKey }
  | { t: 'phase'; from: Phase; to: Phase }
  | { t: 'bossMusic'; on: boolean };

/** Everything the sim needs from the outside, decided once per run. */
export type RunConfig = {
  seed: number;
  mode: GameMode;
  classKey: ClassKey;
  playerName: string;
  /** Forge levels, read from Save by app/ — sim never touches localStorage. */
  forge: {
    vigor: number; honed: number; fleet: number;
    startgold: number; merchant: number; wise: number;
  };
};

export type InputState = {
  tick: number;
  move: { x: number; y: number };  // each component in [-1, 1], already normalized
  aim: number;                     // radians
  attack: boolean;
  special: boolean;
  sprint: boolean;
};

export type World = {
  tick: number;
  phase: Phase;
  rng: Rng;
  play: Bounds;
  config: RunConfig;
  nextId: number;

  players: Record<string, Player>;
  enemies: Enemy[];
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  coins: Coin[];
  potions: Potion[];
  chests: Chest[];
  obstacles: Obstacle[];
  traps: Trap[];
  spawnQueue: SpawnEntry[];

  wave: number;
  waveActive: boolean;
  waveTimer: number;
  waveHasBoss: boolean;
  waveMutator: MutatorKey | null;
  nextWaveDelay: number;
  pendingAfterLevelUp: 'shop' | 'victory' | null;

  score: number;
  combo: number;
  comboTimer: number;
  runKills: number;
  runGoldEarned: number;

  shopOffers: Offer<ShopItem>[];
  shopEquipOffers: Offer<EquipItem>[];
  rerollCost: number;

  events: SimEvent[];
};
