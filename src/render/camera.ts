// camera.ts — the viewport into the fixed world. Pure math, unit-testable.
import { WORLD } from '@dg2/sim';

export type Camera = { x: number; y: number; w: number; h: number };

export function createCamera(): Camera {
  return { x: 0, y: 0, w: 0, h: 0 };
}

/**
 * Centres on target, clamped to the world. When the viewport is larger than
 * the world, the world is centred instead (negative camera origin).
 */
export function updateCamera(cam: Camera, target: { x: number; y: number }, viewW: number, viewH: number): void {
  cam.w = viewW;
  cam.h = viewH;
  cam.x = viewW >= WORLD.w ? (WORLD.w - viewW) / 2 : clamp(target.x - viewW / 2, 0, WORLD.w - viewW);
  cam.y = viewH >= WORLD.h ? (WORLD.h - viewH) / 2 : clamp(target.y - viewH / 2, 0, WORLD.h - viewH);
}

export function worldToScreen(cam: Camera, x: number, y: number): { x: number; y: number } {
  return { x: x - cam.x, y: y - cam.y };
}

/** Culling test: is this world point inside the viewport, with `pad` slack? */
export function isVisible(cam: Camera, x: number, y: number, pad = 0): boolean {
  return x >= cam.x - pad && x <= cam.x + cam.w + pad
      && y >= cam.y - pad && y <= cam.y + cam.h + pad;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
