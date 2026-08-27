// tilemap.ts — pre-renders the whole world's floor + walls once to an
// offscreen canvas; drawTiles() then blits the visible slice of it every
// frame. Ported from ORIG/engine.js:62-158 (buildTileMap + renderFloorCanvas).
//
// T6 changes: dimensions come from WORLD, not from the canvas, and this runs
// once per run instead of being rebuilt on every resize — resizing the
// window only moves the camera's viewport over the same pre-rendered world.
// Tile variation still uses Math.random(): it is cosmetic and lives in
// render/, not in the seeded sim RNG.
import { TILE, WORLD } from '../sim/constants';
import { SHEET, WALL_TILES, FLOOR_TILES, type Frame } from './sprites';
import type { Camera } from './camera';

let floorCanvas: HTMLCanvasElement | null = null;

/**
 * Builds the whole world's tiles into an offscreen canvas. Call once per run,
 * after loadSprites() has resolved. ~2400x1600x4 bytes ≈ 15 MB — expected and
 * acceptable for a fixed-size world.
 */
export function buildTilemap(): void {
  if (!SHEET.complete || SHEET.naturalWidth === 0) { floorCanvas = null; return; }

  const W = WORLD.w, H = WORLD.h;
  const cols = Math.ceil(W / TILE) + 1;
  const rows = Math.ceil(H / TILE) + 1;

  let canvas: HTMLCanvasElement;
  let f: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    f = canvas.getContext('2d');
  } catch {
    floorCanvas = null;
    return;
  }
  if (!f) { floorCanvas = null; return; }
  f.imageSmoothingEnabled = false;

  const blit = ([sx, sy, sw, sh]: Frame, x: number, y: number) =>
    f!.drawImage(SHEET, sx, sy, sw, sh, x, y, TILE, TILE);

  // floor covers everything; walls are drawn over it, anchored to the borders
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // mostly plain floor; light variants only, heavy cracks are too noisy
      const v = Math.random();
      const tile = v < 0.88
        ? FLOOR_TILES[0]
        : FLOOR_TILES[1 + Math.floor(v * 31) % 5];
      blit(tile, c * TILE, r * TILE);
    }
  }

  // darken the floor slightly so torch glow stands out
  f.fillStyle = 'rgba(0,0,10,0.25)';
  f.fillRect(0, 0, W, H);

  // ── walls ──
  // top: cap row + face row (banner / crumbled hole flavor on the face)
  for (let x = 0; x < W; x += TILE) {
    blit(WALL_TILES.top, x, 0);
    const v = Math.random();
    const face = v < 0.06 ? WALL_TILES.banner_red
               : v < 0.12 ? WALL_TILES.banner_blue
               : v < 0.18 ? WALL_TILES.hole
               : WALL_TILES.mid;
    blit(WALL_TILES.mid, x, TILE);
    blit(face, x, TILE);
  }
  blit(WALL_TILES.top_left,  0,     0);
  blit(WALL_TILES.left,      0,     TILE);
  blit(WALL_TILES.top_right, W - TILE, 0);
  blit(WALL_TILES.right,     W - TILE, TILE);

  // bottom: cap row + face row
  for (let x = 0; x < W; x += TILE) {
    blit(WALL_TILES.top, x, H - TILE * 2);
    blit(WALL_TILES.mid, x, H - TILE);
  }

  // side columns between top face and bottom cap
  for (let y = TILE * 2; y < H - TILE * 2; y += TILE) {
    blit(WALL_TILES.edge_left,  0,     y);
    blit(WALL_TILES.edge_right, W - TILE, y);
  }
  blit(WALL_TILES.edge_bot_left,  0,     H - TILE * 2);
  blit(WALL_TILES.edge_bot_right, W - TILE, H - TILE * 2);

  floorCanvas = canvas;
}

/** Blits the camera's visible slice of the pre-rendered world in one draw call. */
export function drawTiles(ctx: CanvasRenderingContext2D, cam: Camera): void {
  if (!floorCanvas) return;
  ctx.drawImage(floorCanvas, cam.x, cam.y, cam.w, cam.h, 0, 0, cam.w, cam.h);
}
