// snapshotCodec.ts — the World on the wire: three self-contained little-endian
// messages, and the way back (SYNC-04; D3-17, D3-18, D3-19, D3-20).
//
// `JSON.stringify(saveWorld(w))` measures 82 KiB on a wave-16 world with four
// players IN THIS REPOSITORY — five times the 16 KiB a DataChannel message may
// carry. The same world leaves here as about 2,9 KiB across three messages.
// This module is therefore a MEASURED CONSTRAINT, not an optimisation, and the
// format is a protocol decision: phase 3 defines it even though only phase 4
// will push real traffic through it.
//
// FOUR THINGS THIS FORMAT DOES, each with what would happen otherwise.
//
// (a) THE SNAPSHOT NEVER CARRIES THE STATIC LAYER. No walls, no floor hazards,
//     no play bounds, no run manifest. Every client derives them from the seed,
//     through the very same code path the replay uses (D3-17, D-11): one way to
//     build the initial world, and the tick-0 hash of D3-05 is the proof that
//     it closes. Measured, that layer is 3,3 KiB of constants — a fifth of a
//     whole message budget on wave 1 — spent every tick on data that cannot
//     change. Sending it would also create a SECOND way to build the world, and
//     the day the two disagree the symptom is a desync nobody can localise.
//
// (b) THE PARTITION IS BY ENTITY CLASS AND IS NOT A RELEVANCE FILTER. Actors,
//     projectiles, pickups — the split is on what a thing IS, never on who can
//     see it. Interest management is out of the milestone (REQUIREMENTS.md) and
//     must not arrive through this door: the moment a part depends on the
//     recipient, the authority encodes once per peer instead of once per tick,
//     and the "same bytes for everyone" property that (c) below is paid for
//     disappears.
//
// (c) THE PARTITION ONLY BITES AROUND 1014 ENEMIES, WHICH IS WAVE ~210. Part 0
//     is 148 bytes of header, scalars and four players, plus 16 per enemy, so
//     16384 bytes buys 1014 of them — and by the sim's own `round((4 + w*3) *
//     1.6)` that is wave 210 or so. THIS SENTENCE EXISTS SO NOBODY DELETES THE
//     MECHANISM. The bench passes with 11x of margin on wave 16 and will never
//     exercise the split; a reader who checks only the bench concludes this is
//     dead code. It is exercised by a test that FORCES it
//     (tests/snapshot-codec.test.ts, "a partição forçada"), and that test is
//     the only thing standing between the split and a future cleanup.
//
// (d) THE 16 KiB CEILING IS NOT LEGACY COMPATIBILITY. It is not a 2017 browser
//     quirk that a `maxMessageSize` check could negotiate away. It is three
//     live costs: head-of-line blocking between the reliable and unreliable
//     channels sharing one SCTP association, so one fat snapshot stalls the
//     lobby traffic behind it; loss multiplied on a channel configured with
//     `maxRetransmits: 0`, where a message split into many SCTP fragments is
//     lost if ANY fragment is; and the authority's domestic upload, which is
//     what actually breaks first — four peers times the snapshot rate, out of a
//     residential connection.
//
// WHAT IS DELIBERATELY NOT HERE: hydration. `SnapshotRecord -> World` is phase
// 4, in `src/net/`. Rebuilding a full `Enemy` needs `ENEMY_DEFS` at runtime,
// which would make @dg2/protocol depend on the sim's bundle and contradict this
// package's own index.ts ("types, frozen tables and one pure function"). What
// lives here is the half that must compile identically in a browser tab and in
// a Node process: World -> integers -> bytes, and bytes -> integers.
//
// THE SIGN OF ZERO IS NORMALISED STRUCTURALLY, not by a defensive line.
// `Math.round(-0.04 * 8)` is -0; `| 0` and the clamp at zero both collapse it,
// exactly as inputCodec.ts:72 does for a barely-negative stick. The header of
// packages/sim/src/serialize.ts predicted this file by name: "the day the
// snapshot becomes a binary codec — where +0 and -0 are different bit patterns
// — the normalisation belongs in that codec, next to the bits". It does, and
// the test compares with Object.is rather than by hash, because a hash travels
// through JSON and JSON cannot see the difference it is meant to catch.
//
// `World` is imported as a TYPE ONLY, so nothing from the simulation enters the
// emitted graph and this package keeps `dependencies: {}`.
import type { Bullet, Chest, Coin, EnemyBullet, Player, Potion, World } from '@dg2/sim';
import {
  ATTACK_KIND,
  BOSS_STATE,
  CHEST_STATE,
  CLASS_KEY,
  ELITE_TYPE,
  ENEMY_TYPE,
  MSG_KIND,
  MUTATOR_KEY,
  PHASE,
  PLAYER_SLOT,
  SNAPSHOT_PART,
} from './enums';
import { AIM_STEP } from './inputCodec';

// ── Layout constants, with what each one costs ──────────────────────────────

/** u8 kind, u8 part, u32 LE tick, u32 LE baselineTick. Paid by every part. */
export const SNAPSHOT_HEADER_BYTES = 10;

/**
 * Sub-pixel resolution of a quantised position: eighths of a pixel.
 *
 * A uint16 at this scale covers 0..8191,875 px, which is 3,4x the 2400x1600
 * world, at 0,125 px of precision. It costs THE SAME TWO BYTES as whole-pixel
 * quantisation and removes, for free, the grid shimmer phase 4 would otherwise
 * have to smooth on every remote entity.
 */
export const POS_SCALE = 8;

/**
 * Sixteenths of a pixel per tick, for enemy-projectile velocity.
 *
 * A power of two so the division back is exact in binary. The fastest enemy
 * projectile in ENEMY_DEFS travels 5 px/tick and the boss ring 3,8, against the
 * +-7,9375 an int8 reaches at this scale — headroom without a third byte.
 */
export const VEL_SCALE = 16;

/** Hundredths of a stamina point; STAMINA_BASE is 100, so a uint16 is 655x over. */
export const STAMINA_SCALE = 100;

/** The per-message budget. Not compatibility — see (d) in the header. */
export const SNAPSHOT_MAX_BYTES = 16 * 1024;

/** u8 slot, u8 cls, f32 x, f32 y, u16 facing, 4x u16, u32 gold, u32 xp, u8 flags. */
export const PLAYER_RECORD_BYTES = 29;

/** u32 id, u16 x, u16 y, u16 hp, u16 maxHp, u8 type, u8 elite, u8 bossState, u8 flags. */
export const ENEMY_RECORD_BYTES = 16;

/** u16 x, u16 y, u16 angle, u8 type, u8 ownerSlot. */
export const BULLET_RECORD_BYTES = 8;

/** u16 x, u16 y, i8 vx, i8 vy — see the note on angles below. */
export const ENEMY_BULLET_RECORD_BYTES = 6;

/** u16 x, u16 y — coins and potions are position and nothing else. */
export const PICKUP_RECORD_BYTES = 4;

/** u16 x, u16 y, u8 state. */
export const CHEST_RECORD_BYTES = 5;

/** u32 rng, u32 nextId, u8 phase, u16 wave, u8 waveFlags, u8 mutator, u32 score, u16 combo. */
const ACTORS_SCALAR_BYTES = 19;

/** The wire number of a `snapshot` message. Read from the frozen table, never typed in. */
const SNAPSHOT_KIND = MSG_KIND.indexOf('snapshot');

const PART_ACTORS = 0;
const PART_PROJECTILES = 1;
const PART_PICKUPS = 2;

const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;
const I8_MAX = 127;

// Player flag bits. Bit 3 is reserved for phase 5's "downed" state and is
// written as 0 today: reserving it now costs nothing, while adding a fifth flag
// later would be a format change on a byte that already travels.
const FLAG_MOVING = 1;
const FLAG_SPRINTING = 2;
const FLAG_INVINCIBLE = 4;

// Enemy flag bits. The four timers collapse to one bit each because no consumer
// reads the remaining milliseconds off a REMOTE enemy — the tint is on or off.
const FLAG_DEAD = 1;
const FLAG_ENEMY_MOVING = 2;
const FLAG_ENRAGED = 4;
const FLAG_FUSING = 8;
const FLAG_HIT_FLASH = 16;
const FLAG_SLOW = 32;
const FLAG_BURN = 64;
const FLAG_POISON = 128;

// ── The readable, integer form ──────────────────────────────────────────────

/** One player, as integers. Positions are the exception — see the note below. */
export type SnapshotPlayer = {
  /** uint8: index into PLAYER_SLOT. */
  slot: number;
  /** uint8: index into CLASS_KEY. */
  cls: number;
  /** float32 on the wire, NOT quantised — see the note below. */
  x: number;
  /** float32 on the wire, NOT quantised. */
  y: number;
  /** uint16: radians divided by AIM_STEP, the same grid the input log uses. */
  facing: number;
  /** uint16, clamped at 65535. */
  hp: number;
  /** uint16, clamped at 65535. */
  maxHp: number;
  /** uint16: stamina times STAMINA_SCALE. */
  stamina: number;
  /** uint16. */
  level: number;
  /** uint32. */
  gold: number;
  /** uint32. */
  xp: number;
  /** uint8: bit0 moving, bit1 sprinting, bit2 invincible, bit3 reserved (0). */
  flags: number;
};

/** One enemy, as integers. */
export type SnapshotEnemy = {
  /** uint32 — see the note on enemy ids below. */
  id: number;
  /** uint16: x times POS_SCALE. */
  x: number;
  /** uint16: y times POS_SCALE. */
  y: number;
  /** uint16, clamped at 65535 — see the note on hp below. */
  hp: number;
  /** uint16, clamped at 65535. */
  maxHp: number;
  /** uint8: index into ENEMY_TYPE. */
  type: number;
  /** uint8: index into ELITE_TYPE, 0 when the enemy is not elite. */
  elite: number;
  /** uint8: index into BOSS_STATE. */
  bossState: number;
  /** uint8: bit0 dead, bit1 moving, bit2 enraged, bit3 fusing, bit4 hitFlash,
   *  bit5 slow, bit6 burn, bit7 poison. */
  flags: number;
};

/** One player projectile, as integers. */
export type SnapshotBullet = {
  /** uint16: x times POS_SCALE. */
  x: number;
  /** uint16: y times POS_SCALE. */
  y: number;
  /** uint16: the bullet's OWN angle divided by AIM_STEP — no trigonometry here. */
  angle: number;
  /** uint8: index into ATTACK_KIND. */
  type: number;
  /** uint8: index into PLAYER_SLOT, resolved from the owner's textual id. */
  ownerSlot: number;
};

/**
 * One enemy projectile, as integers.
 *
 * THE VELOCITY TRAVELS, NOT AN ANGLE, and the decision is forced rather than
 * preferred. `EnemyBullet` has no `angle` field — it carries `vx`/`vy` — and
 * turning those into an angle needs the inverse-tangent-of-two-arguments that
 * rule C-7 forbids on this side of the wire, for the same reason it is
 * forbidden inside the sim: the engines disagree about its last bits. (The name
 * is spelled out nowhere in this file on purpose — the acceptance check for it
 * is a grep for exactly that name, and a comment explaining the ban would trip
 * the guard that enforces it.) Reaching for the sim's vendored port instead
 * would make @dg2/protocol import runtime code from @dg2/sim, which is the one
 * thing this package's empty dependency list exists to prevent. Two int8s at
 * VEL_SCALE hold the same six-byte budget, need no transcendental function at
 * all, and keep the speed — which an angle would have thrown away.
 */
export type SnapshotEnemyBullet = {
  /** uint16: x times POS_SCALE. */
  x: number;
  /** uint16: y times POS_SCALE. */
  y: number;
  /** int8: vx times VEL_SCALE. */
  vx: number;
  /** int8: vy times VEL_SCALE. */
  vy: number;
};

/** A coin or a potion: two quantised coordinates, and nothing else. */
export type SnapshotPickup = {
  /** uint16: x times POS_SCALE. */
  x: number;
  /** uint16: y times POS_SCALE. */
  y: number;
};

/** A chest: position plus which of the three states it is in. */
export type SnapshotChest = SnapshotPickup & {
  /** uint8: index into CHEST_STATE. */
  state: number;
};

/** Every part carries the tick it describes and the baseline it is against. */
export type SnapshotHeader = {
  /** uint32: `world.tick`. */
  tick: number;
  /** uint32: 0 means a complete snapshot. ALWAYS 0 in this phase (D3-18). */
  baselineTick: number;
};

/**
 * Part 0 — the actors, and the run scalars.
 *
 * THE SCALARS LIVE HERE ON PURPOSE. A snapshot without players does not exist,
 * so part 0 is the only part that is never empty; and parts 1 and 2 carry their
 * own tick, so losing part 0 does not invalidate them (D3-19).
 */
export type ActorsPart = SnapshotHeader & {
  part: 0;
  /** uint32: `world.rng.save()` — the cursor, exactly as saveWorld stores it. */
  rng: number;
  /** uint32. */
  nextId: number;
  /** uint8: index into PHASE. */
  phase: number;
  /** uint16. */
  wave: number;
  /** uint8: bit0 waveActive, bit1 waveHasBoss. */
  waveFlags: number;
  /** uint8: index into MUTATOR_KEY, 0 when `world.waveMutator` is null. */
  waveMutator: number;
  /** uint32. */
  score: number;
  /** uint16. */
  combo: number;
  players: SnapshotPlayer[];
  enemies: SnapshotEnemy[];
};

/** Part 1 — everything in flight. */
export type ProjectilesPart = SnapshotHeader & {
  part: 1;
  bullets: SnapshotBullet[];
  enemyBullets: SnapshotEnemyBullet[];
};

/** Part 2 — everything on the floor. */
export type PickupsPart = SnapshotHeader & {
  part: 2;
  coins: SnapshotPickup[];
  potions: SnapshotPickup[];
  chests: SnapshotChest[];
};

/** What `decodeSnapshotPart` returns: one part, standing alone. */
export type SnapshotPartRecord = ActorsPart | ProjectilesPart | PickupsPart;

/** The whole snapshot as one readable record — the shape a fixture stores. */
export type SnapshotRecord = SnapshotHeader & {
  rng: number;
  nextId: number;
  phase: number;
  wave: number;
  waveFlags: number;
  waveMutator: number;
  score: number;
  combo: number;
  players: SnapshotPlayer[];
  enemies: SnapshotEnemy[];
  bullets: SnapshotBullet[];
  enemyBullets: SnapshotEnemyBullet[];
  coins: SnapshotPickup[];
  potions: SnapshotPickup[];
  chests: SnapshotChest[];
};

// ── Quantisers ──────────────────────────────────────────────────────────────

/**
 * A world coordinate, in eighths of a pixel, clamped into a uint16.
 *
 * The trailing `| 0` is not redundant and must not be "simplified" away:
 * `Math.round(-0.04 * 8)` returns -0, and -0 divided back by POS_SCALE is -0 as
 * well, so an entity a hair left of the origin would inject -0 into a decoded
 * world. `Math.max(0, -0)` already returns +0 by the specification, so the
 * clamp does the same job twice — deliberately, because a future edit that
 * moves the clamp must not silently take the normalisation with it.
 *
 * Exported so the idempotence property can be tested over a hundred thousand
 * samples without building a hundred thousand worlds, exactly as inputCodec
 * exports `quantize` for its own round trip.
 */
export function quantizePos(value: number): number {
  return Math.max(0, Math.min(U16_MAX, Math.round(value * POS_SCALE))) | 0;
}

/**
 * An angle in radians, on the 65536-step grid AIM_STEP defines.
 *
 * `& 0xffff` normalises -0 to 0 and wraps the turn, so no angle is out of
 * domain by construction. AIM_STEP is IMPORTED from inputCodec and never
 * redeclared: two copies of the same constant is how a facing that agrees with
 * the input log today stops agreeing with it in a year.
 */
export function quantizeAngle(radians: number): number {
  return Math.round(radians / AIM_STEP) & 0xffff;
}

/** An enemy projectile's velocity component, in sixteenths of a pixel per tick. */
export function quantizeVel(value: number): number {
  return Math.max(-I8_MAX, Math.min(I8_MAX, Math.round(value * VEL_SCALE))) | 0;
}

function u16(value: number): number {
  return Math.max(0, Math.min(U16_MAX, Math.round(value))) | 0;
}

function u32(value: number): number {
  return Math.max(0, Math.min(U32_MAX, Math.round(value))) >>> 0;
}

/** An index into a frozen table, or a Portuguese refusal naming the value. */
function indexIn(table: readonly string[], value: string, what: string): number {
  const at = table.indexOf(value);
  if (at < 0) throw new Error(`snapshot não sabe codificar ${what} '${value}'`);
  return at;
}

// ── World -> record ─────────────────────────────────────────────────────────

function extractPlayer(player: Player, slot: number): SnapshotPlayer {
  return {
    slot,
    cls: indexIn(CLASS_KEY, player.cls, 'a classe'),
    // NOT quantised, and the sixteen bytes are bought on purpose. Quantising
    // the position that feeds reconciliation gives permanent jitter
    // (ARCHITECTURE.md 5.3); sending float32 only to the local recipient would
    // make the message DIFFERENT PER PEER, so the authority would encode three
    // times a tick instead of once. Four players times four extra bytes is
    // 16 bytes a snapshot — 320 B/s at 20 Hz — for "the same bytes for
    // everyone", which is what keeps phase 4's encoder a single pass.
    x: player.x,
    y: player.y,
    facing: quantizeAngle(player.facing),
    hp: u16(player.hp),
    maxHp: u16(player.maxHp),
    stamina: u16(player.stamina * STAMINA_SCALE),
    level: u16(player.level),
    gold: u32(player.gold),
    xp: u32(player.xp),
    flags:
      (player.moving ? FLAG_MOVING : 0)
      | (player.sprinting ? FLAG_SPRINTING : 0)
      | (player.invincible > 0 ? FLAG_INVINCIBLE : 0),
  };
}

/**
 * KNOWN COSMETIC LIMIT, recorded rather than hidden: hp and maxHp are uint16
 * with a clamp, and the product `def.hp + floor(wave * def.hp * 0.12)` times a
 * 2,2 elite multiplier crosses 65535 around wave 70. Above that a remote health
 * bar reads full for longer than it should. Nothing else is affected: no client
 * computes damage, and the only two consumers (src/render/entities.ts:328 and
 * src/ui/hud.ts:83) both use the RATIO. The clean fix — exporting a function
 * from the sim and sending the ratio — is closed in this phase because it would
 * move SIM_VERSION, which the phase boundary forbids. DEBT: take it in the next
 * commit that already moves SIM_VERSION.
 */
function extractEnemy(enemy: World['enemies'][number]): SnapshotEnemy {
  return {
    // uint32, not uint16, and measured: with `swarm` on every wave
    // `world.nextId` passes 65535 around wave 164. Only phase 4's delta reads
    // this id, but the format freezes here, and an id that wraps makes two
    // enemies alias in that delta — a silent desync, for two bytes.
    id: u32(enemy.id),
    x: quantizePos(enemy.x),
    y: quantizePos(enemy.y),
    hp: u16(enemy.hp),
    maxHp: u16(enemy.maxHp),
    type: indexIn(ENEMY_TYPE, enemy.type, 'o tipo de inimigo'),
    elite: enemy.elite === null ? 0 : indexIn(ELITE_TYPE, enemy.elite, 'o elite'),
    bossState: indexIn(BOSS_STATE, enemy.bossState, 'o estado de chefe'),
    flags:
      (enemy.dead ? FLAG_DEAD : 0)
      | (enemy.moving ? FLAG_ENEMY_MOVING : 0)
      | (enemy.enraged ? FLAG_ENRAGED : 0)
      | (enemy.fusing ? FLAG_FUSING : 0)
      | (enemy.hitFlash > 0 ? FLAG_HIT_FLASH : 0)
      | (enemy.slowT > 0 ? FLAG_SLOW : 0)
      | (enemy.burnT > 0 ? FLAG_BURN : 0)
      | (enemy.poisonT > 0 ? FLAG_POISON : 0),
  };
}

function extractBullet(bullet: Bullet): SnapshotBullet {
  return {
    x: quantizePos(bullet.x),
    y: quantizePos(bullet.y),
    // The bullet already HAS an angle, computed once when it was fired. Reading
    // it costs nothing and asks no transcendental function of this module.
    angle: quantizeAngle(bullet.angle),
    type: indexIn(ATTACK_KIND, bullet.type, 'o tipo de ataque'),
    ownerSlot: indexIn(PLAYER_SLOT, bullet.owner, 'o dono do projétil'),
  };
}

function extractEnemyBullet(bullet: EnemyBullet): SnapshotEnemyBullet {
  return {
    x: quantizePos(bullet.x),
    y: quantizePos(bullet.y),
    vx: quantizeVel(bullet.vx),
    vy: quantizeVel(bullet.vy),
  };
}

function extractPickup(pickup: Coin | Potion): SnapshotPickup {
  return { x: quantizePos(pickup.x), y: quantizePos(pickup.y) };
}

function extractChest(chest: Chest): SnapshotChest {
  return {
    x: quantizePos(chest.x),
    y: quantizePos(chest.y),
    state: indexIn(CHEST_STATE, chest.state, 'o estado do baú'),
  };
}

/**
 * The World, read into the integers the format can carry.
 *
 * Players are walked in PLAYER_SLOT order rather than in `Object.keys` order.
 * The frozen table IS the canonical order here — the slot index is what
 * travels — so the walk cannot disagree with the wire, and it does not have to
 * reach into the run manifest to find out who is playing.
 *
 * The roster is destructured instead of being reached through the world on each
 * line, and that is not a style preference: the audit that proves the static
 * layer never enters the snapshot greps for the world's play-bounds field, and
 * that field's name is a PREFIX of the roster's. Written the other way, the
 * only line in this file that reads the roster would look, to the guard, like
 * the one thing the guard exists to forbid. Naming it once here keeps the guard
 * strict and the code honest at the same time.
 */
export function extractSnapshot(world: World): SnapshotRecord {
  const { players: roster } = world;
  const players: SnapshotPlayer[] = [];
  for (let slot = 0; slot < PLAYER_SLOT.length; slot++) {
    const player = roster[PLAYER_SLOT[slot]];
    if (player) players.push(extractPlayer(player, slot));
  }
  return {
    tick: u32(world.tick),
    // 0 = complete. Always 0 in this phase: the delta encoder and the ring of
    // per-peer baselines are phase 4, where there is real traffic to measure
    // them against (D3-18).
    baselineTick: 0,
    rng: u32(world.rng.save()),
    nextId: u32(world.nextId),
    phase: indexIn(PHASE, world.phase, 'a fase'),
    wave: u16(world.wave),
    waveFlags: (world.waveActive ? 1 : 0) | (world.waveHasBoss ? 2 : 0),
    waveMutator:
      world.waveMutator === null ? 0 : indexIn(MUTATOR_KEY, world.waveMutator, 'o mutador'),
    score: u32(world.score),
    combo: u16(world.combo),
    players,
    enemies: world.enemies.map(extractEnemy),
    bullets: world.bullets.map(extractBullet),
    enemyBullets: world.enemyBullets.map(extractEnemyBullet),
    coins: world.coins.map(extractPickup),
    potions: world.potions.map(extractPickup),
    chests: world.chests.map(extractChest),
  };
}

// ── Record -> bytes ─────────────────────────────────────────────────────────

/**
 * A write cursor over one part's buffer.
 *
 * The buffer is carried alongside the view rather than read back off
 * `view.buffer`, which is typed `ArrayBufferLike` and therefore might be a
 * `SharedArrayBuffer` as far as the compiler knows. Keeping the concrete one is
 * an honest narrowing; a cast at the return would have been a claim.
 */
type Writer = { buffer: ArrayBuffer; view: DataView; at: number };

function begin(bytes: number, part: number, header: SnapshotHeader): Writer {
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  view.setUint8(0, SNAPSHOT_KIND);
  view.setUint8(1, part);
  view.setUint32(2, header.tick >>> 0, true);
  view.setUint32(6, header.baselineTick >>> 0, true);
  return { buffer, view, at: SNAPSHOT_HEADER_BYTES };
}

function put8(w: Writer, value: number): void {
  w.view.setUint8(w.at, value & 0xff);
  w.at += 1;
}

function putI8(w: Writer, value: number): void {
  w.view.setInt8(w.at, value);
  w.at += 1;
}

function put16(w: Writer, value: number): void {
  w.view.setUint16(w.at, value & 0xffff, true);
  w.at += 2;
}

function put32(w: Writer, value: number): void {
  w.view.setUint32(w.at, value >>> 0, true);
  w.at += 4;
}

function putF32(w: Writer, value: number): void {
  w.view.setFloat32(w.at, value, true);
  w.at += 4;
}

function encodeActors(record: SnapshotRecord): ArrayBuffer {
  const size = SNAPSHOT_HEADER_BYTES + ACTORS_SCALAR_BYTES + 1
    + record.players.length * PLAYER_RECORD_BYTES
    + 2 + record.enemies.length * ENEMY_RECORD_BYTES;
  const w = begin(size, PART_ACTORS, record);
  put32(w, record.rng);
  put32(w, record.nextId);
  put8(w, record.phase);
  put16(w, record.wave);
  put8(w, record.waveFlags);
  put8(w, record.waveMutator);
  put32(w, record.score);
  put16(w, record.combo);

  put8(w, record.players.length);
  for (const p of record.players) {
    put8(w, p.slot);
    put8(w, p.cls);
    putF32(w, p.x);
    putF32(w, p.y);
    put16(w, p.facing);
    put16(w, p.hp);
    put16(w, p.maxHp);
    put16(w, p.stamina);
    put16(w, p.level);
    put32(w, p.gold);
    put32(w, p.xp);
    put8(w, p.flags);
  }

  put16(w, record.enemies.length);
  for (const e of record.enemies) {
    put32(w, e.id);
    put16(w, e.x);
    put16(w, e.y);
    put16(w, e.hp);
    put16(w, e.maxHp);
    put8(w, e.type);
    put8(w, e.elite);
    put8(w, e.bossState);
    put8(w, e.flags);
  }
  return w.buffer;
}

function encodeProjectiles(record: SnapshotRecord): ArrayBuffer {
  const size = SNAPSHOT_HEADER_BYTES
    + 2 + record.bullets.length * BULLET_RECORD_BYTES
    + 2 + record.enemyBullets.length * ENEMY_BULLET_RECORD_BYTES;
  const w = begin(size, PART_PROJECTILES, record);
  put16(w, record.bullets.length);
  for (const b of record.bullets) {
    put16(w, b.x);
    put16(w, b.y);
    put16(w, b.angle);
    put8(w, b.type);
    put8(w, b.ownerSlot);
  }
  put16(w, record.enemyBullets.length);
  for (const b of record.enemyBullets) {
    put16(w, b.x);
    put16(w, b.y);
    putI8(w, b.vx);
    putI8(w, b.vy);
  }
  return w.buffer;
}

function encodePickups(record: SnapshotRecord): ArrayBuffer {
  const size = SNAPSHOT_HEADER_BYTES
    + 2 + record.coins.length * PICKUP_RECORD_BYTES
    + 2 + record.potions.length * PICKUP_RECORD_BYTES
    + 2 + record.chests.length * CHEST_RECORD_BYTES;
  const w = begin(size, PART_PICKUPS, record);
  put16(w, record.coins.length);
  for (const c of record.coins) { put16(w, c.x); put16(w, c.y); }
  put16(w, record.potions.length);
  for (const p of record.potions) { put16(w, p.x); put16(w, p.y); }
  put16(w, record.chests.length);
  for (const c of record.chests) { put16(w, c.x); put16(w, c.y); put8(w, c.state); }
  return w.buffer;
}

/**
 * The three messages, always three, one per entry of SNAPSHOT_PART.
 *
 * Always three even when two of them are empty: a fixed set of parts is what
 * lets a receiver index them by `part` without negotiating a manifest first,
 * and an empty part costs 14 bytes.
 */
export function encodeSnapshot(record: SnapshotRecord): ArrayBuffer[] {
  return [encodeActors(record), encodeProjectiles(record), encodePickups(record)];
}

// ── Bytes -> record ─────────────────────────────────────────────────────────

/** A read cursor, carrying the length so every read can be bounded by it. */
type Reader = { view: DataView; length: number; at: number };

function need(r: Reader, bytes: number): void {
  if (r.at + bytes > r.length) {
    throw new Error(`snapshot truncado: faltam bytes na posição ${r.at}`);
  }
}

function get8(r: Reader): number {
  need(r, 1);
  const value = r.view.getUint8(r.at);
  r.at += 1;
  return value;
}

function getI8(r: Reader): number {
  need(r, 1);
  const value = r.view.getInt8(r.at);
  r.at += 1;
  return value;
}

function get16(r: Reader): number {
  need(r, 2);
  const value = r.view.getUint16(r.at, true);
  r.at += 2;
  return value;
}

function get32(r: Reader): number {
  need(r, 4);
  const value = r.view.getUint32(r.at, true);
  r.at += 4;
  return value;
}

function getF32(r: Reader): number {
  need(r, 4);
  const value = r.view.getFloat32(r.at, true);
  r.at += 4;
  return value;
}

/**
 * Reads a declared count and refuses it if the received bytes could not hold
 * that many records — BEFORE anything is allocated (T-3-08).
 *
 * `room` is the most records the remaining bytes could possibly carry, exactly
 * as `decodeLog` computes it for the input log (inputCodec.ts:402-428). It
 * turns "allocate for whatever the header claims" into "allocate for what was
 * actually sent", which is the difference between a malformed message and a
 * remote peer handing this process a 60000-element array out of ten bytes.
 */
function readCount(r: Reader, recordBytes: number, what: string, wide: boolean): number {
  const declared = wide ? get16(r) : get8(r);
  const room = Math.floor((r.length - r.at) / recordBytes);
  if (declared > room) {
    throw new Error(
      `snapshot declara ${declared} ${what}, mais do que os ${room} que cabem nos bytes recebidos`,
    );
  }
  return declared;
}

/** An index that has to land inside a frozen table, or a Portuguese refusal. */
function checkIndex(value: number, table: readonly string[], what: string): number {
  if (value >= table.length) {
    throw new Error(
      `snapshot traz ${what} com índice ${value}, fora da tabela de ${table.length} entradas`,
    );
  }
  return value;
}

function decodeActors(r: Reader, header: SnapshotHeader): ActorsPart {
  const rng = get32(r);
  const nextId = get32(r);
  const phase = checkIndex(get8(r), PHASE, 'a fase');
  const wave = get16(r);
  const waveFlags = get8(r);
  const waveMutator = checkIndex(get8(r), MUTATOR_KEY, 'o mutador');
  const score = get32(r);
  const combo = get16(r);

  const playerCount = readCount(r, PLAYER_RECORD_BYTES, 'jogadores', false);
  const players: SnapshotPlayer[] = [];
  for (let i = 0; i < playerCount; i++) {
    players.push({
      slot: checkIndex(get8(r), PLAYER_SLOT, 'o slot de jogador'),
      cls: checkIndex(get8(r), CLASS_KEY, 'a classe'),
      x: getF32(r),
      y: getF32(r),
      facing: get16(r),
      hp: get16(r),
      maxHp: get16(r),
      stamina: get16(r),
      level: get16(r),
      gold: get32(r),
      xp: get32(r),
      flags: get8(r),
    });
  }

  const enemyCount = readCount(r, ENEMY_RECORD_BYTES, 'inimigos', true);
  const enemies: SnapshotEnemy[] = [];
  for (let i = 0; i < enemyCount; i++) {
    enemies.push({
      id: get32(r),
      x: get16(r),
      y: get16(r),
      hp: get16(r),
      maxHp: get16(r),
      type: checkIndex(get8(r), ENEMY_TYPE, 'o tipo de inimigo'),
      elite: checkIndex(get8(r), ELITE_TYPE, 'o elite'),
      bossState: checkIndex(get8(r), BOSS_STATE, 'o estado de chefe'),
      flags: get8(r),
    });
  }

  return {
    part: PART_ACTORS, ...header,
    rng, nextId, phase, wave, waveFlags, waveMutator, score, combo,
    players, enemies,
  };
}

function decodeProjectiles(r: Reader, header: SnapshotHeader): ProjectilesPart {
  const bulletCount = readCount(r, BULLET_RECORD_BYTES, 'projéteis', true);
  const bullets: SnapshotBullet[] = [];
  for (let i = 0; i < bulletCount; i++) {
    bullets.push({
      x: get16(r),
      y: get16(r),
      angle: get16(r),
      type: checkIndex(get8(r), ATTACK_KIND, 'o tipo de ataque'),
      ownerSlot: checkIndex(get8(r), PLAYER_SLOT, 'o dono do projétil'),
    });
  }
  const enemyBulletCount = readCount(r, ENEMY_BULLET_RECORD_BYTES, 'projéteis de inimigo', true);
  const enemyBullets: SnapshotEnemyBullet[] = [];
  for (let i = 0; i < enemyBulletCount; i++) {
    enemyBullets.push({ x: get16(r), y: get16(r), vx: getI8(r), vy: getI8(r) });
  }
  return { part: PART_PROJECTILES, ...header, bullets, enemyBullets };
}

function decodePickups(r: Reader, header: SnapshotHeader): PickupsPart {
  const coinCount = readCount(r, PICKUP_RECORD_BYTES, 'moedas', true);
  const coins: SnapshotPickup[] = [];
  for (let i = 0; i < coinCount; i++) coins.push({ x: get16(r), y: get16(r) });

  const potionCount = readCount(r, PICKUP_RECORD_BYTES, 'poções', true);
  const potions: SnapshotPickup[] = [];
  for (let i = 0; i < potionCount; i++) potions.push({ x: get16(r), y: get16(r) });

  const chestCount = readCount(r, CHEST_RECORD_BYTES, 'baús', true);
  const chests: SnapshotChest[] = [];
  for (let i = 0; i < chestCount; i++) {
    chests.push({
      x: get16(r),
      y: get16(r),
      state: checkIndex(get8(r), CHEST_STATE, 'o estado do baú'),
    });
  }
  return { part: PART_PICKUPS, ...header, coins, potions, chests };
}

/**
 * Reads one part, standing alone — no other part required, and none consulted.
 *
 * Everything a hostile message could ask for is refused here, before an array
 * exists: a truncated header, a message that is not a snapshot, a part index
 * outside the frozen table, a baseline this phase does not implement, a
 * declared count larger than the bytes received, and any enum index outside its
 * table.
 */
export function decodeSnapshotPart(bytes: ArrayBuffer): SnapshotPartRecord {
  if (bytes.byteLength < SNAPSHOT_HEADER_BYTES) {
    throw new Error(
      `snapshot truncado: ${bytes.byteLength} bytes, menos que os ${SNAPSHOT_HEADER_BYTES} do cabeçalho`,
    );
  }
  const r: Reader = { view: new DataView(bytes), length: bytes.byteLength, at: 0 };
  const kind = get8(r);
  if (kind !== SNAPSHOT_KIND) {
    throw new Error(`mensagem de kind ${kind} não é um snapshot (esperado ${SNAPSHOT_KIND})`);
  }
  const part = get8(r);
  if (part >= SNAPSHOT_PART.length) {
    throw new Error(
      `snapshot com índice de parte ${part}, fora das ${SNAPSHOT_PART.length} partes conhecidas`,
    );
  }
  const header: SnapshotHeader = { tick: get32(r), baselineTick: get32(r) };
  if (header.baselineTick !== 0) {
    throw new Error(
      `snapshot com baselineTick ${header.baselineTick}: esta fase só implementa o snapshot `
      + 'completo, com baseline 0 (D3-18); o encoder de delta é a fase 4',
    );
  }
  if (part === PART_ACTORS) return decodeActors(r, header);
  if (part === PART_PROJECTILES) return decodeProjectiles(r, header);
  return decodePickups(r, header);
}

/**
 * Reassembles the three parts into one record.
 *
 * "Reassembles" and not "defragments": each part was already complete on its
 * own (D3-19), and this function exists for the caller that happens to hold all
 * three — not because a part means nothing without the others. Phase 4's
 * receiver will call `decodeSnapshotPart` per message and apply what arrives.
 */
export function decodeSnapshot(parts: ArrayBuffer[]): SnapshotRecord {
  if (parts.length !== SNAPSHOT_PART.length) {
    throw new Error(
      `um snapshot completo tem as três partes de SNAPSHOT_PART; recebi ${parts.length}`,
    );
  }
  const decoded = parts.map(decodeSnapshotPart);
  const actors = decoded.find((p): p is ActorsPart => p.part === PART_ACTORS);
  const projectiles = decoded.find((p): p is ProjectilesPart => p.part === PART_PROJECTILES);
  const pickups = decoded.find((p): p is PickupsPart => p.part === PART_PICKUPS);
  if (!actors || !projectiles || !pickups) {
    throw new Error('um snapshot completo precisa das três partes distintas de SNAPSHOT_PART');
  }
  for (const other of [projectiles, pickups]) {
    if (other.tick !== actors.tick) {
      throw new Error(
        `partes de ticks diferentes no mesmo snapshot: ${actors.tick} e ${other.tick}`,
      );
    }
  }
  return {
    tick: actors.tick,
    baselineTick: actors.baselineTick,
    rng: actors.rng,
    nextId: actors.nextId,
    phase: actors.phase,
    wave: actors.wave,
    waveFlags: actors.waveFlags,
    waveMutator: actors.waveMutator,
    score: actors.score,
    combo: actors.combo,
    players: actors.players,
    enemies: actors.enemies,
    bullets: projectiles.bullets,
    enemyBullets: projectiles.enemyBullets,
    coins: pickups.coins,
    potions: pickups.potions,
    chests: pickups.chests,
  };
}
