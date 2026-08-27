// entities.ts — draws the player. Ported from ORIG/render.js:258-310
// (drawPlayer, drawHeldWeapon). The only change is applying the camera:
// every draw coordinate goes through worldToScreen first, so the sim's
// world-space coordinates never change when the window resizes (T6).
//
// drawHeldWeapon's swing-arc animation (ORIG/render.js:279-283) reads a
// `meleeSwings` list that doesn't exist yet — combat lands in a later task.
// Until then the weapon is drawn at the plain facing angle, which is exactly
// what the original falls back to whenever no swing is in flight.
//
// Everything besides the player (enemies, coins, chests, bullets, ...)
// arrives in Task 17.
import { SPRITE_SCALE } from '../sim/constants';
import { CLASS_DEFS } from '../sim/defs/classes';
import type { Player } from '../sim/types';
import { worldToScreen, type Camera } from './camera';
import { ANIMS, WEAPON_SPRITES, SHEET, playerSheet, type Frame } from './sprites';

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

/** Held weapon, rotated toward the aim (a future task adds the swing arc back in). */
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
