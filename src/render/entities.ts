// entities.ts — draws everything but the tilemap. drawPlayer/drawHeldWeapon
// were ported in Task 10 from ORIG/render.js:258-310; Task 17 adds the rest
// of ORIG/render.js's entity drawing (enemies, bullets, loot, obstacles,
// traps, torches, fog, boss telegraphs).
//
// Two changes from the original apply uniformly, and no others:
//  1. every coordinate goes through worldToScreen(cam, x, y) before drawing;
//  2. every entity-drawing loop begins with a culling test —
//     `if (!isVisible(cam, e.x, e.y, 96)) continue;` — so nothing outside
//     the viewport (with slack) costs a draw call. With a 2400x1600 world
//     this is what keeps a full arena at 60fps.
//
// drawHeldWeapon's swing-arc animation (ORIG/render.js:286-290) still reads
// no swing state: it used to reach into the global `meleeSwings` array, but
// that array no longer exists — swings live in render/fx.ts, fed by the
// sim's 'swing' event, and Fx.draw (not drawHeldWeapon) is what paints them.
// The weapon keeps falling back to the plain facing angle, exactly as the
// original did whenever no swing was in flight.
import { CLASS_DEFS, nearestPlayer, trapFrameAt } from '@dg2/sim';
import type { Player, PlayerSlot, World } from '@dg2/sim';
import { worldToScreen, isVisible, type Camera } from './camera';
import {
  ANIMS, WEAPON_SPRITES, SHEET, playerSheet,
  COIN_FRAMES, FLASK_RED, CHEST_FRAMES, CHEST_EMPTY,
  OBSTACLE_SPRITES, SPIKE_FRAMES, type Frame,
} from './sprites';
import { torchPositions } from './tilemap';
import type { Fx } from './fx';

/**
 * How many screen pixels one source pixel of the current spritesheet covers.
 *
 * Declared here, not imported from the sim: this is a DRAWING decision and the
 * sim has no opinion on it (D-19). The sim's `DEFAULT_ENTITY_SCALE` happens to
 * carry the same number today, but it means something else — it is the default
 * `Enemy.scale`, world state a replay can observe — and the two must be free to
 * move apart. Phase 7 is when they do: the new art is 32x48 authored at scale
 * 1, so THIS constant becomes 1 and the character keeps the exact screen
 * footprint it has now (16x28 at 2). That edit will not touch packages/sim and
 * so will not change SIM_VERSION.
 *
 * ORIG/config.js:5.
 */
const SPRITE_SCALE = 2;

/** Draws a frame centered on (x, y) in SCREEN space, optionally mirrored horizontally. */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  x: number,
  y: number,
  flip: boolean,
  scale = SPRITE_SCALE,
  sheet: CanvasImageSource = SHEET,
): void {
  const [sx, sy, sw, sh] = frame;
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

export function drawPlayer(ctx: CanvasRenderingContext2D, cam: Camera, p: Player): void {
  if (p.invincible > 0 && Math.floor(p.invincible / 80) % 2 === 0) return; // blink

  const animTick = Math.floor(performance.now() / 140) % 4;
  const animSet  = ANIMS[CLASS_DEFS[p.cls].anim];
  const frame    = (p.moving ? animSet.run : animSet.idle)[animTick];
  const flip     = Math.cos(p.facing) < 0; // face the aim direction
  const s        = worldToScreen(cam, p.x, p.y);

  drawSprite(ctx, frame, s.x, s.y, flip, SPRITE_SCALE, playerSheet);
  drawHeldWeapon(ctx, cam, p);

  // aim line (faint)
  ctx.strokeStyle = 'rgba(102,204,255,0.12)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x + Math.cos(p.facing) * 60, s.y + Math.sin(p.facing) * 60);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Held weapon, rotated toward the aim (Fx.draw paints the swing arc separately). */
function drawHeldWeapon(ctx: CanvasRenderingContext2D, cam: Camera, p: Player): void {
  if (!p.weapon.sprite) return; // gun classes carry the weapon in the sprite itself
  const [sx, sy, sw, sh] = WEAPON_SPRITES[p.weapon.sprite];
  const angle = p.facing;

  // weapons have very different sprite heights (sword 21px, staff 30px);
  // normalize them all to the same on-screen size
  const targetH = 30;
  const scale   = targetH / sh;
  const dist    = 17;
  const side    = 12;             // perpendicular shift: held in the hand, away from the body
  const handY   = p.y + 10;
  const ox = Math.cos(angle) * dist + Math.cos(angle + Math.PI / 2) * side;
  const oy = Math.sin(angle) * dist + Math.sin(angle + Math.PI / 2) * side;
  const s = worldToScreen(cam, p.x + ox, handY + oy);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle + Math.PI / 2); // sprites point up
  ctx.drawImage(SHEET, sx, sy, sw, sh,
    -sw * scale / 2, -sh * scale / 2,
    sw * scale, sh * scale);
  ctx.restore();
}

// FOG mutator: darkness closes in, leaving a lit circle around the hero.
// ORIG/render.js:31-41. Not an entity loop — no culling test (matches the
// original, which had none here either).
export function drawFog(ctx: CanvasRenderingContext2D, cam: Camera, world: World, local: PlayerSlot): void {
  if (world.waveMutator !== 'fog') return;
  // The lit circle follows the VIEWER, not whoever happens to be first in the
  // Record. With one local player those coincide; with four they do not, and
  // every other viewer-relative call (updateHud, syncScreens) already takes
  // the slot explicitly.
  const target = world.players[local];
  if (!target) return;
  const r = 190;
  const s = worldToScreen(cam, target.x, target.y);
  const g = ctx.createRadialGradient(s.x, s.y, r * 0.45, s.x, s.y, r * 2.2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.w, cam.h);
}

// Torches (glow spots at room edges). ORIG/render.js:56-87. Positions come
// from tilemap.ts's buildTilemap(), computed once for the whole world.
export function drawTorches(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  void world; // torch layout is static world geometry, independent of world state
  const flicker = 0.85 + Math.sin(performance.now() / 120) * 0.15 + Math.random() * 0.03;
  for (const t of torchPositions) {
    if (!isVisible(cam, t.x, t.y, 96)) continue;
    const p = worldToScreen(cam, t.x, t.y);
    const r = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 90 * flicker);
    r.addColorStop(0, `rgba(255,160,0,${0.18 * flicker})`);
    r.addColorStop(0.5, `rgba(255,100,0,${0.08 * flicker})`);
    r.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r;
    ctx.fillRect(p.x - 90, p.y - 90, 180, 180);

    // torch icon (2px dot)
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.fillStyle = '#ff8c00';
    ctx.fillRect(p.x - 1, p.y - 4, 2, 2);
  }
}

// Bullets. ORIG/render.js:88-140. The fireball's per-frame trail particle
// (ORIG/render.js:126: `spawnParticles(b.x, b.y, orange-or-red, 1)`, called
// straight from the draw loop every frame a fireball is on screen) needs a
// live Fx handle to push a particle from inside a draw call — per fix round
// 1, drawBullets takes `fx` for exactly this, reusing Fx.handle rather than
// duplicating its particle-creation logic in a second method.
export function drawBullets(ctx: CanvasRenderingContext2D, cam: Camera, world: World, fx: Fx): void {
  for (const b of world.bullets) {
    if (!isVisible(cam, b.x, b.y, 96)) continue;
    const p = worldToScreen(cam, b.x, b.y);

    if (b.type === 'arrow') {
      const [sx, sy, sw, sh] = WEAPON_SPRITES.arrow;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(b.angle + Math.PI / 2); // sprite points up
      ctx.drawImage(SHEET, sx, sy, sw, sh,
        -sw * SPRITE_SCALE / 2, -sh * SPRITE_SCALE / 2,
        sw * SPRITE_SCALE, sh * SPRITE_SCALE);
      ctx.restore();
    } else if (b.type === 'bullet') {
      // energy tracer
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(b.angle);
      ctx.shadowColor = '#66ccff';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#aef';
      ctx.fillRect(-7, -1.5, 14, 3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(2, -1, 5, 2);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else if (b.type === 'fireball') {
      const pulse = 1 + Math.sin(performance.now() / 60) * 0.15;
      ctx.shadowColor = '#ff4500';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // fire trail — ORIG/render.js:126. World-space coordinates (b.x, b.y),
      // not the screen-space p.x/p.y above: Fx stores particles in world
      // space and converts at draw time, same as every other particle.
      fx.handle({
        t: 'particles', x: b.x, y: b.y,
        color: Math.random() < 0.5 ? '#ff8c00' : '#ff4500',
        count: 1,
      });
    } else {
      // magic bolt
      ctx.shadowColor = '#ff8c00';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// Arena obstacles. ORIG/render.js:141-149.
export function drawObstacles(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  for (const o of world.obstacles) {
    if (!isVisible(cam, o.x, o.y, 96)) continue;
    if (o.dead) continue;
    const frame = OBSTACLE_SPRITES[o.kind];
    // bottom-anchored: sprite bottom sits at the collision circle's south edge
    const p = worldToScreen(cam, o.x, o.y + o.r - frame[3]);
    drawSprite(ctx, frame, p.x, p.y, false);
  }
}

// Spike traps. ORIG/render.js:150-156. The animation frame comes from the
// sim's own clock (world.tick), not the wall clock: trapFrameAt (T4) is also
// what combat uses to decide whether the spikes are dangerous, so the
// drawing must agree with that, not run on an independent render-side timer.
export function drawTraps(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  for (const tr of world.traps) {
    if (!isVisible(cam, tr.x, tr.y, 96)) continue;
    const frame = SPIKE_FRAMES[trapFrameAt(world, tr)];
    const p = worldToScreen(cam, tr.x, tr.y);
    drawSprite(ctx, frame, p.x, p.y, false);
  }
}

// Charge telegraph: red warning lane in front of the boss. ORIG/render.js:157-174.
export function drawBossTelegraphs(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  for (const e of world.enemies) {
    if (!isVisible(cam, e.x, e.y, 96)) continue;
    if (e.dead || e.bossState !== 'telegraph') continue;
    const len = 360;
    const pulse = 0.18 + Math.abs(Math.sin(performance.now() / 90)) * 0.16;
    const from = worldToScreen(cam, e.x, e.y);
    const to = worldToScreen(cam, e.x + e.chargeDir.x * len, e.y + e.chargeDir.y * len);
    ctx.save();
    ctx.strokeStyle = `rgba(231, 76, 60, ${pulse})`;
    ctx.lineWidth = e.w * 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }
}

// Enemy projectiles: dark pulsing orbs. ORIG/render.js:175-189.
export function drawEnemyBullets(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  for (const b of world.enemyBullets) {
    if (!isVisible(cam, b.x, b.y, 96)) continue;
    const p = worldToScreen(cam, b.x, b.y);
    ctx.shadowColor = '#9b59b6';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#6c3483';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d2a0e8';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// Enemies. ORIG/render.js:218-256. `player.x < e.x` in the original assumed
// the single global hero; nearestPlayer (T12) is its multiplayer-ready
// replacement, already used the same way throughout sim/enemies.ts.
export function drawEnemies(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  const animTick = Math.floor(performance.now() / 140) % 4;
  for (const e of world.enemies) {
    if (!isVisible(cam, e.x, e.y, 96)) continue;
    if (e.dead) continue;

    const set = ANIMS[e.anim][e.moving ? 'run' : 'idle'];
    const frame = set[animTick];
    const target = nearestPlayer(world, e.x, e.y);
    const flip = target !== null && target.x < e.x; // face the player

    // elite champions wear a pulsing colored halo
    if (e.elite && e.eliteTint) {
      ctx.shadowColor = e.eliteTint;
      ctx.shadowBlur = 12 + Math.sin(performance.now() / 220 + e.x) * 6;
    }
    if (e.hitFlash > 0) ctx.filter = 'brightness(2.5) saturate(40%)';
    else if (e.enraged) {
      ctx.filter = `saturate(2.2) hue-rotate(-25deg) brightness(${(1.15 + Math.sin(performance.now() / 90) * 0.15).toFixed(2)})`;
    } else if (e.fusing) {
      // exploder about to blow: accelerating red strobe
      const strobe = Math.sin(performance.now() / Math.max(20, e.fuseT / 8)) > 0;
      if (strobe) ctx.filter = 'brightness(2.2) sepia(1) saturate(6) hue-rotate(-50deg)';
    }
    const p = worldToScreen(cam, e.x, e.y);
    drawSprite(ctx, frame, p.x, p.y, flip, e.scale);
    ctx.filter = 'none';
    ctx.shadowBlur = 0;

    // HP bar (bosses use the big top bar instead — a later task)
    if (!e.boss && e.hp < e.maxHp) {
      const bw = e.w + 6;
      const bx = p.x - bw / 2;
      const by = p.y - e.h / 2 - 9;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#27ae60' : '#e74c3c';
      ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 4);
    }
  }
}

// Coins. ORIG/render.js:311-322.
export function drawCoins(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  const animTick = Math.floor(performance.now() / 140) % 4;
  for (const c of world.coins) {
    if (!isVisible(cam, c.x, c.y, 96)) continue;
    if (c.dead) continue;
    const bobY = Math.sin(c.bob) * 2;
    const p = worldToScreen(cam, c.x, c.y + bobY);
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 6;
    drawSprite(ctx, COIN_FRAMES[animTick], p.x, p.y, false);
    ctx.shadowBlur = 0;
  }
}

// Potions. ORIG/render.js:323-334.
export function drawPotions(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  for (const pt of world.potions) {
    if (!isVisible(cam, pt.x, pt.y, 96)) continue;
    if (pt.dead) continue;
    const bobY = Math.sin(pt.bob) * 2;
    const p = worldToScreen(cam, pt.x, pt.y + bobY);
    ctx.shadowColor = '#e74c3c';
    ctx.shadowBlur = 8;
    drawSprite(ctx, FLASK_RED, p.x, p.y, false);
    ctx.shadowBlur = 0;
  }
}

// Chests. ORIG/render.js:335-356.
export function drawChests(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  for (const ch of world.chests) {
    if (!isVisible(cam, ch.x, ch.y, 96)) continue;

    let frame: Frame;
    if (ch.state === 'closed') frame = CHEST_FRAMES[0];
    else if (ch.state === 'opening') frame = CHEST_FRAMES[Math.min(2, Math.floor(ch.timer / 120))];
    else frame = CHEST_EMPTY;

    if (ch.state === 'closed') {
      // soft golden shimmer so it catches the eye
      const glow = 0.5 + Math.sin(performance.now() / 300) * 0.3;
      ctx.shadowColor = `rgba(255,215,0,${glow})`;
      ctx.shadowBlur = 10;
    } else if (ch.state === 'looted') {
      ctx.globalAlpha = Math.max(0, ch.fade);
    }
    const p = worldToScreen(cam, ch.x, ch.y);
    drawSprite(ctx, frame, p.x, p.y, false);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
