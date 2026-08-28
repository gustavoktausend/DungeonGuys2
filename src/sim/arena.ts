// arena.ts — per-run layout (columns, crates, spike traps) and circle collision.
import { emit } from './world';
import { WORLD } from './constants';
import type { Obstacle, Trap, World } from './types';

/** The original tuned its counts for a ~1280x720 arena; keep that density. */
const AREA_SCALE = (WORLD.w * WORLD.h) / (1280 * 720);

/**
 * Sentinel hp for indestructible obstacles (columns). NOT `Infinity`:
 * `World` has to survive `JSON.parse(JSON.stringify(world))` (see the
 * `hitIds` note in types.ts — serializability is a stated property of the
 * type, and Marco 1's snapshots are built on it), and JSON turns `Infinity`
 * into `null`, after which `o.hp -= dmg` is `NaN`. MAX_SAFE_INTEGER survives
 * the round trip AND keeps `damageCrate`'s `o.hp <= 0` false for any damage
 * this game can deal, so a column stays indestructible even if a caller ever
 * drops the `kind === 'crate'` guard.
 */
export const INDESTRUCTIBLE_HP = Number.MAX_SAFE_INTEGER;

/** A fresh random layout each run: solid columns, breakable crates, spike traps. */
export function generateArena(world: World): void {
  world.obstacles = [];
  world.traps = [];

  const { rng, play } = world;
  const margin = 110;
  const cx = WORLD.w / 2, cy = WORLD.h / 2;

  const spots: { x: number; y: number }[] = [];
  const want = Math.round((4 + rng.int(3)) * AREA_SCALE);
  let attempts = 0;
  while (spots.length < want && attempts++ < want * 60) {
    const x = play.left + margin + rng.next() * (play.right - play.left - margin * 2);
    const y = play.top + margin + rng.next() * (play.bottom - play.top - margin * 2);
    const dcx = x - cx, dcy = y - cy;
    if (Math.sqrt(dcx * dcx + dcy * dcy) < 150) continue;    // keep the spawn clear
    if (spots.some(s => {
      const dx = x - s.x, dy = y - s.y;
      return Math.sqrt(dx * dx + dy * dy) < 110;
    })) continue;
    spots.push({ x, y });
  }

  spots.forEach((s, i) => {
    if (i < 2 || rng.chance(0.5)) {
      world.obstacles.push({ kind: 'column', x: s.x, y: s.y, r: 16, hp: INDESTRUCTIBLE_HP, dead: false });
    } else {
      world.obstacles.push({ kind: 'crate', x: s.x, y: s.y, r: 14, hp: 40, dead: false });
    }
  });

  const trapCount = Math.round((2 + rng.int(2)) * AREA_SCALE);
  attempts = 0;
  while (world.traps.length < trapCount && attempts++ < trapCount * 60) {
    const x = play.left + margin + rng.next() * (play.right - play.left - margin * 2);
    const y = play.top + margin + rng.next() * (play.bottom - play.top - margin * 2);
    const dcx = x - cx, dcy = y - cy;
    if (Math.sqrt(dcx * dcx + dcy * dcy) < 140) continue;
    if (world.obstacles.some(o => {
      const dx = x - o.x, dy = y - o.y;
      return Math.sqrt(dx * dx + dy * dy) < 90;
    })) continue;
    if (world.traps.some(t => {
      const dx = x - t.x, dy = y - t.y;
      return Math.sqrt(dx * dx + dy * dy) < 130;
    })) continue;
    world.traps.push({ x, y, offset: rng.next() * 4 });
  }
}

/** Pushes a circular entity out of solid obstacles. */
export function resolveObstacles(ent: { x: number; y: number }, radius: number, world: World): void {
  for (const o of world.obstacles) {
    if (o.dead) continue;
    const dx = ent.x - o.x, dy = ent.y - o.y;
    const d = Math.sqrt(dx * dx + dy * dy), min = o.r + radius;
    if (d < min && d > 0.001) {
      ent.x = o.x + (dx / d) * min;
      ent.y = o.y + (dy / d) * min;
    }
  }
}

/** 450ms per frame in the original; 450 / 16.667 = 27 ticks (T4). */
const TRAP_TICKS_PER_FRAME = 27;

export function trapFrameAt(world: World, tr: Trap): number {
  return Math.floor(world.tick / TRAP_TICKS_PER_FRAME + tr.offset) % 4;
}

/** Spikes are out on frames 2 and 3. */
export function trapDangerous(world: World, tr: Trap): boolean {
  return trapFrameAt(world, tr) >= 2;
}

export function damageCrate(world: World, o: Obstacle, dmg: number): void {
  o.hp -= dmg;
  emit(world, { t: 'particles', x: o.x, y: o.y, color: '#8B6914', count: 5 });
  if (o.hp <= 0 && !o.dead) {
    o.dead = true;
    emit(world, { t: 'sfx', name: 'chest' });
    emit(world, { t: 'particles', x: o.x, y: o.y, color: '#b8945a', count: 14 });
    const n = 1 + world.rng.int(2);
    for (let i = 0; i < n; i++) {
      const a = world.rng.next() * Math.PI * 2;
      world.coins.push({
        x: o.x, y: o.y,
        vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
        dead: false, bob: world.rng.next() * 6,
      });
    }
  }
}

/**
 * ORIG/items.js:354-358. `(rx, ry)` is the rectangle's CENTRE, not its
 * top-left corner — both original callers (combat.js:375, entities.js:419)
 * pass an enemy's centre (e.x, e.y).
 */
export function rectCircle(
  rx: number, ry: number, rw: number, rh: number,
  cx: number, cy: number, cr: number,
): boolean {
  const nearX = Math.max(rx - rw / 2, Math.min(cx, rx + rw / 2));
  const nearY = Math.max(ry - rh / 2, Math.min(cy, ry + rh / 2));
  const dx = cx - nearX, dy = cy - nearY;
  return dx * dx + dy * dy < cr * cr;
}
