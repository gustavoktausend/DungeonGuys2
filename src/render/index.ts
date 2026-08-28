// index.ts — top-level render compositor. Ported from ORIG/render.js:3-27
// (render()).
//
// Draw order matches the original exactly, line for line: tiles, torches,
// traps, chests, coins, potions, player bullets, enemy bullets, boss
// telegraphs, obstacles, enemies, player(s), fog, then Fx (swings, particles,
// float texts). The whole body — including fog — sits inside the same
// ctx.translate(shakeOffset) the original wrapped its entire render() body
// in (ORIG/render.js:6-27); only the leading clearRect sits outside it,
// exactly as in the original.
//
// One necessary deviation: Fx.draw paints swings, particles and float texts
// together in a single call (that's the interface T17 specifies — Fx has no
// per-effect draw methods), whereas the original interleaves those three
// with drawBossTelegraphs/drawObstacles/drawEnemies/drawPlayer/drawFog at
// three separate points (render.js:19, :24, :26). Fx.draw is placed last, so
// float texts (the most important to keep legible) land above every entity
// and above fog exactly as before; the trade-off is that particles now also
// sit above fog (originally below it) and swings above obstacles/enemies/
// player (originally below them). Flagged in task-17-report.md.
import { drawTiles } from './tilemap';
import {
  drawPlayer, drawFog, drawTorches, drawBullets, drawObstacles,
  drawTraps, drawBossTelegraphs, drawEnemyBullets, drawEnemies,
  drawCoins, drawPotions, drawChests,
} from './entities';
import type { Camera } from './camera';
import type { World } from '../sim/types';
import type { Fx } from './fx';

export function render(world: World, cam: Camera, alpha: number, ctx: CanvasRenderingContext2D, fx: Fx): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cam.w, cam.h);

  ctx.save();
  const shake = fx.shakeOffset();
  ctx.translate(shake.x, shake.y);

  drawTiles(ctx, cam);
  drawTorches(ctx, cam, world);
  drawTraps(ctx, cam, world);
  drawChests(ctx, cam, world);
  drawCoins(ctx, cam, world);
  drawPotions(ctx, cam, world);
  drawBullets(ctx, cam, world);
  drawEnemyBullets(ctx, cam, world);
  drawBossTelegraphs(ctx, cam, world);
  drawObstacles(ctx, cam, world);
  drawEnemies(ctx, cam, world);
  for (const id of Object.keys(world.players)) drawPlayer(ctx, cam, world.players[id]);
  drawFog(ctx, cam, world);
  fx.draw(ctx, cam);

  ctx.restore(); // shake transform

  void alpha; // interpolation of remote entities arrives in Marco 2
}
