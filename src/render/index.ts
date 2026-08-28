// index.ts — top-level render compositor. Ported from ORIG/render.js:3-27
// (render()).
//
// Draw order matches the original exactly, line for line:
//   tiles -> torches -> traps -> chests -> coins -> potions -> player
//   bullets -> enemy bullets -> swings -> boss telegraphs -> obstacles ->
//   enemies -> player(s) -> particles -> fog -> float texts
// (confirmed against ORIG/render.js:11-26 in fix round 1 — an earlier
// version of this file grouped the three Fx-owned layers together at the
// end, which is wrong: the original interleaves swings/particles/float
// texts with drawBossTelegraphs/drawObstacles/drawEnemies/drawPlayer/drawFog
// at three separate points, so Fx exposes three draw methods —
// drawSwings/drawParticles/drawFloatTexts — called at their exact positions
// instead of one combined call).
//
// The whole body — including fog and the float texts — sits inside the same
// ctx.translate(shakeOffset) the original wrapped its entire render() body
// in: ORIG/render.js:6 (ctx.save(), before drawTiles) through :27
// (ctx.restore(), after drawFloatTexts). Only the leading clearRect sits
// outside it, exactly as in the original.
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
  drawBullets(ctx, cam, world, fx);
  drawEnemyBullets(ctx, cam, world);
  fx.drawSwings(ctx, cam);
  drawBossTelegraphs(ctx, cam, world);
  drawObstacles(ctx, cam, world);
  drawEnemies(ctx, cam, world);
  for (const id of Object.keys(world.players)) drawPlayer(ctx, cam, world.players[id]);
  fx.drawParticles(ctx, cam);
  drawFog(ctx, cam, world);
  fx.drawFloatTexts(ctx, cam);

  ctx.restore(); // shake transform

  void alpha; // interpolation of remote entities arrives in Marco 2
}
