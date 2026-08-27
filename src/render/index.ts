// index.ts — top-level render compositor. Ported from ORIG/render.js:1-26
// (render()), trimmed to what exists so far: tiles and the local player.
import { drawTiles } from './tilemap';
import { drawPlayer } from './entities';
import type { Camera } from './camera';
import type { World } from '../sim/types';

export function render(world: World, cam: Camera, alpha: number, ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cam.w, cam.h);
  drawTiles(ctx, cam);
  for (const id of Object.keys(world.players)) drawPlayer(ctx, cam, world.players[id]);
  void alpha; // interpolation of remote entities arrives in Marco 2
}
