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
  dmgKind?: 'melee' | 'arrow' | 'elemental';
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
  /** Both are always present (null until makeElite runs) so every Enemy has
   *  the same shape — an optional key would come and go across snapshots. */
  eliteName: string | null;
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
  dmg: number; dist: number; dead: boolean;
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
export type Chest  = { x: number; y: number; state: 'closed' | 'opening' | 'looted'; timer: number; fade: number };
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
  | { t: 'bossMusic'; on: boolean }
  | { t: 'bossKill' };

/**
 * The slot a player occupies in a run — the ONLY space of identity the
 * simulation and the replay know about (ADR 0001, FORM-01/D-30).
 *
 * The authority assigns it once, when the room closes, and it lives until the
 * run ends: a player who reconnects comes back to the same slot, and a vacant
 * slot is never recycled inside the same run. The two identities it is NOT are
 * deliberately absent from this package — the durable server-side account id
 * and the transport handle both stay outside `packages/sim`, which is what
 * makes a stored replay readable without a database (see tests/identity.ts).
 *
 * A four-value union rather than `string`, because the width of a room is a
 * decision, not an accident, and because it is frozen inside every replay
 * recorded from phase 4 on.
 *
 * NOTE: `@dg2/protocol` exports a DIFFERENT type also called `PlayerSlot` —
 * there it is the {id, cls, name} record of the envelope's canonical order.
 * This one is the id alone. They are never imported into the same file.
 */
export type PlayerSlot = 'p0' | 'p1' | 'p2' | 'p3';

/** Forge levels, read from Save by app/ — sim never touches localStorage. */
export type ForgeLevels = {
  vigor: number; honed: number; fleet: number;
  startgold: number; merchant: number; wise: number; golden: number;
};

/**
 * One player of the run, as the run manifest describes them.
 *
 * `forge` is PER PLAYER, not per run: in co-op four people bring four
 * different sets of permanent upgrades to the same world, and a single
 * run-wide value would silently give everyone the host's.
 */
export type RunPlayer = {
  id: PlayerSlot;
  name: string;
  cls: ClassKey;
  forge: ForgeLevels;
};

/** Everything the sim needs from the outside, decided once per run. */
export type RunConfig = {
  seed: number;
  mode: GameMode;
  /**
   * Every player of the run, and THE ORDER OF THIS ARRAY IS THE CANONICAL
   * ORDER (FORM-02/D-13). `step()` iterates it — not `Object.keys(players)` —
   * so that who gets which draw from `world.rng` is decided by the run
   * manifest instead of by the order in which people happened to join.
   *
   * It is the same order byte 5 of a packed input tick indexes into (D-12),
   * so the replay already looks here for it.
   */
  players: RunPlayer[];
};

export type InputState = {
  tick: number;
  move: { x: number; y: number };  // each component in [-1, 1], already normalized
  aim: number;                     // radians
  attack: boolean;
  special: boolean;
  sprint: boolean;
};

/**
 * What a mission asks of the players.
 *
 * The order MIRRORS `OBJECTIVE_KIND` in packages/protocol, where the INDEX of
 * a name is its wire value. The two lists are two spellings of one table, so
 * they have to be reordered together or a message written as 'hunt' is read as
 * 'purge' — silently, somewhere else, later. Plan 01-14 pins them to each
 * other with a test; until then, treat the protocol's copy as the original.
 *
 * 'none' is first for the same reason it is first there: a zeroed field should
 * decode to "no objective" rather than to a real one.
 */
export type ObjectiveKind = 'none' | 'defend' | 'hunt' | 'purge' | 'fetch' | 'extract';

/**
 * One mission objective, as the simulation carries it.
 *
 * Three properties of this shape are the reason it looks like this, and each
 * one is a mistake that would be expensive to undo after the format is frozen:
 *
 * (a) IT IS A FIELD OF THE WORLD, NOT A DRAINABLE EVENT. Objective progress
 *     reached through `world.events` would be unverifiable by replay: `app/`
 *     drains that array every tick, so what it consumed leaves no trace in the
 *     snapshot, and a verifier re-running the log would have nothing to
 *     compare against. State that decides whether a run counted has to survive
 *     in the World. This is what ADR 0012 decided.
 *
 * (b) IT IS JSON-SAFE. No Map, no Set, no class instance — plain numbers,
 *     strings and arrays. `world.rng` is the single class instance in the
 *     World and it is going to stay the single one, because every additional
 *     one is another special case in the snapshot codec and in `hashWorld`.
 *
 * (c) IT IS ALWAYS PRESENT, ALWAYS THE SAME SHAPE. A campaign run with no
 *     mission carries `objectives: []`, never a missing key and never an
 *     optional field. A key that exists only in mission mode is a hash
 *     divergence lying in wait for the moment when it is most expensive — the
 *     same doctrine already written on `eliteName`/`eliteTint` above.
 */
export type ObjectiveState = {
  kind: ObjectiveKind;
  status: 'inactive' | 'active' | 'complete' | 'failed';
  /** How far along, in whatever unit `kind` counts. */
  progress: number;
  /** The value of `progress` that completes it. */
  target: number;
  /** Ticks remaining; -1 when the objective is not timed. */
  ticksLeft: number;
  /** Entity ids this objective tracks; empty when it tracks none. */
  marks: number[];
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
  pendingAfterLevelUp: 'shop' | 'victory' | null;

  /**
   * Mission objectives for this run. Empty on a campaign or survival run, and
   * empty is a REAL value here, not an absence — see ObjectiveState.
   */
  objectives: ObjectiveState[];

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
