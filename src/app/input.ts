// input.ts — turns keyboard/mouse/touch plus world context into an InputState.
// This is the piece that keeps sim/ pure: everything keyboard, mouse, touch,
// auto-aim and "hold to attack" is resolved here.
//
// `autoAim` reads the persisted setting straight off `Save` (ORIG/ui.js:
// 369-382 — the toggle itself lives in `ui/settings.ts`, this just reads the
// same live object). `touch` is `ui/touch.ts`'s `setupTouch(canvas)` result,
// threaded in by main.ts: touch always auto-aims (there's no mouse to aim
// with), restored from ORIG/ui.js:397-398. `nearestEnemy`/`aimAngle`
// (ORIG/ui.js:385-403) landed in Task 12/16 since they need the enemy list.
import { worldToScreen, type Camera } from '../render/camera';
import { Save } from './save';
import { isTextInput } from '../ui/events';
import type { TouchState } from '../ui/touch';
import type { Enemy, InputState, World } from '@dg2/sim';

/** Below this magnitude the joystick is treated as centered — ORIG/ui.js
 * doesn't have this deadzone (the original always trusted `touchVec`
 * directly since it and the keyboard never both existed at once); the
 * deadzone is this port's, per task-20-brief.md Step 5: "quando não há
 * tecla pressionada e |touch.vec| > 0.12, use touch.vec". */
const TOUCH_DEADZONE = 0.12;

export function createInput(
  canvas: HTMLCanvasElement,
  world: World,
  localId: string,
  cam: Camera,
  touch: TouchState,
) {
  const keys: Record<string, boolean> = {};
  const mouse = { x: 0, y: 0 };
  let mouseDown = false;
  let specialQueued = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTextInput(e.target)) return; // ORIG/engine.js:36 — typing the hero name
    keys[e.code] = true;
    if (e.code === 'KeyE') specialQueued = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
  const onMouseMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) specialQueued = true;
  };
  const onMouseUp = (e: MouseEvent) => { if (e.button === 0) mouseDown = false; };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();

  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);

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
    if (Save.data.settings.autoAim || touch.active) {
      const e = nearestEnemy(p);
      if (e) return Math.atan2(e.y - p.y, e.x - p.x);
    }
    const s = worldToScreen(cam, p.x, p.y);
    return Math.atan2(mouse.y - s.y, mouse.x - s.x);
  }

  return {
    /**
     * Removes this instance's global listeners. main.ts creates a fresh
     * `createInput` per run (the "PLAY AGAIN"/"RESTART" buttons this task
     * adds are the first thing that ever restarts a run in-page instead of
     * reloading); without this, each restart would leave the previous run's
     * keydown/mouseup listeners attached forever, each still mutating a
     * `keys`/`mouseDown` closure nobody reads anymore.
     */
    destroy(): void {
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
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
      } else if (Math.hypot(touch.vec.x, touch.vec.y) > TOUCH_DEADZONE) {
        // no key pressed: fall back to the joystick, keeping its partial
        // magnitude (an analog stick, unlike WASD, isn't always full-speed).
        x = touch.vec.x; y = touch.vec.y;
      }
      const input: InputState = {
        tick,
        move: { x, y },
        aim: aimAngle(),
        attack: mouseDown || !!keys['Space'] || !!keys['KeyZ'] || (touch.active && world.enemies.some(e => !e.dead)),
        special: specialQueued,
        sprint: !!(keys['ShiftLeft'] || keys['ShiftRight']),
      };
      specialQueued = false; // edge-triggered: one cast per press
      return { [localId]: input };
    },
  };
}
