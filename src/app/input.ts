// input.ts — turns keyboard/mouse/touch plus world context into an InputState.
// This is the piece that keeps sim/ pure: everything keyboard, mouse, touch,
// auto-aim and "hold to attack" is resolved here.
//
// Auto-aim and the touch auto-attack depend on an enemy list and land in
// Task 12, when enemies exist — this file gains `nearestEnemy(world, p)` then.
import { worldToScreen, type Camera } from '../render/camera';
import type { InputState, World } from '../sim/types';

export function createInput(canvas: HTMLCanvasElement, world: World, localId: string, cam: Camera) {
  const keys: Record<string, boolean> = {};
  const mouse = { x: 0, y: 0 };
  let mouseDown = false;
  let specialQueued = false;

  addEventListener('keydown', e => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (e.code === 'KeyE') specialQueued = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) specialQueued = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  /** Aim at the mouse, or at the nearest enemy when auto-aim is on. */
  function aimAngle(): number {
    const p = world.players[localId];
    if (!p) return 0;
    const s = worldToScreen(cam, p.x, p.y);
    return Math.atan2(mouse.y - s.y, mouse.x - s.x);
  }

  return {
    collect(tick: number): Record<string, InputState> {
      const p = world.players[localId];
      if (!p) return {};
      let x = 0, y = 0;
      if (keys['KeyW'] || keys['ArrowUp']) y -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) y += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) x += 1;
      if (x !== 0 || y !== 0) {
        const len = Math.hypot(x, y);
        x /= len; y /= len;
      }
      const input: InputState = {
        tick,
        move: { x, y },
        aim: aimAngle(),
        attack: mouseDown || !!keys['Space'] || !!keys['KeyZ'],
        special: specialQueued,
        sprint: !!(keys['ShiftLeft'] || keys['ShiftRight']),
      };
      specialQueued = false; // edge-triggered: one cast per press
      return { [localId]: input };
    },
  };
}
