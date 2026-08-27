// input.ts — turns keyboard/mouse/touch plus world context into an InputState.
// This is the piece that keeps sim/ pure: everything keyboard, mouse, touch,
// auto-aim and "hold to attack" is resolved here.
//
// `autoAim` and `touchActive` are placeholders: ORIG/ui.js:291-368 (the real
// touch joystick/buttons) and :369-382 (the persisted auto-aim toggle) are
// ported in Task 20 (`src/ui/touch.ts`, `src/ui/settings.ts`), which is
// expected to flip these on. `nearestEnemy`/`aimAngle` (ORIG/ui.js:385-403)
// land now, since they need the enemy list Task 12 introduces.
import { worldToScreen, type Camera } from '../render/camera';
import type { Enemy, InputState, World } from '../sim/types';

export function createInput(canvas: HTMLCanvasElement, world: World, localId: string, cam: Camera) {
  const keys: Record<string, boolean> = {};
  const mouse = { x: 0, y: 0 };
  let mouseDown = false;
  let specialQueued = false;
  // Task 20 wires these to the real settings toggle and touch controls.
  const autoAim = false;
  const touchActive = false;

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

  /** Closest living enemy to `p`, or null if there are none. */
  function nearestEnemy(p: { x: number; y: number }): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /**
   * Aim at the nearest enemy when auto-aim is on (always on for touch —
   * there's no mouse to aim with), else at the mouse.
   */
  function aimAngle(): number {
    const p = world.players[localId];
    if (!p) return 0;
    if (autoAim || touchActive) {
      const e = nearestEnemy(p);
      if (e) return Math.atan2(e.y - p.y, e.x - p.x);
    }
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
        attack: mouseDown || !!keys['Space'] || !!keys['KeyZ'] || (touchActive && world.enemies.some(e => !e.dead)),
        special: specialQueued,
        sprint: !!(keys['ShiftLeft'] || keys['ShiftRight']),
      };
      specialQueued = false; // edge-triggered: one cast per press
      return { [localId]: input };
    },
  };
}
